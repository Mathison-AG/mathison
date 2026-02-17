# Step 21 — State Model & Audit Trail

## Goal

Enhance the Deployment model to serve as the agent's single source of truth, with a full audit trail of every state change. Remove Helm-specific fields and add tracking for managed K8s resources. After this step, the agent knows exactly what it deployed, what changed, and when — and can explain this to users.

## Prerequisites

- Step 20 completed (new engine working, Helm no longer used for deployments)

## What to Build

### 1. Prisma Schema Migration

**Add `DeploymentEvent` model:**

```prisma
model DeploymentEvent {
  id            String   @id @default(cuid())
  deploymentId  String   @map("deployment_id")
  deployment    Deployment @relation(fields: [deploymentId], references: [id], onDelete: Cascade)
  action        String   // "created", "config_changed", "upgraded", "restarted", "health_changed", "removed"
  previousState Json?    @map("previous_state")
  newState      Json     @map("new_state")
  reason        String?  // "User requested", "Auto-healed", "Dependency updated"
  triggeredBy   String?  @map("triggered_by") // User ID or "system"
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([deploymentId, createdAt])
  @@map("deployment_events")
}
```

**Modify `Deployment` model:**

Remove:
- `helmRelease` — no longer used
- `chartVersion` — version is in the config
- `revision` — tracked via DeploymentEvent history instead

Add:
- `managedResources Json @default("[]")` — list of K8s resource references (`[{kind, name, namespace}]`)
- `events DeploymentEvent[]` — relation to audit trail

Keep:
- `config` — the validated config (desired state)
- `secretsRef` — K8s Secret name
- `status`, `url`, `localPort`, `servicePort`, `serviceName`
- `appVersion` — the application version (from config)
- `dependsOn` — dependency tracking

### 2. Audit Trail Integration

Wire up `DeploymentEvent` creation at every state change:

- **Deploy**: `action: "created"`, `newState: { config, recipe, secrets }`, `triggeredBy: userId`
- **Config change**: `action: "config_changed"`, `previousState: oldConfig`, `newState: newConfig`
- **Version upgrade**: `action: "upgraded"`, `previousState: { version: "16" }`, `newState: { version: "17" }`
- **Restart**: `action: "restarted"`, `reason: "User requested"`
- **Health change**: `action: "health_changed"`, `newState: { healthy: false, reason: "Pod CrashLoopBackOff" }`, `triggeredBy: "system"`
- **Removal**: `action: "removed"`, `previousState: lastConfig`, `triggeredBy: userId`

### 3. Agent Tool: Deployment History

Add a tool that lets the agent read the audit trail:

```typescript
getAppHistory({ appId }) → [
  { action: "created", when: "2 days ago", reason: "User requested" },
  { action: "config_changed", when: "1 day ago", changes: "storage: 8Gi → 16Gi" },
  { action: "health_changed", when: "3 hours ago", reason: "Pod restarted" },
]
```

This lets the agent answer questions like "what happened to my PostgreSQL?" with accurate, timestamped information.

### 4. Managed Resources Tracking

When the engine applies resources, record what was created:

```json
[
  { "kind": "StatefulSet", "name": "my-postgresql", "namespace": "tenant-ws" },
  { "kind": "Service", "name": "my-postgresql", "namespace": "tenant-ws" },
  { "kind": "Secret", "name": "my-postgresql", "namespace": "tenant-ws" },
  { "kind": "PersistentVolumeClaim", "name": "data-my-postgresql-0", "namespace": "tenant-ws" }
]
```

On removal, this list is used to delete exactly the right resources — no guessing, no leftover resources.

## Key Files

```
prisma/
  schema.prisma             # MODIFIED — new DeploymentEvent model, Deployment changes

prisma/migrations/
  XXXXXXX_state_model/      # NEW — migration for schema changes

src/lib/deployer/
  engine.ts                 # MODIFIED — creates DeploymentEvents on state changes
  events.ts                 # NEW — helper functions for creating audit events

src/lib/agent/
  tools.ts                  # MODIFIED — new getAppHistory tool

worker/
  main.ts                   # MODIFIED — records managedResources after apply
```

## Testing

### Manual Verification

- [ ] Deploy a service → `DeploymentEvent` with action "created" is recorded
- [ ] Change config → event with previous and new state recorded
- [ ] Remove service → event with action "removed" recorded, all managedResources deleted
- [ ] Query deployment history via agent tool → returns correct timeline
- [ ] `yarn typecheck` passes after schema migration
- [ ] `npx prisma migrate deploy` runs cleanly

### Edge Cases

- [ ] Deployment that fails → event records the failure reason
- [ ] Rapid state changes → events are ordered correctly
- [ ] Long audit trail → query still performs well (index on deploymentId + createdAt)

## Notes

- This migration removes Helm-specific fields. If any code still references `helmRelease`, `chartVersion`, or `revision`, it will fail at typecheck — which is exactly what we want. Fix any stragglers.
- The `managedResources` list is written by the worker after successful apply. If apply partially fails, only successfully applied resources are recorded.
- DeploymentEvents are append-only. Never update or delete them — they're the audit trail.
