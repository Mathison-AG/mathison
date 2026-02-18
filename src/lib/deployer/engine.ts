/**
 * Deployment Engine V2
 *
 * Core orchestration for deploying, upgrading, and removing services.
 * Uses the typed recipe system: validates config via Zod, calls build()
 * to produce K8s resource objects, and applies them via Server-Side Apply.
 *
 * Deployments are scoped to a workspace (which maps to a K8s namespace).
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { incrementInstallCount } from "@/lib/catalog/service";
import { requireRecipeDefinition } from "@/recipes/registry";
import { getRecipeMetadataOrFallback } from "@/lib/catalog/metadata";
import { generateSecretsFromDefinition, readK8sSecret } from "./secrets";
import { resolveDependencies, resolveExistingDependencies } from "./dependencies";
import { recordCreated, recordConfigChanged, recordRestarted, recordRemoved } from "./events";
import { deploymentQueue } from "@/lib/queue/queues";
import { JOB_NAMES } from "@/lib/queue/jobs";

import type { DeployJobData, UndeployJobData, UpgradeJobData } from "@/lib/queue/jobs";
import type { RecipeDefinition, BuildContext, IngressContext, KubernetesResource } from "@/recipes/_base/types";

// ─── Types ────────────────────────────────────────────────

interface DeployResult {
  deploymentId: string;
  name: string;
  status: string;
  message: string;
  accessUrl?: string;
  dependencyIds?: string[];
}

interface UpgradeResult {
  deploymentId: string;
  status: string;
  message: string;
}

interface RemoveResult {
  deploymentId: string;
  status: string;
  message: string;
}

// ─── Ingress Context Builder ──────────────────────────────

function buildIngressContext(workspaceSlug: string): IngressContext | undefined {
  const baseDomain = process.env.MATHISON_BASE_DOMAIN;
  if (!baseDomain || process.env.INGRESS_ENABLED !== "true") {
    return undefined;
  }
  return {
    domain: `apps.${baseDomain}`,
    workspaceSlug,
    tlsEnabled: process.env.TLS_ENABLED === "true",
    ingressClass: process.env.INGRESS_CLASS || "nginx",
    tlsClusterIssuer: process.env.TLS_CLUSTER_ISSUER || "letsencrypt-prod",
  };
}

/**
 * Extract the access URL from built Ingress resources.
 * Returns the first Ingress hostname (console for object stores, main for web apps).
 */
function extractAccessUrl(
  resources: KubernetesResource[],
  tlsEnabled: boolean
): string | null {
  for (const resource of resources) {
    if (resource.kind !== "Ingress") continue;
    const spec = (resource as { spec?: { rules?: Array<{ host?: string }> } }).spec;
    const host = spec?.rules?.[0]?.host;
    if (host) {
      const protocol = tlsEnabled ? "https" : "http";
      return `${protocol}://${host}`;
    }
  }
  return null;
}

// ─── Deploy ───────────────────────────────────────────────

/**
 * Initiate a new deployment: lookup recipe from registry, validate config
 * via Zod, resolve deps, generate secrets, call build(), create DB record,
 * and queue the SSA apply job.
 */
