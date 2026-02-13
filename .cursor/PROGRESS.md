# Mathison — Build Progress

> Read this file at the start of every session to know where you are.

## Current State

- **Current step**: 03 — Authentication (Auth.js v5) (not started)
- **App directory**: workspace root (not inside `mathison/`)
- **Dev server**: not running (start with `yarn dev`)
- **Docker services**: running (postgres on 5433, redis on 6379)
- **Database**: migrated — all models created, pgvector active (v0.8.1)
- **Last session**: Step 02 completed — full Prisma schema, migration, pgvector, seed stub

## Step Completion

| Step | Name | Status | Notes |
|------|------|--------|-------|
| 01 | Project Bootstrap & Configuration | **Complete** | Prisma 7 adapter pattern, port 5433 for postgres, yarn |
| 02 | Database Schema & Prisma | **Complete** | All models, enums, pgvector, migration applied, seed stub ready |
| 03 | Authentication (Auth.js v5) | Not started | |
| 04 | Service Catalog Backend | Not started | |
| 05 | AI Agent Core | Not started | |
| 06 | Kubernetes & Helm Integration | Not started | |
| 07 | Deployment Engine & BullMQ Worker | Not started | |
| 08 | Frontend Shell & Layout | Not started | |
| 09 | Chat Panel UI | Not started | |
| 10 | Canvas (React Flow) | Not started | |
| 11 | Catalog & Deployments UI | Not started | |

## Environment

- **K8s cluster**: kind (local) — `kind create cluster --name mathison-dev` (created in Step 06)
- **Docker**: installed, compose services running
- **Helm**: installed at `/opt/homebrew/bin/helm`
- **kubectl**: installed at `/usr/local/bin/kubectl`
- **kind**: not yet installed (install in Step 06 via `brew install kind`)
- **Node.js**: v22.22.0, yarn 1.22.22
- **Package manager**: yarn (user preference)
- **LLM**: Anthropic — API key provided by user at Step 05
- **PostgreSQL**: port 5433 (5432 is used by another project)
- **Redis**: port 6379

## Known Issues

- Turbopack root warning about multiple lockfiles — mitigated with `turbopack.root: "."` in next.config.ts
- Port 5432 occupied by `aucm` project — using 5433 for mathison postgres

## Decisions Log

Record every architectural decision here. Future sessions depend on this.

| # | Decision | Made in | Affects | Rationale |
|---|----------|---------|---------|-----------|
| D1 | LLM provider: Anthropic (Claude) | Planning | Step 05, config | User preference |
| D2 | K8s testing: local `kind` cluster | Planning | Steps 06-07, CI | Disposable, automatable, no shared infra risk |
| D3 | Task order: backend first (01-07), then frontend (08-11) | Planning | All | Dependencies flow top-down |
| D4 | Reference real Helm values from k8s repo for seed recipes | Planning | Step 04 | Battle-tested configs, realistic defaults |
| D5 | Package manager: yarn (not npm) | Step 01 | All | User preference |
| D6 | Prisma 7 with adapter pattern | Step 01 | Steps 02-07 | Latest Prisma; uses `prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts` for URL |
| D7 | Prisma client output: `src/generated/prisma` | Step 01 | All imports | Prisma 7 requires explicit output; import from `@/generated/prisma/client` |
| D8 | Postgres port: 5433 | Step 01 | .env.local, docker-compose | Avoid conflict with existing postgres on 5432 |
| D9 | App lives at workspace root, not inside `mathison/` | Step 01 | All | `mathison/` only has stale `.next` artifacts |
| D10 | pgvector 0.8.1 with 1536-dim embedding columns | Step 02 | Steps 04-05 | Matches text-embedding-3-small output |
| D11 | Migration name: `init` (timestamp: 20260213162759) | Step 02 | Future migrations | First migration creates all base tables |

## Cross-Step Dependencies

Decisions in early steps that later steps MUST respect. Check this before starting any step.

| Source Step | Dependency | Consumer Steps | Detail |
|------------|-----------|----------------|--------|
| 01 | Path alias `@/*` → `src/*` | All | Every import uses this |
| 01 | shadcn/ui component set | 08-11 | Which components are available |
| 01 | Prisma import path: `@/generated/prisma/client` | 02-07, 11 | NOT `@prisma/client` |
| 01 | Prisma config in `prisma.config.ts` (not schema url) | 02-07 | Prisma 7 pattern |
| 01 | `zod` v4 — use `zod/v4` import path | All | Zod 4 has different import pattern |
| 02 | Prisma field names (snake_case in DB, camelCase in TS) | 03-07, 11 | Query field names |
| 02 | JSON field types (`configSchema`, `aiHints`, etc.) | 04, 05, 07 | Shape of JSON data |
| 03 | Session shape: `session.user.{id, tenantId, role}` | 04-07, 11 | Every auth check uses this |
| 03 | Auth guard pattern: `const session = await auth()` | 04-07, 11 | Standard in all protected routes |
| 04 | Seed recipe slugs: `postgresql`, `redis`, `n8n`, `uptime-kuma`, `minio` | 05, 10, 11 | Tool results reference these |
| 04 | Embedding model: `text-embedding-3-small` (1536d) | Schema col | Must match vector column size |
| 05 | Tool names: `searchCatalog`, `deployService`, etc. | 09 | Chat UI renders tool-specific cards |
| 05 | Tool return shapes | 09 | UI must match the data structure |
| 06 | Helm wrapper function signatures | 07 | Worker calls these directly |
| 06 | K8s wrapper function signatures | 05, 07 | Agent tools + worker call these |
| 07 | BullMQ queue name: `"deployments"` | 05 | Agent tools enqueue to this |
| 07 | Job data shapes (`DeployJobData`, etc.) | 05 | Must match what tools send |
| 08 | ChatProvider location in component tree | 09 | Chat components use context from this |
| 08 | Sheet component for chat panel | 09 | Chat content goes inside this shell |
| 10 | `useCanvasData` hook query key: `["stack"]` | 09 | Chat invalidates this after deploys |
