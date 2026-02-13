/**
 * Resource Quota Helpers
 *
 * Helpers for building K8s ResourceQuota specs and checking availability.
 */

import * as k8s from "@kubernetes/client-node";

// ─── Types ────────────────────────────────────────────────

export interface QuotaSpec {
  cpu?: string;      // e.g. "4"
  memory?: string;   // e.g. "8Gi"
  storage?: string;  // e.g. "50Gi"
}

export interface QuotaUsage {
  hard: Record<string, string>;
  used: Record<string, string>;
}

// ─── KubeConfig (self-contained) ──────────────────────────

function getKubeConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  const kubeconfigPath = process.env.KUBECONFIG;

  if (kubeconfigPath) {
    kc.loadFromFile(kubeconfigPath);
  } else {
    try {
      kc.loadFromDefault();
    } catch {
      kc.loadFromCluster();
    }
  }
  return kc;
}

function getCoreApi(): k8s.CoreV1Api {
  return getKubeConfig().makeApiClient(k8s.CoreV1Api);
}

// ─── Quota spec builder ───────────────────────────────────

/**
 * Build a K8s ResourceQuota spec from a simplified quota object.
 *
 * Maps:
 *   cpu → limits.cpu + requests.cpu
 *   memory → limits.memory + requests.memory
 *   storage → requests.storage
 */
export function buildQuotaSpec(
  quota: QuotaSpec,
  name = "mathison-quota"
): k8s.V1ResourceQuota {
  const hard: Record<string, string> = {};

  if (quota.cpu) {
    hard["limits.cpu"] = quota.cpu;
    hard["requests.cpu"] = quota.cpu;
  }
  if (quota.memory) {
    hard["limits.memory"] = quota.memory;
    hard["requests.memory"] = quota.memory;
  }
  if (quota.storage) {
    hard["requests.storage"] = quota.storage;
  }

  return {
    metadata: {
      name,
      labels: {
        "mathison.io/managed-by": "mathison",
      },
    },
    spec: { hard },
  };
}

// ─── Quota availability check ─────────────────────────────

/**
 * Check if a deployment would exceed the tenant's resource quota.
 *
 * Returns { available: true } if there's enough room, or
 * { available: false, reason: "..." } explaining what's exceeded.
 */
export async function checkQuotaAvailability(
  namespace: string,
  requested: QuotaSpec
): Promise<{ available: boolean; reason?: string; usage?: QuotaUsage }> {
  const api = getCoreApi();

  try {
    const res = await api.listNamespacedResourceQuota({ namespace });
    const quotas = res.items ?? [];

    if (quotas.length === 0) {
      // No quota applied — everything is available
      return { available: true };
    }

    // Use the first quota (mathison creates one per namespace)
    const quota = quotas[0]!;
    const hard = quota.status?.hard ?? {};
    const used = quota.status?.used ?? {};

    const usage: QuotaUsage = {
      hard: hard as Record<string, string>,
      used: used as Record<string, string>,
    };

    const issues: string[] = [];

    // Check CPU
    if (requested.cpu && hard["limits.cpu"]) {
      const available = parseResource(hard["limits.cpu"] as string) - parseResource(used["limits.cpu"] as string ?? "0");
      const needed = parseResource(requested.cpu);
      if (needed > available) {
        issues.push(`CPU: need ${requested.cpu}, only ${formatCpu(available)} available`);
      }
    }

    // Check memory
    if (requested.memory && hard["limits.memory"]) {
      const available = parseMemory(hard["limits.memory"] as string) - parseMemory(used["limits.memory"] as string ?? "0");
      const needed = parseMemory(requested.memory);
      if (needed > available) {
        issues.push(`Memory: need ${requested.memory}, only ${formatBytes(available)} available`);
      }
    }

    // Check storage
    if (requested.storage && hard["requests.storage"]) {
      const available = parseMemory(hard["requests.storage"] as string) - parseMemory(used["requests.storage"] as string ?? "0");
      const needed = parseMemory(requested.storage);
      if (needed > available) {
        issues.push(`Storage: need ${requested.storage}, only ${formatBytes(available)} available`);
      }
    }

    if (issues.length > 0) {
      return {
        available: false,
        reason: `Quota exceeded: ${issues.join("; ")}`,
        usage,
      };
    }

    return { available: true, usage };
  } catch (err) {
    console.error(`[quota] Failed to check quota in ${namespace}:`, err);
    // If we can't check, assume available to not block deployments
    return { available: true };
  }
}

// ─── Parsing helpers ──────────────────────────────────────

/**
 * Parse a CPU resource string to a number of cores.
 * "4" → 4, "500m" → 0.5, "1500m" → 1.5
 */
function parseResource(value: string): number {
  if (value.endsWith("m")) {
    return parseInt(value.slice(0, -1), 10) / 1000;
  }
  return parseFloat(value) || 0;
}

/**
 * Parse a memory/storage resource string to bytes.
 * "8Gi" → 8589934592, "512Mi" → 536870912, "50Gi" → ...
 */
function parseMemory(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?$/);
  if (!match) return parseFloat(value) || 0;

  const num = parseFloat(match[1]!);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    k: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
  };

  return num * (multipliers[unit ?? ""] ?? 1);
}

function formatCpu(cores: number): string {
  if (cores >= 1) return `${cores.toFixed(1)} cores`;
  return `${Math.round(cores * 1000)}m`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}Gi`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}Mi`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}Ki`;
  return `${bytes}B`;
}
