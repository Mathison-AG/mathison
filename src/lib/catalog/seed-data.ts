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
  category: "database",
  tags: ["database", "sql", "relational", "postgres", "rdbms"],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "oci://registry-1.docker.io/bitnamicharts/postgresql",
  chartVersion: undefined, // Use latest — pinned versions reference Docker tags that get removed
  configSchema: {
    version: {
      type: "select",
      options: ["16", "15", "14"],
      default: "16",
      label: "PostgreSQL Version",
      description: "Major version of PostgreSQL"
    },
    storage_size: {
      type: "string",
      default: "8Gi",
      label: "Storage Size",
      description: "Persistent volume size (e.g. 8Gi, 20Gi)"
    },
    database: {
      type: "string",
      default: "app",
      label: "Database Name",
      description: "Name of the default database to create"
    },
    username: {
      type: "string",
      default: "app",
      label: "Username",
      description: "Database user to create"
    },
    max_connections: {
      type: "number",
      default: 100,
      min: 10,
      max: 500,
      label: "Max Connections",
      description: "Maximum number of concurrent connections"
    },
    cpu_request: {
      type: "string",
      default: "50m",
      label: "CPU Request",
      description: "CPU request (e.g. 50m, 100m, 250m)"
    },
    memory_request: {
      type: "string",
      default: "128Mi",
      label: "Memory Request",
      description: "Memory request (e.g. 128Mi, 256Mi, 512Mi)"
    },
    cpu_limit: {
      type: "string",
      default: "250m",
      label: "CPU Limit",
      description: "CPU limit (e.g. 250m, 500m, 1000m)"
    },
    memory_limit: {
      type: "string",
      default: "256Mi",
      label: "Memory Limit",
      description: "Memory limit (e.g. 256Mi, 512Mi, 1Gi)"
    }
  },
  secretsSchema: {
    password: {
      description: "Database password",
      generate: true,
      length: 24
    }
  },
  valuesTemplate: `architecture: standalone

auth:
  database: "{{config.database}}"
  username: "{{config.username}}"
  password: "{{secrets.password}}"

primary:
  extendedConfiguration: |
    max_connections = {{config.max_connections}}
  resources:
    requests:
      cpu: "{{config.cpu_request}}"
      memory: "{{config.memory_request}}"
    limits:
      cpu: "{{config.cpu_limit}}"
      memory: "{{config.memory_limit}}"
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
    intervalSeconds: 10
  },
  aiHints: {
    summary:
      "PostgreSQL is a powerful open-source relational database management system",
    whenToSuggest:
      "User needs a database, SQL database, persistent storage, relational data, structured data, or a backend database for an application",
    pairsWellWith: ["redis", "n8n"]
  }
};

// ─── Redis ───────────────────────────────────────────────

const redis: RecipeCreateInput = {
  slug: "redis",
  displayName: "Redis",
  description:
    "In-memory data store used as cache, message broker, and session store. Sub-millisecond latency for high-performance workloads. Supports key-value, pub/sub, streams, and sorted sets.",
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
  category: "database",
  tags: ["cache", "redis", "in-memory", "message-broker", "session-store"],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "oci://registry-1.docker.io/bitnamicharts/redis",
  chartVersion: undefined, // Use latest — pinned versions reference Docker tags that get removed
  configSchema: {
    version: {
      type: "select",
      options: ["7", "6"],
      default: "7",
      label: "Redis Version",
      description: "Major version of Redis"
    },
    storage_size: {
      type: "string",
      default: "1Gi",
      label: "Storage Size",
      description: "Persistent volume size for RDB snapshots"
    },
    maxmemory: {
      type: "string",
      default: "100mb",
      label: "Max Memory",
      description: "Maximum memory limit (e.g. 100mb, 256mb)"
    },
    maxmemory_policy: {
      type: "select",
      options: ["allkeys-lru", "volatile-lru", "allkeys-random", "noeviction"],
      default: "allkeys-lru",
      label: "Eviction Policy",
      description: "What to do when max memory is reached"
    },
    cpu_request: {
      type: "string",
      default: "25m",
      label: "CPU Request",
      description: "CPU request (e.g. 25m, 50m, 100m)"
    },
    memory_request: {
      type: "string",
      default: "64Mi",
      label: "Memory Request",
      description: "Memory request (e.g. 64Mi, 128Mi, 256Mi)"
    },
    cpu_limit: {
      type: "string",
      default: "100m",
      label: "CPU Limit",
      description: "CPU limit (e.g. 100m, 250m, 500m)"
    },
    memory_limit: {
      type: "string",
      default: "128Mi",
      label: "Memory Limit",
      description: "Memory limit (e.g. 128Mi, 256Mi, 512Mi)"
    }
  },
  secretsSchema: {
    password: {
      description: "Redis password",
      generate: true,
      length: 24
    }
  },
  valuesTemplate: `architecture: standalone

