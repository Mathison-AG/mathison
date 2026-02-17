/**
 * Recipe System — Base Types
 *
 * Core interfaces that all recipes implement. A RecipeDefinition is a typed
 * module with a Zod config schema and a build() function that produces
 * K8s resource objects.
 */

import type { z } from "zod/v4";
import type * as k8s from "@kubernetes/client-node";

// ─── K8s Resource Types ───────────────────────────────────

/** Union of all K8s resource types a recipe can produce */
export type KubernetesResource =
  | k8s.V1StatefulSet
  | k8s.V1Deployment
  | k8s.V1Service
  | k8s.V1Secret
  | k8s.V1PersistentVolumeClaim
  | k8s.V1Ingress
  | k8s.V1ConfigMap;

// ─── Secret Definition ────────────────────────────────────

export interface SecretDefinition {
  description: string;
  /** Auto-generate a cryptographically random value */
  generate: boolean;
  /** Length of generated value (default: 24) */
  length?: number;
}

// ─── Dependency Definition ────────────────────────────────

export interface DependencyDefinition {
  /** Recipe slug of the dependency (e.g. "postgresql") */
  recipe: string;
  /** Why this dependency is needed (for AI/UI display) */
  reason: string;
  /** Default config to pass to the dependency when auto-deploying */
  defaultConfig?: Record<string, unknown>;
}

// ─── Connection Info ──────────────────────────────────────

export interface ConnectionInfo {
  host: string;
  port: number;
  /** Additional connection properties (database, username, password, etc.) */
  [key: string]: string | number | boolean;
}

// ─── Ingress Context ──────────────────────────────────────

export interface IngressContext {
  /** Base domain (e.g. "example.com") */
  domain: string;
  /** Whether TLS is enabled */
  tlsEnabled: boolean;
  /** Ingress class name (e.g. "nginx", "traefik") */
  ingressClass: string;
  /** TLS cluster issuer for cert-manager */
  tlsClusterIssuer: string;
}

// ─── Build Context ────────────────────────────────────────

export interface BuildContext<TConfig> {
  /** Zod-validated, fully typed config */
  config: TConfig;
  /** Generated secrets (passwords, keys) */
  secrets: Record<string, string>;
  /** Dependency connection info keyed by alias */
  deps: Record<string, ConnectionInfo>;
  /** Instance name (e.g. "postgresql", "my-db") */
  name: string;
  /** K8s namespace */
  namespace: string;
  /** Ingress settings — undefined if ingress not available */
  ingress?: IngressContext;
}

// ─── Connection Context ───────────────────────────────────

export interface ConnectionContext<TConfig> {
  /** Validated config */
  config: TConfig;
  /** Generated secrets */
  secrets: Record<string, string>;
  /** Instance name */
  name: string;
  /** K8s namespace */
  namespace: string;
}

// ─── Health Check ─────────────────────────────────────────

export interface HealthCheckSpec {
  type: "tcp" | "http" | "exec";
  /** Port to check (for tcp/http) */
  port?: number;
  /** Path for HTTP health check */
  path?: string;
  /** Check interval in seconds */
  intervalSeconds: number;
  /** Command for exec health check */
  command?: string[];
}

export interface HealthCheckContext<TConfig> {
  config: TConfig;
  name: string;
  namespace: string;
}

// ─── AI Hints ─────────────────────────────────────────────

export interface AiHints {
  /** Short summary for the AI agent */
  summary: string;
  /** When the AI should suggest this recipe */
  whenToSuggest: string;
  /** Recipe slugs that pair well with this one */
  pairsWellWith: string[];
}

// ─── Service Port ─────────────────────────────────────────

export interface ServicePortDefinition {
  /** Port name (e.g. "http", "postgresql") */
  name: string;
  /** Service port (what other services connect to) */
  port: number;
  /** Container target port */
  targetPort: number;
  /** Protocol (default: TCP) */
  protocol?: string;
}

// ─── Ingress Definition ───────────────────────────────────

export interface IngressDefinition {
  /** Whether this recipe supports ingress */
  enabled: boolean;
  /** Hostname template (e.g. "n8n-{tenant}.{domain}") */
  hostnameTemplate?: string;
  /** Service port to expose */
  port: number;
  /** URL path (default: "/") */
  path?: string;
  /** Suffix appended to release name for the K8s service name */
  serviceNameSuffix: string;
}

// ─── Recipe Definition ────────────────────────────────────

export interface RecipeDefinition<TConfig = unknown> {
  // ── Identity
  slug: string;
  displayName: string;
  category: string;
  description: string;
  tags: string[];

  // ── Consumer-facing
  shortDescription?: string;
  useCases: string[];
  gettingStarted?: string;
  websiteUrl?: string;
  documentationUrl?: string;
  hasWebUI: boolean;
  featured?: boolean;

  // ── Configuration
  configSchema: z.ZodType<TConfig>;
  secrets: Record<string, SecretDefinition>;
  dependencies?: Record<string, DependencyDefinition>;

  // ── Networking
  ports: ServicePortDefinition[];
  ingress?: IngressDefinition;

  // ── Build — produces typed K8s resource objects
  build(ctx: BuildContext<TConfig>): KubernetesResource[];

  // ── Connection info — for when other recipes depend on this one
  connectionInfo?(ctx: ConnectionContext<TConfig>): ConnectionInfo;

  // ── Health check definition
  healthCheck(ctx: HealthCheckContext<TConfig>): HealthCheckSpec;

  // ── AI metadata
  aiHints: AiHints;
}

// ─── Standard Labels ──────────────────────────────────────

export interface StandardLabels {
  "app.kubernetes.io/name": string;
  "app.kubernetes.io/instance": string;
  "app.kubernetes.io/managed-by": "mathison";
  "app.kubernetes.io/component"?: string;
  "app.kubernetes.io/part-of"?: string;
}

// ─── Resource Requirements ────────────────────────────────

export interface ResourceRequirements {
  requests: {
    cpu: string;
    memory: string;
  };
  limits: {
    cpu: string;
    memory: string;
  };
}

// ─── Env Var Helpers ──────────────────────────────────────

export interface EnvVarPlain {
  name: string;
  value: string;
}

export interface EnvVarSecretRef {
  name: string;
  secretName: string;
  secretKey: string;
}

export type EnvVar = EnvVarPlain | EnvVarSecretRef;

// ─── Volume Mount Helpers ─────────────────────────────────

// ─── Secret Access Helper ─────────────────────────────────

/**
 * Safely access a secret value by key. Throws if the key is missing
 * (which should never happen if the recipe's secrets schema is correct).
 */
export function secret(secrets: Record<string, string>, key: string): string {
  const value = secrets[key];
  if (value === undefined) {
    throw new Error(`Secret '${key}' not found — check the recipe's secrets schema`);
  }
  return value;
}

// ─── Volume Mount Helpers ─────────────────────────────────

export interface VolumeMountDefinition {
  name: string;
  mountPath: string;
  subPath?: string;
  readOnly?: boolean;
}

// ─── Probe Helpers ────────────────────────────────────────

export interface ProbeDefinition {
  type: "tcp" | "http" | "exec";
  port?: number;
  path?: string;
  command?: string[];
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
  successThreshold?: number;
}
