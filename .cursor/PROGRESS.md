# Mathison — Build Progress

> Read this file at the start of every session to know where you are.

## Current State

- **Current step**: 09 — Chat Panel UI (not started)
- **App directory**: workspace root (not inside `mathison/`)
- **Dev server**: running on port 3000
- **Docker services**: running (postgres on 5433, redis on 6379)
- **K8s cluster**: kind `mathison-dev` running (K8s v1.35.0)
- **Database**: migrated + seeded — 5 published recipes in catalog, pgvector active (v0.8.1), 1 test deployment (postgresql PENDING)
- **Test user**: admin@mathison.dev / admin1234 (workspace: mathison-dev)
- **Last session**: Step 08 completed — Frontend shell with dashboard layout, collapsible sidebar, header with workspace badge and user menu, chat panel FAB + Sheet, placeholder pages, TanStack Query + next-themes providers, dark mode support.

## Step Completion

| Step | Name                              | Status       | Notes                                                                                           |
| ---- | --------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| 01   | Project Bootstrap & Configuration | **Complete** | Prisma 7 adapter pattern, port 5433 for postgres, yarn                                          |
| 02   | Database Schema & Prisma          | **Complete** | All models, enums, pgvector, migration applied, seed stub ready                                 |
| 03   | Authentication (Auth.js v5)       | **Complete** | Credentials provider, JWT sessions, split config for Edge middleware, signup creates tenant     |
| 04   | Service Catalog Backend           | **Complete** | 5 recipes seeded, CRUD API, semantic search (needs OPENAI_API_KEY), public catalog routes       |
| 05   | AI Agent Core                     | **Complete** | LLM provider factory, system prompt, 10 tools, streaming chat, multi-step tool calling verified |
| 06   | Kubernetes & Helm Integration     | **Complete** | K8s client, Helm CLI, ingress, tenant manager, quota. Stubs wired, signup provisions namespace. |
| 07   | Deployment Engine & BullMQ Worker | **Complete** | BullMQ queues, deployer engine, worker, secrets, templates, deps. execa→child_process migration |
| 08   | Frontend Shell & Layout           | **Complete** | Dashboard layout, sidebar, header, chat FAB, providers, dark mode, placeholder pages            |
| 09   | Chat Panel UI                     | Not started  |                                                                                                 |
| 10   | Canvas (React Flow)               | Not started  |                                                                                                 |
| 11   | Catalog & Deployments UI          | Not started  |                                                                                                 |

## Environment

- **K8s cluster**: kind (local) — `kind-mathison-dev` context, K8s v1.35.0
- **Docker**: installed, compose services running
- **Helm**: installed at `/opt/homebrew/bin/helm` (v4.1.1), bitnami repo configured
- **kubectl**: installed at `/usr/local/bin/kubectl`
- **kind**: installed at `/opt/homebrew/bin/kind`
- **Node.js**: v22.22.0, yarn 1.22.22
- **Package manager**: yarn (user preference)
- **LLM**: Anthropic — API key provided by user at Step 05
- **PostgreSQL**: port 5433 (5432 is used by another project)
- **Redis**: port 6379

## Known Issues

- Turbopack root warning about multiple lockfiles — mitigated with `turbopack.root: "."` in next.config.ts
- Port 5432 occupied by `aucm` project — using 5433 for mathison postgres
- Next.js 16 deprecation warning: "middleware" file convention is deprecated in favor of "proxy" — middleware still works but may need migration later

## Decisions Log

Record every architectural decision here. Future sessions depend on this.

