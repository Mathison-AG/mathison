/**
 * Object Store Archetype
 *
 * Generates a complete RecipeDefinition for S3-compatible object storage:
 *   StatefulSet + Service + Secret + PVC + dual Ingress (API + Console)
 *
 * Handles: S3 API and console ports, bucket creation, dual ingress.
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

// ─── Object Store Descriptor ──────────────────────────────

export interface ObjectStoreDescriptor<TConfig> {
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
  command?: (ctx: BuildContext<TConfig>) => string[];
  args?: (ctx: BuildContext<TConfig>) => string[];

  // Ports
  apiPort: number;
  consolePort: number;

  // Environment
  env: (ctx: BuildContext<TConfig>) => EnvVar[];

  // Storage
  dataMountPath: string;
  storageSize: (config: TConfig) => string;

  // Resources
  defaultResources: (config: TConfig) => ResourceRequirements;

  // Security
  runAsUser?: number;
  runAsGroup?: number;
  fsGroup?: number;

  // Probes
  livenessProbe?: ProbeDefinition | ((config: TConfig) => ProbeDefinition);
  readinessProbe?: ProbeDefinition | ((config: TConfig) => ProbeDefinition);

  // Ingress
  apiIngress?: IngressDefinition;
  consoleIngress?: IngressDefinition;

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

// ─── Object Store Archetype Function ──────────────────────

export function objectStore<TConfig>(
  descriptor: ObjectStoreDescriptor<TConfig>
): RecipeDefinition<TConfig> {
  const ports: ServicePortDefinition[] = [
    {
      name: "api",
      port: descriptor.apiPort,
      targetPort: descriptor.apiPort,
    },
    {
      name: "console",
      port: descriptor.consolePort,
      targetPort: descriptor.consolePort,
    },
  ];

  // Primary ingress is the console (for hasWebUI)
  const primaryIngress: IngressDefinition = descriptor.consoleIngress ?? {
    enabled: true,
    port: descriptor.consolePort,
    serviceNameSuffix: "-console",
  };

  return {
    slug: descriptor.slug,
    displayName: descriptor.displayName,
    category: "storage",
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
    ports,
    ingress: primaryIngress,
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

      // 2. StatefulSet
      const envVars = descriptor.env(ctx);
      const defaultRes = descriptor.defaultResources(config);

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

      resources.push(
        builders.statefulSet(name, namespace, {
          appName: descriptor.slug,
          image: descriptor.image,
          imageTag: resolvedTag,
          command: commandResult,
          args: argsResult,
          ports: [
            { name: "api", containerPort: descriptor.apiPort },
            { name: "console", containerPort: descriptor.consolePort },
          ],
          env: envVars,
          resources: defaultRes,
          volumeMounts: [
            { name: "data", mountPath: descriptor.dataMountPath },
          ],
          volumeClaimTemplates: [
            {
              name: "data",
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
        })
      );

      // 3. API Service
      resources.push(
        builders.service(name, namespace, {
          appName: descriptor.slug,
          ports: [
            {
              name: "api",
              port: descriptor.apiPort,
              targetPort: descriptor.apiPort,
            },
          ],
          selector: builders.matchLabels(descriptor.slug, name),
        })
      );

      // 4. Console Service
      resources.push(
        builders.service(`${name}-console`, namespace, {
          appName: descriptor.slug,
          ports: [
            {
              name: "console",
              port: descriptor.consolePort,
              targetPort: descriptor.consolePort,
            },
          ],
          selector: builders.matchLabels(descriptor.slug, name),
          component: "console",
        })
      );

      // 5. Ingresses (if context provided)
      if (ctx.ingress) {
        // API ingress
        if (descriptor.apiIngress?.enabled) {
          const apiHost = descriptor.apiIngress.hostnameTemplate
            ? descriptor.apiIngress.hostnameTemplate
                .replace("{name}", name)
                .replace("{domain}", ctx.ingress.domain)
            : `s3-${name}.${ctx.ingress.domain}`;

          const apiTls = ctx.ingress.tlsEnabled
            ? {
                secretName: `${name}-s3-tls`,
                clusterIssuer: ctx.ingress.tlsClusterIssuer,
              }
            : undefined;

          resources.push(
            builders.ingress(`${name}-api-ingress`, namespace, {
              appName: descriptor.slug,
              host: apiHost,
              serviceName: name,
              servicePort: descriptor.apiPort,
              ingressClass: ctx.ingress.ingressClass,
              tls: apiTls,
              component: "api",
            })
          );
        }

        // Console ingress
        if (descriptor.consoleIngress?.enabled) {
          const consoleHost = descriptor.consoleIngress.hostnameTemplate
            ? descriptor.consoleIngress.hostnameTemplate
                .replace("{name}", name)
                .replace("{domain}", ctx.ingress.domain)
            : `${name}.${ctx.ingress.domain}`;

          const consoleTls = ctx.ingress.tlsEnabled
            ? {
                secretName: `${name}-console-tls`,
                clusterIssuer: ctx.ingress.tlsClusterIssuer,
              }
            : undefined;

          resources.push(
            builders.ingress(`${name}-console-ingress`, namespace, {
              appName: descriptor.slug,
              host: consoleHost,
              serviceName: `${name}-console`,
              servicePort: descriptor.consolePort,
              ingressClass: ctx.ingress.ingressClass,
              tls: consoleTls,
              component: "console",
            })
          );
        }
      }

      return resources;
    },

    connectionInfo: descriptor.connectionInfo,
    healthCheck: descriptor.healthCheck,
    dataExport: descriptor.dataExport,
    dataImport: descriptor.dataImport,
  };
}
