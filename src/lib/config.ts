import { z } from "zod/v4";

const envSchema = z.object({
  // Platform
  MATHISON_MODE: z.enum(["cloud", "self-hosted"]).default("self-hosted"),
  MATHISON_BASE_DOMAIN: z.string().default("localhost:3000"),
  MATHISON_WILDCARD_DOMAIN: z.string().optional(),

  // Database
  DATABASE_URL: z.string(),

  // Redis (for BullMQ)
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Auth (Auth.js)
  AUTH_SECRET: z.string(),
  AUTH_URL: z.string().optional(),

  // LLM
  LLM_PROVIDER: z.enum(["openai", "anthropic", "ollama"]).default("openai"),
  LLM_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),

  // Kubernetes
  KUBECONFIG: z.string().optional(),

  // Cluster / Ingress
  INGRESS_ENABLED: z.coerce.boolean().default(false),
  INGRESS_CLASS: z.string().default(""),
  TLS_ENABLED: z.coerce.boolean().default(true),
  TLS_CLUSTER_ISSUER: z.string().default("letsencrypt-prod"),
  STORAGE_CLASS: z.string().default(""),

  // Tenant defaults
  DEFAULT_TENANT_CPU_QUOTA: z.string().default("4"),
  DEFAULT_TENANT_MEMORY_QUOTA: z.string().default("8Gi"),
  DEFAULT_TENANT_STORAGE_QUOTA: z.string().default("50Gi"),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
