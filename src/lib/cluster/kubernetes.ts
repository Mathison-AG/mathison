/**
 * Kubernetes Client Wrapper
 *
 * Higher-level functions wrapping @kubernetes/client-node.
 * All functions return clean objects — no raw K8s internals leaked.
 */

import * as k8s from "@kubernetes/client-node";

// ─── Client initialization ────────────────────────────────

let _kubeConfig: k8s.KubeConfig | null = null;

function getKubeConfig(): k8s.KubeConfig {
  if (_kubeConfig) return _kubeConfig;

  const kc = new k8s.KubeConfig();
  const kubeconfigPath = process.env.KUBECONFIG;

  if (kubeconfigPath) {
    kc.loadFromFile(kubeconfigPath);
  } else {
    // Try default kubeconfig first (covers kind, minikube, etc.)
    // Fall back to in-cluster if that fails
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

function getAppsApi(): k8s.AppsV1Api {
  return getKubeConfig().makeApiClient(k8s.AppsV1Api);
}

function getNetworkingApi(): k8s.NetworkingV1Api {
  return getKubeConfig().makeApiClient(k8s.NetworkingV1Api);
}

/** Reset cached kubeconfig (useful for testing) */
export function resetKubeConfig(): void {
  _kubeConfig = null;
}

/** Expose kubeconfig for Helm wrapper (needs KUBECONFIG path) */
export function getKubeConfigPath(): string | undefined {
  const kc = getKubeConfig();
  // If user set KUBECONFIG, use that. Otherwise export current config to a temp path.
  if (process.env.KUBECONFIG) {
    return process.env.KUBECONFIG;
  }
  // For kind/default, the kubeconfig is at the default location
  const currentContext = kc.getCurrentContext();
  if (currentContext) {
    return undefined; // helm uses default kubeconfig
  }
  return undefined;
}

// ─── Namespace operations ─────────────────────────────────

/**
 * Create a Kubernetes namespace (idempotent — skips if exists).
 */
export async function createNamespace(
  name: string,
  labels?: Record<string, string>
): Promise<{ created: boolean; name: string }> {
  const api = getCoreApi();

  try {
    await api.createNamespace({
      body: {
        metadata: {
          name,
          labels: {
            ...labels,
            "mathison.io/managed-by": "mathison",
          },
        },
      },
    });
    console.log(`[k8s] Created namespace: ${name}`);
    return { created: true, name };
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 409) {
      console.log(`[k8s] Namespace already exists: ${name}`);
      return { created: false, name };
    }
    throw wrapK8sError("createNamespace", err);
  }
}

/**
 * Delete a namespace and all resources within it.
 */
export async function deleteNamespace(name: string): Promise<void> {
  const api = getCoreApi();

  try {
    await api.deleteNamespace({ name });
    console.log(`[k8s] Deleted namespace: ${name}`);
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      console.log(`[k8s] Namespace not found (already deleted): ${name}`);
      return;
    }
    throw wrapK8sError("deleteNamespace", err);
  }
}

// ─── Resource quotas ──────────────────────────────────────

/**
 * Apply a ResourceQuota to a namespace (create or replace).
 */
export async function applyResourceQuota(
  namespace: string,
  quota: { cpu?: string; memory?: string; storage?: string }
): Promise<void> {
  const api = getCoreApi();
  const quotaName = "mathison-quota";

  const hard: Record<string, string> = {};
  if (quota.cpu) hard["limits.cpu"] = quota.cpu;
  if (quota.memory) hard["limits.memory"] = quota.memory;
  if (quota.storage) hard["requests.storage"] = quota.storage;

  const body: k8s.V1ResourceQuota = {
    metadata: {
      name: quotaName,
      namespace,
      labels: { "mathison.io/managed-by": "mathison" },
    },
    spec: { hard },
  };

  try {
    await api.replaceNamespacedResourceQuota({
      name: quotaName,
      namespace,
      body,
    });
    console.log(`[k8s] Updated resource quota in ${namespace}`);
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      // Doesn't exist yet — create it
      await api.createNamespacedResourceQuota({ namespace, body });
      console.log(`[k8s] Created resource quota in ${namespace}`);
    } else {
      throw wrapK8sError("applyResourceQuota", err);
    }
  }
}

// ─── Network policies ─────────────────────────────────────

/**
 * Apply default-deny NetworkPolicy for cross-tenant isolation.
 * Allows intra-namespace traffic + kube-system DNS.
 */
