# Step 23 — Backup & Restore

## Goal

Enable exporting a workspace's complete desired state to a portable JSON snapshot and restoring it to a new or existing cluster. The agent can backup the infrastructure state, and a user can restore everything from a snapshot — secrets are regenerated, services are reconciled. After this step, the agent's state is portable and recoverable.

## Prerequisites

- Steps 19–22 completed (typed recipe system fully operational, audit trail working)

## What to Build

### 1. Workspace Snapshot Format

Define the export format:

```typescript
interface WorkspaceSnapshot {
  version: 1;                          // Schema version for future migrations
  exportedAt: string;                  // ISO timestamp
  exportedBy: string;                  // User ID or "system"
  workspace: {
    slug: string;
    name: string;
  };
  services: Array<{
    recipe: string;                    // Recipe slug (must exist in registry)
    name: string;                      // Instance name
    config: Record<string, unknown>;   // Validated config at export time
    dependsOn: string[];               // Other service names (not IDs)
    status: string;                    // Status at export time (informational)
  }>;
  metadata?: {
    platform: string;                  // "mathison"
    engineVersion: string;             // For compatibility checks
  };
}
```

**What's NOT exported:**
- Secrets (security — regenerated on restore)
- K8s resource state (recreated from recipes)
- Deployment IDs (new IDs on restore)
- Audit trail (starts fresh)
- Install counts, embeddings (dynamic data)

### 2. Export API

**`GET /api/workspaces/:id/export`**

- Auth required (workspace owner)
- Reads all Deployments for the workspace
- Validates each deployment's config still matches its recipe's Zod schema
- Returns the snapshot as JSON (Content-Type: application/json)
- Optionally: `?download=true` returns as file attachment

### 3. Import / Restore API

**`POST /api/workspaces/:id/import`**

- Auth required (workspace owner)
- Accepts a WorkspaceSnapshot JSON body
- Validates:
  - Snapshot version is supported
  - All referenced recipes exist in the registry
  - All configs validate against their recipe's Zod schemas
  - No name conflicts with existing deployments (unless `?force=true` which removes existing first)
- For each service in the snapshot:
  1. Generate new secrets
  2. Create Deployment record
  3. Queue deploy job (which calls build() + SSA)
- Respects dependency order (deploys dependencies first)
- Returns: list of created deployments with their new IDs

### 4. Agent Tools

**`backupWorkspace` tool:**
- Triggers export, returns snapshot summary (service count, names)
- Agent can explain: "I've backed up your workspace with 3 services: PostgreSQL, Redis, and n8n"

**`restoreWorkspace` tool:**
- Takes a snapshot (from previous backup or user-provided)
- Triggers import, reports progress
- Agent explains: "Restoring 3 services... PostgreSQL is running, Redis is starting, n8n is waiting for dependencies..."

### 5. Snapshot Storage (Simple)

For MVP, snapshots are returned to the client (download). No server-side storage.

Future: store snapshots in the DB or object storage with versioning.

## Key Files

```
src/types/
  snapshot.ts                # NEW — WorkspaceSnapshot type + Zod schema

src/lib/workspace/
  export.ts                  # NEW — export workspace to snapshot
  import.ts                  # NEW — import/restore from snapshot

src/app/api/workspaces/
  [id]/export/route.ts       # NEW — GET export endpoint
  [id]/import/route.ts       # NEW — POST import endpoint

src/lib/agent/
  tools.ts                   # MODIFIED — backupWorkspace, restoreWorkspace tools
```

## Testing

### Manual Verification

- [ ] Export a workspace with 2-3 deployed services → valid JSON snapshot
- [ ] Import the snapshot into the same workspace (after clearing it) → all services recreated
- [ ] Import into a different workspace → works correctly
- [ ] Imported services reach RUNNING state with new secrets
- [ ] Dependencies are deployed in correct order
- [ ] Agent can backup and restore via tools
- [ ] Invalid snapshot (bad recipe slug) → clear error message

### Edge Cases

- [ ] Export with no deployments → valid empty snapshot
- [ ] Import with unknown recipe slug → rejected with clear error
- [ ] Import with config that doesn't validate → rejected with specific field errors
- [ ] Import when some services already exist → conflict handling (reject or force)
- [ ] Circular dependencies → handled gracefully (shouldn't be possible but guard against it)

## Notes

- This is deliberately simple for MVP. No server-side snapshot storage, no incremental backups, no scheduled backups. Those come later.
- Secrets are never exported. This is a security decision. On restore, new secrets are generated. Services like PostgreSQL will start with new credentials — this is fine for a fresh cluster. For migration between clusters with data, a separate data migration tool would be needed (future).
- The snapshot format has a `version` field for forward compatibility. If the format changes in the future, we can write migration logic.
- Dependency ordering during import: topological sort based on `dependsOn` references.
