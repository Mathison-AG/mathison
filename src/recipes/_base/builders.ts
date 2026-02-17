/**
 * K8s Resource Builders
 *
 * Thin wrapper functions that construct typed @kubernetes/client-node objects
 * with sensible defaults. Each builder sets standard labels, security contexts,
 * and handles env vars from both plain values and secret references.
 */

import type * as k8s from "@kubernetes/client-node";

import type {
  StandardLabels,
  ResourceRequirements,
  EnvVar,
  EnvVarSecretRef,
  VolumeMountDefinition,
  ProbeDefinition,
} from "./types";

// ─── Label Helpers ────────────────────────────────────────

/**
 * Build standard Kubernetes labels for a resource.
 */
export function standardLabels(
  appName: string,
  instanceName: string,
  component?: string
): StandardLabels {
  const labels: StandardLabels = {
    "app.kubernetes.io/name": appName,
    "app.kubernetes.io/instance": instanceName,
    "app.kubernetes.io/managed-by": "mathison",
  };
  if (component) {
    labels["app.kubernetes.io/component"] = component;
  }
  return labels;
}

/**
 * Build a match-labels selector (subset of standard labels).
 */
export function matchLabels(
  appName: string,
  instanceName: string
): Record<string, string> {
  return {
    "app.kubernetes.io/name": appName,
    "app.kubernetes.io/instance": instanceName,
  };
}

// ─── Env Var Helpers ──────────────────────────────────────

function isSecretRef(env: EnvVar): env is EnvVarSecretRef {
  return "secretName" in env;
}

/**
 * Convert EnvVar definitions to K8s V1EnvVar objects.
 */
export function buildEnvVars(envs: EnvVar[]): k8s.V1EnvVar[] {
  return envs.map((env) => {
    if (isSecretRef(env)) {
      return {
        name: env.name,
        valueFrom: {
          secretKeyRef: {
            name: env.secretName,
            key: env.secretKey,
          },
        },
      };
    }
    return {
      name: env.name,
      value: env.value,
    };
  });
}

// ─── Probe Helpers ────────────────────────────────────────

/**
 * Convert a ProbeDefinition to a K8s V1Probe object.
 */
export function buildProbe(probe: ProbeDefinition): k8s.V1Probe {
  const base: k8s.V1Probe = {
    initialDelaySeconds: probe.initialDelaySeconds ?? 10,
    periodSeconds: probe.periodSeconds ?? 10,
    timeoutSeconds: probe.timeoutSeconds ?? 5,
    failureThreshold: probe.failureThreshold ?? 3,
    successThreshold: probe.successThreshold ?? 1,
  };

  switch (probe.type) {
    case "tcp":
      return { ...base, tcpSocket: { port: probe.port! } };
    case "http":
      return {
        ...base,
        httpGet: { port: probe.port!, path: probe.path ?? "/" },
      };
    case "exec":
      return { ...base, exec: { command: probe.command ?? [] } };
  }
}

// ─── Resource Builders ────────────────────────────────────

export interface StatefulSetSpec {
  appName: string;
  image: string;
  imageTag?: string;
  replicas?: number;
  ports: Array<{ name: string; containerPort: number; protocol?: string }>;
  env?: EnvVar[];
  resources?: ResourceRequirements;
  volumeMounts?: VolumeMountDefinition[];
  volumeClaimTemplates?: Array<{
    name: string;
    storageSize: string;
    accessModes?: string[];
    storageClass?: string;
  }>;
  command?: string[];
  args?: string[];
  livenessProbe?: ProbeDefinition;
  readinessProbe?: ProbeDefinition;
  securityContext?: k8s.V1PodSecurityContext;
  containerSecurityContext?: k8s.V1SecurityContext;
  component?: string;
  initContainers?: k8s.V1Container[];
  serviceAccountName?: string;
  extraLabels?: Record<string, string>;
  extraAnnotations?: Record<string, string>;
}

/**
 * Build a V1StatefulSet with standard labels and sensible defaults.
 */
