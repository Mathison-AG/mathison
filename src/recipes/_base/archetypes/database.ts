/**
 * Database Archetype
 *
 * Generates a complete RecipeDefinition for stateful databases:
 *   StatefulSet + Service + Secret + PVC (via volumeClaimTemplate)
 *
 * Handles: security contexts, probes, standard labels, resource limits,
 * and optional extended configuration via ConfigMap.
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
} from "../types";

// ─── Database Descriptor ──────────────────────────────────

export interface DatabaseDescriptor<TConfig> {
  // Identity
  slug: string;
  displayName: string;
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

  // Storage
  dataVolumeName?: string;
  dataMountPath: string;
  storageSize: (config: TConfig) => string;

  // Optional config file (e.g. extended postgresql.conf)
  configFile?: (ctx: BuildContext<TConfig>) => { key: string; content: string } | undefined;
  configMountPath?: string;

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
  serviceNameSuffix?: string;

  // Connection info for dependents
  connectionInfo: (ctx: ConnectionContext<TConfig>) => ConnectionInfo;

  // Health check
  healthCheck: (ctx: HealthCheckContext<TConfig>) => HealthCheckSpec;

  // AI
  aiHints: AiHints;
}

// ─── Database Archetype Function ──────────────────────────

export function database<TConfig>(
  descriptor: DatabaseDescriptor<TConfig>
): RecipeDefinition<TConfig> {
  const portName = descriptor.portName ?? descriptor.slug;
  const dataVolumeName = descriptor.dataVolumeName ?? "data";
  const serviceNameSuffix = descriptor.serviceNameSuffix ?? "";

  const ports: ServicePortDefinition[] = descriptor.servicePorts ?? [
    {
      name: portName,
      port: descriptor.containerPort,
      targetPort: descriptor.containerPort,
    },
  ];

  const ingress: IngressDefinition = {
    enabled: false,
    port: descriptor.containerPort,
    serviceNameSuffix,
  };

  return {
    slug: descriptor.slug,
    displayName: descriptor.displayName,
    category: "database",
    description: descriptor.description,
    tags: descriptor.tags,
    shortDescription: descriptor.shortDescription,
    useCases: descriptor.useCases,
    gettingStarted: descriptor.gettingStarted,
    websiteUrl: descriptor.websiteUrl,
    documentationUrl: descriptor.documentationUrl,
    hasWebUI: false,
    featured: descriptor.featured,
    configSchema: descriptor.configSchema,
    secrets: descriptor.secrets,
    dependencies: descriptor.dependencies,
    ports,
    ingress,
    aiHints: descriptor.aiHints,

    build(ctx: BuildContext<TConfig>): KubernetesResource[] {
      const resources: KubernetesResource[] = [];
      const { name, namespace, config, secrets: secretValues } = ctx;

      const resolvedTag =
        typeof descriptor.imageTag === "function"
          ? descriptor.imageTag(config)
          : descriptor.imageTag;

      // 1. Secret
      const secretName = `${name}-secret`;
      if (Object.keys(secretValues).length > 0) {
        resources.push(
          builders.secret(secretName, namespace, {
            appName: descriptor.slug,
            stringData: secretValues,
          })
        );
      }

      // 2. ConfigMap (optional extended config)
      let configMapName: string | undefined;
      const configFileResult = descriptor.configFile?.(ctx);
      if (configFileResult) {
        configMapName = `${name}-config`;
        resources.push(
          builders.configMap(configMapName, namespace, {
            appName: descriptor.slug,
            data: { [configFileResult.key]: configFileResult.content },
          })
        );
      }

      // 3. StatefulSet
      const envVars = descriptor.env(ctx);
      const defaultRes = descriptor.defaultResources(config);

      const volumeMounts: Array<{
        name: string;
        mountPath: string;
        readOnly?: boolean;
      }> = [
        { name: dataVolumeName, mountPath: descriptor.dataMountPath },
      ];

      if (configMapName && descriptor.configMountPath) {
        volumeMounts.push({
          name: "config",
          mountPath: descriptor.configMountPath,
          readOnly: true,
        });
      }

      const livenessProbe =
        typeof descriptor.livenessProbe === "function"
          ? descriptor.livenessProbe(config)
          : descriptor.livenessProbe;

      const readinessProbe =
        typeof descriptor.readinessProbe === "function"
          ? descriptor.readinessProbe(config)
          : descriptor.readinessProbe;

      const sts = builders.statefulSet(name, namespace, {
        appName: descriptor.slug,
        image: descriptor.image,
        imageTag: resolvedTag,
        ports: [
          {
            name: portName,
            containerPort: descriptor.containerPort,
          },
        ],
        env: envVars,
        resources: defaultRes,
        volumeMounts,
        volumeClaimTemplates: [
          {
            name: dataVolumeName,
            storageSize: descriptor.storageSize(config),
          },
        ],
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
      });

      // Add configMap volume if needed
      if (configMapName && sts.spec?.template?.spec) {
        sts.spec.template.spec.volumes = [
          {
            name: "config",
            configMap: { name: configMapName },
          },
        ];
      }

      resources.push(sts);

      // 4. Service
      resources.push(
        builders.service(`${name}${serviceNameSuffix}`, namespace, {
          appName: descriptor.slug,
          ports: ports.map((p) => ({
            name: p.name,
            port: p.port,
            targetPort: p.targetPort,
          })),
          selector: builders.matchLabels(descriptor.slug, name),
        })
      );

      // 5. Headless service (for StatefulSet DNS)
      resources.push(
        builders.service(`${name}-headless`, namespace, {
          appName: descriptor.slug,
          ports: ports.map((p) => ({
            name: p.name,
            port: p.port,
            targetPort: p.targetPort,
          })),
          type: "None",
          selector: builders.matchLabels(descriptor.slug, name),
        })
      );

      return resources;
    },

    connectionInfo: descriptor.connectionInfo,
    healthCheck: descriptor.healthCheck,
  };
}
