/**
 * Dependency Resolution
 *
 * When deploying a service with dependencies (e.g., n8n needs PostgreSQL),
 * this module checks for existing deployments and auto-deploys missing ones.
 * Returns connection info for template rendering.
 *
 * Dependencies are resolved within the same workspace (namespace).
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getRecipe } from "@/lib/catalog/service";
import { generateSecrets, createK8sSecret } from "./secrets";
import { renderValuesTemplate, buildTemplateContext } from "./template";
import { deploymentQueue } from "@/lib/queue/queues";
import { JOB_NAMES } from "@/lib/queue/jobs";

import type { Recipe, RecipeDependency, ConfigSchema } from "@/types/recipe";
import type { DependencyInfo } from "./template";
import type { DeployJobData } from "@/lib/queue/jobs";

// ─── Types ────────────────────────────────────────────────

export interface ResolvedDependencies {
  /** Connection info for each dependency (keyed by alias or slug) */
  resolved: Record<string, DependencyInfo>;
  /** IDs of auto-deployed dependency Deployment records */
  newDeploymentIds: string[];
}

// ─── Default ports for common services ────────────────────

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  redis: 6379,
  mysql: 3306,
  mongodb: 27017,
  minio: 9000,
};

// ─── Dependency resolution ────────────────────────────────

/**
 * Resolve all dependencies for a recipe within a workspace.
 * For each dependency:
 *   1. Check if already deployed in this workspace
 *   2. If not, auto-deploy it (create record + queue job)
 *   3. Return connection info for template rendering
 */
export async function resolveDependencies(params: {
  tenantId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceNamespace: string;
  recipe: Recipe;
}): Promise<ResolvedDependencies> {
  const { tenantId, workspaceId, workspaceSlug, workspaceNamespace, recipe } = params;

  if (!recipe.dependencies || recipe.dependencies.length === 0) {
    return { resolved: {}, newDeploymentIds: [] };
  }

  const resolved: Record<string, DependencyInfo> = {};
  const newDeploymentIds: string[] = [];

  for (const dep of recipe.dependencies) {
    const depKey = dep.alias || dep.service;

    // 1. Check if already deployed in this workspace
    const existing = await prisma.deployment.findUnique({
      where: {
        workspaceId_name: { workspaceId, name: depKey },
      },
      select: {
        id: true,
        helmRelease: true,
        config: true,
        secretsRef: true,
        status: true,
      },
    });

    if (existing && existing.status !== "STOPPED" && existing.status !== "FAILED") {
      // Dependency already deployed — extract connection info
      resolved[depKey] = buildConnectionInfo(
        dep,
        existing.helmRelease,
        workspaceNamespace,
        (existing.config ?? {}) as Record<string, unknown>
      );
      continue;
    }

    // 2. Auto-deploy the dependency
    const depRecipe = await getRecipe(dep.service);
    if (!depRecipe) {
      throw new Error(
        `Dependency '${dep.service}' not found in catalog — cannot deploy '${recipe.slug}'`
      );
    }

    const depResult = await deployDependency({
      tenantId,
      workspaceId,
      workspaceSlug,
      workspaceNamespace,
      dep,
      depRecipe,
    });

    resolved[depKey] = depResult.connectionInfo;
    newDeploymentIds.push(depResult.deploymentId);
  }

  return { resolved, newDeploymentIds };
}

// ─── Auto-deploy a single dependency ──────────────────────

async function deployDependency(params: {
  tenantId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceNamespace: string;
  dep: RecipeDependency;
  depRecipe: Recipe;
}): Promise<{ deploymentId: string; connectionInfo: DependencyInfo }> {
  const { tenantId, workspaceId, workspaceSlug, workspaceNamespace, dep, depRecipe } = params;

  const depName = dep.alias || dep.service;
  const helmRelease = `${workspaceSlug}-${depName}`;
  const depConfig = dep.config || {};

  // Generate secrets for the dependency
  const secrets = generateSecrets(depRecipe.secretsSchema);

  // Create K8s secret if we have any
  const secretsRef =
    Object.keys(secrets).length > 0
      ? `secret-${workspaceSlug}-${depName}`
      : null;

  if (secretsRef && Object.keys(secrets).length > 0) {
    try {
      await createK8sSecret(workspaceNamespace, secretsRef, secrets);
    } catch (err) {
      console.error(`[dependencies] Failed to create K8s secret for '${depName}':`, err);
      // Continue anyway — Helm values will have the secrets inline
    }
  }

  // Build config defaults from recipe configSchema
  const configDefaults = extractConfigDefaults(depRecipe.configSchema);

  // Render values template
  const context = buildTemplateContext({
    config: depConfig,
    configDefaults,
    secrets,
    deps: {}, // Dependencies of dependencies (for now, don't go deeper)
    tenantSlug: workspaceSlug,
    tenantNamespace: workspaceNamespace,
  });

  const renderedValues = renderValuesTemplate(
    depRecipe.valuesTemplate,
    context
  );

  // Create Deployment record
  const deployment = await prisma.deployment.create({
    data: {
      tenantId,
      workspaceId,
      recipeId: depRecipe.id,
      recipeVersion: depRecipe.version,
      name: depName,
      namespace: workspaceNamespace,
      helmRelease,
      config: depConfig as unknown as Prisma.InputJsonValue,
      secretsRef,
      status: "PENDING",
    },
  });

  // Queue deploy job
  const jobData: DeployJobData = {
    deploymentId: deployment.id,
    recipeSlug: depRecipe.slug,
    helmRelease,
    chartUrl: depRecipe.chartUrl,
    chartVersion: depRecipe.chartVersion ?? undefined,
    tenantNamespace: workspaceNamespace,
    renderedValues,
  };

  await deploymentQueue.add(JOB_NAMES.DEPLOY, jobData, {
    jobId: `deploy-${deployment.id}`,
    priority: 1, // Dependencies get higher priority
  });

  console.log(
    `[dependencies] Auto-deployed dependency '${depName}' (${depRecipe.displayName}) → job queued`
  );

  // Build connection info
  const connectionInfo = buildConnectionInfo(
    dep,
    helmRelease,
    workspaceNamespace,
    depConfig
  );

  return { deploymentId: deployment.id, connectionInfo };
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Build connection info for a dependency (used in template rendering).
 * The host is the K8s service DNS name within the namespace.
 */
function buildConnectionInfo(
  dep: RecipeDependency,
  helmRelease: string,
  namespace: string,
  config: Record<string, unknown>
): DependencyInfo {
  const port = DEFAULT_PORTS[dep.service] ?? 5432;

  // K8s service DNS: <release-name>.<namespace>.svc.cluster.local
  // For bitnami charts, the service name is usually the release name
  const host = `${helmRelease}.${namespace}.svc.cluster.local`;

  // Extract credentials from config (these will also be in secrets)
  const credentials: Record<string, string> = {};
  if (config.username) credentials.username = String(config.username);
  if (config.database) credentials.database = String(config.database);

  return { host, port, credentials };
}

/**
 * Extract default values from a recipe's configSchema.
 */
function extractConfigDefaults(
  configSchema: ConfigSchema
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(configSchema)) {
    if ("default" in field && field.default !== undefined) {
      defaults[key] = field.default;
    }
  }

  return defaults;
}
