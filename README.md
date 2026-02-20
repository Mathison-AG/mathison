<h1 align="center">Mathison</h1>

<p align="center">
  <strong>AI-first Kubernetes platform — deploy and manage apps through an AI chat agent.</strong>
</p>

<p align="center">
  <a href="https://github.com/Mathison-AG/mathison/releases"><img src="https://img.shields.io/github/v/release/Mathison-AG/mathison" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Mathison-AG/mathison" alt="License: AGPL-3.0"></a>
</p>

---

Mathison lets you say **"deploy PostgreSQL"** and it handles everything — namespaces, secrets, dependencies, networking, health checks. No YAML, no Helm commands, no K8s knowledge required.

Under the hood, a typed recipe system generates Kubernetes manifests and applies them via Server-Side Apply. A BullMQ worker handles the deployment lifecycle, including dependency resolution, health monitoring, and data export/import.

## Features

- **AI chat agent** — natural language to running apps. Powered by Claude, GPT, or Ollama.
- **App store** — one-click install for PostgreSQL, Redis, MinIO, n8n, Uptime Kuma, and more.
- **Workspace isolation** — each workspace maps to a K8s namespace with independent apps and config.
- **Dependency management** — apps that need a database get one auto-deployed.
- **Backup & restore** — export/import workspace snapshots including app configurations.
- **Self-hosted** — runs on any Kubernetes cluster. Your data stays on your infrastructure.

## Architecture

Three container images:

| Image | Purpose |
|---|---|
| `mathison-web` | Next.js standalone server — UI, API, AI agent |
| `mathison-worker` | BullMQ job processor — deploys/manages apps on K8s |
| `mathison-migrate` | Runs Prisma migrations as a K8s Job before upgrades |

## Quick Start (Helm)

### Prerequisites

- Kubernetes cluster (1.27+)
- Helm 3.12+
- An LLM API key (Anthropic, OpenAI, or self-hosted Ollama)
- `kubectl` access to the target cluster

### Install

```bash
# Add the OCI registry (GHCR)
helm install mathison oci://ghcr.io/mathison-ag/charts/mathison \
  --namespace mathison \
  --create-namespace \
  --set config.authUrl=https://mathison.example.com \
  --set secrets.authSecret=$(openssl rand -base64 32) \
  --set secrets.anthropicApiKey=sk-ant-your-key \
  --set secrets.postgresPassword=$(openssl rand -base64 24) \
  --set ingress.host=mathison.example.com
```

### Verify

```bash
# Wait for the migration job
kubectl -n mathison wait --for=condition=complete job -l app.kubernetes.io/component=migrate --timeout=120s

# Check all pods
kubectl -n mathison get pods

# Open the web UI and create your first account
```

### Minimal values file

Create `values.yaml` for a reproducible install:

```yaml
config:
  llmProvider: anthropic
  authUrl: https://mathison.example.com

secrets:
  authSecret: "generate-with-openssl-rand-base64-32"
  anthropicApiKey: "sk-ant-your-key"
  postgresPassword: "generate-with-openssl-rand-base64-24"

ingress:
  enabled: true
  className: nginx
  host: mathison.example.com
  tls:
    enabled: true
    secretName: mathison-tls
```

```bash
helm install mathison oci://ghcr.io/mathison-ag/charts/mathison \
  --namespace mathison \
  --create-namespace \
  -f values.yaml
```

### Upgrade

```bash
helm upgrade mathison oci://ghcr.io/mathison-ag/charts/mathison \
  --namespace mathison \
  -f values.yaml
```

The migrate job runs automatically before the web and worker pods start.

### Uninstall

```bash
helm uninstall mathison --namespace mathison
kubectl delete namespace mathison
```

> **Note:** Uninstalling removes the Mathison control plane. Apps deployed by Mathison into tenant namespaces are not automatically deleted.

## Configuration Reference

### Application

| Parameter | Description | Default |
|---|---|---|
| `config.mode` | Platform mode | `self-hosted` |
| `config.llmProvider` | LLM provider: `anthropic`, `openai`, or `ollama` | `anthropic` |
| `config.authUrl` | External URL for the web UI (must match ingress hostname) | `""` |
| `config.baseDomain` | Base domain for tenant app ingress | `""` |

