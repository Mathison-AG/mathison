/**
 * Deployment Engine
 *
 * Core orchestration for deploying, upgrading, and removing services.
 * Called by agent tools — coordinates recipe lookup, dependency resolution,
 * secret generation, template rendering, and job queuing.
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getRecipe } from "@/lib/catalog/service";
import { generateSecrets, createK8sSecret } from "./secrets";
import {
  renderValuesTemplate,
  buildTemplateContext,
} from "./template";
import { resolveDependencies } from "./dependencies";
import { deploymentQueue } from "@/lib/queue/queues";
import { JOB_NAMES } from "@/lib/queue/jobs";

import type { DeployJobData, UndeployJobData, UpgradeJobData } from "@/lib/queue/jobs";
import type { ConfigSchema } from "@/types/recipe";

// ─── Types ────────────────────────────────────────────────

interface DeployResult {
  deploymentId: string;
  name: string;
  status: string;
  message: string;
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

// ─── Deploy ───────────────────────────────────────────────

/**
 * Initiate a new deployment: lookup recipe, resolve deps, generate secrets,
 * render values, create DB record, and queue the Helm install job.
 */
export async function initiateDeployment(params: {
  tenantId: string;
  recipeSlug: string;
  name?: string;
  config?: Record<string, unknown>;
}): Promise<DeployResult> {
  const { tenantId, recipeSlug, config = {} } = params;

  // 1. Look up recipe
  const recipe = await getRecipe(recipeSlug);
  if (!recipe) {
    throw new Error(`Recipe '${recipeSlug}' not found in catalog`);
  }

  // 2. Get tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, namespace: true },
  });
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const deploymentName = params.name || recipe.slug;
  const helmRelease = `${tenant.slug}-${deploymentName}`;

  // 3. Check for duplicate
  const existing = await prisma.deployment.findUnique({
    where: {
      tenantId_name: { tenantId, name: deploymentName },
    },
  });
  if (existing) {
    throw new Error(
      `A service named '${deploymentName}' is already deployed (status: ${existing.status})`
    );
  }

  // 4. Resolve dependencies
  const { resolved: depInfo, newDeploymentIds } = await resolveDependencies({
    tenantId,
    tenantSlug: tenant.slug,
    tenantNamespace: tenant.namespace,
    recipe,
  });

  // 5. Generate secrets
  const secrets = generateSecrets(recipe.secretsSchema);

  // Store secrets in K8s
  const secretsRef =
    Object.keys(secrets).length > 0
      ? `secret-${tenant.slug}-${deploymentName}`
      : null;

  if (secretsRef && Object.keys(secrets).length > 0) {
    try {
      await createK8sSecret(tenant.namespace, secretsRef, secrets);
    } catch (err) {
      console.error(`[engine] Failed to create K8s secret for '${deploymentName}':`, err);
      // Continue — secrets are also in the rendered values
    }
  }

  // 6. Render values template
  const configDefaults = extractConfigDefaults(recipe.configSchema);
  const context = buildTemplateContext({
    config,
    configDefaults,
    secrets,
    deps: depInfo,
    tenantSlug: tenant.slug,
    tenantNamespace: tenant.namespace,
  });

  const renderedValues = renderValuesTemplate(recipe.valuesTemplate, context);

  // 7. Create Deployment record
  const deployment = await prisma.deployment.create({
    data: {
      tenantId,
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      name: deploymentName,
      namespace: tenant.namespace,
      helmRelease,
      config: config as unknown as Prisma.InputJsonValue,
      secretsRef,
      status: "PENDING",
      dependsOn: newDeploymentIds,
    },
  });

  // 8. Queue deploy job
  const jobData: DeployJobData = {
    deploymentId: deployment.id,
    recipeSlug: recipe.slug,
    helmRelease,
    chartUrl: recipe.chartUrl,
    chartVersion: recipe.chartVersion ?? undefined,
    tenantNamespace: tenant.namespace,
    renderedValues,
  };

  await deploymentQueue.add(JOB_NAMES.DEPLOY, jobData, {
    jobId: `deploy-${deployment.id}`,
  });

  const depMsg =
    newDeploymentIds.length > 0
      ? ` (with ${newDeploymentIds.length} dependency/ies auto-deployed)`
      : "";

  console.log(
    `[engine] Deployment '${deploymentName}' (${recipe.displayName}) queued${depMsg}`
  );

  return {
    deploymentId: deployment.id,
    name: deploymentName,
    status: "PENDING",
    message: `Deployment '${deploymentName}' (${recipe.displayName}) queued for installation${depMsg}.`,
    dependencyIds: newDeploymentIds.length > 0 ? newDeploymentIds : undefined,
  };
}

