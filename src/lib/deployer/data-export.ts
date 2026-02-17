/**
 * Data Export & Import Service
 *
 * Orchestrates per-recipe data export/import using kubectl exec.
 * Recipes define their own export strategy (command or files),
 * and this service handles pod discovery and execution.
 */

import { prisma } from "@/lib/db";
import { listPods } from "@/lib/cluster/kubernetes";
import { readK8sSecret } from "@/lib/deployer/secrets";
import {
  execInPodStream,
  execInPodWithStdin,
} from "@/lib/cluster/pod-exec";
import { getRecipeDefinition } from "@/recipes/registry";

import type { Readable } from "stream";
import type {
  DataExportContext,
  DataExportDefinition,
  DataImportDefinition,
} from "@/recipes/_base/types";

// ─── Types ────────────────────────────────────────────────

export interface ExportResult {
  /** Readable stream of the exported data */
  stream: Readable;
  /** MIME type for the response */
  contentType: string;
  /** Suggested filename */
  filename: string;
  /** Human-readable description */
  description: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  restartNeeded: boolean;
}

// ─── Export ───────────────────────────────────────────────

/**
 * Export data from a running deployment.
 *
 * Looks up the recipe's dataExport definition, finds a running pod,
 * and executes the export strategy (command or files).
 */
export async function exportDeploymentData(
  deploymentId: string,
  tenantId: string
): Promise<ExportResult> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, tenantId },
    select: {
      id: true,
      name: true,
      namespace: true,
      status: true,
      config: true,
      recipe: { select: { slug: true } },
    },
  });

  if (!deployment) {
    throw new Error("App not found");
  }

  if (deployment.status !== "RUNNING") {
    throw new Error("App must be running to export data");
  }

  const recipe = getRecipeDefinition(deployment.recipe.slug);
  if (!recipe) {
    throw new Error(`Recipe '${deployment.recipe.slug}' not found`);
  }

  if (!recipe.dataExport) {
    throw new Error(`${recipe.displayName} does not support data export`);
  }

  const pod = await findRunningPod(deployment.namespace, deployment.name);
  const secrets = await readK8sSecret(
    deployment.namespace,
    `${deployment.name}-secret`
  );

  const ctx: DataExportContext = {
    config: (deployment.config ?? {}) as Record<string, unknown>,
    secrets,
    name: deployment.name,
    namespace: deployment.namespace,
  };

  return executeExport(
    pod,
    deployment.namespace,
    deployment.name,
    recipe.displayName,
    recipe.dataExport,
    ctx
  );
}

async function executeExport(
  podName: string,
  namespace: string,
  deploymentName: string,
  displayName: string,
  exportDef: DataExportDefinition,
  ctx: DataExportContext
): Promise<ExportResult> {
  const { strategy } = exportDef;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (strategy.type === "command") {
    const command = strategy.command(ctx);

    const result = execInPodStream(namespace, podName, command);

    return {
      stream: result.stdout,
      contentType: strategy.contentType,
      filename: `${deploymentName}-${timestamp}.${strategy.fileExtension}`,
      description: exportDef.description,
    };
  }

  // Files strategy: tar the specified paths
  const paths = strategy.paths(ctx);
  const excludeArgs = (strategy.excludePatterns ?? []).flatMap((p) => [
    "--exclude",
    p,
  ]);
  const tarCommand = ["tar", "czf", "-", ...excludeArgs, ...paths];

  const result = execInPodStream(namespace, podName, tarCommand);

  return {
    stream: result.stdout,
    contentType: "application/gzip",
    filename: `${deploymentName}-${timestamp}.tar.gz`,
    description: exportDef.description,
  };
}

// ─── Import ───────────────────────────────────────────────

/**
 * Import data into a running deployment.
 *
 * Looks up the recipe's dataImport definition, finds a running pod,
 * and executes the import strategy (command or files).
 */