| #   | Decision                                                                  | Made in  | Affects                    | Rationale                                                                                       |
| --- | ------------------------------------------------------------------------- | -------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| D1  | LLM provider: Anthropic (Claude)                                          | Planning | Step 05, config            | User preference                                                                                 |
| D2  | K8s testing: local `kind` cluster                                         | Planning | Steps 06-07, CI            | Disposable, automatable, no shared infra risk                                                   |
| D3  | Task order: backend first (01-07), then frontend (08-11)                  | Planning | All                        | Dependencies flow top-down                                                                      |
| D4  | Reference real Helm values from k8s repo for seed recipes                 | Planning | Step 04                    | Battle-tested configs, realistic defaults                                                       |
| D5  | Package manager: yarn (not npm)                                           | Step 01  | All                        | User preference                                                                                 |
| D6  | Prisma 7 with adapter pattern                                             | Step 01  | Steps 02-07                | Latest Prisma; uses `prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts` for URL |
| D7  | Prisma client output: `src/generated/prisma`                              | Step 01  | All imports                | Prisma 7 requires explicit output; import from `@/generated/prisma/client`                      |
| D8  | Postgres port: 5433                                                       | Step 01  | .env.local, docker-compose | Avoid conflict with existing postgres on 5432                                                   |
| D9  | App lives at workspace root, not inside `mathison/`                       | Step 01  | All                        | `mathison/` only has stale `.next` artifacts                                                    |
| D10 | pgvector 0.8.1 with 1536-dim embedding columns                            | Step 02  | Steps 04-05                | Matches text-embedding-3-small output                                                           |
| D11 | Migration name: `init` (timestamp: 20260213162759)                        | Step 02  | Future migrations          | First migration creates all base tables                                                         |
| D12 | Split auth config: `auth.config.ts` (Edge-safe) + `auth.ts` (full)        | Step 03  | Middleware, all auth       | Middleware runs in Edge runtime, can't import Prisma/pg                                         |
| D13 | No `@auth/prisma-adapter` — custom authorize + JWT only                   | Step 03  | Session handling           | User model has custom fields, no Account/Session tables needed for credentials-only auth        |
| D14 | bcryptjs (pure JS) for password hashing, 12 salt rounds                   | Step 03  | Security                   | No native addon build issues                                                                    |
| D15 | Catalog API routes are public (middleware allows `/api/catalog/*`)        | Step 04  | Steps 05, 08-11            | Read endpoints public, writes check auth in route handler                                       |
| D16 | Seed recipes without embeddings when OPENAI_API_KEY missing               | Step 04  | Step 05                    | Seed is safe to run without API key; re-run with key to add embeddings                          |
| D17 | Embedding model: `text-embedding-3-small` via `@ai-sdk/openai`            | Step 04  | Step 05                    | 1536d vectors, requires OPENAI_API_KEY in .env.local                                            |
| D18 | AI SDK v6 uses `inputSchema` not `parameters` for tools                   | Step 05  | All agent code             | Breaking change from AI SDK v5                                                                  |
| D19 | AI SDK v6 uses `toUIMessageStreamResponse()` not `toDataStreamResponse()` | Step 05  | Steps 08-09                | Frontend `useChat` needs UI message stream protocol                                             |
| D20 | AI SDK v6 uses `stopWhen: stepCountIs(10)` not `maxSteps: 10`             | Step 05  | Chat route                 | Multi-step tool calling control                                                                 |
| D21 | Ollama provider returns LanguageModelV1 — needs cast for AI SDK v6        | Step 05  | Provider factory           | `ollama-ai-provider` not yet updated for V3                                                     |
| D22 | K8s/Helm tool stubs return placeholder data — wired in Steps 06-07        | Step 05  | Steps 06-07                | DB operations fully functional, cluster ops stubbed                                             |
| D23 | Test user: admin@mathison.dev / admin1234, workspace: mathison-dev        | Step 05  | Testing                    | Created via signup endpoint                                                                     |
| D24 | K8s client uses `loadFromDefault()` first, fallback to `loadFromCluster()` | Step 06  | All cluster ops            | Works with kind, minikube, EKS, GKE — auto-detects context                                     |
| D25 | `@kubernetes/client-node` v1.4.0 uses `_from` not `from` in NetworkPolicy | Step 06  | Network policies           | `from` is a JS reserved word, K8s client maps it to `_from`                                     |
| D26 | Helm CLI wrapper uses `yaml` package for serializing values to temp files  | Step 06  | Step 07                    | Values written to tmpdir, cleaned up in `finally` block                                         |
| D27 | Signup now provisions K8s namespace (non-blocking, fire-and-forget)        | Step 06  | Steps 07-11                | Namespace + quota + network policy created on signup                                            |
| D28 | `generateSecret()` upgraded to `crypto.randomBytes()` for strong secrets  | Step 06  | Deployment secrets          | Replaces Math.random-based generator from Step 05                                               |
| D29 | `enqueueDeployJob()` stub remains — wired in Step 07 with BullMQ          | Step 06  | Step 07                    | Only K8s read ops wired in Step 06, deploy queue deferred                                       |
| D30 | Replaced `execa` with `child_process.execFile` in Helm wrapper            | Step 07  | All cluster ops            | execa v9 ESM-only breaks tsx worker; child_process is native and works everywhere               |
| D31 | Removed top-level `ioredis` dep — BullMQ connection uses plain options    | Step 07  | Queue/worker               | Avoids ioredis version conflict between top-level and bullmq's bundled copy                    |
| D32 | BullMQ queue name: `"deployments"` — job names: deploy, undeploy, upgrade | Step 07  | Steps 05, 09               | Agent tools enqueue via `deploymentQueue.add()`                                                 |
| D33 | Worker runs via `tsx watch worker/index.ts` — loads .env.local via dotenv | Step 07  | Development                | Separate process, not inside Next.js — needs explicit dotenv loading                            |
| D34 | Deployer engine: `initiateDeployment()`, `initiateUpgrade()`, `initiateRemoval()` | Step 07 | Step 05 tools        | Agent tools call engine functions instead of inline logic                                        |
| D35 | Values templates rendered with Handlebars (noEscape for YAML safety)      | Step 07  | Step 04 templates          | Config defaults merged with user config before rendering                                         |
| D36 | Font: Inter (replaced Geist) — CSS var `--font-sans`                      | Step 08  | All UI                     | Cleaner readability for dashboard-style app                                                     |
| D37 | Providers: ThemeProvider > QueryClientProvider > TooltipProvider           | Step 08  | Steps 09-11                | All client-side providers in `src/components/providers.tsx`                                      |
| D38 | Dashboard layout: `(dashboard)` route group, no root `page.tsx`           | Step 08  | Steps 09-11                | Middleware handles auth redirect, route group maps to `/`                                       |
| D39 | Sidebar collapse state in `DashboardShell`, `hidden lg:flex` for desktop  | Step 08  | Steps 09-11                | Mobile uses Sheet from left side                                                                 |
| D40 | Chat panel: standalone FAB + Sheet component, state self-contained        | Step 08  | Step 09                    | Step 09 replaces placeholder content with real chat UI                                          |
| D41 | Theme hydration: `useSyncExternalStore` for mounted detection             | Step 08  | UI patterns                | Avoids react-hooks/set-state-in-effect lint error with `useState`+`useEffect`                   |
| D42 | Cloud-first rebrand: hide K8s terminology from all user-facing text       | Post-08  | All UI, system prompt, tools | Users deploy "services" not "Helm charts". Internal code unchanged.                             |

