/**
 * Secret Generation & K8s Secret Management
 *
 * Generates crypto-random passwords and manages K8s Secret resources
 * for deployment credentials.
 */

import * as crypto from "node:crypto";
import * as k8s from "@kubernetes/client-node";

import type { SecretsSchema } from "@/types/recipe";

// ─── Password generation ──────────────────────────────────

const PASSWORD_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate a cryptographically strong random password.
 */
export function generatePassword(length = 24): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

// ─── Secret schema processing ─────────────────────────────

/**
 * Generate secrets based on a recipe's secrets schema.
 * Reuses existing secrets if provided (for upgrades).
 */
export function generateSecrets(
  secretsSchema: SecretsSchema,
  existingSecrets?: Record<string, string>
): Record<string, string> {
  const secrets: Record<string, string> = {};

  for (const [key, field] of Object.entries(secretsSchema)) {
    // Reuse existing secret if available
    if (existingSecrets?.[key]) {
      secrets[key] = existingSecrets[key];
      continue;
    }

    // Auto-generate if schema says so
    if (field.generate) {
      secrets[key] = generatePassword(field.length || 24);
    }
  }

  return secrets;
}

// ─── K8s Secret operations ────────────────────────────────

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

function getCoreApi(): k8s.CoreV1Api {
  return getKubeConfig().makeApiClient(k8s.CoreV1Api);
}

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

/**
 * Create or update a K8s Secret in the given namespace.
 * Uses Opaque type with stringData (K8s handles base64 encoding).
 */
export async function createK8sSecret(
  namespace: string,
  name: string,
  data: Record<string, string>
): Promise<void> {
  const api = getCoreApi();

  const body: k8s.V1Secret = {
    metadata: {
      name,
      namespace,
      labels: {
        "mathison.io/managed-by": "mathison",
      },
    },
    type: "Opaque",
    stringData: data,
  };

  try {
    // Try to replace existing secret
    await api.replaceNamespacedSecret({ name, namespace, body });
    console.log(`[secrets] Updated K8s secret '${name}' in ${namespace}`);
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      // Doesn't exist — create it
      await api.createNamespacedSecret({ namespace, body });
      console.log(`[secrets] Created K8s secret '${name}' in ${namespace}`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[secrets] Failed to create/update secret '${name}':`, msg);
      throw new Error(`[secrets] Failed to manage secret '${name}': ${msg}`);
    }
  }
}

/**
 * Read a K8s Secret and return its decoded data.
 * Returns empty object if the secret doesn't exist.
 * Used during upgrades to retrieve existing secrets.
 */
export async function readK8sSecret(
  namespace: string,
  name: string
): Promise<Record<string, string>> {
  const api = getCoreApi();

  try {
    const secret = await api.readNamespacedSecret({ name, namespace });
    const data = secret.data ?? {};
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      // K8s stores secret data as base64-encoded strings
      result[key] = Buffer.from(value, "base64").toString("utf8");
    }

    return result;
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return {};
    }
    console.warn(`[secrets] Failed to read K8s secret '${name}':`, err);
    return {};
  }
}

/**
 * Delete a K8s Secret (used during undeploy).
 * Idempotent — ignores 404.
 */
export async function deleteK8sSecret(
  namespace: string,
  name: string
): Promise<void> {
  const api = getCoreApi();

  try {
    await api.deleteNamespacedSecret({ name, namespace });
    console.log(`[secrets] Deleted K8s secret '${name}' from ${namespace}`);
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      // Already deleted — fine
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[secrets] Failed to delete secret '${name}':`, msg);
    throw new Error(`[secrets] Failed to delete secret '${name}': ${msg}`);
  }
}
