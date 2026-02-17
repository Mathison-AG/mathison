/**
 * n8n Recipe
 *
 * Fair-code workflow automation platform. Uses a custom build() function
 * (not an archetype) due to its complexity: dependency wiring to PostgreSQL,
 * worker mode toggle, encryption key, and conditional ingress.
 *
 * Produces: Deployment + Service + Secret + optional Ingress
 * Dependencies: PostgreSQL (auto-deployed as "n8n-db")
 */

import { z } from "zod/v4";
import * as builders from "../_base/builders";
import { secret } from "../_base/types";

import type {
  RecipeDefinition,
  BuildContext,
  KubernetesResource,
  HealthCheckContext,
  HealthCheckSpec,
  EnvVar,
} from "../_base/types";

// ─── Config Schema ────────────────────────────────────────

const configSchema = z.object({
  execution_mode: z.enum(["regular", "queue"]).default("regular"),
  cpu_request: z.string().default("50m"),
  memory_request: z.string().default("256Mi"),
  cpu_limit: z.string().default("500m"),
  memory_limit: z.string().default("512Mi"),
});

type N8nConfig = z.infer<typeof configSchema>;

// ─── Build Function ───────────────────────────────────────

function build(ctx: BuildContext<N8nConfig>): KubernetesResource[] {
  const resources: KubernetesResource[] = [];
  const { name, namespace, config, secrets, deps } = ctx;

  // Get PostgreSQL dependency connection info
  const db = deps["n8n-db"];
  if (!db) {
    throw new Error("n8n requires a PostgreSQL dependency (alias: n8n-db)");
  }

  // 1. Secret — encryption key and DB password
  const secretName = `${name}-secret`;
  resources.push(
    builders.secret(secretName, namespace, {
      appName: "n8n",
      stringData: {
        N8N_ENCRYPTION_KEY: secret(secrets, "encryption_key"),
        DB_POSTGRESDB_PASSWORD: String(db.password ?? ""),
      },
    })
  );

  // 2. Environment variables
  const envVars: EnvVar[] = [
    // Database config
    { name: "DB_TYPE", value: "postgresdb" },
    { name: "DB_POSTGRESDB_HOST", value: db.host },
    { name: "DB_POSTGRESDB_PORT", value: String(db.port) },
    { name: "DB_POSTGRESDB_DATABASE", value: String(db.database ?? "n8n") },
    { name: "DB_POSTGRESDB_USER", value: String(db.username ?? "n8n") },
    { name: "DB_POSTGRESDB_SCHEMA", value: "public" },
    // Secrets from K8s Secret
    {
      name: "DB_POSTGRESDB_PASSWORD",
      secretName: secretName,
      secretKey: "DB_POSTGRESDB_PASSWORD",
    },
    {
      name: "N8N_ENCRYPTION_KEY",
      secretName: secretName,
      secretKey: "N8N_ENCRYPTION_KEY",
    },
    // n8n settings
    { name: "N8N_PORT", value: "5678" },
    { name: "N8N_PROTOCOL", value: "http" },
    { name: "GENERIC_TIMEZONE", value: "UTC" },
  ];

  // Queue mode settings
  if (config.execution_mode === "queue") {
    envVars.push({ name: "EXECUTIONS_MODE", value: "queue" });
  }

  // 3. Main Deployment
  resources.push(
    builders.deployment(name, namespace, {
      appName: "n8n",
      image: "docker.io/n8nio/n8n",
      ports: [{ name: "http", containerPort: 5678 }],
      env: envVars,
      resources: {
        requests: { cpu: config.cpu_request, memory: config.memory_request },
        limits: { cpu: config.cpu_limit, memory: config.memory_limit },
      },
      livenessProbe: {
        type: "http",
        port: 5678,
        path: "/healthz",
        initialDelaySeconds: 30,
        periodSeconds: 15,
        timeoutSeconds: 5,
        failureThreshold: 3,
      },
      readinessProbe: {
        type: "http",
        port: 5678,
        path: "/healthz",
        initialDelaySeconds: 10,
        periodSeconds: 10,
        timeoutSeconds: 5,
        failureThreshold: 3,
      },
      securityContext: {
        fsGroup: 1000,
        runAsUser: 1000,
        runAsGroup: 1000,
      },
      strategy: { type: "Recreate" },
    })
  );

  // 4. Service
  const svcName = name;
  resources.push(
    builders.service(svcName, namespace, {
      appName: "n8n",
      ports: [{ name: "http", port: 5678, targetPort: 5678 }],
      selector: builders.matchLabels("n8n", name),
    })
  );

  // 5. Worker Deployment (queue mode only)
  if (config.execution_mode === "queue") {
    const workerEnv: EnvVar[] = [
      ...envVars,
      { name: "N8N_WORKER", value: "true" },
    ];

    resources.push(
      builders.deployment(`${name}-worker`, namespace, {
        appName: "n8n",
        image: "docker.io/n8nio/n8n",
        command: ["n8n", "worker"],
        ports: [],
        env: workerEnv,
        resources: {
          requests: { cpu: config.cpu_request, memory: config.memory_request },
          limits: { cpu: config.cpu_limit, memory: config.memory_limit },
        },
        securityContext: {
          fsGroup: 1000,
          runAsUser: 1000,
          runAsGroup: 1000,
        },
        component: "worker",
      })
    );
  }

  // 6. Ingress (if context provided)
  if (ctx.ingress) {
    const hostname = `n8n-${name}.${ctx.ingress.domain}`;

    const ingressTls = ctx.ingress.tlsEnabled
      ? {
          secretName: `${name}-tls`,
          clusterIssuer: ctx.ingress.tlsClusterIssuer,
        }
      : undefined;

    resources.push(
      builders.ingress(`${name}-ingress`, namespace, {
        appName: "n8n",
        host: hostname,
        serviceName: svcName,
        servicePort: 5678,
        path: "/",
        ingressClass: ctx.ingress.ingressClass,
        tls: ingressTls,
      })
    );
  }

  return resources;
}