### Secrets

| Parameter | Description | Default |
|---|---|---|
| `secrets.authSecret` | Session encryption key (`openssl rand -base64 32`) | `""` |
| `secrets.anthropicApiKey` | Anthropic API key | `""` |
| `secrets.postgresPassword` | PostgreSQL password (`openssl rand -base64 24`) | `""` |
| `secrets.existingSecret` | Use a pre-existing Secret instead of chart-managed one | `""` |

When using `existingSecret`, the Secret must contain: `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`, `DATABASE_URL`.

### Tenant App Ingress

When enabled, apps deployed by users get real Kubernetes Ingress resources instead of port-forwarding.

| Parameter | Description | Default |
|---|---|---|
| `config.tenantIngress.enabled` | Enable K8s Ingress for tenant apps | `false` |
| `config.tenantIngress.ingressClass` | Ingress class for tenant apps | `""` |
| `config.tenantIngress.tlsEnabled` | Enable TLS via cert-manager | `false` |
| `config.tenantIngress.tlsClusterIssuer` | cert-manager ClusterIssuer name | `""` |

Hostname pattern: `{app}-{workspace}.apps.{baseDomain}`. Set up a wildcard DNS record for `*.apps.{baseDomain}`.

### PostgreSQL

| Parameter | Description | Default |
|---|---|---|
| `postgresql.enabled` | Deploy bundled PostgreSQL (pgvector) | `true` |
| `postgresql.persistence.size` | PVC size | `10Gi` |
| `postgresql.persistence.storageClass` | StorageClass (empty = cluster default) | `""` |
| `postgresql.external.host` | External DB host (when `enabled=false`) | `""` |
| `postgresql.external.port` | External DB port | `5432` |

### Redis

| Parameter | Description | Default |
|---|---|---|
| `redis.enabled` | Deploy bundled Redis | `true` |
| `redis.persistence.size` | PVC size | `1Gi` |
| `redis.external.url` | External Redis URL (when `enabled=false`) | `""` |

### Ingress

| Parameter | Description | Default |
|---|---|---|
| `ingress.enabled` | Enable Ingress for the web UI | `true` |
| `ingress.className` | Ingress class (nginx, traefik, etc.) | `""` |
| `ingress.host` | Hostname for the web UI | `mathison.example.com` |
| `ingress.tls.enabled` | Enable TLS | `false` |
| `ingress.tls.secretName` | TLS secret name | `mathison-tls` |

### Resources

Each component has configurable resource requests and limits:

```yaml
web:
  replicas: 2
  resources:
    requests: { cpu: 200m, memory: 256Mi }
    limits:   { cpu: "1", memory: 512Mi }

worker:
  replicas: 1
  resources:
    requests: { cpu: 100m, memory: 256Mi }
    limits:   { cpu: 500m, memory: 512Mi }

postgresql:
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits:   { cpu: "1", memory: 1Gi }
```

### Using an External Database

To use your own PostgreSQL (must have the pgvector extension):

```yaml
postgresql:
  enabled: false
  external:
    host: your-postgres.example.com
    port: 5432
    database: mathison
    user: mathison

secrets:
  postgresPassword: "your-password"
```

### Using an External Redis

```yaml
redis:
  enabled: false
  external:
    url: "redis://user:pass@your-redis.example.com:6379"
```

