# Step 05 — AI Agent Core

## Goal

Implement the AI agent: LLM provider factory (OpenAI/Anthropic/Ollama), system prompt, all tool definitions with Zod schemas and execute functions, and the `/api/chat` streaming endpoint. After this step, the agent can have conversations and call tools.

## Prerequisites

- Steps 01–04 completed (project, database, auth, catalog with seed data)
- Anthropic API key configured in `.env.local` (`LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`)

## What to Build

### 1. LLM Provider Factory (`src/lib/agent/provider.ts`)

Multi-provider support based on `LLM_PROVIDER` env var:

```typescript
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

### 2. System Prompt (`src/lib/agent/system-prompt.ts`)

Define the agent personality and guidelines. The agent should:
- Introduce itself as Mathison
- Explain it can search catalog, deploy services, check status, view logs, update/remove services
- Always confirm destructive actions before executing
- Explain what it's deploying and what the user gets
- Provide access URLs and connection details after deployment
- Auto-deploy dependencies (e.g., PostgreSQL for n8n)
- Search Artifact Hub when catalog doesn't have what's needed
- Be concise but informative — no raw YAML unless asked

See the Platform Prompt "System Prompt" section for the exact text.

### 3. Agent Tools (`src/lib/agent/tools.ts`)

Implement ALL tool definitions with Zod parameter schemas and execute functions.

**`searchCatalog`** — Search the service catalog (pgvector semantic search)
- Parameters: `query` (string), `category` (optional string)
- Execute: calls `searchRecipes()` from catalog service
- Returns: array of `{slug, displayName, description, category, tier}`

**`getRecipe`** — Get full recipe details
- Parameters: `slug` (string)
- Execute: Prisma query for full recipe
- Returns: recipe with configSchema, dependencies, resourceDefaults

**`deployService`** — Deploy a service from catalog
- Parameters: `recipeSlug` (string), `name` (optional string), `config` (optional record)
- Execute:
  1. Look up recipe by slug
  2. Resolve dependencies (check if already deployed, deploy if needed)
  3. Generate secrets
  4. Create Deployment record (status=PENDING)
  5. Queue BullMQ job for helm install
- Returns: `{deploymentId, name, status, message}`

**`getStackStatus`** — Get status of all deployed services
- Parameters: none (uses tenantId from context)
- Execute: query deployments for tenant, return array
- Returns: `[{name, recipe, status, url, resources}]`

**`getServiceDetail`** — Get detailed deployment info
- Parameters: `deploymentId` (string)
- Execute: deployment record + live K8s data (pods, resource usage)
- Returns: `{name, status, url, pods, config, connectionInfo}`

**`getServiceLogs`** — Get pod logs
- Parameters: `deploymentId` (string), `lines` (optional number, default 50)
- Execute: K8s API pod logs
- Returns: string of log lines

**`updateService`** — Update running service config (Helm upgrade)
- Parameters: `deploymentId` (string), `config` (record)
- Execute: queue BullMQ job for helm upgrade
- Returns: `{deploymentId, status, message}`

**`removeService`** — Remove a deployed service
- Parameters: `deploymentId` (string), `confirmed` (boolean)
- Execute: if confirmed, queue helm uninstall job
- Returns: `{deploymentId, status, message}`

**`createRecipe`** — Create new catalog recipe
- Parameters: slug, displayName, description, category, chartUrl, chartVersion?, valuesTemplate?, configSchema?, aiHints?
- Execute: create recipe with status=DRAFT, tier=COMMUNITY
- Returns: `{slug, displayName, status}`

**`searchHelmCharts`** — Search Artifact Hub (fallback)
- Parameters: `query` (string)
- Execute: HTTP GET to `https://artifacthub.io/api/v1/packages/search?ts_query_web={query}&kind=0`
- Returns: `[{name, repo, description, version, url}]`

**Important:** The tools that need K8s/Helm (deployService, getServiceDetail, getServiceLogs, updateService, removeService) should have their execute functions implemented with the correct logic structure, but the actual K8s/Helm calls can use placeholder functions that will be wired in Steps 06–07. The database operations should be fully functional.

### 4. Chat API Route (`src/app/api/chat/route.ts`)

```typescript
import { streamText } from "ai";
import { getProvider } from "@/lib/agent/provider";
import { getTools } from "@/lib/agent/tools";
import { systemPrompt } from "@/lib/agent/system-prompt";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { messages } = await req.json();
  const provider = getProvider();
  const tools = getTools(session.user.tenantId);

  const result = streamText({
    model: provider,
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 10,
  });

  return result.toDataStreamResponse();
}
```

### 5. Conversation Persistence (Optional Enhancement)

If time permits, save conversations to the database:
- Create conversation on first message
- Append messages as they stream
- Load conversation history on reconnect

This is nice-to-have for the MVP — the basic flow works without it (messages live in client state).

## Deliverables

- [ ] `POST /api/chat` with `{ messages: [{ role: "user", content: "What can I deploy?" }] }` returns a streaming response
- [ ] Agent uses `searchCatalog` tool when asked about available services
- [ ] Agent uses `getRecipe` when asked for details about a specific service
- [ ] Agent uses `deployService` when asked to deploy something (creates DB record, queues job)
- [ ] Agent uses `getStackStatus` when asked "what's running?"
- [ ] Agent confirms before calling `removeService`
- [ ] Agent falls back to `searchHelmCharts` when catalog doesn't have what's needed
- [ ] Multi-step tool calling works (agent can search → get details → deploy in one conversation)
- [ ] Provider switching works (set `LLM_PROVIDER=anthropic` → uses Claude)

## Key Files

```
src/lib/agent/
├── provider.ts         # LLM provider factory
├── system-prompt.ts    # System prompt
└── tools.ts            # All tool definitions
src/app/api/
└── chat/route.ts       # Streaming chat endpoint
```

## Notes

- Use Vercel AI SDK's `tool()` helper with Zod schemas — this provides automatic type inference and validation.
- `maxSteps: 10` allows the agent to make multiple tool calls in a single turn (e.g., search → deploy → check status).
- The `getTools` function receives `tenantId` and closure-captures it so all tool executions are scoped to the correct tenant.
- For tools that need K8s/Helm: implement the DB + queue logic now, stub the actual cluster operations. They get wired in Steps 06–07.
- The `searchHelmCharts` tool calls the Artifact Hub public API — no auth needed.