## Cross-Step Dependencies

Decisions in early steps that later steps MUST respect. Check this before starting any step.

| Source Step | Dependency                                                              | Consumer Steps | Detail                                |
| ----------- | ----------------------------------------------------------------------- | -------------- | ------------------------------------- |
| 01          | Path alias `@/*` → `src/*`                                              | All            | Every import uses this                |
| 01          | shadcn/ui component set                                                 | 08-11          | Which components are available        |
| 01          | Prisma import path: `@/generated/prisma/client`                         | 02-07, 11      | NOT `@prisma/client`                  |
| 01          | Prisma config in `prisma.config.ts` (not schema url)                    | 02-07          | Prisma 7 pattern                      |
| 01          | `zod` v4 — use `zod/v4` import path                                     | All            | Zod 4 has different import pattern    |
| 02          | Prisma field names (snake_case in DB, camelCase in TS)                  | 03-07, 11      | Query field names                     |
| 02          | JSON field types (`configSchema`, `aiHints`, etc.)                      | 04, 05, 07     | Shape of JSON data                    |
| 03          | Session shape: `session.user.{id, tenantId, role}`                      | 04-07, 11      | Every auth check uses this            |
| 03          | Auth guard pattern: `const session = await auth()`                      | 04-07, 11      | Standard in all protected routes      |
| 04          | Seed recipe slugs: `postgresql`, `redis`, `n8n`, `uptime-kuma`, `minio` | 05, 10, 11     | Tool results reference these          |
| 04          | Embedding model: `text-embedding-3-small` (1536d)                       | Schema col     | Must match vector column size         |
| 05          | Tool names: `searchCatalog`, `deployService`, etc.                      | 09             | Chat UI renders tool-specific cards   |
| 05          | Tool return shapes                                                      | 09             | UI must match the data structure      |
| 06          | Helm wrapper function signatures                                        | 07             | Worker calls these directly           |
| 06          | K8s wrapper function signatures                                         | 05, 07         | Agent tools + worker call these       |
| 07          | BullMQ queue name: `"deployments"`                                      | 05             | Agent tools enqueue to this           |
| 07          | Job data shapes (`DeployJobData`, etc.)                                 | 05             | Must match what tools send            |
| 08          | ChatProvider location in component tree                                 | 09             | Chat components use context from this |
| 08          | Sheet component for chat panel                                          | 09             | Chat content goes inside this shell   |
| 07          | BullMQ queue name: `"deployments"`, job names from `JOB_NAMES`          | 05, 09         | Agent tools + UI reference these      |
| 07          | Engine functions: `initiateDeployment`, `initiateUpgrade`, `initiateRemoval` | 05          | Tools import from `@/lib/deployer/engine` |
| 07          | Worker process: `yarn worker` / `tsx watch worker/index.ts`             | Development    | Must be running for deploys to execute |
| 10          | `useCanvasData` hook query key: `["stack"]`                             | 09             | Chat invalidates this after deploys   |
