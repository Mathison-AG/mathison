/**
 * Ingress Helper
 *
 * Utilities for managing K8s Ingress resources.
 * Builds ingress specs from recipe config and applies them.
 */

import * as k8s from "@kubernetes/client-node";

// ─── Types ────────────────────────────────────────────────

export interface IngressOptions {
  name: string;
  namespace: string;
  serviceName: string;
  servicePort: number;
  host: string;
  ingressClass?: string;
  tls?: boolean;
  tlsClusterIssuer?: string;
  annotations?: Record<string, string>;
}

// Re-use the KubeConfig from the main kubernetes module
// but keep this module self-contained for imports
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

function getNetworkingApi(): k8s.NetworkingV1Api {
  return getKubeConfig().makeApiClient(k8s.NetworkingV1Api);
}

// ─── Ingress class detection ──────────────────────────────

/**
 * Auto-detect available IngressClass in the cluster.
 * Returns the first available class name, or null if none found.
 */
export async function detectIngressClass(): Promise<string | null> {
  const api = getNetworkingApi();

  try {
    const res = await api.listIngressClass();
    const classes = res.items ?? [];

    if (classes.length === 0) return null;

    // Prefer the default class, then nginx, then traefik, then first available
    const defaultClass = classes.find(
      (ic) => ic.metadata?.annotations?.["ingressclass.kubernetes.io/is-default-class"] === "true"
    );
    if (defaultClass?.metadata?.name) return defaultClass.metadata.name;

    const nginx = classes.find((ic) => ic.metadata?.name === "nginx");
    if (nginx?.metadata?.name) return nginx.metadata.name;

    const traefik = classes.find((ic) => ic.metadata?.name === "traefik");
    if (traefik?.metadata?.name) return traefik.metadata.name;

    return classes[0]?.metadata?.name ?? null;
  } catch (err) {
    console.error("[ingress] Failed to detect ingress class:", err);
    return null;
  }
}

// ─── Ingress spec builder ─────────────────────────────────

/**
 * Build a K8s Ingress manifest from options.
 * Supports host-based routing, TLS with cert-manager, custom ingress class.
 */
export function buildIngressSpec(options: IngressOptions): k8s.V1Ingress {
  const annotations: Record<string, string> = {
    "mathison.io/managed-by": "mathison",
    ...options.annotations,
  };

  // Add cert-manager annotation for TLS
  if (options.tls && options.tlsClusterIssuer) {
    annotations["cert-manager.io/cluster-issuer"] = options.tlsClusterIssuer;
  }

  const ingress: k8s.V1Ingress = {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: options.name,
      namespace: options.namespace,
      annotations,
      labels: {
        "mathison.io/managed-by": "mathison",
      },
    },
    spec: {
      rules: [
        {
          host: options.host,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: options.serviceName,
                    port: { number: options.servicePort },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  // Set ingress class
  if (options.ingressClass) {
    ingress.spec!.ingressClassName = options.ingressClass;
  }

  // Add TLS section
  if (options.tls) {
    ingress.spec!.tls = [
      {
        hosts: [options.host],
        secretName: `${options.name}-tls`,
      },
    ];
  }

  return ingress;
}

/**
 * Build a host name from service + tenant + domain.
 * Pattern: {serviceName}-{tenantSlug}.{domain}
 */
export function buildIngressHost(
  serviceName: string,
  tenantSlug: string,
  domain: string
): string {
  return `${serviceName}-${tenantSlug}.${domain}`;
}

// ─── Apply ingress ────────────────────────────────────────

/**
 * Create or update an Ingress resource.
 */
export async function createOrUpdateIngress(
  namespace: string,
  spec: k8s.V1Ingress
): Promise<{ created: boolean }> {
  const api = getNetworkingApi();
  const name = spec.metadata?.name;

  if (!name) {
    throw new Error("[ingress] Ingress spec missing metadata.name");
  }

  try {
    await api.replaceNamespacedIngress({
      name,
      namespace,
      body: spec,
    });
    console.log(`[ingress] Updated ingress ${name} in ${namespace}`);
    return { created: false };
  } catch (err: unknown) {
    if (isK8sNotFound(err)) {
      await api.createNamespacedIngress({
        namespace,
        body: spec,
      });
      console.log(`[ingress] Created ingress ${name} in ${namespace}`);
      return { created: true };
    }
    throw err;
  }
}

/**
 * Delete an Ingress resource.
 */
export async function deleteIngress(
  namespace: string,
  name: string
): Promise<void> {
  const api = getNetworkingApi();

  try {
    await api.deleteNamespacedIngress({ name, namespace });
    console.log(`[ingress] Deleted ingress ${name} from ${namespace}`);
  } catch (err: unknown) {
    if (isK8sNotFound(err)) {
      console.log(`[ingress] Ingress ${name} not found (already deleted)`);
      return;
    }
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────

function isK8sNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    (err as { statusCode: number }).statusCode === 404
  );
}
