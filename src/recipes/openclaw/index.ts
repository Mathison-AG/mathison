/**
 * OpenClaw Recipe
 *
 * Self-hosted personal AI assistant with multi-channel messaging. Uses the
 * webApp archetype to produce: Deployment + Service + Secret + PVC + optional Ingress.
 * Dependencies: PostgreSQL (data store) + Redis (caching/sessions).
 */

import { z } from "zod/v4";
import { webApp } from "../_base/archetypes";

import type { RecipeDefinition, BuildContext, EnvVar } from "../_base/types";

// ─── Config Schema ────────────────────────────────────────

const configSchema = z.object({
  storage_size: z.string().default("5Gi"),
  cpu_request: z.string().default("250m"),
  memory_request: z.string().default("512Mi"),
  cpu_limit: z.string().default("1"),
  memory_limit: z.string().default("2Gi"),
});

type OpenClawConfig = z.infer<typeof configSchema>;

// ─── Environment Builder ─────────────────────────────────

function buildEnv(ctx: BuildContext<OpenClawConfig>): EnvVar[] {
  const db = ctx.deps["openclaw-db"];
  const cache = ctx.deps["openclaw-redis"];
  const secretName = `${ctx.name}-secret`;

  const env: EnvVar[] = [
    { name: "NODE_ENV", value: "production" },
  ];

  if (db) {
    env.push({
      name: "DATABASE_URL",
      value: `postgresql://${String(db.username ?? "openclaw")}:${String(db.password ?? "")}@${db.host}:${db.port}/${String(db.database ?? "openclaw")}`,
    });
  }

  if (cache) {
    const redisPassword = cache.password ? `:${String(cache.password)}` : "";
    env.push({
      name: "REDIS_URL",
      value: `redis://${redisPassword}@${cache.host}:${cache.port}`,
    });
  }

  env.push({
    name: "OPENCLAW_GATEWAY_TOKEN",
    secretName,
    secretKey: "gateway_token",
  });

  return env;
}

// ─── Recipe Definition ────────────────────────────────────

export const openclaw: RecipeDefinition<OpenClawConfig> = webApp<OpenClawConfig>({
  slug: "openclaw",
  displayName: "OpenClaw",
  category: "automation",
  description:
    "Open-source personal AI assistant that connects to WhatsApp, Telegram, Discord, Slack, Signal, iMessage, and more. Supports Claude, GPT, Grok, or fully local models via Ollama. Runs 24/7 with autonomous task monitoring.",
  tags: ["ai", "assistant", "chatbot", "automation", "multi-channel", "llm"],

  shortDescription: "Personal AI assistant across all your messaging channels",
  useCases: [
    "Run a personal AI assistant on your own infrastructure",
    "Connect AI to WhatsApp, Telegram, Discord, and Slack",
    "Automate tasks with 5,700+ community skills",
  ],
  gettingStarted: `## Getting Started with OpenClaw

OpenClaw is your personal AI assistant — it connects to the messaging channels you already use and responds with the power of any LLM you choose.

### First steps
1. Open OpenClaw from your dashboard (click "Open App")
2. You'll see the **Control UI** — this is your gateway's dashboard
3. Go to **Settings** and enter the **Gateway Token** shown during setup
4. Pair your browser device when prompted

### Connect a messaging channel
Go to the channel settings and follow the setup for your platform:
- **Telegram**: Create a bot via @BotFather, paste the token
- **Discord**: Create a bot in the Developer Portal, paste the token
- **WhatsApp**: Scan the QR code from the channel setup screen
- **Slack**: Install the OpenClaw app in your workspace

### Configure your LLM
OpenClaw works with multiple AI providers:
- **Cloud**: Claude (Anthropic), GPT (OpenAI), Grok (xAI)
- **Local**: Ollama, vLLM — run models entirely on your hardware

### Extend with skills
Browse **ClawHub** for 5,700+ community-built skills — from smart home control to calendar management to code generation.`,
  websiteUrl: "https://openclaw.ai",
  documentationUrl: "https://docs.openclaw.ai",
  featured: false,

  configSchema,
  secrets: {
    gateway_token: {
      description: "Token for authenticating with the OpenClaw Control UI",
      generate: true,
      length: 32,
    },
  },
  dependencies: {
    "openclaw-db": {
      recipe: "postgresql",
      reason: "Stores conversation history, agent sessions, and configuration",
      defaultConfig: { database: "openclaw", username: "openclaw", storage_size: "5Gi" },
    },
    "openclaw-redis": {
      recipe: "redis",
      reason: "Caching and session management",
    },
  },

  image: "ghcr.io/openclaw/openclaw",
  imageTag: "latest",
  containerPort: 18789,

  env: buildEnv,

  persistence: {
    enabled: true,
    mountPath: "/home/node/.openclaw",
    storageSize: (config) => config.storage_size,
  },

  defaultResources: (config) => ({
    requests: { cpu: config.cpu_request, memory: config.memory_request },
    limits: { cpu: config.cpu_limit, memory: config.memory_limit },
  }),

  runAsUser: 1000,
  runAsGroup: 1000,
  fsGroup: 1000,

  livenessProbe: {
    type: "http",
    port: 18789,
    path: "/",
    initialDelaySeconds: 30,
    periodSeconds: 20,
    timeoutSeconds: 5,
    failureThreshold: 3,
  },
  readinessProbe: {
    type: "http",
    port: 18789,
    path: "/",
    initialDelaySeconds: 15,
    periodSeconds: 10,
    timeoutSeconds: 5,
    failureThreshold: 3,
  },

  ingress: {
    enabled: true,
    hostnameTemplate: "{name}-{workspace}.{domain}",
    port: 18789,
    path: "/",
    serviceNameSuffix: "-openclaw",
    extraAnnotations: {
      "nginx.ingress.kubernetes.io/proxy-buffering": "off",
      "nginx.ingress.kubernetes.io/proxy-read-timeout": "3600",
      "nginx.ingress.kubernetes.io/proxy-send-timeout": "3600",
      "nginx.ingress.kubernetes.io/proxy-http-version": "1.1",
    },
  },

  healthCheck: () => ({
    type: "http",
    port: 18789,
    path: "/",
    intervalSeconds: 20,
  }),

  dataExport: {
    description: "OpenClaw stores data in PostgreSQL — export the database from the openclaw-db app instead",
    strategy: {
      type: "command",
      command: () => [
        "sh", "-c",
        "echo 'OpenClaw data lives in its PostgreSQL database. Export data from the openclaw-db app instead.'",
      ],
      contentType: "text/plain",
      fileExtension: "txt",
    },
  },

  aiHints: {
    summary:
      "OpenClaw is a self-hosted personal AI assistant that connects to WhatsApp, Telegram, Discord, Slack, and other messaging channels",
    whenToSuggest:
      "User wants a personal AI assistant, chatbot, multi-channel messaging bot, or needs AI connected to WhatsApp/Telegram/Discord/Slack",
    pairsWellWith: ["postgresql", "redis", "n8n"],
  },
});

export default openclaw;
