/**
 * Uptime Kuma Recipe
 *
 * Self-hosted monitoring tool with status pages. Uses the webApp archetype
 * to produce: Deployment + Service + PVC + optional Ingress.
 */

import { z } from "zod/v4";
import { webApp } from "../_base/archetypes";

import type { RecipeDefinition } from "../_base/types";

// ─── Config Schema ────────────────────────────────────────

const configSchema = z.object({
  storage_size: z.string().default("2Gi"),
  cpu_request: z.string().default("25m"),
  memory_request: z.string().default("64Mi"),
  cpu_limit: z.string().default("150m"),
  memory_limit: z.string().default("200Mi"),
});

type UptimeKumaConfig = z.infer<typeof configSchema>;

// ─── Recipe Definition ────────────────────────────────────

export const uptimeKuma: RecipeDefinition<UptimeKumaConfig> = webApp<UptimeKumaConfig>({
  slug: "uptime-kuma",
  displayName: "Uptime Kuma",
  category: "monitoring",
  description:
    "Self-hosted monitoring tool with a beautiful status page. Monitor HTTP, TCP, DNS, Docker, and more. Get alerts via email, Slack, Telegram, and 90+ notification services.",
  tags: ["monitoring", "uptime", "status-page", "alerts", "health-check"],

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
  featured: true,

  configSchema,
  secrets: {},

  image: "louislam/uptime-kuma",
  imageTag: "1",
  containerPort: 3001,

  env: () => [],

  persistence: {
    enabled: true,
    mountPath: "/app/data",
    storageSize: (config) => config.storage_size,
  },

  defaultResources: (config) => ({
    requests: { cpu: config.cpu_request, memory: config.memory_request },
    limits: { cpu: config.cpu_limit, memory: config.memory_limit },
  }),

  // Note: Uptime Kuma's entrypoint runs `chown -R node:node /app/data`
  // which requires root. The container drops to `node` (UID 1000) via su-exec.
  // Do NOT set runAsUser — the container manages user switching itself.

  livenessProbe: {
    type: "http",
    port: 3001,
    path: "/",
    initialDelaySeconds: 15,
    periodSeconds: 15,
    timeoutSeconds: 5,
    failureThreshold: 3,
  },
  readinessProbe: {
    type: "http",
    port: 3001,
    path: "/",
    initialDelaySeconds: 5,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 3,
  },

  ingress: {
    enabled: true,
    hostnameTemplate: "{name}-{workspace}.{domain}",
    port: 3001,
    path: "/",
    serviceNameSuffix: "-uptime-kuma",
    extraAnnotations: {
      "nginx.ingress.kubernetes.io/proxy-buffering": "off",
      "nginx.ingress.kubernetes.io/proxy-read-timeout": "300",
      "nginx.ingress.kubernetes.io/proxy-send-timeout": "300",
    },
  },

  healthCheck: () => ({
    type: "http",
    port: 3001,
    path: "/",
    intervalSeconds: 15,
  }),

  dataExport: {
    description: "SQLite database containing all monitors, status pages, and notification settings",
    strategy: {
      type: "files",
      paths: () => ["/app/data/kuma.db"],
    },
  },

  dataImport: {
    description: "Restore monitors and settings from a previous export",
    strategy: {
      type: "files",
      extractPath: "/",
    },
    restartAfterImport: true,
  },

  aiHints: {
    summary:
      "Uptime Kuma is a self-hosted uptime monitoring tool with a status page",
    whenToSuggest:
      "User needs uptime monitoring, health checks, status page, alerting for downtime, or wants to monitor services and endpoints",
    pairsWellWith: ["postgresql", "n8n"],
  },
});

export default uptimeKuma;