export function statefulSet(
  name: string,
  namespace: string,
  spec: StatefulSetSpec
): k8s.V1StatefulSet {
  const labels = {
    ...standardLabels(spec.appName, name, spec.component),
    ...spec.extraLabels,
  };
  const selector = matchLabels(spec.appName, name);

  const container: k8s.V1Container = {
    name: spec.appName,
    image: spec.imageTag
      ? `${spec.image}:${spec.imageTag}`
      : spec.image,
    ports: spec.ports.map((p) => ({
      name: p.name,
      containerPort: p.containerPort,
      protocol: p.protocol ?? "TCP",
    })),
    env: spec.env ? buildEnvVars(spec.env) : undefined,
    resources: spec.resources
      ? {
          requests: spec.resources.requests,
          limits: spec.resources.limits,
        }
      : undefined,
    volumeMounts: spec.volumeMounts?.map((vm) => ({
      name: vm.name,
      mountPath: vm.mountPath,
      subPath: vm.subPath,
      readOnly: vm.readOnly,
    })),
    livenessProbe: spec.livenessProbe
      ? buildProbe(spec.livenessProbe)
      : undefined,
    readinessProbe: spec.readinessProbe
      ? buildProbe(spec.readinessProbe)
      : undefined,
    securityContext: spec.containerSecurityContext,
  };

  return {
    apiVersion: "apps/v1",
    kind: "StatefulSet",
    metadata: {
      name,
      namespace,
      labels,
      annotations: spec.extraAnnotations,
    },
    spec: {
      replicas: spec.replicas ?? 1,
      serviceName: name,
      selector: { matchLabels: selector },
      template: {
        metadata: { labels },
        spec: {
          serviceAccountName: spec.serviceAccountName,
          securityContext: spec.securityContext ?? {
            fsGroup: 1001,
          },
          initContainers: spec.initContainers,
          containers: [container],
        },
      },
      volumeClaimTemplates: spec.volumeClaimTemplates?.map((vct) => ({
        metadata: { name: vct.name },
        spec: {
          accessModes: vct.accessModes ?? ["ReadWriteOnce"],
          storageClassName: vct.storageClass || undefined,
          resources: {
            requests: { storage: vct.storageSize },
          },
        },
      })),
    },
  };
}

export interface DeploymentSpec {
  appName: string;
  image: string;
  imageTag?: string;
  replicas?: number;
  ports: Array<{ name: string; containerPort: number; protocol?: string }>;
  env?: EnvVar[];
  resources?: ResourceRequirements;
  volumeMounts?: VolumeMountDefinition[];
  volumes?: k8s.V1Volume[];
  command?: string[];
  args?: string[];
  livenessProbe?: ProbeDefinition;
  readinessProbe?: ProbeDefinition;
  securityContext?: k8s.V1PodSecurityContext;
  containerSecurityContext?: k8s.V1SecurityContext;
  component?: string;
  initContainers?: k8s.V1Container[];
  serviceAccountName?: string;
  strategy?: k8s.V1DeploymentStrategy;
  extraLabels?: Record<string, string>;
  extraAnnotations?: Record<string, string>;
}

/**
 * Build a V1Deployment with standard labels and sensible defaults.
 */
export function deployment(
  name: string,
  namespace: string,
  spec: DeploymentSpec
): k8s.V1Deployment {
  const labels = {
    ...standardLabels(spec.appName, name, spec.component),
    ...spec.extraLabels,
  };
  const selector = matchLabels(spec.appName, name);

  const container: k8s.V1Container = {
    name: spec.appName,
    image: spec.imageTag
      ? `${spec.image}:${spec.imageTag}`
      : spec.image,
    ports: spec.ports.map((p) => ({
      name: p.name,
      containerPort: p.containerPort,
      protocol: p.protocol ?? "TCP",
    })),
    env: spec.env ? buildEnvVars(spec.env) : undefined,
    resources: spec.resources
      ? {
          requests: spec.resources.requests,
          limits: spec.resources.limits,
        }
      : undefined,
    volumeMounts: spec.volumeMounts?.map((vm) => ({
      name: vm.name,
      mountPath: vm.mountPath,
      subPath: vm.subPath,
      readOnly: vm.readOnly,
    })),
    livenessProbe: spec.livenessProbe
      ? buildProbe(spec.livenessProbe)
      : undefined,
    readinessProbe: spec.readinessProbe
      ? buildProbe(spec.readinessProbe)
      : undefined,
    securityContext: spec.containerSecurityContext,
    command: spec.command,
    args: spec.args,
  };

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name,
      namespace,
      labels,
      annotations: spec.extraAnnotations,
    },
    spec: {
      replicas: spec.replicas ?? 1,
      selector: { matchLabels: selector },
      strategy: spec.strategy ?? { type: "RollingUpdate" },
      template: {
        metadata: { labels },
        spec: {
          serviceAccountName: spec.serviceAccountName,
          securityContext: spec.securityContext ?? {
            fsGroup: 1001,
          },
          initContainers: spec.initContainers,
          containers: [container],
          volumes: spec.volumes,
        },
      },
    },
  };
}

