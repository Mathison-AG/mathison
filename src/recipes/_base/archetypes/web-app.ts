/**
 * Web App Archetype
 *
 * Generates a complete RecipeDefinition for web applications:
 *   Deployment + Service + optional PVC + optional Ingress
 *
 * Handles: rolling updates, probes, ingress with TLS, persistent storage.
 */

import type { z } from "zod/v4";
import * as builders from "../builders";

import type {
  RecipeDefinition,
  BuildContext,
  KubernetesResource,
  ConnectionInfo,
  ConnectionContext,
  HealthCheckSpec,
  HealthCheckContext,
  SecretDefinition,
  DependencyDefinition,
  AiHints,
  ServicePortDefinition,
  IngressDefinition,
  EnvVar,
  ProbeDefinition,
  ResourceRequirements,
  VolumeMountDefinition,
  DataExportDefinition,
  DataImportDefinition,
} from "../types";

// ─── Web App Descriptor ───────────────────────────────────

export interface WebAppDescriptor<TConfig> {
  // Identity
  slug: string;
  displayName: string;
  category: string;
  description: string;
  tags: string[];

  // Consumer-facing
  shortDescription?: string;
  useCases: string[];
  gettingStarted?: string;
  websiteUrl?: string;
  documentationUrl?: string;
  featured?: boolean;

  // Configuration
  configSchema: z.ZodType<TConfig>;
  secrets: Record<string, SecretDefinition>;
  dependencies?: Record<string, DependencyDefinition>;

  // Container
  image: string;
  imageTag?: string | ((config: TConfig) => string);
  containerPort: number;
  portName?: string;

  // Environment
  env: (ctx: BuildContext<TConfig>) => EnvVar[];

  // Command/args
  command?: (ctx: BuildContext<TConfig>) => string[];
  args?: (ctx: BuildContext<TConfig>) => string[];

  // Storage (optional for web apps)
  persistence?: {
    enabled: boolean | ((config: TConfig) => boolean);
    mountPath: string;
    storageSize: (config: TConfig) => string;
    volumeName?: string;
  };

  // Additional volumes (e.g. for config)
  volumes?: (ctx: BuildContext<TConfig>) => {
    volumes: Array<{ name: string; source: unknown }>;
    mounts: VolumeMountDefinition[];
  };

  // Resources
  defaultResources: (config: TConfig) => ResourceRequirements;

  // Security
  runAsUser?: number;
  runAsGroup?: number;
  fsGroup?: number;

  // Probes
  livenessProbe?: ProbeDefinition | ((config: TConfig) => ProbeDefinition);
  readinessProbe?: ProbeDefinition | ((config: TConfig) => ProbeDefinition);

  // Service
  servicePorts?: ServicePortDefinition[];

  // Ingress
  ingress?: IngressDefinition;

  // Connection info for dependents (optional — most web apps don't provide this)
  connectionInfo?: (ctx: ConnectionContext<TConfig>) => ConnectionInfo;

  // Health check
  healthCheck: (ctx: HealthCheckContext<TConfig>) => HealthCheckSpec;

  // Data export/import
  dataExport?: DataExportDefinition;
  dataImport?: DataImportDefinition;

  // AI
  aiHints: AiHints;
}

// ─── Web App Archetype Function ───────────────────────────

