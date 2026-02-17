/**
 * MinIO Recipe
 *
 * High-performance S3-compatible object storage. Uses the objectStore archetype
 * to produce: StatefulSet + Service (API + Console) + Secret + PVC + dual Ingress.
 *
 * Uses the official MinIO chart values pattern (not Bitnami).
 */

import { z } from "zod/v4";
import { objectStore } from "../_base/archetypes";
import { secret } from "../_base/types";

import type { RecipeDefinition } from "../_base/types";

// ─── Config Schema ────────────────────────────────────────

const configSchema = z.object({
  storage_size: z.string().default("10Gi"),
  default_buckets: z.string().default("data"),
  cpu_request: z.string().default("50m"),
  memory_request: z.string().default("128Mi"),
  cpu_limit: z.string().default("500m"),
  memory_limit: z.string().default("512Mi"),
});

type MinIOConfig = z.infer<typeof configSchema>;

// ─── Recipe Definition ────────────────────────────────────

export const minio: RecipeDefinition<MinIOConfig> = objectStore<MinIOConfig>({
  slug: "minio",
  displayName: "MinIO",
  description:
    "High-performance S3-compatible object storage. Store files, backups, artifacts, and media with full S3 API compatibility. Supports versioning, lifecycle policies, and server-side encryption.",
  tags: ["storage", "s3", "object-storage", "minio", "backup", "files"],

  shortDescription: "Store files and media — your own cloud storage",
  useCases: ["File storage", "Backup destination", "Media hosting"],
  gettingStarted: `## Getting Started with MinIO

MinIO gives you your own private cloud storage, compatible with Amazon S3. Store files, backups, images, and more.

### First steps
1. Open the MinIO Console from your dashboard (click "Open App")
2. Log in with the admin credentials from your app settings
3. Click **Create Bucket** to create your first storage bucket
4. Upload files via the web console, or connect using any S3-compatible tool

### Connecting from other apps
MinIO is fully S3-compatible, so you can use it with:
- Any app that supports S3 storage (backups, media uploads)
- AWS CLI: \`aws --endpoint-url <your-minio-url> s3 ls\`
- Popular S3 libraries in Python, Node.js, Go, and more

### Tips
- Create separate buckets for different purposes (e.g., "backups", "uploads", "media")
- Enable versioning on important buckets to keep file history`,
  websiteUrl: "https://min.io",
  documentationUrl: "https://min.io/docs/minio/linux/index.html",
  featured: true,

  configSchema,
  secrets: {
    root_user: {
      description: "MinIO root/admin username",
      generate: true,
      length: 12,
    },
    root_password: {
      description: "MinIO root/admin password",
      generate: true,
      length: 24,
    },
  },

  image: "quay.io/minio/minio",
  imageTag: "latest",
  command: () => ["minio"],
  args: () => ["server", "/data", "--console-address", ":9001"],

  apiPort: 9000,
  consolePort: 9001,

  env: (ctx) => [
    { name: "MINIO_ROOT_USER", value: secret(ctx.secrets, "root_user") },
    { name: "MINIO_ROOT_PASSWORD", value: secret(ctx.secrets, "root_password") },
    { name: "MINIO_DEFAULT_BUCKETS", value: ctx.config.default_buckets },
  ],

  dataMountPath: "/data",
  storageSize: (config) => config.storage_size,

  defaultResources: (config) => ({
    requests: { cpu: config.cpu_request, memory: config.memory_request },
    limits: { cpu: config.cpu_limit, memory: config.memory_limit },
  }),

  runAsUser: 1000,
  runAsGroup: 1000,
  fsGroup: 1000,

  livenessProbe: {
    type: "http",
    port: 9000,
    path: "/minio/health/live",
    initialDelaySeconds: 30,
    periodSeconds: 15,
    timeoutSeconds: 5,
    failureThreshold: 3,
  },
  readinessProbe: {
    type: "http",
    port: 9000,
    path: "/minio/health/ready",
    initialDelaySeconds: 10,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 3,
  },

  apiIngress: {
    enabled: true,
    hostnameTemplate: "s3-{name}.{domain}",
    port: 9000,
    serviceNameSuffix: "",
  },
  consoleIngress: {
    enabled: true,
    hostnameTemplate: "minio-{name}.{domain}",
    port: 9001,
    serviceNameSuffix: "-console",
  },

  connectionInfo: (ctx) => ({
    host: `${ctx.name}.${ctx.namespace}.svc.cluster.local`,
    port: 9000,
    consolePort: 9001,
    rootUser: secret(ctx.secrets, "root_user"),
    rootPassword: secret(ctx.secrets, "root_password"),
    endpoint: `http://${ctx.name}.${ctx.namespace}.svc.cluster.local:9000`,
  }),

  healthCheck: () => ({
    type: "http",
    port: 9000,
    path: "/minio/health/live",
    intervalSeconds: 15,
  }),

  dataExport: {
    description: "Full archive of all stored files and buckets",
    strategy: {
      type: "files",
      paths: () => ["/data"],
      excludePatterns: [".minio.sys/tmp/*"],
    },
  },

  dataImport: {
    description: "Restore files and buckets from a previous export",
    strategy: {
      type: "files",
      extractPath: "/",
    },
    restartAfterImport: true,
  },

  aiHints: {
    summary: "MinIO is a high-performance S3-compatible object storage system",
    whenToSuggest:
      "User needs file storage, object storage, S3-compatible storage, backup storage, media storage, or artifact storage",
    pairsWellWith: ["postgresql", "n8n"],
  },
});

export default minio;