export interface ServiceSpec {
  appName: string;
  ports: Array<{
    name: string;
    port: number;
    targetPort: number;
    protocol?: string;
  }>;
  type?: string;
  component?: string;
  extraLabels?: Record<string, string>;
  /** Override the selector (default: matchLabels for appName + name) */
  selector?: Record<string, string>;
}

/**
 * Build a V1Service with standard labels.
 */
export function service(
  name: string,
  namespace: string,
  spec: ServiceSpec
): k8s.V1Service {
  const labels = {
    ...standardLabels(spec.appName, name, spec.component),
    ...spec.extraLabels,
  };

  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name,
      namespace,
      labels,
    },
    spec: {
      type: spec.type ?? "ClusterIP",
      selector:
        spec.selector ?? matchLabels(spec.appName, name),
      ports: spec.ports.map((p) => ({
        name: p.name,
        port: p.port,
        targetPort: p.targetPort,
        protocol: p.protocol ?? "TCP",
      })),
    },
  };
}

export interface SecretSpec {
  appName: string;
  /** Plain-text data (K8s will base64-encode via stringData) */
  stringData: Record<string, string>;
  component?: string;
  extraLabels?: Record<string, string>;
}

/**
 * Build a V1Secret (Opaque) with standard labels.
 * Uses stringData so K8s handles base64 encoding.
 */
export function secret(
  name: string,
  namespace: string,
  spec: SecretSpec
): k8s.V1Secret {
  const labels = {
    ...standardLabels(spec.appName, name, spec.component),
    ...spec.extraLabels,
  };

  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name,
      namespace,
      labels,
    },
    type: "Opaque",
    stringData: spec.stringData,
  };
}

export interface PersistentVolumeClaimSpec {
  appName: string;
  storageSize: string;
  accessModes?: string[];
  storageClass?: string;
  component?: string;
  extraLabels?: Record<string, string>;
}

/**
 * Build a V1PersistentVolumeClaim with standard labels.
 */
export function persistentVolumeClaim(
  name: string,
  namespace: string,
  spec: PersistentVolumeClaimSpec
): k8s.V1PersistentVolumeClaim {
  const labels = {
    ...standardLabels(spec.appName, name, spec.component),
    ...spec.extraLabels,
  };

  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name,
      namespace,
      labels,
    },
    spec: {
      accessModes: spec.accessModes ?? ["ReadWriteOnce"],
      storageClassName: spec.storageClass || undefined,
      resources: {
        requests: { storage: spec.storageSize },
      },
    },
  };
}

export interface IngressSpec {
  appName: string;
  host: string;
  serviceName: string;
  servicePort: number;
  path?: string;
  pathType?: string;
  ingressClass?: string;
  tls?: {
    secretName: string;
    clusterIssuer?: string;
  };
  component?: string;
  extraLabels?: Record<string, string>;
  extraAnnotations?: Record<string, string>;
}

/**
 * Build a V1Ingress with standard labels and optional TLS.
 */
export function ingress(
  name: string,
  namespace: string,
  spec: IngressSpec
): k8s.V1Ingress {
  const labels = {
    ...standardLabels(spec.appName, name, spec.component),
    ...spec.extraLabels,
  };

  const annotations: Record<string, string> = {
    ...spec.extraAnnotations,
  };

  if (spec.tls?.clusterIssuer) {
    annotations["cert-manager.io/cluster-issuer"] = spec.tls.clusterIssuer;
  }

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name,
      namespace,
      labels,
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
    },
    spec: {
      ingressClassName: spec.ingressClass || undefined,
      rules: [
        {
          host: spec.host,
          http: {
            paths: [
              {
                path: spec.path ?? "/",
                pathType: spec.pathType ?? "Prefix",
                backend: {
                  service: {
                    name: spec.serviceName,
                    port: { number: spec.servicePort },
                  },
                },
              },
            ],
          },
        },
      ],
      tls: spec.tls
        ? [
            {
              secretName: spec.tls.secretName,
              hosts: [spec.host],
            },
          ]
        : undefined,
    },
  };
}

export interface ConfigMapSpec {
  appName: string;
  data: Record<string, string>;
  component?: string;
  extraLabels?: Record<string, string>;
}

/**
 * Build a V1ConfigMap with standard labels.
 */
export function configMap(
  name: string,
  namespace: string,
  spec: ConfigMapSpec
): k8s.V1ConfigMap {
  const labels = {
    ...standardLabels(spec.appName, name, spec.component),
    ...spec.extraLabels,
  };

  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name,
      namespace,
      labels,
    },
    data: spec.data,
  };
}