export function webApp<TConfig>(
  descriptor: WebAppDescriptor<TConfig>
): RecipeDefinition<TConfig> {
  const portName = descriptor.portName ?? "http";
  const serviceNameSuffix = descriptor.ingress?.serviceNameSuffix ?? "";

  const ports: ServicePortDefinition[] = descriptor.servicePorts ?? [
    {
      name: portName,
      port: descriptor.containerPort,
      targetPort: descriptor.containerPort,
    },
  ];

  return {
    slug: descriptor.slug,
    displayName: descriptor.displayName,
    category: descriptor.category,
    description: descriptor.description,
    tags: descriptor.tags,
    shortDescription: descriptor.shortDescription,
    useCases: descriptor.useCases,
    gettingStarted: descriptor.gettingStarted,
    websiteUrl: descriptor.websiteUrl,
    documentationUrl: descriptor.documentationUrl,
    hasWebUI: true,
    featured: descriptor.featured,
    configSchema: descriptor.configSchema,
    secrets: descriptor.secrets,
    dependencies: descriptor.dependencies,
    ports,
    ingress: descriptor.ingress ?? {
      enabled: true,
      port: descriptor.containerPort,
      serviceNameSuffix,
    },
    aiHints: descriptor.aiHints,

    build(ctx: BuildContext<TConfig>): KubernetesResource[] {
      const resources: KubernetesResource[] = [];
      const { name, namespace, config, secrets: secretValues } = ctx;

      const resolvedTag =
        typeof descriptor.imageTag === "function"
          ? descriptor.imageTag(config)
          : descriptor.imageTag;

      // 1. Secret (if needed)
      const secretName = `${name}-secret`;
      if (Object.keys(secretValues).length > 0) {
        resources.push(
          builders.secret(secretName, namespace, {
            appName: descriptor.slug,
            stringData: secretValues,
          })
        );
      }

      // 2. PVC (if persistence enabled)
      const persistEnabled =
        descriptor.persistence &&
        (typeof descriptor.persistence.enabled === "function"
          ? descriptor.persistence.enabled(config)
          : descriptor.persistence.enabled);

      const pvcName = `${name}-data`;
      if (persistEnabled && descriptor.persistence) {
        resources.push(
          builders.persistentVolumeClaim(pvcName, namespace, {
            appName: descriptor.slug,
            storageSize: descriptor.persistence.storageSize(config),
          })
        );
      }

      // 3. Deployment
      const envVars = descriptor.env(ctx);
      const defaultRes = descriptor.defaultResources(config);

      const volumeMounts: VolumeMountDefinition[] = [];
      const volumes: Array<{ name: string; persistentVolumeClaim?: { claimName: string } }> = [];

      if (persistEnabled && descriptor.persistence) {
        const volName = descriptor.persistence.volumeName ?? "data";
        volumeMounts.push({
          name: volName,
          mountPath: descriptor.persistence.mountPath,
        });
        volumes.push({
          name: volName,
          persistentVolumeClaim: { claimName: pvcName },
        });
      }

      // Additional volumes from descriptor
      const extraVols = descriptor.volumes?.(ctx);
      if (extraVols) {
        for (const vm of extraVols.mounts) {
          volumeMounts.push(vm);
        }
      }

      const livenessProbe =
        typeof descriptor.livenessProbe === "function"
          ? descriptor.livenessProbe(config)
          : descriptor.livenessProbe;

      const readinessProbe =
        typeof descriptor.readinessProbe === "function"
          ? descriptor.readinessProbe(config)
          : descriptor.readinessProbe;

      const commandResult = descriptor.command?.(ctx);
      const argsResult = descriptor.args?.(ctx);

      const k8sVolumes = [
        ...volumes.map((v) => ({
          name: v.name,
          persistentVolumeClaim: v.persistentVolumeClaim,
        })),
        ...(extraVols?.volumes.map((v) => ({
          name: v.name,
          ...(v.source as Record<string, unknown>),
        })) ?? []),
      ];

      resources.push(
        builders.deployment(name, namespace, {
          appName: descriptor.slug,
          image: descriptor.image,
          imageTag: resolvedTag,
          command: commandResult,
          args: argsResult,
          ports: [
            {
              name: portName,
              containerPort: descriptor.containerPort,
            },
          ],
          env: envVars,
          resources: defaultRes,
          volumeMounts: volumeMounts.length > 0 ? volumeMounts : undefined,
          volumes: k8sVolumes.length > 0 ? k8sVolumes : undefined,
          livenessProbe,
          readinessProbe,
          securityContext: {
            fsGroup: descriptor.fsGroup ?? 1001,
            ...(descriptor.runAsUser !== undefined && {
              runAsUser: descriptor.runAsUser,
            }),
            ...(descriptor.runAsGroup !== undefined && {
              runAsGroup: descriptor.runAsGroup,
            }),
          },
          strategy: { type: "Recreate" },
        })
      );

      // 4. Service
      const svcName = `${name}${serviceNameSuffix}`;
      resources.push(
        builders.service(svcName, namespace, {
          appName: descriptor.slug,
          ports: ports.map((p) => ({
            name: p.name,
            port: p.port,
            targetPort: p.targetPort,
          })),
          selector: builders.matchLabels(descriptor.slug, name),
        })
      );

      // 5. Ingress (if ingress context provided and recipe supports it)
      if (ctx.ingress && descriptor.ingress?.enabled) {
        const hostname = descriptor.ingress.hostnameTemplate
          ? descriptor.ingress.hostnameTemplate
              .replace("{name}", name)
              .replace("{domain}", ctx.ingress.domain)
          : `${name}.${ctx.ingress.domain}`;

        const ingressTls = ctx.ingress.tlsEnabled
          ? {
              secretName: `${name}-tls`,
              clusterIssuer: ctx.ingress.tlsClusterIssuer,
            }
          : undefined;

        resources.push(
          builders.ingress(`${name}-ingress`, namespace, {
            appName: descriptor.slug,
            host: hostname,
            serviceName: svcName,
            servicePort: descriptor.ingress.port,
            path: descriptor.ingress.path ?? "/",
            ingressClass: ctx.ingress.ingressClass,
            tls: ingressTls,
          })
        );
      }

      return resources;
    },

    connectionInfo: descriptor.connectionInfo,
    healthCheck: descriptor.healthCheck,
    dataExport: descriptor.dataExport,
    dataImport: descriptor.dataImport,
  };
}
