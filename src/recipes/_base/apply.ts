/**
 * Server-Side Apply Wrapper
 *
 * Functions for applying typed K8s resources using Server-Side Apply (SSA).
 * Uses @kubernetes/client-node patch API with fieldManager: "mathison".
 */

import * as k8s from "@kubernetes/client-node";

import type { KubernetesResource } from "./types";

// ─── K8s Client ───────────────────────────────────────────

let _kubeConfig: k8s.KubeConfig | null = null;

function getKubeConfig(): k8s.KubeConfig {
  if (_kubeConfig) return _kubeConfig;

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

  _kubeConfig = kc;
  return kc;
}

function getObjectApi(): k8s.KubernetesObjectApi {
  const kc = getKubeConfig();
  return k8s.KubernetesObjectApi.makeApiClient(kc);
}

/** Reset cached kubeconfig (useful for testing) */
export function resetKubeConfig(): void {
  _kubeConfig = null;
}

// ─── Error Helpers ────────────────────────────────────────

interface K8sApiError {
  statusCode: number;
  body?: { message?: string };
}

function isK8sError(err: unknown): err is K8sApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    typeof (err as K8sApiError).statusCode === "number"
  );
}

function resourceId(resource: KubernetesResource): string {
  const kind = resource.kind ?? "Unknown";
  const name = resource.metadata?.name ?? "unnamed";
  const ns = resource.metadata?.namespace ?? "";
  return ns ? `${kind}/${ns}/${name}` : `${kind}/${name}`;
}

// ─── Apply Options ────────────────────────────────────────

export interface ApplyOptions {
  /** Field manager name (default: "mathison") */
  fieldManager?: string;
  /** Force conflicts (default: true) */
  force?: boolean;
  /** Dry run mode — validate without applying */
  dryRun?: boolean;
}

// ─── Apply Result ─────────────────────────────────────────

export interface ApplyResult {
  resource: string;
  action: "created" | "configured" | "unchanged";
  error?: string;
}

// ─── Apply Resources ──────────────────────────────────────

/**
 * Apply a list of K8s resources using Server-Side Apply.
 * Each resource must have apiVersion, kind, and metadata.name set.
 */
export async function applyResources(
  resources: KubernetesResource[],
  options: ApplyOptions = {}
): Promise<ApplyResult[]> {
  const api = getObjectApi();
  const fieldManager = options.fieldManager ?? "mathison";
  const force = options.force ?? true;
  const dryRun = options.dryRun ? ["All"] : undefined;

  const results: ApplyResult[] = [];

  for (const resource of resources) {
    const id = resourceId(resource);

    try {
      // Ensure managedFields is not set (SSA manages this)
      if (resource.metadata) {
        delete (resource.metadata as Record<string, unknown>).managedFields;
      }

      await api.patch(
        resource,
        undefined, // pretty
        dryRun ? dryRun.join(",") : undefined, // dryRun
        fieldManager,
        force,
        "application/apply-patch+yaml"
      );

      results.push({ resource: id, action: "configured" });
      console.log(`[apply] ${dryRun ? "(dry-run) " : ""}Applied ${id}`);
    } catch (err: unknown) {
      if (isK8sError(err)) {
        const msg = err.body?.message ?? `HTTP ${err.statusCode}`;
        console.error(`[apply] Failed to apply ${id}: ${msg}`);
        results.push({ resource: id, action: "unchanged", error: msg });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[apply] Failed to apply ${id}: ${msg}`);
        results.push({ resource: id, action: "unchanged", error: msg });
      }
    }
  }

  return results;
}

// ─── Delete Resources ─────────────────────────────────────

export interface DeleteResult {
  resource: string;
  deleted: boolean;
  error?: string;
}

/**
 * Delete a list of K8s resources.
 * Processes in reverse order (ingress → service → deployment → pvc → secret).
 * Idempotent — ignores 404 (already deleted).
 */
export async function deleteResources(
  resources: KubernetesResource[]
): Promise<DeleteResult[]> {
  const api = getObjectApi();
  const results: DeleteResult[] = [];

  // Delete in reverse order for proper cleanup
  const reversed = [...resources].reverse();

  for (const resource of reversed) {
    const id = resourceId(resource);

    try {
      await api.delete(resource);
      results.push({ resource: id, deleted: true });
      console.log(`[apply] Deleted ${id}`);
    } catch (err: unknown) {
      if (isK8sError(err) && err.statusCode === 404) {
        results.push({ resource: id, deleted: false });
        console.log(`[apply] Already deleted: ${id}`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[apply] Failed to delete ${id}: ${msg}`);
        results.push({ resource: id, deleted: false, error: msg });
      }
    }
  }

  return results;
}

// ─── Dry Run ──────────────────────────────────────────────

/**
 * Validate resources without applying them.
 * Uses Server-Side Apply with dryRun: ["All"].
 */
export async function dryRunResources(
  resources: KubernetesResource[]
): Promise<ApplyResult[]> {
  return applyResources(resources, { dryRun: true });
}

// ─── Read Current State ───────────────────────────────────

/**
 * Read the current state of a resource from the cluster.
 * Returns null if the resource doesn't exist.
 */
export async function readResource(
  resource: KubernetesResource
): Promise<KubernetesResource | null> {
  const api = getObjectApi();

  try {
    const spec = resource as k8s.KubernetesObject & {
      metadata: { name: string; namespace?: string };
    };
    const result = await api.read(spec);
    return result as KubernetesResource;
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}
