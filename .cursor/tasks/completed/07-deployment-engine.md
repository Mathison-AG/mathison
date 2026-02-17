# Step 07 — Deployment Engine & BullMQ Worker

## Goal

Build the deployment orchestration layer: BullMQ queue setup, the worker process that executes Helm operations, dependency resolution, secret generation, and values template rendering. After this step, the full deploy → helm install → monitor → report flow works end-to-end.

## Prerequisites

- Steps 01–06 completed (project, database, auth, catalog, AI agent, K8s/Helm wrappers)
- Redis running (`docker compose up -d`)
- Kubernetes cluster accessible

## What to Build

### 1. Redis/BullMQ Connection (`src/lib/queue/connection.ts`)

```typescript
import IORedis from "ioredis";
import { env } from "@/lib/config";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
});
```

### 2. Queue Definitions (`src/lib/queue/queues.ts`)

```typescript
import { Queue } from "bullmq";
import { connection } from "./connection";

export const deploymentQueue = new Queue("deployments", { connection });
export const embeddingQueue = new Queue("embeddings", { connection });
export const monitorQueue = new Queue("monitoring", { connection });
```

### 3. Job Type Definitions (`src/lib/queue/jobs.ts`)

Shared types between the API (producer) and worker (consumer):

```typescript
export interface DeployJobData {
  deploymentId: string;
  recipeSlug: string;
  helmRelease: string;
  chartUrl: string;
  chartVersion?: string;
  tenantNamespace: string;
  renderedValues: string;  // YAML string
}

export interface UndeployJobData {
  deploymentId: string;
  helmRelease: string;
  tenantNamespace: string;
}

export interface UpgradeJobData {
  deploymentId: string;
  helmRelease: string;
  chartUrl: string;
  tenantNamespace: string;
  renderedValues: string;
}

export interface EmbedJobData {
  recipeId: string;
}

export interface HealthCheckJobData {
  deploymentId: string;
}
```

### 4. Deployment Orchestration (`src/lib/deployer/engine.ts`)

The core deployment logic called by agent tools:

```typescript
export async function initiateDeployment(params: {
  tenantId: string;
  tenantNamespace: string;
  recipeSlug: string;
  name?: string;
  config?: Record<string, any>;
}): Promise<{ deploymentId: string; name: string; status: string; message: string }> {
  // 1. Look up recipe
  // 2. Resolve dependencies (deploy them first if needed)
  // 3. Generate secrets (passwords, etc.)
  // 4. Render values template with config + secrets + dependency info
  // 5. Create Deployment record in DB (status=PENDING)
  // 6. Queue BullMQ "deploy" job
  // 7. Return deployment info
}
```

### 5. Dependency Resolution (`src/lib/deployer/dependencies.ts`)

When deploying a service with dependencies (e.g., n8n needs PostgreSQL):

```typescript
export async function resolveDependencies(params: {
  tenantId: string;
  tenantNamespace: string;
  recipe: Recipe;
  existingDeployments: Deployment[];
}): Promise<{
  resolved: Map<string, { host: string; port: number; credentials: Record<string, string> }>;
  newDeployments: string[];  // IDs of auto-deployed dependencies
}> {
  // For each dependency in recipe.dependencies:
  //   1. Check if already deployed in this tenant
  //   2. If not, recursively deploy it
  //   3. Collect connection info (host, port, credentials)
  //   4. Return resolved map for template rendering
}
```

### 6. Secret Generation (`src/lib/deployer/secrets.ts`)

Generate and manage secrets for deployments:

```typescript
export function generatePassword(length?: number): string {
  // Crypto-random password generation
}

export async function generateSecrets(
  secretsSchema: Record<string, any>,
  existingSecrets?: Record<string, string>
): Promise<Record<string, string>> {
  // For each field in secretsSchema:
  //   - If existing value provided, reuse it
  //   - If type is "password", generate random password
  //   - If type is "username", generate from context
}

export async function createK8sSecret(
  namespace: string,
  name: string,
  data: Record<string, string>
): Promise<void> {
  // Create or update K8s Secret resource
}
```

