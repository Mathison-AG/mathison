/**
 * Dependency Resolution V2
 *
 * When deploying a service with dependencies (e.g., n8n needs PostgreSQL),
 * this module checks for existing deployments and auto-deploys missing ones
 * using the typed recipe system (build + SSA).
 *
 * Connection info comes from each recipe's connectionInfo() method —
 * no more hardcoded service name suffixes or default ports.
 *
 * Dependencies are resolved within the same workspace (namespace).
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getRecipeDefinition } from "@/recipes/registry";
import { generateSecretsFromDefinition, readK8sSecret } from "./secrets";
import { deploymentQueue } from "@/lib/queue/queues";
import { JOB_NAMES } from "@/lib/queue/jobs";

import type { DeployJobData } from "@/lib/queue/jobs";
import type {
  RecipeDefinition,
  ConnectionInfo,
  BuildContext,
  IngressContext,
} from "@/recipes/_base/types";

// ─── Types ────────────────────────────────────────────────

export interface ResolvedDependencies {
  /** Connection info for each dependency (keyed by alias) */
  resolved: Record<string, ConnectionInfo>;
  /** IDs of auto-deployed dependency Deployment records */
  newDeploymentIds: string[];
}

// ─── Ingress Context Builder ──────────────────────────────

function buildIngressContext(): IngressContext | undefined {
  const domain = process.env.MATHISON_BASE_DOMAIN;
  if (!domain || process.env.INGRESS_ENABLED !== "true") {
    return undefined;
  }
  return {
    domain,
    tlsEnabled: process.env.TLS_ENABLED === "true",
    ingressClass: process.env.INGRESS_CLASS || "nginx",
    tlsClusterIssuer: process.env.TLS_CLUSTER_ISSUER || "letsencrypt-prod",
  };
}

// ─── Dependency resolution ────────────────────────────────

/**
 * Resolve all dependencies for a recipe within a workspace.
 * For each dependency:
 *   1. Check if already deployed in this workspace
 *   2. If not, auto-deploy it (create record + queue job)
 *   3. Return connection info from the dependency recipe's connectionInfo()
 */
export async function resolveDependencies(params: {
  tenantId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceNamespace: string;
  recipe: RecipeDefinition<unknown>;
}): Promise<ResolvedDependencies> {
  const { tenantId, workspaceId, workspaceSlug, workspaceNamespace, recipe } =
    params;

  if (!recipe.dependencies || Object.keys(recipe.dependencies).length === 0) {
    return { resolved: {}, newDeploymentIds: [] };
  }

  const resolved: Record<string, ConnectionInfo> = {};
  const newDeploymentIds: string[] = [];

  for (const [alias, dep] of Object.entries(recipe.dependencies)) {
    // Look up the dependency recipe from the registry
    const depRecipe = getRecipeDefinition(dep.recipe);
    if (!depRecipe) {
      throw new Error(
        `Dependency '${dep.recipe}' not found in recipe registry — cannot deploy '${recipe.slug}'`
      );
    }

    if (!depRecipe.connectionInfo) {
      throw new Error(
        `Dependency recipe '${dep.recipe}' does not provide connectionInfo() — cannot wire '${recipe.slug}'`
      );
    }

    // 1. Check if already deployed in this workspace
    const existing = await prisma.deployment.findUnique({
      where: {
        workspaceId_name: { workspaceId, name: alias },
      },
      select: {
        id: true,
        config: true,
        status: true,
        name: true,
      },
    });

    if (
      existing &&
      existing.status !== "STOPPED" &&
      existing.status !== "FAILED"
    ) {
      // Dependency already deployed — get connection info from recipe
      const existingConfig = (existing.config ?? {}) as Record<string, unknown>;
      const parsedConfig = depRecipe.configSchema.parse(existingConfig);

      // Read existing secrets from K8s
      const existingSecrets = await readSecretsForDeployment(
        workspaceNamespace,
        existing.name,
        depRecipe
      );

      const connInfo = depRecipe.connectionInfo({
        config: parsedConfig,
        secrets: existingSecrets,
        name: existing.name,
        namespace: workspaceNamespace,
      });

      resolved[alias] = connInfo;
      continue;
    }

    // 2. Auto-deploy the dependency
    const depResult = await deployDependency({
      tenantId,
      workspaceId,
      workspaceSlug,
      workspaceNamespace,
      alias,
      dep,
      depRecipe,
    });

    resolved[alias] = depResult.connectionInfo;
    newDeploymentIds.push(depResult.deploymentId);
  }

  return { resolved, newDeploymentIds };
}

// ─── Resolve existing dependencies (for upgrades) ────────

/**
 * Resolve existing dependencies for a deployment upgrade.
 * Unlike resolveDependencies(), this does NOT auto-deploy missing deps —
 * it only looks up existing dependency deployments and builds connection
 * info using the recipe's connectionInfo() method.
 */