auth:
  enabled: true
  password: "{{secrets.password}}"

master:
  configuration: |
    maxmemory {{config.maxmemory}}
    maxmemory-policy {{config.maxmemory_policy}}
  resources:
    requests:
      cpu: "{{config.cpu_request}}"
      memory: "{{config.memory_request}}"
    limits:
      cpu: "{{config.cpu_limit}}"
      memory: "{{config.memory_limit}}"
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
    intervalSeconds: 10
  },
  aiHints: {
    summary:
      "Redis is an in-memory data store for caching, session management, and message brokering",
    whenToSuggest:
      "User needs caching, a message broker, session store, rate limiting, pub/sub, or a fast key-value store",
    pairsWellWith: ["postgresql", "n8n"]
  }
};

// ─── n8n ─────────────────────────────────────────────────

const n8n: RecipeCreateInput = {
  slug: "n8n",
  displayName: "n8n",
  description:
    "Fair-code workflow automation platform. Connect APIs, databases, and services with a visual flow editor. Self-hosted alternative to Zapier and Make with full control over your data.",
  shortDescription:
    "Visual workflow automation — connect anything to everything",
  useCases: [
    "Automate repetitive tasks",
    "Connect apps without coding",
    "Build custom workflows",
  ],
  gettingStarted: `## Getting Started with n8n

n8n is a powerful visual workflow automation tool — think Zapier, but self-hosted and fully under your control.

### First steps
1. Open n8n from your dashboard (click "Open App")
2. Create your first workflow by clicking **+ New Workflow**
3. Pick a **trigger** — this is what starts your workflow (e.g., a schedule, a webhook, or a new email)
4. Add **actions** — connect to 400+ apps like Slack, Google Sheets, GitHub, and more
5. Test your workflow, then activate it

### Ideas to get started
- Send a Slack message when a GitHub issue is created
- Back up a Google Sheet to your database every night
- Monitor a website and get notified if it goes down`,
  websiteUrl: "https://n8n.io",
  documentationUrl: "https://docs.n8n.io",
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
  chartVersion: undefined, // Use latest — major version jump from 0.26.x to 2.x
  configSchema: {
    execution_mode: {
      type: "select",
      options: ["regular", "queue"],
      default: "regular",
      label: "Execution Mode",
      description:
        "Regular: single process. Queue: separate workers for scalability."
    },
    cpu_request: {
      type: "string",
      default: "50m",
      label: "CPU Request",
      description: "CPU request (e.g. 50m, 100m, 250m)"
    },
    memory_request: {
      type: "string",
      default: "256Mi",
      label: "Memory Request",
      description: "Memory request (e.g. 256Mi, 512Mi, 1Gi)"
    },
    cpu_limit: {
      type: "string",
      default: "500m",
      label: "CPU Limit",
      description: "CPU limit (e.g. 500m, 1000m, 2000m)"
    },
    memory_limit: {
      type: "string",
      default: "512Mi",
      label: "Memory Limit",
      description: "Memory limit (e.g. 512Mi, 1Gi, 2Gi)"
    }
  },
  secretsSchema: {
    encryption_key: {
      description: "n8n encryption key for credentials stored in DB",
      generate: true,
      length: 32
    }
  },
  valuesTemplate: `main:
  config:
    db:
      type: postgresdb
      postgresdb:
        host: "{{deps.n8n-db.host}}"
        port: 5432
        database: "{{deps.n8n-db.database}}"
        user: "{{deps.n8n-db.username}}"
        schema: public
  secret:
    n8n:
      encryption_key: "{{secrets.encryption_key}}"
    db:
      postgresdb:
        password: "{{deps.n8n-db.password}}"
  persistence:
    enabled: false
  resources:
    requests:
      cpu: "{{config.cpu_request}}"
      memory: "{{config.memory_request}}"
    limits:
      cpu: "{{config.cpu_limit}}"
      memory: "{{config.memory_limit}}"

worker:
  enabled: {{#eq config.execution_mode "queue"}}true{{else}}false{{/eq}}

webhook:
  enabled: false

valkey:
  enabled: false

{{#if cluster.ingress_enabled}}
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
        - "n8n-{{tenant.slug}}.{{cluster.domain}}"
{{else}}
ingress:
  enabled: false
{{/if}}`,
  dependencies: [
    {
      service: "postgresql",
      alias: "n8n-db",
      config: { database: "n8n", username: "n8n", storage_size: "8Gi" }
    }
  ],
  ingressConfig: {
    enabled: true,
    hostnameTemplate: "n8n-{tenant}.{domain}",
    port: 5678,
    path: "/"
  },
  resourceDefaults: { cpu: "50m", memory: "256Mi" },
  resourceLimits: { cpu: "500m", memory: "512Mi" },
  healthCheck: {
    type: "http",
    port: 5678,
    path: "/healthz",
    intervalSeconds: 15
  },
  aiHints: {
    summary:
      "n8n is a workflow automation platform, a self-hosted alternative to Zapier",
    whenToSuggest:
      "User needs workflow automation, API integration, task scheduling, Zapier/Make alternative, or wants to connect multiple services together",
    pairsWellWith: ["postgresql", "redis"]
  }
};