export async function applyNetworkPolicy(namespace: string): Promise<void> {
  const api = getNetworkingApi();
  const policyName = "mathison-default-deny";

  const body: k8s.V1NetworkPolicy = {
    metadata: {
      name: policyName,
      namespace,
      labels: { "mathison.io/managed-by": "mathison" },
    },
    spec: {
      podSelector: {}, // Applies to all pods
      policyTypes: ["Ingress"],
      ingress: [
        {
          // Allow traffic from same namespace
          _from: [{ namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": namespace } } }],
        },
        {
          // Allow DNS from kube-system
          _from: [{ namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "kube-system" } } }],
          ports: [
            { protocol: "UDP", port: 53 },
            { protocol: "TCP", port: 53 },
          ],
        },
      ],
    },
  };

  try {
    await api.replaceNamespacedNetworkPolicy({
      name: policyName,
      namespace,
      body,
    });
    console.log(`[k8s] Updated network policy in ${namespace}`);
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      await api.createNamespacedNetworkPolicy({ namespace, body });
      console.log(`[k8s] Created network policy in ${namespace}`);
    } else {
      throw wrapK8sError("applyNetworkPolicy", err);
    }
  }
}

// ─── Pod operations ───────────────────────────────────────

export interface PodInfo {
  name: string;
  status: string;
  ready: boolean;
  restarts: number;
  age: string;
}

/**
 * List pods in a namespace, optionally filtered by label selector.
 */
export async function listPods(
  namespace: string,
  labelSelector?: string
): Promise<PodInfo[]> {
  const api = getCoreApi();

  try {
    const res = await api.listNamespacedPod({
      namespace,
      labelSelector,
    });

    return (res.items ?? []).map(podToPodInfo);
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return [];
    }
    throw wrapK8sError("listPods", err);
  }
}

/**
 * Get logs from a pod (tail N lines). If pod has multiple containers, gets the first.
 */
export async function getPodLogs(
  namespace: string,
  podName: string,
  lines = 100
): Promise<string> {
  const api = getCoreApi();

  try {
    const logs = await api.readNamespacedPodLog({
      name: podName,
      namespace,
      tailLines: lines,
    });

    return logs ?? "(no logs)";
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return `Pod '${podName}' not found in namespace '${namespace}'.`;
    }
    throw wrapK8sError("getPodLogs", err);
  }
}

/**
 * Get logs for pods matching a Helm release label selector.
 * Returns concatenated logs from all matching pods.
 */
export async function getReleaseLogs(
  namespace: string,
  helmRelease: string,
  lines = 100
): Promise<string> {
  const pods = await listPods(
    namespace,
    `app.kubernetes.io/instance=${helmRelease}`
  );

  if (pods.length === 0) {
    return `No pods found for release '${helmRelease}' in namespace '${namespace}'.`;
  }

  const logParts: string[] = [];
  for (const pod of pods) {
    try {
      const logs = await getPodLogs(namespace, pod.name, lines);
      logParts.push(`─── ${pod.name} ───\n${logs}`);
    } catch {
      logParts.push(`─── ${pod.name} ───\n(failed to retrieve logs)`);
    }
  }

  return logParts.join("\n\n");
}

// ─── Deployment status ────────────────────────────────────

export interface DeploymentStatusInfo {
  name: string;
  ready: boolean;
  replicas: number;
  readyReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
}

/**
 * Get deployment or statefulset readiness by name.
 */
