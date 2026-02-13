import type { RecipeStatus, RecipeTier } from "@/generated/prisma/enums";

// ─── Config Schema Types ─────────────────────────────────

interface ConfigFieldBase {
  label?: string;
  description?: string;
  required?: boolean;
}

interface ConfigFieldString extends ConfigFieldBase {
  type: "string";
  default?: string;
}

interface ConfigFieldNumber extends ConfigFieldBase {
  type: "number";
  default?: number;
  min?: number;
  max?: number;
}

interface ConfigFieldBoolean extends ConfigFieldBase {
  type: "boolean";
  default?: boolean;
}

interface ConfigFieldSelect extends ConfigFieldBase {
  type: "select";
  options: string[];
  default?: string;
}

export type ConfigField =
  | ConfigFieldString
  | ConfigFieldNumber
  | ConfigFieldBoolean
  | ConfigFieldSelect;

export type ConfigSchema = Record<string, ConfigField>;

// ─── Secrets Schema ──────────────────────────────────────

export interface SecretField {
  description?: string;
  generate?: boolean; // Auto-generate if not provided
  length?: number; // For auto-generated secrets
}

export type SecretsSchema = Record<string, SecretField>;

// ─── Dependency ──────────────────────────────────────────

export interface RecipeDependency {
  service: string; // Recipe slug (e.g. "postgresql")
  alias?: string; // Override name for the dependency
  config?: Record<string, unknown>; // Default config for the dependency
}

// ─── Ingress Config ──────────────────────────────────────

export interface IngressConfig {
  enabled: boolean;
  hostnameTemplate?: string; // e.g. "n8n-{tenant}.{domain}"
  port?: number;
  path?: string;
}

// ─── AI Hints ────────────────────────────────────────────

export interface AiHints {
  summary: string;
  whenToSuggest: string;
  pairsWellWith: string[];
}

// ─── Health Check ────────────────────────────────────────

export interface HealthCheck {
  type?: "tcp" | "http" | "exec";
  port?: number;
  path?: string;
  intervalSeconds?: number;
}

// ─── Resource Spec ───────────────────────────────────────

export interface ResourceSpec {
  cpu: string;
  memory: string;
}

// ─── Recipe ──────────────────────────────────────────────

export interface Recipe {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  iconUrl: string | null;
  sourceType: string;
  chartUrl: string;
  chartVersion: string | null;
  configSchema: ConfigSchema;
  secretsSchema: SecretsSchema;
  valuesTemplate: string;
  dependencies: RecipeDependency[];
  ingressConfig: IngressConfig;
  resourceDefaults: ResourceSpec;
  resourceLimits: ResourceSpec;
  healthCheck: HealthCheck;
  aiHints: AiHints;
  tier: RecipeTier;
  status: RecipeStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── API Input Types ─────────────────────────────────────

export interface RecipeListFilters {
  category?: string;
  search?: string;
  status?: RecipeStatus;
}

export interface RecipeCreateInput {
  slug: string;
  displayName: string;
  description: string;
  category: string;
  tags?: string[];
  iconUrl?: string;
  sourceType?: string;
  chartUrl: string;
  chartVersion?: string;
  configSchema?: ConfigSchema;
  secretsSchema?: SecretsSchema;
  valuesTemplate?: string;
  dependencies?: RecipeDependency[];
  ingressConfig?: IngressConfig;
  resourceDefaults?: ResourceSpec;
  resourceLimits?: ResourceSpec;
  healthCheck?: HealthCheck;
  aiHints?: AiHints;
}

export interface RecipeUpdateInput {
  displayName?: string;
  description?: string;
  category?: string;
  tags?: string[];
  iconUrl?: string | null;
  chartUrl?: string;
  chartVersion?: string | null;
  configSchema?: ConfigSchema;
  secretsSchema?: SecretsSchema;
  valuesTemplate?: string;
  dependencies?: RecipeDependency[];
  ingressConfig?: IngressConfig;
  resourceDefaults?: ResourceSpec;
  resourceLimits?: ResourceSpec;
  healthCheck?: HealthCheck;
  aiHints?: AiHints;
  status?: RecipeStatus;
}

// ─── Search Result ───────────────────────────────────────

export interface RecipeSearchResult {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  category: string;
  tier: RecipeTier;
  similarity: number;
}
