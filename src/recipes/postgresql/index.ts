/**
 * PostgreSQL Recipe
 *
 * Enterprise-grade relational database. Uses the database archetype
 * to produce: StatefulSet + Service + Secret + PVC.
 *
 * Equivalent to the Bitnami PostgreSQL Helm chart in standalone mode.
 */

import { z } from "zod/v4";
import { database } from "../_base/archetypes";
import { secret } from "../_base/types";

import type { RecipeDefinition } from "../_base/types";

// ─── Config Schema ────────────────────────────────────────

const configSchema = z.object({
  version: z.enum(["16", "15", "14"]).default("16"),
  storage_size: z.string().default("8Gi"),
  database: z.string().default("app"),
  username: z.string().default("app"),
  max_connections: z.number().min(10).max(500).default(100),
  cpu_request: z.string().default("50m"),
  memory_request: z.string().default("128Mi"),
  cpu_limit: z.string().default("250m"),
  memory_limit: z.string().default("256Mi"),
});

type PostgresConfig = z.infer<typeof configSchema>;

// ─── Recipe Definition ────────────────────────────────────

export const postgresql: RecipeDefinition<PostgresConfig> = database<PostgresConfig>({
  slug: "postgresql",
  displayName: "PostgreSQL",
  description:
    "Enterprise-grade relational database with ACID compliance, JSON support, and extensibility. Ideal for structured data, complex queries, and as a backend for applications like n8n or custom apps.",
  tags: ["database", "sql", "relational", "postgres", "rdbms"],

  shortDescription: "Powerful open-source relational database",
  useCases: [
    "Store application data",
    "Run SQL queries",
    "Backend for other apps",
  ],
  gettingStarted: `## Getting Started with PostgreSQL

After installation, you can connect to your database using any PostgreSQL client.

**Connection details** are available in your app's settings panel. You'll need:
- **Host** and **Port** (provided automatically)
- **Database name** (default: \`app\`)
- **Username** and **Password** (auto-generated)

### Quick start
1. Copy the connection string from your app settings
2. Use any SQL client (e.g. pgAdmin, DBeaver, TablePlus) to connect
3. Start creating tables and inserting data

PostgreSQL supports standard SQL, JSON data, full-text search, and much more.`,
  websiteUrl: "https://www.postgresql.org",
  documentationUrl: "https://www.postgresql.org/docs/",

  configSchema,
  secrets: {
    password: {
      description: "Database password",
      generate: true,
      length: 24,
    },
  },

  image: "docker.io/bitnami/postgresql",
  imageTag: () => "latest",
  containerPort: 5432,
  portName: "postgresql",

  env: (ctx) => [
    { name: "POSTGRESQL_DATABASE", value: ctx.config.database },
    { name: "POSTGRESQL_USERNAME", value: ctx.config.username },
    { name: "POSTGRESQL_PASSWORD", value: secret(ctx.secrets, "password") },
    { name: "PGDATA", value: "/bitnami/postgresql/data" },
  ],

  dataMountPath: "/bitnami/postgresql",
  storageSize: (config) => config.storage_size,

  configFile: (ctx) => {
    if (ctx.config.max_connections !== 100) {
      return {
        key: "extended.conf",
        content: `max_connections = ${ctx.config.max_connections}`,
      };
    }
    return undefined;
  },
  configMountPath: "/opt/bitnami/postgresql/conf/conf.d",

  defaultResources: (config) => ({
    requests: { cpu: config.cpu_request, memory: config.memory_request },
    limits: { cpu: config.cpu_limit, memory: config.memory_limit },
  }),

  runAsUser: 1001,
  fsGroup: 1001,

  livenessProbe: {
    type: "exec",
    command: [
      "/bin/sh",
      "-c",
      'exec pg_isready -U "$POSTGRESQL_USERNAME" -d "dbname=$POSTGRESQL_DATABASE" -h 127.0.0.1 -p 5432',
    ],
    initialDelaySeconds: 30,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 6,
  },
  readinessProbe: {
    type: "exec",
    command: [
      "/bin/sh",
      "-c",
      'exec pg_isready -U "$POSTGRESQL_USERNAME" -d "dbname=$POSTGRESQL_DATABASE" -h 127.0.0.1 -p 5432',
    ],
    initialDelaySeconds: 5,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 6,
  },

  serviceNameSuffix: "-postgresql",

  connectionInfo: (ctx) => ({
    host: `${ctx.name}-postgresql.${ctx.namespace}.svc.cluster.local`,
    port: 5432,
    database: ctx.config.database,
    username: ctx.config.username,
    password: secret(ctx.secrets, "password"),
  }),

  healthCheck: () => ({
    type: "tcp",
    port: 5432,
    intervalSeconds: 10,
  }),

  aiHints: {
    summary:
      "PostgreSQL is a powerful open-source relational database management system",
    whenToSuggest:
      "User needs a database, SQL database, persistent storage, relational data, structured data, or a backend database for an application",
    pairsWellWith: ["redis", "n8n"],
  },
});

export default postgresql;
