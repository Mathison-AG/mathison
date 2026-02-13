# Mathison — Build Progress

> Read this file at the start of every session to know where you are.

## Current State

- **Current step**: 01 — Project Bootstrap (not started)
- **App directory**: `mathison/` (not yet created)
- **Dev server**: not running
- **Docker services**: not running
- **Database**: not migrated
- **Last session**: initial planning — task files created

## Step Completion

| Step | Name | Status | Notes |
|------|------|--------|-------|
| 01 | Project Bootstrap & Configuration | Not started | |
| 02 | Database Schema & Prisma | Not started | |
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
- **Docker**: installed
- **Helm**: installed at `/opt/homebrew/bin/helm`
- **kubectl**: installed at `/usr/local/bin/kubectl`
- **kind**: not yet installed (install in Step 06 via `brew install kind`)
- **Node.js**: v22.22.0, npm 11.8.0 ✅
- **LLM**: Anthropic — API key provided by user at Step 05

## Known Issues

(none yet)

## Decisions Log

Record every architectural decision here. Future sessions depend on this.

| # | Decision | Made in | Affects | Rationale |
|---|----------|---------|---------|-----------|
| D1 | LLM provider: Anthropic (Claude) | Planning | Step 05, config | User preference |
| D2 | K8s testing: local `kind` cluster | Planning | Steps 06-07, CI | Disposable, automatable, no shared infra risk |
| D3 | Task order: backend first (01-07), then frontend (08-11) | Planning | All | Dependencies flow top-down |
| D4 | Reference real Helm values from k8s repo for seed recipes | Planning | Step 04 | Battle-tested configs, realistic defaults |

## Cross-Step Dependencies

Decisions in early steps that later steps MUST respect. Check this before starting any step.

| Source Step | Dependency | Consumer Steps | Detail |
|------------|-----------|----------------|--------|
| 01 | Path alias `@/*` → `src/*` | All | Every import uses this |
| 01 | shadcn/ui component set | 08-11 | Which components are available |
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
