import type { RecipeCreateInput } from "@/types/recipe";

/**
 * Seed recipe definitions for the 5 initial catalog entries.
 * Each recipe has complete config schema, Helm values template,
 * AI hints, resource specs, and dependency information.
 *
 * Values templates use Handlebars syntax:
 *   {{config.<key>}}     — user-configurable values
 *   {{secrets.<key>}}    — sensitive values (auto-generated or user-provided)
 *   {{deps.<slug>.host}} — dependency service addresses
 *   {{tenant.namespace}} — K8s namespace for this tenant
 */

// ─── PostgreSQL ──────────────────────────────────────────

const postgresql: RecipeCreateInput = {
  slug: "postgresql",
  displayName: "PostgreSQL",
  description:
    "Enterprise-grade relational database with ACID compliance, JSON support, and extensibility. Ideal for structured data, complex queries, and as a backend for applications like n8n or custom apps.",
  category: "database",
  tags: ["database", "sql", "relational", "postgres", "rdbms"],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "oci://registry-1.docker.io/bitnamicharts/postgresql",
  chartVersion: "16.6.3",
  configSchema: {
    version: {
      type: "select",
      options: ["16", "15", "14"],
      default: "16",
      label: "PostgreSQL Version",
      description: "Major version of PostgreSQL",
    },
    storage_size: {
      type: "string",
      default: "8Gi",
      label: "Storage Size",
      description: "Persistent volume size (e.g. 8Gi, 20Gi)",
    },
    database: {
      type: "string",
      default: "app",
      label: "Database Name",
      description: "Name of the default database to create",
    },
    username: {
      type: "string",
      default: "app",
      label: "Username",
      description: "Database user to create",
    },
    max_connections: {
      type: "number",
      default: 100,
      min: 10,
      max: 500,
      label: "Max Connections",
      description: "Maximum number of concurrent connections",
    },
  },
  secretsSchema: {
    password: {
      description: "Database password",
      generate: true,
      length: 24,
    },
  },
  valuesTemplate: `architecture: standalone

image:
  tag: "{{config.version}}"

auth:
  database: "{{config.database}}"
  username: "{{config.username}}"
  password: "{{secrets.password}}"

primary:
  extendedConfiguration: |
    max_connections = {{config.max_connections}}
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      cpu: 250m
      memory: 256Mi
  persistence:
    enabled: true
    size: "{{config.storage_size}}"
    accessModes:
      - ReadWriteOnce`,
  dependencies: [],
  ingressConfig: { enabled: false },
  resourceDefaults: { cpu: "50m", memory: "128Mi" },
  resourceLimits: { cpu: "250m", memory: "256Mi" },
  healthCheck: {
    type: "tcp",
    port: 5432,
    intervalSeconds: 10,
  },
  aiHints: {
    summary:
      "PostgreSQL is a powerful open-source relational database management system",
    whenToSuggest:
      "User needs a database, SQL database, persistent storage, relational data, structured data, or a backend database for an application",
    pairsWellWith: ["redis", "n8n"],
  },
};

// ─── Redis ───────────────────────────────────────────────

const redis: RecipeCreateInput = {
  slug: "redis",
  displayName: "Redis",
  description:
    "In-memory data store used as cache, message broker, and session store. Sub-millisecond latency for high-performance workloads. Supports key-value, pub/sub, streams, and sorted sets.",
  category: "database",
  tags: ["cache", "redis", "in-memory", "message-broker", "session-store"],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "oci://registry-1.docker.io/bitnamicharts/redis",
  chartVersion: "20.11.4",
  configSchema: {
    version: {
      type: "select",
      options: ["7", "6"],
      default: "7",
      label: "Redis Version",
      description: "Major version of Redis",
    },
    storage_size: {
      type: "string",
      default: "1Gi",
      label: "Storage Size",
      description: "Persistent volume size for RDB snapshots",
    },
    maxmemory: {
      type: "string",
      default: "100mb",
      label: "Max Memory",
      description: "Maximum memory limit (e.g. 100mb, 256mb)",
    },
    maxmemory_policy: {
      type: "select",
      options: [
        "allkeys-lru",
        "volatile-lru",
        "allkeys-random",
        "noeviction",
      ],
      default: "allkeys-lru",
      label: "Eviction Policy",
      description: "What to do when max memory is reached",
    },
  },
  secretsSchema: {
    password: {
      description: "Redis password",
      generate: true,
      length: 24,
    },
  },
  valuesTemplate: `architecture: standalone

image:
  tag: "{{config.version}}"

auth:
  enabled: true
  password: "{{secrets.password}}"

master:
  configuration: |
    maxmemory {{config.maxmemory}}
    maxmemory-policy {{config.maxmemory_policy}}
  resources:
    requests:
      cpu: 25m
      memory: 64Mi
    limits:
      cpu: 100m
      memory: 128Mi
  persistence:
    enabled: true
    size: "{{config.storage_size}}"
    accessModes:
      - ReadWriteOnce

replica:
  replicaCount: 0`,
  dependencies: [],
  ingressConfig: { enabled: false },
  resourceDefaults: { cpu: "25m", memory: "64Mi" },
  resourceLimits: { cpu: "100m", memory: "128Mi" },
  healthCheck: {
    type: "tcp",
    port: 6379,
    intervalSeconds: 10,
  },
  aiHints: {
    summary:
      "Redis is an in-memory data store for caching, session management, and message brokering",
    whenToSuggest:
      "User needs caching, a message broker, session store, rate limiting, pub/sub, or a fast key-value store",
    pairsWellWith: ["postgresql", "n8n"],
  },
};

