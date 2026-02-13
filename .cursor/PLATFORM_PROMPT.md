# Mathison Platform — Project Brief

You are building **Mathison**, an AI-first platform that lets users deploy and manage applications on Kubernetes without needing to understand Kubernetes. Users interact with an AI agent via natural language ("add a PostgreSQL database", "set up n8n") and see their stack visualized on a canvas.

This is both a **SaaS product** (cloud-hosted, multi-tenant) and a **self-hostable application** (single Helm install on any Kubernetes cluster). The same codebase serves both modes.

---

## Tech Stack

- **Framework**: Next.js 15 (App Router, Server Components, Route Handlers)
- **Language**: TypeScript (strict mode) — everywhere, frontend and backend
- **UI**: React 19, Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Canvas**: React Flow — visual stack/dependency graph
- **AI**: Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) — streaming, tool calling, multi-provider
- **Database**: PostgreSQL 16 with pgvector extension
- **ORM**: Prisma (schema, migrations, typed client)
- **Auth**: Auth.js v5 (NextAuth) — credentials, OIDC, OAuth providers
- **Background Jobs**: BullMQ + Redis — deployment orchestration, embedding generation
- **Validation**: Zod — forms, API inputs, tool parameters
- **K8s Integration**: `@kubernetes/client-node` + `helm` CLI (subprocess via `execa`)
- **Data Fetching**: TanStack Query (React Query) for client components
- **Deployment**: Docker, Helm chart

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   Next.js Application                     │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Pages (React Server Components + Client Components) │ │
│  │  ┌──────────────┐  ┌─────────────────────────────┐  │ │
│  │  │  Chat Panel  │  │  Canvas (React Flow)        │  │ │
│  │  │  (useChat)   │  │  (visual stack view)        │  │ │
│  │  └──────────────┘  └─────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  API Route Handlers (/api/*)                         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐   │ │
│  │  │ /api/chat│ │/api/     │ │ /api/deployments  │   │ │
│  │  │ (AI SDK) │ │ catalog  │ │                   │   │ │
│  │  └──────────┘ └──────────┘ └───────────────────┘   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Server-side Libraries                               │ │
│  │  ┌───────────┐ ┌────────────┐ ┌─────────────────┐  │ │
│  │  │ Prisma    │ │ K8s Client │ │ Helm Wrapper    │  │ │
│  │  │ (DB)      │ │            │ │ (execa)         │  │ │
│  │  └───────────┘ └────────────┘ └─────────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
         │                              │
    PostgreSQL                    Kubernetes API
    + Redis                       + Helm CLI

┌──────────────────────────────────────────────────────────┐
│  BullMQ Worker (separate process, same codebase)         │
│  Processes: deploy, undeploy, embed, health-check        │
└──────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
mathison/
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── layout.tsx                    # Root layout (providers, fonts, metadata)
│   │   ├── page.tsx                      # Landing/redirect to dashboard
│   │   │
│   │   ├── (auth)/                       # Auth route group (no sidebar layout)
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── layout.tsx                # Centered card layout
│   │   │
│   │   ├── (dashboard)/                  # Main app route group (with sidebar)
│   │   │   ├── layout.tsx                # Sidebar + header + chat panel layout
│   │   │   ├── page.tsx                  # Dashboard: canvas + overview
│   │   │   ├── catalog/
│   │   │   │   ├── page.tsx              # Browse/search catalog
│   │   │   │   └── [slug]/page.tsx       # Recipe detail page
│   │   │   ├── deployments/
│   │   │   │   ├── page.tsx              # List all deployments
│   │   │   │   └── [id]/page.tsx         # Deployment detail (logs, config)
│   │   │   └── settings/
│   │   │       └── page.tsx              # Account & workspace settings
│   │   │
│   │   └── api/                          # API Route Handlers
│   │       ├── chat/route.ts             # POST — AI agent (Vercel AI SDK streamText)
│   │       ├── catalog/
│   │       │   ├── route.ts              # GET (list/search), POST (create)
│   │       │   ├── [slug]/route.ts       # GET, PUT, DELETE single recipe
│   │       │   └── search/route.ts       # POST — semantic search (pgvector)
│   │       ├── deployments/
│   │       │   ├── route.ts              # GET (list), POST (deploy)
│   │       │   ├── [id]/route.ts         # GET (detail), DELETE (remove)
│   │       │   └── [id]/logs/route.ts    # GET — stream pod logs
│   │       ├── stack/route.ts            # GET — canvas data (nodes + edges)
│   │       └── auth/[...nextauth]/route.ts  # Auth.js catch-all
│   │
│   ├── components/                       # React components
│   │   ├── ui/                           # shadcn/ui components (Button, Card, Dialog, etc.)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx               # Navigation sidebar
│   │   │   ├── header.tsx                # Top bar (user menu, workspace name)
│   │   │   └── chat-panel.tsx            # Sliding right panel (chat or detail)
│   │   ├── canvas/
│   │   │   ├── stack-canvas.tsx          # React Flow canvas wrapper
│   │   │   ├── service-node.tsx          # Custom node: icon, name, status, URL
│   │   │   ├── dependency-edge.tsx       # Custom edge: animated dependency line
│   │   │   └── canvas-controls.tsx       # Zoom, fit, layout buttons
│   │   ├── chat/
│   │   │   ├── chat-messages.tsx         # Message list with streaming support
│   │   │   ├── chat-input.tsx            # Input box with send button
│   │   │   ├── tool-invocation.tsx       # Renders tool calls as action cards
│   │   │   └── chat-provider.tsx         # Chat context provider (wraps useChat)
│   │   ├── catalog/
│   │   │   ├── recipe-card.tsx           # Card in catalog grid
│   │   │   ├── recipe-grid.tsx           # Grid layout with filters
│   │   │   └── recipe-detail.tsx         # Full recipe info + deploy button
│   │   ├── deployments/
│   │   │   ├── deployment-card.tsx       # Row/card in deployment list
│   │   │   ├── deployment-detail.tsx     # Full detail panel
│   │   │   ├── log-viewer.tsx            # Streaming log viewer
│   │   │   └── status-badge.tsx          # Colored status indicator
│   │   └── auth/
│   │       ├── login-form.tsx
│   │       └── signup-form.tsx
│   │
│   ├── lib/                              # Server-side libraries & utilities
│   │   ├── db.ts                         # Prisma client singleton
│   │   ├── auth.ts                       # Auth.js configuration
│   │   ├── agent/
│   │   │   ├── tools.ts                  # All agent tool definitions (Zod + execute)
│   │   │   ├── system-prompt.ts          # System prompt for the agent
│   │   │   └── provider.ts              # LLM provider factory (openai/anthropic/ollama)
│   │   ├── cluster/
│   │   │   ├── kubernetes.ts             # K8s client wrapper (namespaces, pods, logs)
│   │   │   ├── helm.ts                   # Helm CLI wrapper (install, upgrade, uninstall)
│   │   │   └── ingress.ts               # Ingress helper (detect class, create rules)
│   │   ├── catalog/
│   │   │   ├── service.ts               # Catalog CRUD + semantic search queries
│   │   │   ├── seed.ts                  # Seed initial recipes on first startup
│   │   │   └── embedding.ts             # Generate embeddings for recipe text
│   │   ├── deployer/
│   │   │   ├── engine.ts                # Deployment orchestration logic
│   │   │   ├── dependencies.ts          # Dependency resolution
│   │   │   ├── secrets.ts               # Secret generation + K8s Secret management
│   │   │   └── template.ts              # Render values_template with config + secrets
│   │   ├── tenant/
│   │   │   ├── manager.ts               # Namespace creation, quotas, network policies
│   │   │   └── quota.ts                 # Resource quota helpers
│   │   ├── queue/
│   │   │   ├── connection.ts            # Redis/BullMQ connection factory
│   │   │   ├── queues.ts               # Queue definitions (deploy, embed, monitor)
│   │   │   └── jobs.ts                  # Job type definitions (shared with worker)
│   │   └── config.ts                    # Environment variable parsing + validation (Zod)
│   │
│   ├── hooks/                           # Client-side React hooks
│   │   ├── use-deployments.ts           # Fetch + poll deployments via TanStack Query
│   │   ├── use-canvas-data.ts           # Fetch stack graph (nodes + edges)
│   │   └── use-catalog.ts              # Catalog search + browse
│   │
│   └── types/                           # Shared TypeScript types
│       ├── recipe.ts                    # Recipe, ConfigSchema, RecipeCreate
│       ├── deployment.ts                # Deployment, DeploymentStatus
│       ├── tenant.ts                    # Tenant
│       └── canvas.ts                    # CanvasNode, CanvasEdge
│
├── worker/
│   └── index.ts                         # BullMQ worker entry point
│                                        # Imports from src/lib/ — same codebase
│                                        # Processes: deploy, undeploy, embed, health-check
│
├── prisma/
│   ├── schema.prisma                    # Database schema (all models)
│   ├── migrations/                      # Prisma Migrate output
│   └── seed.ts                          # Seed script (initial recipes)
│
├── public/                              # Static assets
│   └── icons/                           # Service icons (postgresql.svg, redis.svg, etc.)
│
├── .env.example                         # Documented env vars
├── .env.local                           # Local dev overrides (gitignored)
├── docker-compose.yaml                  # Local dev: postgres + redis
├── Dockerfile                           # Production multi-stage build
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector", schema: "public")]
}

// ─── Auth & Tenancy ──────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?   @map("password_hash")
  name          String?
  role          Role      @default(USER)
  tenantId      String    @map("tenant_id")
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  conversations Conversation[]
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@map("users")
}

enum Role {
  ADMIN
  USER
}

model Tenant {
  id           String       @id @default(cuid())
  slug         String       @unique
  name         String
  namespace    String       @unique          // K8s namespace: "tenant-{slug}"
  quota        Json         @default("{}")   // {cpu: "4", memory: "8Gi", storage: "50Gi"}
  status       TenantStatus @default(ACTIVE)
  users        User[]
  deployments  Deployment[]
  conversations Conversation[]
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  @@map("tenants")
}

enum TenantStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

// ─── Service Catalog ─────────────────────────────────────

model Recipe {
  id               String       @id @default(cuid())
  slug             String       @unique
  displayName      String       @map("display_name")
  description      String
  category         String                     // "database", "automation", "monitoring"
  tags             String[]                   // ["database", "sql", "relational"]
  iconUrl          String?      @map("icon_url")

  // Source
  sourceType       String       @default("helm") @map("source_type")
  chartUrl         String       @map("chart_url")        // "bitnami/postgresql"
  chartVersion     String?      @map("chart_version")    // ">=15.0.0"

  // Configuration
  configSchema     Json         @default("{}") @map("config_schema")
  secretsSchema    Json         @default("{}") @map("secrets_schema")
  valuesTemplate   String       @default("") @map("values_template")
  dependencies     Json         @default("[]")           // [{service, alias, config}]
  ingressConfig    Json         @default("{}") @map("ingress_config")
  resourceDefaults Json         @default("{}") @map("resource_defaults")
  resourceLimits   Json         @default("{}") @map("resource_limits")
  healthCheck      Json         @default("{}") @map("health_check")

  // AI
  aiHints          Json         @default("{}") @map("ai_hints")
  embedding        Unsupported("vector(1536)")?

  // Metadata
  tier             RecipeTier   @default(COMMUNITY)
  status           RecipeStatus @default(DRAFT)
  createdById      String?      @map("created_by_id")
  version          Int          @default(1)
  deployments      Deployment[]
  versions         RecipeVersion[]
  createdAt        DateTime     @default(now()) @map("created_at")
  updatedAt        DateTime     @updatedAt @map("updated_at")

  @@map("recipes")
}

enum RecipeTier {
  OFFICIAL
  VERIFIED
  COMMUNITY
}

enum RecipeStatus {
  DRAFT
  PUBLISHED
  DEPRECATED
}

model RecipeVersion {
  id        String   @id @default(cuid())
  recipeId  String   @map("recipe_id")
  recipe    Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  version   Int
  snapshot  Json                              // Full recipe data at this version
  changedBy String?  @map("changed_by")
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([recipeId, version])
  @@map("recipe_versions")
}

// ─── Stacks (bundled recipes) ────────────────────────────

model Stack {
  id          String       @id @default(cuid())
  slug        String       @unique
  displayName String       @map("display_name")
  description String
  services    Json                              // [{recipeSlug, alias, config, wiring}]
  aiHints     Json         @default("{}") @map("ai_hints")
  embedding   Unsupported("vector(1536)")?
  tier        RecipeTier   @default(COMMUNITY)
  status      RecipeStatus @default(DRAFT)
  createdById String?      @map("created_by_id")
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  @@map("stacks")
}

// ─── Deployments ─────────────────────────────────────────

model Deployment {
  id             String           @id @default(cuid())
  tenantId       String           @map("tenant_id")
  tenant         Tenant           @relation(fields: [tenantId], references: [id])
  recipeId       String           @map("recipe_id")
  recipe         Recipe           @relation(fields: [recipeId], references: [id])
  recipeVersion  Int              @map("recipe_version")
  name           String                         // "my-postgresql"
  namespace      String                         // tenant's K8s namespace
  helmRelease    String           @map("helm_release")
  config         Json             @default("{}")
  secretsRef     String?          @map("secrets_ref")
  status         DeploymentStatus @default(PENDING)
  url            String?
  errorMessage   String?          @map("error_message")
  dependsOn      String[]         @map("depends_on")  // Deployment IDs
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")

  @@unique([tenantId, name])
  @@map("deployments")
}

enum DeploymentStatus {
  PENDING
  DEPLOYING
  RUNNING
  FAILED
  STOPPED
  DELETING
}

// ─── Conversations ───────────────────────────────────────

model Conversation {
  id        String    @id @default(cuid())
  tenantId  String    @map("tenant_id")
  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  userId    String    @map("user_id")
  user      User      @relation(fields: [userId], references: [id])
  title     String?
  messages  Message[]
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  @@map("conversations")
}

model Message {
  id             String   @id @default(cuid())
  conversationId String   @map("conversation_id")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           MessageRole
  content        String
  toolInvocations Json?   @map("tool_invocations")   // [{toolName, args, result}]
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("messages")
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
  TOOL
}
```

---

## AI Agent — The Core

### Chat API Route (Vercel AI SDK)

The chat endpoint is the heart of the application. It uses the Vercel AI SDK's `streamText` function with tool definitions.

```typescript
// src/app/api/chat/route.ts
import { streamText } from "ai";
import { getProvider } from "@/lib/agent/provider";
import { getTools } from "@/lib/agent/tools";
import { systemPrompt } from "@/lib/agent/system-prompt";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { messages } = await req.json();
  const provider = getProvider();   // returns openai/anthropic/ollama based on env
  const tools = getTools(session.user.tenantId);

  const result = streamText({
    model: provider,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 10,   // allow multi-step tool calling
  });

  return result.toDataStreamResponse();
}
```

### System Prompt

```typescript
// src/lib/agent/system-prompt.ts
export const systemPrompt = `You are Mathison, an AI assistant that helps users deploy and manage applications on Kubernetes. Users do not need to understand Kubernetes — they tell you what they need in plain language, and you handle the rest.

You have tools to:
- Search the service catalog for available applications and databases
- Deploy services to the user's workspace
- Check the status of running services
- View service logs
- Update or remove services
- Create new catalog entries when a service isn't available yet

Guidelines:
- Always confirm destructive actions (remove, scale to zero) before executing. Ask the user to confirm.
- When deploying, explain what you're setting up and what the user will get.
- After a successful deployment, provide the access URL and any relevant connection details.
- If a service has dependencies (e.g., n8n needs PostgreSQL), deploy them automatically and explain what you did.
- If the user asks for something not in the catalog, search Artifact Hub for a Helm chart and offer to set it up.
- Be concise but informative. Don't dump raw YAML or Kubernetes internals unless the user asks.
- When listing services or status, format the output as a clean readable list.`;
```

### Agent Tools

Each tool is defined with a Zod schema (parameters) and an `execute` function. The AI SDK handles the call-execute-respond loop automatically.

```typescript
// src/lib/agent/tools.ts
import { tool } from "ai";
import { z } from "zod";

export function getTools(tenantId: string) {
  return {
    searchCatalog: tool({
      description: "Search the service catalog for available services to deploy. Use this when the user asks what's available or wants to find a specific type of service.",
      parameters: z.object({
        query: z.string().describe("Natural language search query"),
        category: z.string().optional().describe("Filter by category: database, automation, monitoring, storage, analytics"),
      }),
      execute: async ({ query, category }) => {
        // Semantic search via pgvector
        // Returns: [{slug, displayName, description, category, tier}]
      },
    }),

    getRecipe: tool({
      description: "Get full details about a specific service recipe including its configuration options.",
      parameters: z.object({
        slug: z.string().describe("Recipe slug, e.g. 'postgresql'"),
      }),
      execute: async ({ slug }) => {
        // Prisma query for full recipe data
        // Returns: recipe with configSchema, dependencies, resourceDefaults
      },
    }),

    deployService: tool({
      description: "Deploy a service from the catalog to the user's workspace. This will install the service and all its dependencies.",
      parameters: z.object({
        recipeSlug: z.string().describe("The recipe to deploy, e.g. 'postgresql'"),
        name: z.string().optional().describe("Custom name for this deployment, e.g. 'my-database'"),
        config: z.record(z.any()).optional().describe("Configuration overrides matching the recipe's config schema"),
      }),
      execute: async ({ recipeSlug, name, config }) => {
        // 1. Look up recipe
        // 2. Resolve dependencies (deploy them first if needed)
        // 3. Generate secrets
        // 4. Queue BullMQ job for helm install
        // 5. Create deployment record in DB with status=DEPLOYING
        // Returns: {deploymentId, name, status, message}
      },
    }),

    getStackStatus: tool({
      description: "Get the status of all deployed services in the user's workspace.",
      parameters: z.object({}),
      execute: async () => {
        // Query deployments for this tenant
        // Enrich with live K8s pod status
        // Returns: [{name, recipe, status, url, resources}]
      },
    }),

    getServiceDetail: tool({
      description: "Get detailed information about a specific deployed service including resource usage and connection details.",
      parameters: z.object({
        deploymentId: z.string().describe("The deployment ID"),
      }),
      execute: async ({ deploymentId }) => {
        // Deployment record + live K8s data (pods, resource usage)
        // Returns: {name, status, url, pods, config, connectionInfo}
      },
    }),

    getServiceLogs: tool({
      description: "Get recent logs from a deployed service. Useful for debugging.",
      parameters: z.object({
        deploymentId: z.string().describe("The deployment ID"),
        lines: z.number().optional().default(50).describe("Number of log lines"),
      }),
      execute: async ({ deploymentId, lines }) => {
        // K8s API: get pod logs
        // Returns: string of log lines
      },
    }),

    updateService: tool({
      description: "Update the configuration of a running service. This performs a Helm upgrade.",
      parameters: z.object({
        deploymentId: z.string().describe("The deployment ID"),
        config: z.record(z.any()).describe("New configuration values"),
      }),
      execute: async ({ deploymentId, config }) => {
        // Queue BullMQ job for helm upgrade
        // Returns: {deploymentId, status, message}
      },
    }),

    removeService: tool({
      description: "Remove a deployed service. IMPORTANT: Always ask the user for confirmation before calling this tool. Never call this without explicit user confirmation.",
      parameters: z.object({
        deploymentId: z.string().describe("The deployment ID to remove"),
        confirmed: z.boolean().describe("Must be true — confirm the user has agreed to removal"),
      }),
      execute: async ({ deploymentId, confirmed }) => {
        if (!confirmed) return { error: "User must confirm removal first" };
        // Queue BullMQ job for helm uninstall
        // Returns: {deploymentId, status: "deleting", message}
      },
    }),

    createRecipe: tool({
      description: "Create a new service recipe in the catalog. Use this when you find a Helm chart that isn't in the catalog yet.",
      parameters: z.object({
        slug: z.string(),
        displayName: z.string(),
        description: z.string(),
        category: z.string(),
        chartUrl: z.string(),
        chartVersion: z.string().optional(),
        valuesTemplate: z.string().optional(),
        configSchema: z.any().optional(),
        aiHints: z.any().optional(),
      }),
      execute: async (params) => {
        // Create recipe with status=DRAFT, tier=COMMUNITY
        // Returns: {slug, displayName, status}
      },
    }),

    searchHelmCharts: tool({
      description: "Search Artifact Hub for Helm charts. Use as fallback when the catalog doesn't have what the user needs.",
      parameters: z.object({
        query: z.string().describe("Search query for Artifact Hub"),
      }),
      execute: async ({ query }) => {
        // HTTP request to Artifact Hub API
        // Returns: [{name, repo, description, version, url}]
      },
    }),
  };
}
```

### LLM Provider Factory

```typescript
// src/lib/agent/provider.ts
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ollama-ai-provider";
import { env } from "@/lib/config";

export function getProvider() {
  switch (env.LLM_PROVIDER) {
    case "openai":
      return openai(env.LLM_MODEL || "gpt-4o");
    case "anthropic":
      return anthropic(env.LLM_MODEL || "claude-sonnet-4-20250514");
    case "ollama":
      const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
      return ollama(env.LLM_MODEL || "llama3");
    default:
      return openai("gpt-4o");
  }
}
```

---

## Frontend Design

### Main Layout

The primary view is a split layout inside the `(dashboard)` route group:

- **Left sidebar** (collapsible): Navigation — Dashboard, Catalog, Deployments, Settings
- **Main area**: The canvas (React Flow) showing the user's deployed stack, or page content
- **Right panel** (sliding overlay): Chat with the AI agent. Toggleable with a floating button.

### Chat Panel — using AI SDK's `useChat`

```typescript
// src/components/chat/chat-provider.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { createContext, useContext } from "react";

const ChatContext = createContext<ReturnType<typeof useChat> | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useChat({
    api: "/api/chat",
    maxSteps: 10,       // allow multi-step tool use
    onFinish: (message) => {
      // Trigger deployment list refetch when agent makes changes
      // (uses TanStack Query invalidation)
    },
  });

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
```

```typescript
// src/components/chat/chat-messages.tsx
"use client";

import { useChatContext } from "./chat-provider";
import { ToolInvocation } from "./tool-invocation";

export function ChatMessages() {
  const { messages, isLoading } = useChatContext();

  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message) => (
        <div key={message.id}>
          {/* Render text content */}
          {message.content && (
            <div className={message.role === "user" ? "ml-auto bg-primary" : "bg-muted"}>
              {message.content}
            </div>
          )}
          {/* Render tool invocations as action cards */}
          {message.toolInvocations?.map((invocation) => (
            <ToolInvocation key={invocation.toolCallId} invocation={invocation} />
          ))}
        </div>
      ))}
      {isLoading && <div className="animate-pulse">Thinking...</div>}
    </div>
  );
}
```

### Canvas (React Flow)

```typescript
// src/components/canvas/stack-canvas.tsx
"use client";