export async function getDeploymentStatus(
  namespace: string,
  name: string
): Promise<DeploymentStatusInfo | null> {
  const appsApi = getAppsApi();

  // Try Deployment first, then StatefulSet
  try {
    const dep = await appsApi.readNamespacedDeployment({ name, namespace });
    const status = dep.status;
    return {
      name: dep.metadata?.name ?? name,
      ready: (status?.readyReplicas ?? 0) >= (status?.replicas ?? 1),
      replicas: status?.replicas ?? 0,
      readyReplicas: status?.readyReplicas ?? 0,
      updatedReplicas: status?.updatedReplicas ?? 0,
      availableReplicas: status?.availableReplicas ?? 0,
    };
  } catch {
    // Not a Deployment — try StatefulSet
  }

  try {
    const sts = await appsApi.readNamespacedStatefulSet({ name, namespace });
    const status = sts.status;
    return {
      name: sts.metadata?.name ?? name,
      ready: (status?.readyReplicas ?? 0) >= (status?.replicas ?? 1),
      replicas: status?.replicas ?? 0,
      readyReplicas: status?.readyReplicas ?? 0,
      updatedReplicas: status?.updatedReplicas ?? 0,
      availableReplicas: status?.availableReplicas ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Get pod status for a Helm release (used by agent tools).
 * Tries `app.kubernetes.io/instance` (Bitnami/standard) first,
 * then falls back to `release` label (used by many community charts).
 */
export async function getReleasePodStatus(
  namespace: string,
  helmRelease: string
): Promise<{ pods: PodInfo[] }> {
  try {
    // Try standard Kubernetes label first
    let pods = await listPods(
      namespace,
      `app.kubernetes.io/instance=${helmRelease}`
    );

    // Fall back to Helm's release label
    if (pods.length === 0) {
      pods = await listPods(namespace, `release=${helmRelease}`);
    }

    return { pods };
  } catch (err) {
    console.error(`[k8s] Failed to get pod status for ${helmRelease}:`, err);
    return { pods: [] };
  }
}

// ─── Wait for ready ───────────────────────────────────────

/**
 * Poll until pods matching the label selector are ready, or timeout.
 * Returns true if ready, false if timed out.
 */
export async function waitForReady(
  namespace: string,
  labelSelector: string,
  timeoutSeconds = 300
): Promise<{ ready: boolean; pods: PodInfo[] }> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  const pollInterval = 5000; // 5 seconds

  while (Date.now() < deadline) {
    const pods = await listPods(namespace, labelSelector);

    if (pods.length > 0 && pods.every((p) => p.ready)) {
      console.log(
        `[k8s] All pods ready for selector '${labelSelector}' in ${namespace}`
      );
      return { ready: true, pods };
    }

    await sleep(pollInterval);
  }

  // Final check
  const pods = await listPods(namespace, labelSelector);
  return { ready: pods.length > 0 && pods.every((p) => p.ready), pods };
}

// ─── Service operations ───────────────────────────────────

export interface ServiceInfo {
  name: string;
  type: string;
  clusterIP: string | null;
  ports: Array<{ name?: string; port: number; targetPort: number | string; protocol: string }>;
}

/**
 * List K8s services in a namespace.
 */
export async function listServices(namespace: string): Promise<ServiceInfo[]> {
  const api = getCoreApi();

  try {
    const res = await api.listNamespacedService({ namespace });

    return (res.items ?? []).map((svc) => ({
      name: svc.metadata?.name ?? "unknown",
      type: svc.spec?.type ?? "ClusterIP",
      clusterIP: svc.spec?.clusterIP ?? null,
      ports: (svc.spec?.ports ?? []).map((p) => ({
        name: p.name,
        port: p.port,
        targetPort: p.targetPort ?? p.port,
        protocol: p.protocol ?? "TCP",
      })),
    }));
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return [];
    }
    throw wrapK8sError("listServices", err);
  }
}

// ─── Ingress operations ───────────────────────────────────

/**
 * Get the URL from an Ingress resource.
 */
export async function getIngressUrl(
  namespace: string,
  name: string
): Promise<string | null> {
  const api = getNetworkingApi();

  try {
    const ingress = await api.readNamespacedIngress({ name, namespace });
    const rules = ingress.spec?.rules ?? [];

    const firstRule = rules[0];
    if (rules.length > 0 && firstRule?.host) {
      const tls = ingress.spec?.tls;
      const scheme = tls && tls.length > 0 ? "https" : "http";
      return `${scheme}://${firstRule.host}`;
    }

    return null;
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return null;
    }
    throw wrapK8sError("getIngressUrl", err);
  }
}

// ─── Service port queries ─────────────────────────────────

export interface ReleaseServicePort {
  /** The K8s service port (what other services connect to) */
  port: number;
  /** The container target port */
  targetPort: number | string;
  /** Port name (e.g. "http", "postgresql") */
  name?: string;
  /** Protocol (TCP, UDP) */
  protocol: string;
}

/**
 * Get exposed service ports for a Helm release.
 * Filters by the standard Bitnami/Helm label `app.kubernetes.io/instance`.
 * Excludes headless services (clusterIP=None) and returns the primary
 * service's ports (prefers non-headless, non-metrics services).
 */
