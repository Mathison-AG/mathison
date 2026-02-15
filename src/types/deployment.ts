import type { DeploymentStatus } from "@/generated/prisma/enums";

// ─── K8s resource types ────────────────────────────────────

export interface ContainerResources {
  containerName: string;
  requests: { cpu: string | null; memory: string | null };
  limits: { cpu: string | null; memory: string | null };
}

export interface PodResources {
  podName: string;
  containers: ContainerResources[];
}

// ─── Service port types ──────────────────────────────────

export interface ServicePort {
  port: number;
  targetPort: number | string;
  name?: string;
  protocol: string;
}

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
  resources: PodResources[];
  ports: ServicePort[];
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

// ─── Resource helpers ─────────────────────────────────────

export interface ResourceSummary {
  cpuRequest: string | null;
  cpuLimit: string | null;
  memoryRequest: string | null;
  memoryLimit: string | null;
}

/**
 * Extract a resource summary from the first pod's main container.
 * This gives the "per-pod" resource allocation for display.
 */
export function getResourceSummary(resources: PodResources[]): ResourceSummary {
  const main = resources[0]?.containers[0];
  if (!main) {
    return { cpuRequest: null, cpuLimit: null, memoryRequest: null, memoryLimit: null };
  }
  return {
    cpuRequest: main.requests.cpu,
    cpuLimit: main.limits.cpu,
    memoryRequest: main.requests.memory,
    memoryLimit: main.limits.memory,
  };
}

/** Config keys that represent resources (excluded from general config display) */
export const RESOURCE_CONFIG_KEYS = new Set([
  "cpu_request",
  "cpu_limit",
  "memory_request",
  "memory_limit",
]);