// ─── n8n ─────────────────────────────────────────────────

const n8n: RecipeCreateInput = {
  slug: "n8n",
  displayName: "n8n",
  description:
    "Fair-code workflow automation platform. Connect APIs, databases, and services with a visual flow editor. Self-hosted alternative to Zapier and Make with full control over your data.",
  category: "automation",
  tags: [
    "automation",
    "workflow",
    "zapier",
    "integration",
    "no-code",
    "low-code",
  ],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "oci://8gears.container-registry.com/library/n8n",
  chartVersion: "0.26.1",
  configSchema: {
    execution_mode: {
      type: "select",
      options: ["regular", "queue"],
      default: "regular",
      label: "Execution Mode",
      description:
        "Regular: single process. Queue: separate workers for scalability.",
    },
  },
  secretsSchema: {
    encryption_key: {
      description: "n8n encryption key for credentials stored in DB",
      generate: true,
      length: 32,
    },
  },
  valuesTemplate: `main:
  config:
    n8n:
      port: 5678
    db:
      type: postgresdb
      postgresdb:
        host: "{{deps.postgresql.host}}"
        port: 5432
        database: "{{deps.postgresql.database}}"
        user: "{{deps.postgresql.username}}"
        schema: public
  secret:
    n8n:
      encryption_key: "{{secrets.encryption_key}}"
    db:
      postgresdb:
        password: "{{deps.postgresql.password}}"
  resources:
    requests:
      cpu: 50m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

persistence:
  enabled: false

worker:
  enabled: {{#eq config.execution_mode "queue"}}true{{else}}false{{/eq}}

webhook:
  enabled: false

ingress:
  enabled: true
  className: "{{cluster.ingress_class}}"
  annotations:
    cert-manager.io/cluster-issuer: "{{cluster.tls_cluster_issuer}}"
  hosts:
    - host: "n8n-{{tenant.slug}}.{{cluster.domain}}"
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: n8n-tls
      hosts:
        - "n8n-{{tenant.slug}}.{{cluster.domain}}"`,
  dependencies: [
    {
      service: "postgresql",
      alias: "n8n-db",
      config: { database: "n8n", username: "n8n", storage_size: "8Gi" },
    },
  ],
  ingressConfig: {
    enabled: true,
    hostnameTemplate: "n8n-{tenant}.{domain}",
    port: 5678,
    path: "/",
  },
  resourceDefaults: { cpu: "50m", memory: "256Mi" },
  resourceLimits: { cpu: "500m", memory: "512Mi" },
  healthCheck: {
    type: "http",
    port: 5678,
    path: "/healthz",
    intervalSeconds: 15,
  },
  aiHints: {
    summary:
      "n8n is a workflow automation platform, a self-hosted alternative to Zapier",
    whenToSuggest:
      "User needs workflow automation, API integration, task scheduling, Zapier/Make alternative, or wants to connect multiple services together",
    pairsWellWith: ["postgresql", "redis"],
  },
};

// ─── Uptime Kuma ─────────────────────────────────────────

