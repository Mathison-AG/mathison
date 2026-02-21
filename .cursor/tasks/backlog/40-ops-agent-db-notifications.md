# Step 40 — Ops Agent: Database Models & Notification Foundation

## Goal

Create the database models and notification provider abstraction that the autonomous ops agent depends on. This is pure foundation — no agent logic yet.

## Prerequisites

- Steps 01–35 complete (Mathison deployed and functional)

## What to Build

### 1. New Prisma Models

**NotificationChannel** — configurable per workspace:

```prisma
model NotificationChannel {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  provider    String    // "telegram", "slack", "discord", "webhook", "email"
  name        String    // user-friendly label
  config      Json      // provider-specific: { botToken, chatId } for Telegram
  enabled     Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

**OpsAgentRun** — one row per agent cycle:

```prisma
model OpsAgentRun {
  id          String    @id @default(uuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  startedAt   DateTime  @default(now())
  completedAt DateTime?
  status      String    // "running", "completed", "failed", "circuit_broken"
  summary     String?   // LLM-generated summary of what happened
  actionsJson Json?     // array of actions taken
  tokenUsage  Int?      // track LLM cost
  error       String?
}
```

**BackupRecord** — history of automated backups:

```prisma
model BackupRecord {
  id           String     @id @default(uuid())
  deploymentId String
  deployment   Deployment @relation(fields: [deploymentId], references: [id], onDelete: Cascade)
  status       String     // "pending", "completed", "failed"
  dataSize     Int?       // bytes
  storagePath  String?    // where the backup is stored
  triggeredBy  String     // "system" or user ID
  createdAt    DateTime   @default(now())
  error        String?
}
```

### 2. New Fields on Deployment

- `updatePolicy` — String, default `"notify_only"`. Values: `auto_patch`, `auto_minor`, `notify_only`, `disabled`
- `latestAvailableVersion` — String, nullable
- `lastVersionCheckAt` — DateTime, nullable
- `backupEnabled` — Boolean, default false
- `backupSchedule` — String, nullable (cron expression, e.g. `"0 3 * * *"`)
- `lastBackupAt` — DateTime, nullable
- `previousImageTag` — String, nullable (for rollback after failed update)

### 3. Notification Provider Abstraction

Create `src/lib/notifications/`:

- `types.ts` — `NotificationProvider` interface, `NotificationMessage` type with severity levels (`info`, `warning`, `critical`), `NotificationResult`
- `telegram.ts` — Telegram Bot API implementation using plain `fetch` (no extra deps). Supports Markdown formatting.
- `registry.ts` — factory that instantiates the right provider from a `NotificationChannel` DB record
- `send.ts` — `sendNotification(workspaceId, message)` — looks up all enabled channels for a workspace and sends to each. Fire-and-forget with error logging.

### 4. Notification API Routes

- `POST /api/notifications/channels` — create a notification channel
- `GET /api/notifications/channels` — list channels for workspace
- `PUT /api/notifications/channels/[id]` — update a channel
- `DELETE /api/notifications/channels/[id]` — delete a channel
- `POST /api/notifications/channels/[id]/test` — send a test notification

## Key Decisions

- Telegram Bot API uses plain `fetch` — no new npm dependencies
- `NotificationChannel.config` is `Json` — each provider defines its own config shape, validated with Zod at runtime
- Notification sending is fire-and-forget (async, error-swallowed) — never blocks the caller
- All models use `onDelete: Cascade` to clean up when parent is deleted

## Testing

1. Run migration: `docker compose -f docker-compose.local.yml exec web npx prisma migrate dev`
2. Verify models exist: `docker compose -f docker-compose.local.yml exec web npx prisma studio`
3. Test notification API: create a Telegram channel, send a test notification
4. Verify `sendNotification()` sends to Telegram bot

## Files Changed

- `prisma/schema.prisma` — new models + fields
- `src/lib/notifications/types.ts` — interfaces
- `src/lib/notifications/telegram.ts` — Telegram provider
- `src/lib/notifications/registry.ts` — provider factory
- `src/lib/notifications/send.ts` — send helper
- `src/app/api/notifications/channels/route.ts` — CRUD API
- `src/app/api/notifications/channels/[id]/route.ts` — single channel ops
- `src/app/api/notifications/channels/[id]/test/route.ts` — test endpoint
