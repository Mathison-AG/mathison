import type { DeploymentStatus } from "@/generated/prisma/enums";

// ─── Deployment (API response shape) ──────────────────────

export interface Deployment {
  id: string;
  name: string;
  namespace: string;
  helmRelease: string;
  status: DeploymentStatus;
  url: string | null;
  chartVersion: string | null;
  appVersion: string | null;
  revision: number;
  errorMessage: string | null;
  config: Record<string, unknown>;
  dependsOn: string[];
  recipe: {
    slug: string;
    displayName: string;
    iconUrl: string | null;
    category: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Deployment detail (extended) ─────────────────────────

export interface DeploymentDetail extends Deployment {
  recipeId: string;
  recipeVersion: number;
  secretsRef: string | null;
}

// ─── Resource config helpers ──────────────────────────────

export interface ResourceConfig {
  cpuRequest: string | null;
  cpuLimit: string | null;
  memoryRequest: string | null;
  memoryLimit: string | null;
}

/** Extract resource config from deployment.config */
export function extractResources(config: Record<string, unknown>): ResourceConfig {
  return {
    cpuRequest: (config.cpu_request as string) ?? null,
    cpuLimit: (config.cpu_limit as string) ?? null,
    memoryRequest: (config.memory_request as string) ?? null,
    memoryLimit: (config.memory_limit as string) ?? null,
  };
}

/** Config keys that represent resources (excluded from general config display) */
export const RESOURCE_CONFIG_KEYS = new Set([
  "cpu_request",
  "cpu_limit",
  "memory_request",
  "memory_limit",
]);