// ─── Uptime Kuma ─────────────────────────────────────────

const uptimeKuma: RecipeCreateInput = {
  slug: "uptime-kuma",
  displayName: "Uptime Kuma",
  description:
    "Self-hosted monitoring tool with a beautiful status page. Monitor HTTP, TCP, DNS, Docker, and more. Get alerts via email, Slack, Telegram, and 90+ notification services.",
  shortDescription: "Beautiful uptime monitoring for all your services",
  useCases: [
    "Monitor website uptime",
    "Get alerts when services go down",
    "Track response times",
  ],
  gettingStarted: `## Getting Started with Uptime Kuma

Uptime Kuma lets you monitor your websites, APIs, and services — and get notified instantly when something goes down.

### First steps
1. Open Uptime Kuma from your dashboard (click "Open App")
2. Create an account on first launch (this is your local admin account)
3. Click **Add New Monitor**
4. Enter the URL or IP address you want to monitor
5. Set your check interval (how often to check) and alert thresholds

### Set up notifications
Go to **Settings → Notifications** to connect:
- Email, Slack, Discord, Telegram
- Microsoft Teams, Webhooks, and 90+ more services

### Status pages
Create a public status page to share uptime with your team or users.`,
  websiteUrl: "https://uptime.kuma.pet",
  documentationUrl: "https://github.com/louislam/uptime-kuma/wiki",
  category: "monitoring",
  tags: ["monitoring", "uptime", "status-page", "alerts", "health-check"],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "https://helm.irsigler.cloud",
  chartVersion: "2.20.0",
  configSchema: {
    storage_size: {
      type: "string",
      default: "2Gi",
      label: "Storage Size",
      description: "Persistent volume size for SQLite database"
    },
    cpu_request: {
      type: "string",
      default: "25m",
      label: "CPU Request",
      description: "CPU request (e.g. 25m, 50m, 100m)"
    },
    memory_request: {
      type: "string",
      default: "64Mi",
      label: "Memory Request",
      description: "Memory request (e.g. 64Mi, 128Mi, 256Mi)"
    },
    cpu_limit: {
      type: "string",
      default: "150m",
      label: "CPU Limit",
      description: "CPU limit (e.g. 150m, 250m, 500m)"
    },
    memory_limit: {
      type: "string",
      default: "200Mi",
      label: "Memory Limit",
      description: "Memory limit (e.g. 200Mi, 512Mi, 1Gi)"
    }
  },
  secretsSchema: {},
  valuesTemplate: `image:
  repository: louislam/uptime-kuma
  tag: "1"

resources:
  requests:
    cpu: "{{config.cpu_request}}"
    memory: "{{config.memory_request}}"
  limits:
    cpu: "{{config.cpu_limit}}"
    memory: "{{config.memory_limit}}"

persistence:
  enabled: true
  size: "{{config.storage_size}}"
  accessModes:
    - ReadWriteOnce

{{#if cluster.ingress_enabled}}
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
        - "status-{{tenant.slug}}.{{cluster.domain}}"
{{else}}
ingress:
  enabled: false
{{/if}}`,
  dependencies: [],
  ingressConfig: {
    enabled: true,
    hostnameTemplate: "status-{tenant}.{domain}",
    port: 3001,
    path: "/"
  },
  resourceDefaults: { cpu: "25m", memory: "64Mi" },
  resourceLimits: { cpu: "150m", memory: "200Mi" },
  healthCheck: {
    type: "http",
    port: 3001,
    path: "/",
    intervalSeconds: 15
  },
  aiHints: {
    summary:
      "Uptime Kuma is a self-hosted uptime monitoring tool with a status page",
    whenToSuggest:
      "User needs uptime monitoring, health checks, status page, alerting for downtime, or wants to monitor services and endpoints",
    pairsWellWith: ["postgresql", "n8n"]
  }
};

