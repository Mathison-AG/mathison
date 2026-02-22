/**
 * BullMQ Job Type Definitions
 *
 * Shared types between the API (producer) and worker (consumer).
 * V2: Uses serialized K8s resources instead of Helm values YAML.
 */

// ─── Deployment jobs ──────────────────────────────────────

export interface DeployJobData {
  deploymentId: string;
  recipeSlug: string;
  namespace: string;
  /** JSON-serialized KubernetesResource[] from recipe build() */
  resources: string;
}

export interface UndeployJobData {
  deploymentId: string;
  namespace: string;
  /** JSON-serialized KubernetesResource[] — resources to delete */
  resources: string;
}

export interface UpgradeJobData {
  deploymentId: string;
  recipeSlug: string;
  namespace: string;
  /** JSON-serialized KubernetesResource[] from recipe build() */
  resources: string;
}

// ─── Embedding jobs ───────────────────────────────────────

export interface EmbedJobData {
  recipeId: string;
}

// ─── Health check jobs ────────────────────────────────────

export interface HealthCheckJobData {
  deploymentId: string;
}

// ─── Auto-diagnose jobs ───────────────────────────────────

export interface AutoDiagnoseJobData {
  deploymentId: string;
  trigger: "deploy_failed" | "health_check_failed" | "upgrade_failed";
}

// ─── Job names ────────────────────────────────────────────

export const JOB_NAMES = {
  DEPLOY: "deploy",
  UNDEPLOY: "undeploy",
  UPGRADE: "upgrade",
  HEALTH_CHECK: "health-check",
  AUTO_DIAGNOSE: "auto-diagnose",
  EMBED: "embed",
} as const;