export async function initiateDeployment(params: {
  tenantId: string;
  workspaceId: string;
  recipeSlug: string;
  name?: string;
  config?: Record<string, unknown>;
}): Promise<DeployResult> {
  const { tenantId, workspaceId, recipeSlug, config = {} } = params;

  // 1. Look up recipe from typed registry
  const recipe = requireRecipeDefinition(recipeSlug);

  // 2. Get workspace info (includes namespace)
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, tenantId, status: "ACTIVE" },
    select: { slug: true, namespace: true, tenant: { select: { slug: true } } },
  });
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const deploymentName = params.name || recipe.slug;

  // 3. Check for duplicate within workspace
  const existing = await prisma.deployment.findUnique({
    where: {
      workspaceId_name: { workspaceId, name: deploymentName },
    },
  });
  if (existing) {
    throw new Error(
      `A service named '${deploymentName}' is already deployed in this workspace (status: ${existing.status})`
    );
  }

  // 4. Validate config via Zod schema (fills defaults for missing fields)
  const parsed = recipe.configSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${String(parsed.error)}`);
  }
  const validatedConfig = parsed.data as Record<string, unknown>;

  // 5. Resolve dependencies (within workspace)
  const { resolved: depInfo, newDeploymentIds } = await resolveDependencies({
    tenantId,
    workspaceId,
    workspaceNamespace: workspace.namespace,
    workspaceSlug: workspace.slug,
    recipe,
  });

  // 6. Generate secrets from recipe definition
  const secrets = generateSecretsFromDefinition(recipe.secrets);

  // 7. Build K8s resources
  const ingressCtx = buildIngressContext(workspace.slug);
  const buildCtx: BuildContext<unknown> = {
    config: validatedConfig,
    secrets,
    deps: depInfo,
    name: deploymentName,
    namespace: workspace.namespace,
    ingress: ingressCtx,
  };

  const resources = recipe.build(buildCtx);
  const serializedResources = JSON.stringify(resources);

  // Compute access URL from Ingress resources (production) or leave null (local dev)
  const accessUrl = ingressCtx
    ? extractAccessUrl(resources, ingressCtx.tlsEnabled)
    : null;

  // 8. Find or create the DB recipe record for linking
  const dbRecipe = await prisma.recipe.upsert({
    where: { slug: recipeSlug },
    create: { slug: recipeSlug },
    update: {},
    select: { id: true },
  });

  // 9. Create Deployment record
  const deployment = await prisma.deployment.create({
    data: {
      tenantId,
      workspaceId,
      recipeId: dbRecipe.id,
      recipeVersion: 1,
      name: deploymentName,
      namespace: workspace.namespace,
      config: validatedConfig as unknown as Prisma.InputJsonValue,
      secretsRef: null, // Secrets are now part of the build() output
      managedResources: serializedResources,
      status: "PENDING",
      dependsOn: newDeploymentIds,
      url: accessUrl,
    },
  });

  // 10. Record audit event (fire-and-forget)
  recordCreated({
    deploymentId: deployment.id,
    recipeSlug,
    config: validatedConfig,
  });

  // 11. Queue deploy job
  const jobData: DeployJobData = {
    deploymentId: deployment.id,
    recipeSlug,
    namespace: workspace.namespace,
    resources: serializedResources,
  };

  await deploymentQueue.add(JOB_NAMES.DEPLOY, jobData, {
    jobId: `deploy-${deployment.id}`,
  });

  // Increment install count (fire-and-forget)
  incrementInstallCount(recipeSlug);

  const depMsg =
    newDeploymentIds.length > 0
      ? ` (with ${newDeploymentIds.length} dependency/ies auto-deployed)`
      : "";

  console.log(
    `[engine] Deployment '${deploymentName}' (${recipe.displayName}) queued in workspace '${workspace.slug}'${depMsg}`
  );

  return {
    deploymentId: deployment.id,
    name: deploymentName,
    status: "PENDING",
    message: `Deployment '${deploymentName}' (${recipe.displayName}) queued for installation${depMsg}.`,
    accessUrl: accessUrl ?? undefined,
    dependencyIds: newDeploymentIds.length > 0 ? newDeploymentIds : undefined,
  };
}

// ─── Upgrade ──────────────────────────────────────────────

/**
 * Upgrade an existing deployment with new configuration.
 * Validates new config, merges with existing, rebuilds resources, queues job.
 */
export async function initiateUpgrade(params: {
  tenantId: string;
  deploymentId: string;
  config: Record<string, unknown>;
}): Promise<UpgradeResult> {
  const { tenantId, deploymentId, config } = params;

  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, tenantId },
    include: {
      workspace: {
        select: {
          id: true,
          slug: true,
          namespace: true,
        },
      },
      recipe: {
        select: { slug: true },
      },
    },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  // Get recipe from typed registry
  const recipe = requireRecipeDefinition(deployment.recipe.slug);
  const recipeMeta = getRecipeMetadataOrFallback(deployment.recipe.slug);

  // Merge configs (new values override existing)
  const existingConfig = (deployment.config ?? {}) as Record<string, unknown>;
  const mergedConfig = { ...existingConfig, ...config };

  // Validate merged config via Zod
  const parsed = recipe.configSchema.safeParse(mergedConfig);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${String(parsed.error)}`);
  }
  const validatedConfig = parsed.data as Record<string, unknown>;

  // Reuse existing secrets — read from the K8s Secret resources in the cluster
  const existingSecrets = await readExistingSecrets(
    deployment.namespace,
    deployment.name,
    recipe
  );
  const secrets = generateSecretsFromDefinition(recipe.secrets, existingSecrets);

  // Re-resolve existing dependencies
  const depInfo = await resolveExistingDependencies({
    workspaceId: deployment.workspace.id,
    workspaceNamespace: deployment.workspace.namespace,
    recipe,
  });

  // Rebuild K8s resources with new config
  const ingressCtx = buildIngressContext(deployment.workspace.slug);
  const buildCtx: BuildContext<unknown> = {
    config: validatedConfig,
    secrets,
    deps: depInfo,
    name: deployment.name,
    namespace: deployment.namespace,
    ingress: ingressCtx,
  };

  const resources = recipe.build(buildCtx);
  const serializedResources = JSON.stringify(resources);

  // Compute access URL from Ingress resources (production) or leave existing
  const accessUrl = ingressCtx
    ? extractAccessUrl(resources, ingressCtx.tlsEnabled)
    : undefined;

  // Update DB
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      config: validatedConfig as unknown as Prisma.InputJsonValue,
      managedResources: serializedResources,
      status: "DEPLOYING",
      ...(accessUrl ? { url: accessUrl } : {}),
    },
  });

  // Record audit event (fire-and-forget)
  const configChanged = JSON.stringify(existingConfig) !== JSON.stringify(validatedConfig);
  if (configChanged) {
    recordConfigChanged({
      deploymentId,
      previousConfig: existingConfig,
      newConfig: validatedConfig,
    });
  } else {
    recordRestarted({ deploymentId });
  }

  // Queue upgrade job
  const jobData: UpgradeJobData = {
    deploymentId,
    recipeSlug: deployment.recipe.slug,
    namespace: deployment.namespace,
    resources: serializedResources,
  };

  await deploymentQueue.add(JOB_NAMES.UPGRADE, jobData, {
    jobId: `upgrade-${deploymentId}-${Date.now()}`,
  });

  console.log(
    `[engine] Upgrade queued for '${deployment.name}' (${recipeMeta.displayName})`
  );

  return {
    deploymentId,
    status: "DEPLOYING",
    message: `Updating '${deployment.name}' (${recipeMeta.displayName}) with new configuration.`,
  };
}

