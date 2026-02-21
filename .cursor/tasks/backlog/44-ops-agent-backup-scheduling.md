# Step 44 — Ops Agent: Backup Scheduling

## Goal

Enable the ops agent to run scheduled backups for deployments that have `dataExport` defined in their recipe. Backups run on a cron schedule, are stored locally (PV on worker), and the agent tracks history and prunes old backups.

## Prerequisites

- Step 42 complete (health monitoring — agent loop functional)
- Existing `dataExport` on recipes (already implemented in Step 24)

## What to Build

### 1. Backup Execution

`src/lib/ops-agent/backup.ts`:

- `executeBackup(deploymentId)` — orchestrates a backup:
  1. Look up deployment + recipe
  2. Verify recipe has `dataExport` defined
  3. Execute the export (reuse logic from `src/lib/deployer/data-export.ts`)
  4. Store output to `/backups/{workspaceId}/{deploymentName}/{timestamp}.{ext}`
  5. Create `BackupRecord` with status, size, path
  6. Update `deployment.lastBackupAt`
  7. Return the record

- `shouldRunBackup(deployment)` — checks:
  - `backupEnabled` is true
  - Recipe has `dataExport` defined
  - `backupSchedule` cron expression matches (time since `lastBackupAt` exceeds interval)
  - Simple cron evaluation: support daily (`0 3 * * *`), weekly (`0 3 * * 0`), hourly (`0 * * * *`)

- `pruneBackups(deploymentId, keepCount)` — deletes old backup files + records beyond retention limit (default: keep last 10)

### 2. Backup Tools for the Agent

Add to `src/lib/ops-agent/tools.ts`:

**`runBackup(deploymentId)`**
- Calls `executeBackup()`
- Returns status + file path + size
- Sends alert on failure

**`getBackupHistory(deploymentId)`**
- Queries `BackupRecord` for the deployment
- Returns last 10 backups with status, size, timestamp

**`pruneOldBackups(deploymentId, keepCount)`**
- Calls `pruneBackups()`
- Returns how many were pruned

### 3. Cron Evaluation

`src/lib/ops-agent/cron.ts`:

- `shouldRunNow(cronExpression, lastRunAt, now)` — lightweight cron check
- Support standard 5-field cron: minute, hour, day-of-month, month, day-of-week
- For the MVP, focus on common patterns: daily, weekly, every N hours
- Returns `true` if enough time has passed since `lastRunAt` for the cron to have fired

### 4. Backup Storage

For MVP, backups are stored on the worker's filesystem:
- Path: `/backups/{workspaceId}/{deploymentName}/{timestamp}.tar.gz` (or `.sql` for databases)
- In Docker dev: mount a volume at `/backups` in the worker container
- In production: PersistentVolume on the worker pod
- Future: S3/MinIO integration

### 5. State Gathering Update

Update `loop.ts` to include backup state:
- Deployments with `backupEnabled` and their schedule/lastBackupAt
- Any failed recent backups
- Deployments that are overdue for backup

### 6. System Prompt Update

Add backup-specific guidance:
- Check backup schedules each cycle
- Run backups that are due
- Notify on backup failures (critical — data loss risk)
- Periodically prune old backups (suggest when > 20 exist)
- Don't run backups on FAILED deployments (they might produce corrupt data)

## Key Decisions

- Reuse existing `dataExport` logic from `src/lib/deployer/data-export.ts` — no new export mechanisms
- Cron parsing is lightweight/custom — no cron-parser npm dependency
- Backups stored on local filesystem for MVP — future S3 integration is a separate task
- Backup retention default: 10 per deployment
- Don't backup FAILED deployments — only RUNNING ones
- Backup execution runs in the worker process (has kubectl access for exec-based exports)

## Testing

1. Enable backup on a PostgreSQL deployment: set `backupEnabled: true`, `backupSchedule: "0 * * * *"` (hourly)
2. Wait for ops cycle — verify backup runs and `BackupRecord` created
3. Check `/backups/` directory in the worker container for the backup file
4. Verify `lastBackupAt` updated on deployment
5. Create 12 backups, verify pruning keeps only 10
6. Test with a deployment that has no `dataExport` — verify agent skips it gracefully

## Files Changed

- `src/lib/ops-agent/backup.ts` — backup execution, pruning
- `src/lib/ops-agent/cron.ts` — lightweight cron evaluation
- `src/lib/ops-agent/tools.ts` — backup tools
- `src/lib/ops-agent/loop.ts` — backup state in gathered context
- `src/lib/ops-agent/system-prompt.ts` — backup guidance
- `docker-compose.local.yml` — mount `/backups` volume on worker
