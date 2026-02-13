/**
 * BullMQ Job Type Definitions
 *
 * Shared types between the API (producer) and worker (consumer).
 */

// ─── Deployment jobs ──────────────────────────────────────

export interface DeployJobData {
  deploymentId: string;
  recipeSlug: string;
  helmRelease: string;
  chartUrl: string;
  chartVersion?: string;
  tenantNamespace: string;
  renderedValues: string; // YAML string
}

export interface UndeployJobData {
  deploymentId: string;
  helmRelease: string;
  tenantNamespace: string;
}

export interface UpgradeJobData {
  deploymentId: string;
  helmRelease: string;
  chartUrl: string;
  chartVersion?: string;
  tenantNamespace: string;
  renderedValues: string; // YAML string
}

// ─── Embedding jobs ───────────────────────────────────────

export interface EmbedJobData {
  recipeId: string;
}

// ─── Health check jobs ────────────────────────────────────

export interface HealthCheckJobData {
  deploymentId: string;
}

// ─── Job names ────────────────────────────────────────────

export const JOB_NAMES = {
  DEPLOY: "deploy",
  UNDEPLOY: "undeploy",
  UPGRADE: "upgrade",
  HEALTH_CHECK: "health-check",
  EMBED: "embed",
} as const;