// ─── MinIO ───────────────────────────────────────────────

const minio: RecipeCreateInput = {
  slug: "minio",
  displayName: "MinIO",
  description:
    "High-performance S3-compatible object storage. Store files, backups, artifacts, and media with full S3 API compatibility. Supports versioning, lifecycle policies, and server-side encryption.",
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
  category: "storage",
  tags: ["storage", "s3", "object-storage", "minio", "backup", "files"],
  iconUrl: undefined,
  sourceType: "helm",
  chartUrl: "oci://registry-1.docker.io/bitnamicharts/minio",
  chartVersion: undefined, // Use latest — pinned versions reference Docker tags that get removed
  configSchema: {
    storage_size: {
      type: "string",
      default: "10Gi",
      label: "Storage Size",
      description: "Persistent volume size for object storage"
    },
    default_buckets: {
      type: "string",
      default: "data",
      label: "Default Buckets",
      description: "Comma-separated list of buckets to create on startup"
    },
    cpu_request: {
      type: "string",
      default: "50m",
      label: "CPU Request",
      description: "CPU request (e.g. 50m, 100m, 250m)"
    },
    memory_request: {
      type: "string",
      default: "128Mi",
      label: "Memory Request",
      description: "Memory request (e.g. 128Mi, 256Mi, 512Mi)"
    },
    cpu_limit: {
      type: "string",
      default: "500m",
      label: "CPU Limit",
      description: "CPU limit (e.g. 500m, 1000m, 2000m)"
    },
    memory_limit: {
      type: "string",
      default: "512Mi",
      label: "Memory Limit",
      description: "Memory limit (e.g. 512Mi, 1Gi, 2Gi)"
    }
  },
  secretsSchema: {
    root_user: {
      description: "MinIO root/admin username",
      generate: true,
      length: 12
    },
    root_password: {
      description: "MinIO root/admin password",
      generate: true,
      length: 24
    }
  },
  valuesTemplate: `mode: standalone

auth:
  rootUser: "{{secrets.root_user}}"
  rootPassword: "{{secrets.root_password}}"

defaultBuckets: "{{config.default_buckets}}"

resources:
  requests:
    cpu: "{{config.cpu_request}}"
    memory: "{{config.memory_request}}"
  limits:
    cpu: "{{config.cpu_limit}}"
    memory: "{{config.memory_limit}}"

persistence:
  enabled: true
  size: "{{config.storage_size}}"
  accessModes:
    - ReadWriteOnce

{{#if cluster.ingress_enabled}}
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
  tls: true
{{else}}
ingress:
  enabled: false

apiIngress:
  enabled: false
{{/if}}`,
  dependencies: [],
  ingressConfig: {
    enabled: true,
    hostnameTemplate: "minio-{tenant}.{domain}",
    port: 9001,
    path: "/"
  },
  resourceDefaults: { cpu: "50m", memory: "128Mi" },
  resourceLimits: { cpu: "500m", memory: "512Mi" },
  healthCheck: {
    type: "http",
    port: 9000,
    path: "/minio/health/live",
    intervalSeconds: 15
  },
  aiHints: {
    summary: "MinIO is a high-performance S3-compatible object storage system",
    whenToSuggest:
      "User needs file storage, object storage, S3-compatible storage, backup storage, media storage, or artifact storage",
    pairsWellWith: ["postgresql", "n8n"]
  }
};

// ─── Export all seed recipes ─────────────────────────────

export const seedRecipes: RecipeCreateInput[] = [
  postgresql,
  redis,
  n8n,
  uptimeKuma,
  minio
];