const uptimeKuma: RecipeCreateInput = {
  slug: "uptime-kuma",
  displayName: "Uptime Kuma",
  description:
    "Self-hosted monitoring tool with a beautiful status page. Monitor HTTP, TCP, DNS, Docker, and more. Get alerts via email, Slack, Telegram, and 90+ notification services.",
  category: "monitoring",
  tags: [
    "monitoring",
    "uptime",
    "status-page",
    "alerts",
    "health-check",
  ],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "https://helm.irsigler.cloud",
  chartVersion: "2.20.0",
  configSchema: {
    storage_size: {
      type: "string",
      default: "2Gi",
      label: "Storage Size",
      description: "Persistent volume size for SQLite database",
    },
  },
  secretsSchema: {},
  valuesTemplate: `image:
  repository: louislam/uptime-kuma
  tag: "1"

resources:
  requests:
    cpu: 25m
    memory: 64Mi
  limits:
    cpu: 150m
    memory: 200Mi

persistence:
  enabled: true
  size: "{{config.storage_size}}"
  accessModes:
    - ReadWriteOnce

ingress:
  enabled: true
  className: "{{cluster.ingress_class}}"
  annotations:
    cert-manager.io/cluster-issuer: "{{cluster.tls_cluster_issuer}}"
  hosts:
    - host: "status-{{tenant.slug}}.{{cluster.domain}}"
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: uptime-kuma-tls
      hosts:
        - "status-{{tenant.slug}}.{{cluster.domain}}"`,
  dependencies: [],
  ingressConfig: {
    enabled: true,
    hostnameTemplate: "status-{tenant}.{domain}",
    port: 3001,
    path: "/",
  },
  resourceDefaults: { cpu: "25m", memory: "64Mi" },
  resourceLimits: { cpu: "150m", memory: "200Mi" },
  healthCheck: {
    type: "http",
    port: 3001,
    path: "/",
    intervalSeconds: 15,
  },
  aiHints: {
    summary:
      "Uptime Kuma is a self-hosted uptime monitoring tool with a status page",
    whenToSuggest:
      "User needs uptime monitoring, health checks, status page, alerting for downtime, or wants to monitor services and endpoints",
    pairsWellWith: ["postgresql", "n8n"],
  },
};

// ─── MinIO ───────────────────────────────────────────────

const minio: RecipeCreateInput = {
  slug: "minio",
  displayName: "MinIO",
  description:
    "High-performance S3-compatible object storage. Store files, backups, artifacts, and media with full S3 API compatibility. Supports versioning, lifecycle policies, and server-side encryption.",
  category: "storage",
  tags: ["storage", "s3", "object-storage", "minio", "backup", "files"],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "oci://registry-1.docker.io/bitnamicharts/minio",
  chartVersion: "14.12.2",
  configSchema: {
    storage_size: {
      type: "string",
      default: "10Gi",
      label: "Storage Size",
      description: "Persistent volume size for object storage",
    },
    default_buckets: {
      type: "string",
      default: "data",
      label: "Default Buckets",
      description: "Comma-separated list of buckets to create on startup",
    },
  },
  secretsSchema: {
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
  valuesTemplate: `mode: standalone

auth:
  rootUser: "{{secrets.root_user}}"
  rootPassword: "{{secrets.root_password}}"

defaultBuckets: "{{config.default_buckets}}"

resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

persistence:
  enabled: true
  size: "{{config.storage_size}}"
  accessModes:
    - ReadWriteOnce

ingress:
  enabled: true
  ingressClassName: "{{cluster.ingress_class}}"
  annotations:
    cert-manager.io/cluster-issuer: "{{cluster.tls_cluster_issuer}}"
  hostname: "minio-{{tenant.slug}}.{{cluster.domain}}"
  tls: true

apiIngress:
  enabled: true
  ingressClassName: "{{cluster.ingress_class}}"
  annotations:
    cert-manager.io/cluster-issuer: "{{cluster.tls_cluster_issuer}}"
  hostname: "s3-{{tenant.slug}}.{{cluster.domain}}"
  tls: true`,
  dependencies: [],
  ingressConfig: {
    enabled: true,
    hostnameTemplate: "minio-{tenant}.{domain}",
    port: 9001,
    path: "/",
  },
  resourceDefaults: { cpu: "50m", memory: "128Mi" },
  resourceLimits: { cpu: "500m", memory: "512Mi" },
  healthCheck: {
    type: "http",
    port: 9000,
    path: "/minio/health/live",
    intervalSeconds: 15,
  },
  aiHints: {
    summary:
      "MinIO is a high-performance S3-compatible object storage system",
    whenToSuggest:
      "User needs file storage, object storage, S3-compatible storage, backup storage, media storage, or artifact storage",
    pairsWellWith: ["postgresql", "n8n"],
  },
};

// ─── Export all seed recipes ─────────────────────────────

export const seedRecipes: RecipeCreateInput[] = [
  postgresql,
  redis,
  n8n,
  uptimeKuma,
  minio,
];
