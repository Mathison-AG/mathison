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
import { generateSecrets, createK8sSecret, readK8sSecret } from "./secrets";
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
  minio: 9000
};

/**
 * Bitnami (and other) charts append a suffix to the Helm release name
 * for the K8s Service. Map chart types to their service name suffix.
 */
const SERVICE_NAME_SUFFIXES: Record<string, string> = {
  postgresql: "-postgresql",
  redis: "-redis-master",
  mysql: "-mysql",
  mongodb: "-mongodb",
  minio: ""
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
  const { tenantId, workspaceId, workspaceSlug, workspaceNamespace, recipe } =
    params;

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
        workspaceId_name: { workspaceId, name: depKey }
      },
      select: {
        id: true,
        helmRelease: true,
        config: true,
        secretsRef: true,
        status: true
      }
    });

    if (
      existing &&
      existing.status !== "STOPPED" &&
      existing.status !== "FAILED"
    ) {
      // Dependency already deployed — extract connection info including secrets from K8s
      let existingSecrets: Record<string, string> = {};
      if (existing.secretsRef) {
        existingSecrets = await readK8sSecret(
          workspaceNamespace,
          existing.secretsRef
        );
      }
      resolved[depKey] = buildConnectionInfo(
        dep,
        existing.helmRelease,
        workspaceNamespace,
        (existing.config ?? {}) as Record<string, unknown>,
        existingSecrets
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
      depRecipe
    });

    resolved[depKey] = depResult.connectionInfo;
    newDeploymentIds.push(depResult.deploymentId);
  }

  return { resolved, newDeploymentIds };
}

// ─── Resolve existing dependencies (for upgrades) ────────

/**
 * Resolve existing dependencies for a deployment upgrade.
 * Unlike resolveDependencies(), this does NOT auto-deploy missing deps —
 * it only looks up existing dependency deployments and builds connection
 * info including secrets read from K8s.
 *
 * Used when upgrading a deployment so the values template can render
 * dependency placeholders (e.g. {{deps.n8n-db.host}}) correctly.
 */
export async function resolveExistingDependencies(params: {
  workspaceId: string;
  workspaceNamespace: string;
  dependencies: RecipeDependency[];
}): Promise<Record<string, DependencyInfo>> {
  const { workspaceId, workspaceNamespace, dependencies } = params;

  if (!dependencies || dependencies.length === 0) {
    return {};
  }

  const resolved: Record<string, DependencyInfo> = {};

  for (const dep of dependencies) {
    const depKey = dep.alias || dep.service;

    // Look up the existing dependency deployment in this workspace
    const existing = await prisma.deployment.findUnique({
      where: {
        workspaceId_name: { workspaceId, name: depKey },
      },
      select: {
        helmRelease: true,
        config: true,
        secretsRef: true,
      },
    });

    if (!existing) {
      console.warn(
        `[dependencies] Dependency '${depKey}' not found in workspace during upgrade — skipping`
      );
      continue;
    }

    // Read secrets from K8s so templates can access credentials (e.g. password)
    let secrets: Record<string, string> = {};
    if (existing.secretsRef) {
      secrets = await readK8sSecret(workspaceNamespace, existing.secretsRef);
    }

    resolved[depKey] = buildConnectionInfo(
      dep,
      existing.helmRelease,
      workspaceNamespace,
      (existing.config ?? {}) as Record<string, unknown>,
      secrets
    );
  }

  return resolved;
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
  const {
    tenantId,
    workspaceId,
    workspaceSlug,
    workspaceNamespace,
    dep,
    depRecipe
  } = params;

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
      console.error(
        `[dependencies] Failed to create K8s secret for '${depName}':`,
        err
      );
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
    tenantNamespace: workspaceNamespace
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
      status: "PENDING"
    }
  });

  // Queue deploy job
  const jobData: DeployJobData = {
    deploymentId: deployment.id,
    recipeSlug: depRecipe.slug,
    helmRelease,
    chartUrl: depRecipe.chartUrl,
    chartVersion: depRecipe.chartVersion ?? undefined,
    tenantNamespace: workspaceNamespace,
    renderedValues
  };

  await deploymentQueue.add(JOB_NAMES.DEPLOY, jobData, {
    jobId: `deploy-${deployment.id}`,
    priority: 1 // Dependencies get higher priority
  });

  console.log(
    `[dependencies] Auto-deployed dependency '${depName}' (${depRecipe.displayName}) → job queued`
  );

  // Build connection info (include secrets so parent can access e.g. password)
  const connectionInfo = buildConnectionInfo(
    dep,
    helmRelease,
    workspaceNamespace,
    depConfig,
    secrets
  );

  return { deploymentId: deployment.id, connectionInfo };
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Build connection info for a dependency (used in template rendering).
 * The host is the K8s service DNS name within the namespace.
 *
 * All config and secret values are flattened into the top level so
 * templates can access them directly: {{deps.n8n-db.database}}, {{deps.n8n-db.password}}
 */
function buildConnectionInfo(
  dep: RecipeDependency,
  helmRelease: string,
  namespace: string,
  config: Record<string, unknown>,
  secrets: Record<string, string> = {}
): DependencyInfo {
  const port = DEFAULT_PORTS[dep.service] ?? 5432;

  // Bitnami charts append chart name to the service (e.g. release-postgresql)
  const suffix = SERVICE_NAME_SUFFIXES[dep.service] ?? "";
  const host = `${helmRelease}${suffix}.${namespace}.svc.cluster.local`;

  // Start with host + port, then spread config and secrets for flat access
  const info: DependencyInfo = { host, port };

  // Add config values (database, username, etc.)
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string" || typeof v === "number") {
      info[k] = v;
    }
  }

  // Add secrets (password, etc.) — these override config if same key
  for (const [k, v] of Object.entries(secrets)) {
    info[k] = v;
  }

  return info;
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