import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from "@xyflow/react";
import { ServiceNode } from "./service-node";
import { DependencyEdge } from "./dependency-edge";
import { useCanvasData } from "@/hooks/use-canvas-data";

const nodeTypes = { service: ServiceNode };
const edgeTypes = { dependency: DependencyEdge };

export function StackCanvas() {
  const { data, isLoading } = useCanvasData();
  const [nodes, setNodes, onNodesChange] = useNodesState(data?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(data?.edges ?? []);

  // Update nodes/edges when data changes (deployment status updates)
  // Auto-layout with dagre

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
```

```typescript
// src/components/canvas/service-node.tsx
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StatusBadge } from "@/components/deployments/status-badge";

export function ServiceNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm min-w-[200px]">
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-3">
        <img src={data.iconUrl} alt="" className="h-8 w-8" />
        <div>
          <div className="font-medium">{data.displayName}</div>
          <div className="text-xs text-muted-foreground">{data.recipeName}</div>
        </div>
        <StatusBadge status={data.status} />
      </div>
      {data.url && (
        <a href={data.url} target="_blank" className="mt-2 block text-xs text-blue-500 truncate">
          {data.url}
        </a>
      )}
      {data.metadata && (
        <div className="mt-1 text-xs text-muted-foreground">{data.metadata}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

### Auth Pages

- Clean, centered card layout using shadcn/ui components
- Login: email + password form
- Signup: email + password + workspace name → creates User + Tenant + K8s namespace

### Catalog Browser

- Server component page that fetches recipes from DB
- Grid of `RecipeCard` components (icon, name, description, category badge, tier badge)
- Search bar with debounced input → calls `/api/catalog/search`
- Filter chips for categories
- Click a card → `/catalog/[slug]` detail page with full description, config options, "Deploy" button

---

## Background Worker (BullMQ)

The worker runs as a separate process but imports from the same `src/lib/` codebase.

```typescript
// worker/index.ts
import { Worker } from "bullmq";
import { connection } from "@/lib/queue/connection";
import { helmInstall, helmUninstall, helmUpgrade } from "@/lib/cluster/helm";
import { prisma } from "@/lib/db";

const worker = new Worker(
  "deployments",
  async (job) => {
    switch (job.name) {
      case "deploy": {
        const { deploymentId, recipeSlug, tenantNamespace, config } = job.data;
        try {
          // 1. Update status → DEPLOYING
          await prisma.deployment.update({
            where: { id: deploymentId },
            data: { status: "DEPLOYING" },
          });

          // 2. Run helm install
          const result = await helmInstall({
            releaseName: job.data.helmRelease,
            chart: job.data.chartUrl,
            namespace: tenantNamespace,
            values: job.data.renderedValues,
          });

          // 3. Wait for pods to be ready (poll K8s API)
          // 4. Get ingress URL if applicable
          // 5. Update status → RUNNING
          await prisma.deployment.update({
            where: { id: deploymentId },
            data: { status: "RUNNING", url: result.url },
          });
        } catch (error) {
          await prisma.deployment.update({
            where: { id: deploymentId },
            data: { status: "FAILED", errorMessage: String(error) },
          });
        }
        break;
      }

      case "undeploy": {
        // helm uninstall + cleanup + update status
        break;
      }

      case "embed": {
        // Generate embedding for a recipe and store it
        break;
      }

      case "health-check": {
        // Periodic: check all RUNNING deployments against K8s API
        // Update status if pods are unhealthy
        break;
      }
    }
  },
  { connection }
);
```

Run it with: `npx tsx worker/index.ts` (dev) or as a separate container in production.

---

## Configuration

All configuration via environment variables, validated at startup with Zod:

```typescript
// src/lib/config.ts
import { z } from "zod";

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
  AUTH_SECRET: z.string(),             // Random secret for session encryption
  AUTH_URL: z.string().optional(),     // Canonical URL (auto-detected in most cases)

  // LLM
  LLM_PROVIDER: z.enum(["openai", "anthropic", "ollama"]).default("openai"),
  LLM_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),

  // Kubernetes
  KUBECONFIG: z.string().optional(),   // Not needed when running in-cluster

  // Cluster
  INGRESS_CLASS: z.string().default(""),       // "" = auto-detect
  TLS_ENABLED: z.coerce.boolean().default(true),
  TLS_CLUSTER_ISSUER: z.string().default("letsencrypt-prod"),
  STORAGE_CLASS: z.string().default(""),       // "" = cluster default

  // Tenant defaults
  DEFAULT_TENANT_CPU_QUOTA: z.string().default("4"),
  DEFAULT_TENANT_MEMORY_QUOTA: z.string().default("8Gi"),
  DEFAULT_TENANT_STORAGE_QUOTA: z.string().default("50Gi"),
});

export const env = envSchema.parse(process.env);
```

```bash
# .env.example

# ─── Platform ───────────────────────────────────────────
MATHISON_MODE=self-hosted
MATHISON_BASE_DOMAIN=localhost:3000
# MATHISON_WILDCARD_DOMAIN=*.apps.example.com

# ─── Database ───────────────────────────────────────────
DATABASE_URL=postgresql://mathison:mathison@localhost:5432/mathison

# ─── Redis ──────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Auth ───────────────────────────────────────────────
AUTH_SECRET=generate-a-random-secret-here

# ─── LLM Provider ──────────────────────────────────────
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
# LLM_MODEL=gpt-4o
#
# For Anthropic:
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-your-key-here
#
# For Ollama (self-hosted, air-gapped):
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# LLM_MODEL=llama3

# ─── Kubernetes ─────────────────────────────────────────
# When running outside the cluster, point to your kubeconfig:
# KUBECONFIG=~/.kube/config
#
# When running inside the cluster, leave unset (uses service account).

# ─── Cluster ────────────────────────────────────────────
INGRESS_CLASS=
TLS_ENABLED=true
TLS_CLUSTER_ISSUER=letsencrypt-prod
STORAGE_CLASS=
```

---

## Development Setup

```yaml
# docker-compose.yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: mathison
      POSTGRES_USER: mathison
      POSTGRES_PASSWORD: mathison
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

Development workflow:
```bash
# 1. Start dependencies
docker compose up -d

# 2. Install packages
npm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Run database migrations
npx prisma migrate dev

# 5. Seed the catalog
npx prisma db seed

# 6. Start the app (Next.js dev server)
npm run dev

# 7. Start the worker (separate terminal)
npm run worker
```

package.json scripts:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx watch worker/index.ts",
    "worker:prod": "node dist/worker/index.js",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Seed Catalog

On first run (`prisma db seed`), populate the catalog with these initial recipes (status=PUBLISHED, tier=OFFICIAL):

1. **PostgreSQL** — `bitnami/postgresql` — category: database
   - Config: version (16/15/14), storage_size, max_connections
   - No ingress (database — internal only)
   - AI hints: "relational database", pairs well with everything

2. **Redis** — `bitnami/redis` — category: database
   - Config: version, storage_size, maxmemory
   - No ingress (internal only)
   - AI hints: "cache, message broker, session store"

3. **n8n** — `oci://8gears.container-registry.com/library/n8n` — category: automation
   - Depends on: PostgreSQL
   - Config: execution_mode (regular/queue)
   - Ingress: `n8n-{tenant}.{domain}`
   - AI hints: "workflow automation, Zapier alternative, connects services"

4. **Uptime Kuma** — `louislam/uptime-kuma` — category: monitoring
   - Config: storage_size
   - Ingress: `status-{tenant}.{domain}`
   - AI hints: "uptime monitoring, status page"

5. **MinIO** — `bitnami/minio` — category: storage
   - Config: storage_size, root_user, root_password
   - Ingress: `minio-{tenant}.{domain}` (console)
   - AI hints: "S3-compatible object storage, file storage"

Each seed recipe must include:
- Complete `valuesTemplate` (Handlebars/Mustache style, rendered by `src/lib/deployer/template.ts`)
- Proper `configSchema` with types, defaults, and descriptions
- Correct `dependencies` array
- `aiHints` with summary, whenToSuggest, and pairsWellWith
- `ingressConfig` where applicable
- Sensible `resourceDefaults` and `resourceLimits`

---

## Implementation Notes

- **TypeScript strict mode** everywhere. Configure `tsconfig.json` with `"strict": true`.
- Use **Server Components by default**. Only add `"use client"` when the component needs interactivity (canvas, chat, forms).
- **Prisma client** should be a singleton (`src/lib/db.ts`) to avoid connection pool exhaustion in dev.
- **Helm operations** run via `execa` (subprocess). Always use `--output json` for parseable results. Never use an SDK — the CLI is the stable interface.
- **pgvector** queries use Prisma's `$queryRaw` for embedding similarity search. The embedding column isn't directly usable through the Prisma client; use raw SQL for vector operations.
- **Values template** rendering: use a simple Handlebars/Mustache-style template engine (like `handlebars` or a lightweight custom one) to render recipe `valuesTemplate` with config + secrets + dependency connection info.
- **Error handling**: all API routes should return consistent JSON error responses with proper HTTP status codes. Use a shared error handler.
- **Polling for deployment status**: the frontend polls `/api/deployments` every 5 seconds while any deployment is in DEPLOYING/DELETING state. Use TanStack Query's `refetchInterval`.
- When the AI agent triggers a deployment, the chat response includes the deployment ID. The frontend sees the new deployment on the next poll and updates the canvas.

---

## MVP Scope

For the first working version, implement:

1. **Auth**: Signup + login with credentials provider (Auth.js). Create tenant + K8s namespace on signup.
2. **Catalog API**: CRUD for recipes, semantic search via pgvector, seed data on first run.
3. **AI Agent Chat**: `/api/chat` route with Vercel AI SDK, all tools defined above. Streaming responses.
4. **Deployer**: BullMQ worker that runs `helm install/uninstall`. Dependency resolution. Secret generation.
5. **Frontend**: Login/signup, dashboard with React Flow canvas, sliding chat panel (useChat), catalog browser.
6. **Docker Compose**: Local dev with PostgreSQL + Redis.

Do NOT implement yet (defer to later):
- OIDC / OAuth providers beyond credentials
- Stacks (bundled recipes)
- Recipe version history
- Billing / metering
- Custom domains
- Multi-cluster support
- Helm chart for production deployment
- Admin panel

---

## Key Principles

- **The AI agent is the primary interface.** The canvas and catalog are visual companions, but most actions happen through chat. Design the agent tools first, then build UI around them.
- **Never assume infrastructure.** The platform must work on any Kubernetes cluster. No Hetzner-specific, k3s-specific, or cloud-provider-specific code.
- **Recipes are data, not code.** The service catalog lives in the database. Recipes can be created, modified, and searched dynamically via the API. The AI agent can create new recipes.
- **Safety by default.** The agent confirms destructive actions. Deployments are namespaced and isolated. Resource quotas prevent runaway usage.
- **Self-hosted is first-class.** Every feature must work in self-hosted mode with zero cloud dependencies. Support Ollama for fully air-gapped deployments.
- **Type safety end-to-end.** Zod schemas validate all inputs. Prisma types flow through the entire stack. Tool parameters are typed. No `any` unless absolutely necessary.
- **Keep it simple.** Prefer fewer files with clear responsibility over deep abstraction layers. This is a monolith — embrace it. Don't over-engineer adapters for things that don't need swapping yet.