## Development

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [kind](https://kind.sigs.k8s.io/) (Kubernetes in Docker) for local K8s testing
- An Anthropic API key (or OpenAI / Ollama)

No local Node.js installation is needed — everything runs inside Docker containers.

### Setup

1. **Clone the repo:**

```bash
git clone git@github.com:Mathison-AG/mathison.git
cd mathison
```

2. **Create a local kind cluster:**

```bash
kind create cluster --name mathison-dev
```

3. **Configure environment:**

```bash
cp .env.example .env.local
```

Edit `.env.local` and set at minimum:

```
AUTH_SECRET=<generate with: openssl rand -base64 32>
ANTHROPIC_API_KEY=sk-ant-your-key
```

4. **Start all services:**

```bash
docker compose -f docker-compose.local.yml up
```

This starts PostgreSQL, Redis, runs migrations/seed, then launches the web server and worker. The setup service runs `yarn install`, `prisma generate`, `prisma migrate deploy`, and `prisma db seed` — all idempotent.

5. **Open the app:**

Navigate to [http://localhost:3000](http://localhost:3000) and sign up. The default seed credentials are `admin@mathison.dev` / `admin1234`.

### How It Works

All services are defined in `docker-compose.local.yml`:

| Service | Purpose | Ports |
|---|---|---|
| `postgres` | PostgreSQL 16 with pgvector | `5433:5432` |
| `redis` | Redis 7 | `6379:6379` |
| `setup` | One-time: installs deps, runs migrations, seeds DB | — |
| `web` | Next.js dev server with hot reload | `3000:3000` |
| `worker` | BullMQ worker with watch mode | `8080:8080`, `10000-10049` |

Source code is bind-mounted (`.:/app`) for hot reloading. `node_modules` lives in a Docker volume (Linux-built native deps, avoids macOS/Linux conflicts). `~/.kube` is mounted read-only so the worker can reach the kind cluster.

### Common Tasks

```bash
# Run commands inside the web container
docker compose -f docker-compose.local.yml exec web <command>

# Type checking
docker compose -f docker-compose.local.yml exec web yarn typecheck

# Linting
docker compose -f docker-compose.local.yml exec web yarn lint

# Test the AI agent via CLI (faster than browser)
docker compose -f docker-compose.local.yml exec web yarn chat "deploy postgres"

# Open Prisma Studio (database GUI)
docker compose -f docker-compose.local.yml exec web npx prisma studio

# Check kind cluster
kubectl --context kind-mathison-dev get pods -A
```

### After Adding Dependencies

Restart the containers — the setup service runs `yarn install` on every start:

```bash
docker compose -f docker-compose.local.yml restart
```

For native module changes, rebuild the image:

```bash
docker compose -f docker-compose.local.yml up --build
```

### Full Reset

Wipe all data (DB, volumes, node_modules) and rebuild:

```bash
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up --build
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, shadcn/ui, Lucide icons |
| Database | PostgreSQL 16 (pgvector), Prisma 7 |
| Queue | Redis 7, BullMQ |
| Auth | Auth.js v5 (next-auth beta) |
| AI | Vercel AI SDK v6, Anthropic / OpenAI / Ollama |
| Kubernetes | @kubernetes/client-node, Server-Side Apply |
| Visualization | React Flow v12, dagre |

## CI/CD

Releases are automated with [release-please](https://github.com/googleapis/release-please). On merge to `main`:

1. **release-please** creates/updates a release PR with changelog and version bumps.
2. When the release PR is merged, the pipeline:
   - Builds `mathison-web`, `mathison-worker`, and `mathison-migrate` images (multi-arch: amd64 + arm64)
   - Pushes them to `ghcr.io/mathison-ag/`
   - Packages and pushes the Helm chart to `oci://ghcr.io/mathison-ag/charts/mathison`
3. Images are tagged with the version, `major.minor`, `sha`, and `latest`.

Manual releases are also supported via `workflow_dispatch` with a version input.

## Contributing

1. Fork the repo and create a feature branch from `main`.
2. Follow the [Development](#development) section to set up your local environment.
3. Make your changes — the codebase uses TypeScript strict mode, Zod v4 for validation, and Server Components by default.
4. Run `yarn typecheck` and `yarn lint` inside the container before submitting.
5. Open a pull request with a clear description of what changed and why.

### Coding Conventions

- **TypeScript strict** — no `any` unless unavoidable.
- **Zod v4** for all validation — import from `"zod/v4"`.
- **Server Components** by default. Only add `"use client"` for interactivity.
- **Prisma imports** from `@/generated/prisma/client` (not `@prisma/client`).
- **API routes** follow the try/catch + auth guard + Zod validation pattern.
- **Commit messages**: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:` prefixes.

### Adding a New Recipe

Recipes define how apps are deployed. Each recipe lives in `src/recipes/<slug>/` and exports a `RecipeDefinition`. Recipes use archetypes (`database()`, `cache()`, `webApp()`, `objectStore()`) for common patterns or a custom `build()` for full control.

See existing recipes for examples — `src/recipes/postgresql/`, `src/recipes/n8n/`, etc.

## License

[AGPL-3.0](LICENSE)
