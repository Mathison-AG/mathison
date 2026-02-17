/**
 * Redis Recipe
 *
 * In-memory data store for caching, session management, and message brokering.
 * Uses the cache archetype to produce: StatefulSet + Service + Secret.
 *
 * Equivalent to the Bitnami Redis Helm chart in standalone mode (no replicas).
 */

import { z } from "zod/v4";
import { cache } from "../_base/archetypes";
import { secret } from "../_base/types";

import type { RecipeDefinition } from "../_base/types";

// ─── Config Schema ────────────────────────────────────────

const configSchema = z.object({
  version: z.enum(["7", "6"]).default("7"),
  storage_size: z.string().default("1Gi"),
  maxmemory: z.string().default("100mb"),
  maxmemory_policy: z
    .enum(["allkeys-lru", "volatile-lru", "allkeys-random", "noeviction"])
    .default("allkeys-lru"),
  cpu_request: z.string().default("25m"),
  memory_request: z.string().default("64Mi"),
  cpu_limit: z.string().default("100m"),
  memory_limit: z.string().default("128Mi"),
});

type RedisConfig = z.infer<typeof configSchema>;

// ─── Recipe Definition ────────────────────────────────────

export const redis: RecipeDefinition<RedisConfig> = cache<RedisConfig>({
  slug: "redis",
  displayName: "Redis",
  description:
    "In-memory data store used as cache, message broker, and session store. Sub-millisecond latency for high-performance workloads. Supports key-value, pub/sub, streams, and sorted sets.",
  tags: ["cache", "redis", "in-memory", "message-broker", "session-store"],

  shortDescription: "Lightning-fast in-memory data store",
  useCases: ["Caching", "Session storage", "Message queuing"],
  gettingStarted: `## Getting Started with Redis

Redis is ready to use as soon as it's installed. It stores data in memory for ultra-fast access.

**Connection details** are available in your app's settings panel.

### Common uses
- **Caching**: Speed up your other apps by caching frequently accessed data
- **Session storage**: Store user sessions for your web applications
- **Message queuing**: Use pub/sub or streams for real-time messaging

### Quick start
1. Copy the connection details from your app settings
2. Connect using any Redis client or library
3. Start storing and retrieving data with simple key-value commands`,
  websiteUrl: "https://redis.io",
  documentationUrl: "https://redis.io/docs/",

  configSchema,
  secrets: {
    password: {
      description: "Redis password",
      generate: true,
      length: 24,
    },
  },

  image: "docker.io/bitnami/redis",
  imageTag: () => "latest",
  containerPort: 6379,
  portName: "redis",

  env: (ctx) => [
    { name: "REDIS_PASSWORD", value: secret(ctx.secrets, "password") },
    { name: "REDIS_AOF_ENABLED", value: "no" },
  ],

  command: (ctx) => [
    "redis-server",
    "--requirepass",
    secret(ctx.secrets, "password"),
    "--maxmemory",
    ctx.config.maxmemory,
    "--maxmemory-policy",
    ctx.config.maxmemory_policy,
  ],

  persistenceEnabled: true,
  dataMountPath: "/bitnami/redis/data",
  storageSize: (config) => config.storage_size,

  defaultResources: (config) => ({
    requests: { cpu: config.cpu_request, memory: config.memory_request },
    limits: { cpu: config.cpu_limit, memory: config.memory_limit },
  }),

  runAsUser: 1001,
  fsGroup: 1001,

  livenessProbe: {
    type: "exec",
    command: [
      "sh",
      "-c",
      "redis-cli -a $REDIS_PASSWORD ping | grep -q PONG",
    ],
    initialDelaySeconds: 20,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 5,
  },
  readinessProbe: {
    type: "exec",
    command: [
      "sh",
      "-c",
      "redis-cli -a $REDIS_PASSWORD ping | grep -q PONG",
    ],
    initialDelaySeconds: 5,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 5,
  },

  serviceNameSuffix: "-redis-master",

  connectionInfo: (ctx) => ({
    host: `${ctx.name}-redis-master.${ctx.namespace}.svc.cluster.local`,
    port: 6379,
    password: secret(ctx.secrets, "password"),
  }),

  healthCheck: () => ({
    type: "tcp",
    port: 6379,
    intervalSeconds: 10,
  }),

  dataExport: {
    description: "Redis RDB snapshot (point-in-time dump of all keys and values)",
    strategy: {
      type: "command",
      command: () => [
        "sh", "-c",
        `redis-cli -a "$REDIS_PASSWORD" --rdb /tmp/dump.rdb > /dev/null 2>&1 && cat /tmp/dump.rdb && rm -f /tmp/dump.rdb`,
      ],
      contentType: "application/octet-stream",
      fileExtension: "rdb",
    },
  },

  dataImport: {
    description: "Restore from an RDB dump file",
    strategy: {
      type: "command",
      command: () => [
        "sh", "-c",
        `cat > /tmp/restore.rdb && redis-cli -a "$REDIS_PASSWORD" shutdown nosave; cp /tmp/restore.rdb /bitnami/redis/data/dump.rdb`,
      ],
    },
    restartAfterImport: true,
  },

  aiHints: {
    summary:
      "Redis is an in-memory data store for caching, session management, and message brokering",
    whenToSuggest:
      "User needs caching, a message broker, session store, rate limiting, pub/sub, or a fast key-value store",
    pairsWellWith: ["postgresql", "n8n"],
  },
});

export default redis;