// ─── Remove ───────────────────────────────────────────────

/**
 * Remove a deployment: check dependents, read managed resources, queue delete job.
 */
export async function initiateRemoval(params: {
  tenantId: string;
  deploymentId: string;
}): Promise<RemoveResult> {
  const { tenantId, deploymentId } = params;

  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, tenantId },
    include: {
      recipe: { select: { slug: true } },
    },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const removeMeta = getRecipeMetadataOrFallback(deployment.recipe.slug);

  // Check for dependents within the same workspace
  const dependents = await prisma.deployment.findMany({
    where: {
      workspaceId: deployment.workspaceId,
      dependsOn: { has: deploymentId },
      status: { not: "STOPPED" },
    },
    select: { name: true },
  });

  if (dependents.length > 0) {
    const names = dependents.map((d) => d.name).join(", ");
    throw new Error(
      `Cannot remove '${deployment.name}' — the following services depend on it: ${names}. Remove them first.`
    );
  }

  // Get resources to delete — either from DB or rebuild from recipe
  let serializedResources: string;
  if (deployment.managedResources) {
    serializedResources = deployment.managedResources;
  } else {
    // Fallback: rebuild resources for deletion
    const recipe = requireRecipeDefinition(deployment.recipe.slug);
    const buildCtx: BuildContext<unknown> = {
      config: recipe.configSchema.parse({}),
      secrets: {},
      deps: {},
      name: deployment.name,
      namespace: deployment.namespace,
    };
    const resources = recipe.build(buildCtx);
    serializedResources = JSON.stringify(resources);
  }

  // Record audit event (fire-and-forget)
  recordRemoved({
    deploymentId,
    lastConfig: (deployment.config ?? {}) as Record<string, unknown>,
  });

  // Update status
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "DELETING" },
  });

  // Queue undeploy job
  const jobData: UndeployJobData = {
    deploymentId,
    namespace: deployment.namespace,
    resources: serializedResources,
  };

  await deploymentQueue.add(JOB_NAMES.UNDEPLOY, jobData, {
    jobId: `undeploy-${deploymentId}`,
  });

  console.log(`[engine] Removal queued for '${deployment.name}' (${removeMeta.displayName})`);

  return {
    deploymentId,
    status: "DELETING",
    message: `Removing '${deployment.name}' (${removeMeta.displayName}).`,
  };
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Read existing secrets from K8s for a deployment.
 * Looks for the Secret resource that the recipe build() would have created.
 */
async function readExistingSecrets(
  namespace: string,
  deploymentName: string,
  recipe: RecipeDefinition<unknown>
): Promise<Record<string, string>> {
  // Try to read the secret that build() creates (typically `{name}-secret`)
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

  // Also check if there are any secrets defined in the recipe
  if (Object.keys(recipe.secrets).length === 0) {
    return {};
  }

  return {};
}

/**
 * Helper to extract service info from built resources for port-forwarding.
 * Finds the primary Service resource in the build output.
 */
export function extractServiceInfo(
  resources: KubernetesResource[]
): { serviceName: string; servicePort: number } | null {
  for (const resource of resources) {
    if (resource.kind === "Service") {
      const name = resource.metadata?.name;
      const spec = (resource as { spec?: { clusterIP?: string; ports?: Array<{ port?: number }> } }).spec;

      // Skip headless services
      if (spec?.clusterIP === "None") continue;

      const port = spec?.ports?.[0]?.port;
      if (name && port) {
        return { serviceName: name, servicePort: port };
      }
    }
  }
  return null;
}

/**
 * Helper to extract pod labels from built resources.
 * Reads from the first Deployment or StatefulSet in the resource list.
 */
export function extractPodSelector(
  resources: KubernetesResource[]
): string | null {
  for (const resource of resources) {
    if (resource.kind === "Deployment" || resource.kind === "StatefulSet") {
      const spec = resource as {
        spec?: {
          selector?: {
            matchLabels?: Record<string, string>;
          };
        };
      };

      const labels = spec.spec?.selector?.matchLabels;
      if (labels) {
        return Object.entries(labels)
          .map(([k, v]) => `${k}=${v}`)
          .join(",");
      }
    }
  }
  return null;
}
