/**
 * Cache Archetype
 *
 * Generates a complete RecipeDefinition for in-memory data stores:
 *   StatefulSet + Service + Secret
 *
 * Similar to database but typically smaller storage, different probes,
 * and optional persistence (RDB snapshots).
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
  AiHints,
  ServicePortDefinition,
  IngressDefinition,
  EnvVar,
  ProbeDefinition,
  ResourceRequirements,
  DataExportDefinition,
  DataImportDefinition,
} from "../types";

// ─── Cache Descriptor ─────────────────────────────────────

export interface CacheDescriptor<TConfig> {
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

  // Container
  image: string;
  imageTag?: string | ((config: TConfig) => string);
  containerPort: number;
  portName?: string;

  // Environment
  env: (ctx: BuildContext<TConfig>) => EnvVar[];

  // Command/args (e.g. redis-server --requirepass)
  command?: (ctx: BuildContext<TConfig>) => string[];
  args?: (ctx: BuildContext<TConfig>) => string[];

  // Storage (optional for caches)
  persistenceEnabled?: boolean | ((config: TConfig) => boolean);
  dataMountPath?: string;
  storageSize?: (config: TConfig) => string;

  // Config file (e.g. redis.conf)
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

  // Data export/import
  dataExport?: DataExportDefinition;
  dataImport?: DataImportDefinition;

  // AI
  aiHints: AiHints;
}

// ─── Cache Archetype Function ─────────────────────────────

export function cache<TConfig>(
  descriptor: CacheDescriptor<TConfig>
): RecipeDefinition<TConfig> {
  const portName = descriptor.portName ?? descriptor.slug;
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

      // 2. ConfigMap (optional config file)
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

      // 3. Determine persistence
      const persistEnabled =
        typeof descriptor.persistenceEnabled === "function"
          ? descriptor.persistenceEnabled(config)
          : descriptor.persistenceEnabled ?? false;

      // 4. StatefulSet
      const envVars = descriptor.env(ctx);
      const defaultRes = descriptor.defaultResources(config);

      const volumeMounts: Array<{
        name: string;
        mountPath: string;
        readOnly?: boolean;
      }> = [];
      if (persistEnabled && descriptor.dataMountPath) {
        volumeMounts.push({
          name: "data",
          mountPath: descriptor.dataMountPath,
        });
      }
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

      const commandResult = descriptor.command?.(ctx);
      const argsResult = descriptor.args?.(ctx);

      const sts = builders.statefulSet(name, namespace, {
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
        volumeClaimTemplates:
          persistEnabled && descriptor.storageSize
            ? [
                {
                  name: "data",
                  storageSize: descriptor.storageSize(config),
                },
              ]
            : undefined,
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
          ...(sts.spec.template.spec.volumes ?? []),
          {
            name: "config",
            configMap: { name: configMapName },
          },
        ];
      }

      resources.push(sts);

      // 5. Service
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

      return resources;
    },

    connectionInfo: descriptor.connectionInfo,
    healthCheck: descriptor.healthCheck,
    dataExport: descriptor.dataExport,
    dataImport: descriptor.dataImport,
  };
}