### 7. Values Template Rendering (`src/lib/deployer/template.ts`)

Render Handlebars-style values templates:

```typescript
import Handlebars from "handlebars";

export function renderValuesTemplate(
  template: string,
  context: {
    config: Record<string, any>;
    secrets: Record<string, string>;
    deps: Record<string, { host: string; port: number; credentials: Record<string, string> }>;
    tenant: { slug: string; namespace: string };
    platform: { domain: string; tlsEnabled: boolean; clusterIssuer: string };
  }
): string {
  const compiled = Handlebars.compile(template);
  return compiled(context);
}
```

### 8. BullMQ Worker (`worker/index.ts`)

The worker process that consumes jobs:

```typescript
import { Worker } from "bullmq";
import { connection } from "../src/lib/queue/connection";
import { helmInstall, helmUninstall, helmUpgrade } from "../src/lib/cluster/helm";
import { waitForReady } from "../src/lib/cluster/kubernetes";
import { prisma } from "../src/lib/db";

const worker = new Worker("deployments", async (job) => {
  switch (job.name) {
    case "deploy": {
      // 1. Update deployment status → DEPLOYING
      // 2. Add Helm repo if needed
      // 3. Run helm install with rendered values
      // 4. Wait for pods to be ready (poll K8s)
      // 5. Get ingress URL if applicable
      // 6. Update deployment status → RUNNING + set URL
      // On error: status → FAILED + set errorMessage
      break;
    }

    case "undeploy": {
      // 1. Update status → DELETING
      // 2. Run helm uninstall
      // 3. Clean up K8s secrets
      // 4. Update status → STOPPED / delete record
      break;
    }

    case "upgrade": {
      // 1. Update status → DEPLOYING
      // 2. Run helm upgrade with new values
      // 3. Wait for pods to be ready
      // 4. Update status → RUNNING
      break;
    }

    case "health-check": {
      // Check if pods are still healthy
      // Update status if degraded
      break;
    }
  }
}, { connection });

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

console.log("Mathison worker started, waiting for jobs...");
```

### 9. Wire Agent Tools

Go back to `src/lib/agent/tools.ts` and replace the placeholder implementations:
- `deployService` → calls `initiateDeployment()`
- `updateService` → queues upgrade job
- `removeService` → queues undeploy job
- `getServiceDetail` → enriches DB data with live K8s status
- `getServiceLogs` → calls `getPodLogs()`

## Deliverables

- [ ] `npm run worker` starts the BullMQ worker process successfully
- [ ] Deploying via the AI agent creates a DB record, queues a job, and the worker executes `helm install`
- [ ] Dependencies are auto-resolved (deploying n8n auto-deploys PostgreSQL first)
- [ ] Secrets are generated and stored as K8s Secrets
- [ ] Values templates are rendered correctly with config, secrets, and dependency info
- [ ] Worker updates deployment status through the lifecycle: PENDING → DEPLOYING → RUNNING (or FAILED)
- [ ] `helm uninstall` works via the removeService tool
- [ ] Worker logs errors and updates deployment with error messages on failure

## Key Files

```
src/lib/
├── queue/
│   ├── connection.ts      # Redis connection
│   ├── queues.ts          # Queue instances
│   └── jobs.ts            # Job type definitions
├── deployer/
│   ├── engine.ts          # Deployment orchestration
│   ├── dependencies.ts    # Dependency resolution
│   ├── secrets.ts         # Secret generation
│   └── template.ts        # Values template rendering
worker/
└── index.ts               # BullMQ worker process
```

## Notes

- The worker runs as a **separate process** (`npm run worker` / `npx tsx worker/index.ts`) but shares code from `src/lib/`.
- For production, the worker would run as a separate container with the same image but a different entrypoint.
- **Handlebars** is already in dependencies from Step 01.
- The worker should be resilient: catch all errors, update deployment status to FAILED, log everything.
- Use `job.updateProgress()` to report progress back (optional, but useful for UI).
- Consider adding a repeatable job for periodic health checks (every 60 seconds, check all RUNNING deployments).