// ─── Recipe Definition ────────────────────────────────────

export const n8n: RecipeDefinition<N8nConfig> = {
  slug: "n8n",
  displayName: "n8n",
  category: "automation",
  description:
    "Fair-code workflow automation platform. Connect APIs, databases, and services with a visual flow editor. Self-hosted alternative to Zapier and Make with full control over your data.",
  tags: ["automation", "workflow", "zapier", "integration", "no-code", "low-code"],

  shortDescription: "Visual workflow automation — connect anything to everything",
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
  hasWebUI: true,
  featured: true,

  configSchema,
  secrets: {
    encryption_key: {
      description: "n8n encryption key for credentials stored in DB",
      generate: true,
      length: 32,
    },
  },
  dependencies: {
    "n8n-db": {
      recipe: "postgresql",
      reason: "n8n stores workflow data and credentials in PostgreSQL",
      defaultConfig: { database: "n8n", username: "n8n", storage_size: "8Gi" },
    },
  },

  ports: [{ name: "http", port: 5678, targetPort: 5678 }],

  ingress: {
    enabled: true,
    hostnameTemplate: "n8n-{name}.{domain}",
    port: 5678,
    path: "/",
    serviceNameSuffix: "",
  },

  build,

  connectionInfo: (ctx) => ({
    host: `${ctx.name}.${ctx.namespace}.svc.cluster.local`,
    port: 5678,
    url: `http://${ctx.name}.${ctx.namespace}.svc.cluster.local:5678`,
  }),

  healthCheck: (_ctx: HealthCheckContext<N8nConfig>): HealthCheckSpec => ({
    type: "http",
    port: 5678,
    path: "/healthz",
    intervalSeconds: 15,
  }),

  aiHints: {
    summary:
      "n8n is a workflow automation platform, a self-hosted alternative to Zapier",
    whenToSuggest:
      "User needs workflow automation, API integration, task scheduling, Zapier/Make alternative, or wants to connect multiple services together",
    pairsWellWith: ["postgresql", "redis"],
  },
};

export default n8n;