export async function getReleaseServicePorts(
  namespace: string,
  helmRelease: string
): Promise<ReleaseServicePort[]> {
  const api = getCoreApi();

  try {
    const res = await api.listNamespacedService({
      namespace,
      labelSelector: `app.kubernetes.io/instance=${helmRelease}`,
    });

    const services = res.items ?? [];
    // Filter out headless services and metrics-only services
    const candidates = services.filter(
      (svc) =>
        svc.spec?.clusterIP !== "None" &&
        !svc.metadata?.name?.endsWith("-metrics") &&
        !svc.metadata?.name?.endsWith("-headless")
    );

    // Pick the first candidate (Bitnami charts typically have one primary service)
    const primary = candidates[0];
    if (!primary?.spec?.ports?.length) {
      return [];
    }

    return primary.spec.ports.map((p) => ({
      port: p.port,
      targetPort: p.targetPort ?? p.port,
      name: p.name,
      protocol: p.protocol ?? "TCP",
    }));
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return [];
    }
    throw wrapK8sError("getReleaseServicePorts", err);
  }
}

// ─── Resource queries ─────────────────────────────────────

export interface ContainerResources {
  containerName: string;
  requests: { cpu: string | null; memory: string | null };
  limits: { cpu: string | null; memory: string | null };
}

export interface PodResources {
  podName: string;
  containers: ContainerResources[];
}

/**
 * Get resource requests/limits for pods matching a Helm release label.
 * Reads the actual pod spec (not just what was requested in values).
 */
export async function getReleaseResources(
  namespace: string,
  helmRelease: string
): Promise<PodResources[]> {
  const api = getCoreApi();

  try {
    const res = await api.listNamespacedPod({
      namespace,
      labelSelector: `app.kubernetes.io/instance=${helmRelease}`,
    });

    return (res.items ?? []).map((pod) => ({
      podName: pod.metadata?.name ?? "unknown",
      containers: (pod.spec?.containers ?? []).map((c) => ({
        containerName: c.name,
        requests: {
          cpu: c.resources?.requests?.["cpu"] ?? null,
          memory: c.resources?.requests?.["memory"] ?? null,
        },
        limits: {
          cpu: c.resources?.limits?.["cpu"] ?? null,
          memory: c.resources?.limits?.["memory"] ?? null,
        },
      })),
    }));
  } catch (err: unknown) {
    if (isK8sError(err) && err.statusCode === 404) {
      return [];
    }
    throw wrapK8sError("getReleaseResources", err);
  }
}

// ─── Helpers ──────────────────────────────────────────────

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

function wrapK8sError(operation: string, err: unknown): Error {
  if (isK8sError(err)) {
    const msg =
      err.body?.message ?? `K8s API returned status ${err.statusCode}`;
    console.error(`[k8s] ${operation} failed (${err.statusCode}):`, msg);
    return new Error(`[k8s:${operation}] ${msg}`);
  }

  if (err instanceof Error) {
    console.error(`[k8s] ${operation} failed:`, err.message);
    return new Error(`[k8s:${operation}] ${err.message}`);
  }

  console.error(`[k8s] ${operation} failed:`, err);
  return new Error(`[k8s:${operation}] Unknown error`);
}

function podToPodInfo(pod: k8s.V1Pod): PodInfo {
  const containerStatuses = pod.status?.containerStatuses ?? [];
  const totalRestarts = containerStatuses.reduce(
    (sum, cs) => sum + (cs.restartCount ?? 0),
    0
  );
  const allReady = containerStatuses.length > 0 && containerStatuses.every((cs) => cs.ready === true);

  let phase = pod.status?.phase ?? "Unknown";

  // Improve status with container-level info
  for (const cs of containerStatuses) {
    if (cs.state?.waiting?.reason) {
      phase = cs.state.waiting.reason; // CrashLoopBackOff, ImagePullBackOff, etc.
      break;
    }
    if (cs.state?.terminated?.reason) {
      phase = cs.state.terminated.reason;
      break;
    }
  }

  const createdAt = pod.metadata?.creationTimestamp;
  const age = createdAt ? formatAge(new Date(createdAt)) : "unknown";

  return {
    name: pod.metadata?.name ?? "unknown",
    status: phase,
    ready: allReady,
    restarts: totalRestarts,
    age,
  };
}

function formatAge(created: Date): string {
  const seconds = Math.floor((Date.now() - created.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
