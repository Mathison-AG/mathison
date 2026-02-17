# Step 20 — Deployment Engine V2

## Goal

Replace the Helm-based deployment engine with a typed build-and-apply flow. The new engine validates config via Zod, calls the recipe's `build()` function to produce K8s resource objects, and applies them via Server-Side Apply. After this step, Helm is no longer used for deployments — the agent deploys, upgrades, and removes services through the typed recipe system.

## Prerequisites

- Step 19 completed (recipe system foundation with all 5 typed recipes)
- Kind cluster running for testing

## What to Build

### 1. New Engine Flow (`src/lib/deployer/engine.ts`)

Replace the current flow:

**Current:** getRecipe → resolveDeps → generateSecrets → renderTemplate (Handlebars) → createDB → queueJob → worker: helmInstall

**New:** getRecipe (from registry) → validateConfig (Zod) → resolveDeps (typed) → generateSecrets → build() (typed K8s objects) → dryRun → createDB → queueJob → worker: applyResources (SSA)

Key changes:
- `initiateDeployment()` — calls recipe registry instead of DB, validates config against Zod schema, calls `build()` to pre-validate, creates Deployment record, queues job
- `initiateUpgrade()` — validates new config, merges with existing, calls `build()` with new config, queues job
- `initiateRemoval()` — reads `managedResources` from Deployment, queues job to delete them

### 2. Worker Handlers (`worker/main.ts`)

Replace Helm-based handlers:

- `handleDeploy` — calls `applyResources()` instead of `helmInstall()`, waits for pods ready, updates status
- `handleUpgrade` — calls `applyResources()` with new manifests (SSA handles the diff), waits for rollout
- `handleUndeploy` — calls `deleteResources()` instead of `helmUninstall()`, cleans up secrets, deletes DB record

Remove:
- `ensureHelmRepo()` — no longer needed
- `helmRecoverStuckRelease()` — no stuck releases with SSA
- Helm-specific error parsing

### 3. Typed Dependency Resolution

Update `src/lib/deployer/dependencies.ts`:
- Dependencies reference recipes by slug from the registry (not DB)
- Auto-deploy uses the new engine (build + SSA, not Helm)
- `connectionInfo()` from the dependency recipe provides typed connection data
- No more hardcoded service name suffixes — each recipe's `connectionInfo()` knows its own service name

### 4. Secrets Management Update

Update `src/lib/deployer/secrets.ts`:
- Secrets are generated from the recipe's `secrets` definition (not `secretsSchema` JSON blob)
- K8s Secrets are created as part of the recipe's `build()` output (included in the resource list)
- On upgrade, existing secrets are read from K8s and reused (same as today, but through the typed system)

### 5. Port-Forward Update

Update port-forward logic:
- Service name comes from the recipe's `build()` output (find the Service resource in the list)
- Service port comes from the Service spec (not from `ingressConfig`)
- Remove hardcoded service name suffix logic

### 6. Pod Monitoring Update

Update pod status checking:
- Labels come from the recipe's `build()` output (read from the Deployment/StatefulSet labels)
- No more fallback label selector logic — labels are deterministic from our builders

## Key Files

```
src/lib/deployer/
  engine.ts              # REWRITTEN — new validate → build → apply flow
  dependencies.ts        # MODIFIED — typed dependency resolution
  secrets.ts             # MODIFIED — uses recipe secret definitions
  template.ts            # DELETED — no more Handlebars rendering

src/lib/cluster/
  helm.ts                # KEPT for now (removed in Step 22)
  kubernetes.ts          # MODIFIED — updated pod monitoring, uses builder labels

worker/
  main.ts                # REWRITTEN — SSA-based handlers

src/lib/queue/
  jobs.ts                # MODIFIED — job data no longer carries renderedValues YAML
```

## Testing

### Manual Verification

- [ ] Deploy PostgreSQL via the new engine — reaches RUNNING state
- [ ] Deploy Redis — reaches RUNNING state
- [ ] Deploy n8n (with auto-deployed PostgreSQL dependency) — reaches RUNNING, can access UI
- [ ] Deploy Uptime Kuma — reaches RUNNING, can access UI
- [ ] Deploy MinIO — reaches RUNNING, can access console
- [ ] Upgrade a deployment (change config) — applies cleanly, service stays healthy
- [ ] Remove a deployment — all K8s resources deleted, DB record removed
- [ ] Port-forward works for all deployed services
- [ ] `yarn typecheck` passes

### Edge Cases

- [ ] Deploy with no config (all defaults) — works correctly
- [ ] Deploy with partial config — defaults applied for missing fields
- [ ] Deploy duplicate name — proper error returned
- [ ] Remove service with dependents — blocked with clear error
- [ ] Redeploy after removal (same name) — works cleanly (no stale PVC issues)
- [ ] Network error during apply — proper error handling, status set to FAILED

## Notes

- The old Helm engine can remain as dead code during this step — it gets cleaned up in Step 22.
- Test each recipe deployment individually on the kind cluster. Don't move to the next until the current one works end-to-end.
- Server-Side Apply with `force: true` handles the case where resources already exist (idempotent). This eliminates the stuck release recovery logic.
- The worker no longer needs the Helm binary. This simplifies the Docker image.
- Pay attention to StatefulSet updates — K8s doesn't allow updating certain fields on existing StatefulSets (like volumeClaimTemplates). Handle this gracefully.