export async function resolveExistingDependencies(params: {
  workspaceId: string;
  workspaceNamespace: string;
  recipe: RecipeDefinition<unknown>;
}): Promise<Record<string, ConnectionInfo>> {
  const { workspaceId, workspaceNamespace, recipe } = params;

  if (!recipe.dependencies || Object.keys(recipe.dependencies).length === 0) {
    return {};
  }

  const resolved: Record<string, ConnectionInfo> = {};

  for (const [alias, dep] of Object.entries(recipe.dependencies)) {
    const depRecipe = getRecipeDefinition(dep.recipe);
    if (!depRecipe?.connectionInfo) {
      console.warn(
        `[dependencies] Dependency recipe '${dep.recipe}' not found or has no connectionInfo — skipping`
      );
      continue;
    }

    // Look up the existing dependency deployment in this workspace
    const existing = await prisma.deployment.findUnique({
      where: {
        workspaceId_name: { workspaceId, name: alias },
      },
      select: {
        config: true,
        name: true,
      },
    });

    if (!existing) {
      console.warn(
        `[dependencies] Dependency '${alias}' not found in workspace during upgrade — skipping`
      );
      continue;
    }

    const existingConfig = (existing.config ?? {}) as Record<string, unknown>;
    const parsedConfig = depRecipe.configSchema.parse(existingConfig);

    // Read secrets from K8s
    const secrets = await readSecretsForDeployment(
      workspaceNamespace,
      existing.name,
      depRecipe
    );

    resolved[alias] = depRecipe.connectionInfo({
      config: parsedConfig,
      secrets,
      name: existing.name,
      namespace: workspaceNamespace,
    });
  }

  return resolved;
}

// ─── Auto-deploy a single dependency ──────────────────────

async function deployDependency(params: {
  tenantId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceNamespace: string;
  alias: string;
  dep: { recipe: string; defaultConfig?: Record<string, unknown> };
  depRecipe: RecipeDefinition<unknown>;
}): Promise<{ deploymentId: string; connectionInfo: ConnectionInfo }> {
  const {
    tenantId,
    workspaceId,
    workspaceSlug,
    workspaceNamespace,
    alias,
    dep,
    depRecipe,
  } = params;

  const depConfig = dep.defaultConfig || {};

  // Validate config
  const parsedConfig = depRecipe.configSchema.parse(depConfig);

  // Generate secrets for the dependency
  const secrets = generateSecretsFromDefinition(depRecipe.secrets);

  // Build K8s resources
  const buildCtx: BuildContext<unknown> = {
    config: parsedConfig,
    secrets,
    deps: {},
    name: alias,
    namespace: workspaceNamespace,
    ingress: buildIngressContext(),
  };

  const resources = depRecipe.build(buildCtx);
  const serializedResources = JSON.stringify(resources);

  // Find DB recipe record for linking
  const dbRecipe = await prisma.recipe.findFirst({
    where: { slug: dep.recipe },
    select: { id: true, version: true },
  });

  // Create Deployment record
  const deployment = await prisma.deployment.create({
    data: {
      tenantId,
      workspaceId,
      recipeId: dbRecipe?.id ?? "",
      recipeVersion: dbRecipe?.version ?? 1,
      name: alias,
      namespace: workspaceNamespace,
      helmRelease: `${workspaceSlug}-${alias}`,
      config: depConfig as unknown as Prisma.InputJsonValue,
      secretsRef: null,
      managedResources: serializedResources,
      status: "PENDING",
    },
  });

  // Queue deploy job
  const jobData: DeployJobData = {
    deploymentId: deployment.id,
    recipeSlug: dep.recipe,
    namespace: workspaceNamespace,
    resources: serializedResources,
  };

  await deploymentQueue.add(JOB_NAMES.DEPLOY, jobData, {
    jobId: `deploy-${deployment.id}`,
    priority: 1,
  });

  console.log(
    `[dependencies] Auto-deployed dependency '${alias}' (${depRecipe.displayName}) → job queued`
  );

  // Build connection info using the recipe's typed connectionInfo()
  if (!depRecipe.connectionInfo) {
    throw new Error(
      `Dependency recipe '${dep.recipe}' does not provide connectionInfo()`
    );
  }

  const connectionInfo = depRecipe.connectionInfo({
    config: parsedConfig,
    secrets,
    name: alias,
    namespace: workspaceNamespace,
  });

  return { deploymentId: deployment.id, connectionInfo };
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Read secrets for a deployment from K8s.
 * Tries common secret naming conventions used by the builders.
 */
async function readSecretsForDeployment(
  namespace: string,
  deploymentName: string,
  recipe: RecipeDefinition<unknown>
): Promise<Record<string, string>> {
  if (Object.keys(recipe.secrets).length === 0) {
    return {};
  }

  const possibleNames = [
    `${deploymentName}-secret`,
    `${deploymentName}-secrets`,
    deploymentName,
  ];

  for (const secretName of possibleNames) {
    const secrets = await readK8sSecret(namespace, secretName);
    if (Object.keys(secrets).length > 0) {
      return secrets;
    }
  }

  return {};
}