export async function importDeploymentData(
  deploymentId: string,
  tenantId: string,
  data: Buffer
): Promise<ImportResult> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, tenantId },
    select: {
      id: true,
      name: true,
      namespace: true,
      status: true,
      config: true,
      recipe: { select: { slug: true } },
    },
  });

  if (!deployment) {
    throw new Error("App not found");
  }

  if (deployment.status !== "RUNNING") {
    throw new Error("App must be running to import data");
  }

  const recipe = getRecipeDefinition(deployment.recipe.slug);
  if (!recipe) {
    throw new Error(`Recipe '${deployment.recipe.slug}' not found`);
  }

  if (!recipe.dataImport) {
    throw new Error(`${recipe.displayName} does not support data import`);
  }

  const pod = await findRunningPod(deployment.namespace, deployment.name);
  const secrets = await readK8sSecret(
    deployment.namespace,
    `${deployment.name}-secret`
  );

  const ctx: DataExportContext = {
    config: (deployment.config ?? {}) as Record<string, unknown>,
    secrets,
    name: deployment.name,
    namespace: deployment.namespace,
  };

  return executeImport(
    pod,
    deployment.namespace,
    recipe.displayName,
    recipe.dataImport,
    ctx,
    data
  );
}

async function executeImport(
  podName: string,
  namespace: string,
  displayName: string,
  importDef: DataImportDefinition,
  ctx: DataExportContext,
  data: Buffer
): Promise<ImportResult> {
  const { strategy } = importDef;

  if (strategy.type === "command") {
    const command = strategy.command(ctx);
    const result = await execInPodWithStdin(namespace, podName, command, data);

    if (result.exitCode !== 0) {
      console.error(
        `[data-import] Command failed for ${displayName}:`,
        result.stderr
      );
      return {
        success: false,
        message: `Import failed: ${result.stderr || "Command returned non-zero exit code"}`,
        restartNeeded: false,
      };
    }

    return {
      success: true,
      message: `Data imported successfully into ${displayName}`,
      restartNeeded: importDef.restartAfterImport ?? true,
    };
  }

  // Files strategy: extract tar
  const extractPath = strategy.extractPath;
  const tarCommand = ["tar", "xzf", "-", "-C", extractPath];
  const result = await execInPodWithStdin(namespace, podName, tarCommand, data);

  if (result.exitCode !== 0) {
    console.error(
      `[data-import] Tar extract failed for ${displayName}:`,
      result.stderr
    );
    return {
      success: false,
      message: `Import failed: ${result.stderr || "Failed to extract data archive"}`,
      restartNeeded: false,
    };
  }

  return {
    success: true,
    message: `Data imported successfully into ${displayName}`,
    restartNeeded: importDef.restartAfterImport ?? true,
  };
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Find a running pod for a deployment by its standard label selector.
 */
async function findRunningPod(
  namespace: string,
  instanceName: string
): Promise<string> {
  let pods = await listPods(
    namespace,
    `app.kubernetes.io/instance=${instanceName}`
  );

  if (pods.length === 0) {
    pods = await listPods(namespace, `release=${instanceName}`);
  }

  const readyPod = pods.find((p) => p.ready);
  if (!readyPod) {
    if (pods.length === 0) {
      throw new Error(`No pods found for '${instanceName}'`);
    }
    throw new Error(
      `No ready pods found for '${instanceName}' (${pods.length} pod(s) exist but none are ready)`
    );
  }

  return readyPod.name;
}

// ─── Query helpers ────────────────────────────────────────

/**
 * Check if a recipe supports data export.
 */
export function supportsDataExport(recipeSlug: string): boolean {
  const recipe = getRecipeDefinition(recipeSlug);
  return !!recipe?.dataExport;
}

/**
 * Check if a recipe supports data import.
 */
export function supportsDataImport(recipeSlug: string): boolean {
  const recipe = getRecipeDefinition(recipeSlug);
  return !!recipe?.dataImport;
}

/**
 * Get data export/import info for a recipe (for API responses).
 */
export function getDataPortabilityInfo(recipeSlug: string): {
  canExport: boolean;
  canImport: boolean;
  exportDescription: string | null;
  importDescription: string | null;
} {
  const recipe = getRecipeDefinition(recipeSlug);
  return {
    canExport: !!recipe?.dataExport,
    canImport: !!recipe?.dataImport,
    exportDescription: recipe?.dataExport?.description ?? null,
    importDescription: recipe?.dataImport?.description ?? null,
  };
}