// ─── Upgrade ──────────────────────────────────────────────

/**
 * Upgrade an existing deployment with new configuration.
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
      recipe: {
        select: {
          slug: true,
          displayName: true,
          chartUrl: true,
          chartVersion: true,
          configSchema: true,
          secretsSchema: true,
          valuesTemplate: true,
          dependencies: true,
        },
      },
    },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, namespace: true },
  });
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  // Merge configs
  const existingConfig = (deployment.config ?? {}) as Record<string, unknown>;
  const mergedConfig = { ...existingConfig, ...config };

  // Re-generate secrets (reuse existing)
  const secretsSchema = deployment.recipe.secretsSchema as Record<string, { generate?: boolean; length?: number; description?: string }>;
  const secrets = generateSecrets(secretsSchema);

  // Render new values
  const configDefaults = extractConfigDefaults(
    deployment.recipe.configSchema as Record<string, { type: string; default?: unknown }>
  );
  const context = buildTemplateContext({
    config: mergedConfig,
    configDefaults,
    secrets,
    deps: {}, // TODO: re-resolve deps for upgrades
    tenantSlug: tenant.slug,
    tenantNamespace: tenant.namespace,
  });

  const renderedValues = renderValuesTemplate(
    deployment.recipe.valuesTemplate as string,
    context
  );

  // Update DB
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      config: mergedConfig as unknown as Prisma.InputJsonValue,
      status: "DEPLOYING",
    },
  });

  // Queue upgrade job
  const jobData: UpgradeJobData = {
    deploymentId,
    helmRelease: deployment.helmRelease,
    chartUrl: deployment.recipe.chartUrl,
    chartVersion: deployment.recipe.chartVersion ?? undefined,
    tenantNamespace: tenant.namespace,
    renderedValues,
  };

  await deploymentQueue.add(JOB_NAMES.UPGRADE, jobData, {
    jobId: `upgrade-${deploymentId}-${Date.now()}`,
  });

  console.log(`[engine] Upgrade queued for '${deployment.name}' (${deployment.recipe.displayName})`);

  return {
    deploymentId,
    status: "DEPLOYING",
    message: `Updating '${deployment.name}' (${deployment.recipe.displayName}) with new configuration.`,
  };
}

// ─── Remove ───────────────────────────────────────────────

/**
 * Remove a deployment: check dependents, update status, queue undeploy job.
 */
export async function initiateRemoval(params: {
  tenantId: string;
  deploymentId: string;
}): Promise<RemoveResult> {
  const { tenantId, deploymentId } = params;

  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, tenantId },
    select: {
      id: true,
      name: true,
      helmRelease: true,
      namespace: true,
      recipe: { select: { displayName: true } },
    },
  });

  if (!deployment) {
    throw new Error("Deployment not found");
  }

  // Check for dependents
  const dependents = await prisma.deployment.findMany({
    where: {
      tenantId,
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

  // Update status
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { status: "DELETING" },
  });

  // Queue undeploy job
  const jobData: UndeployJobData = {
    deploymentId,
    helmRelease: deployment.helmRelease,
    tenantNamespace: deployment.namespace,
  };

  await deploymentQueue.add(JOB_NAMES.UNDEPLOY, jobData, {
    jobId: `undeploy-${deploymentId}`,
  });

  console.log(`[engine] Removal queued for '${deployment.name}' (${deployment.recipe.displayName})`);

  return {
    deploymentId,
    status: "DELETING",
    message: `Removing '${deployment.name}' (${deployment.recipe.displayName}).`,
  };
}

// ─── Helpers ──────────────────────────────────────────────

function extractConfigDefaults(
  configSchema: ConfigSchema | Record<string, unknown>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(configSchema)) {
    if (
      typeof field === "object" &&
      field !== null &&
      "default" in field &&
      (field as { default?: unknown }).default !== undefined
    ) {
      defaults[key] = (field as { default: unknown }).default;
    }
  }

  return defaults;
}
