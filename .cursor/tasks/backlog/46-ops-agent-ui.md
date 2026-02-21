# Step 46 — Ops Agent: UI Integration

## Goal

Build the UI for managing notification channels, configuring per-app update policies and backup schedules, and viewing the ops agent's activity timeline.

## Prerequisites

- Steps 40–45 complete (all ops agent capabilities functional)

## What to Build

### 1. Notification Channels in Settings

In `src/app/(dashboard)/settings/`:

**Notification Channels Section:**
- List existing channels with provider icon, name, enabled toggle
- "Add Channel" dialog:
  - Provider selector (Telegram first, others greyed out / "coming soon")
  - Provider-specific config form:
    - Telegram: Bot Token + Chat ID fields, with a help link to BotFather
  - Name field (user-friendly label)
  - Enable/disable toggle
- "Send Test" button per channel — sends a test notification
- Edit/delete existing channels
- Uses TanStack Query for data fetching (query key: `["notification-channels"]`)

### 2. Ops Agent Status in Settings

**Ops Agent Section:**
- Enable/disable toggle for the workspace
- Cycle interval display (5 minutes, not configurable in MVP)
- Last run status + timestamp
- "View Activity" link to the ops activity page
- Recent runs summary (last 5 runs with status badges)

### 3. Per-App Configuration on App Detail Page

In `src/app/(dashboard)/apps/[id]/`:

**Update Policy:**
- Dropdown/select: Auto-patch / Auto-minor / Notify only / Disabled
- Current version + latest available version display
- "Check Now" button to trigger immediate version check
- Last checked timestamp

**Backup Schedule:**
- Enable/disable toggle
- Schedule picker: Daily (with time), Weekly (with day + time), or Custom cron
- Last backup timestamp + status
- "Backup Now" button for manual trigger
- Recent backup history (last 5 with status/size)

### 4. Ops Activity Page

New route: `src/app/(dashboard)/ops/page.tsx`

- Timeline view of all ops agent actions across the workspace
- Each entry shows:
  - Timestamp
  - Deployment name + icon
  - Action type (health check, restart, update, backup, alert) with colored badge
  - Brief reasoning (from LLM)
  - Result (success/failure)
- Filters:
  - By deployment (dropdown)
  - By action type (multi-select)
  - By severity (info/warning/critical)
  - Date range
- Pagination (latest first, 20 per page)

**API Routes:**
- `GET /api/ops/runs` — list recent OpsAgentRun records with pagination
- `GET /api/ops/runs/[id]` — single run detail with full actions
- `POST /api/ops/trigger` — manually trigger an ops cycle

### 5. Navigation

- Add "Ops Agent" item to sidebar navigation (between "My Apps" and "Settings")
- Icon: `Bot` or `Shield` from lucide-react
- Badge showing count of recent critical actions (last 24h)

### 6. Dashboard Integration

On the main dashboard (`/`):

- Small "Ops Agent" status card:
  - "Active" / "Paused" / "Disabled" with colored indicator
  - Last run time
  - Recent actions count
  - Link to ops activity page

## Key Decisions

- TanStack Query for all data fetching (consistent with existing patterns)
- Notification channel config (bot tokens) stored encrypted — or at minimum, masked in UI
- Update policy and backup schedule changes call existing API routes (PATCH deployment)
- Ops activity page uses server-side pagination (not client-side)
- Telegram setup includes a step-by-step guide (link to BotFather, how to get chat ID)

## Testing

1. Navigate to Settings — verify Notification Channels section appears
2. Add a Telegram channel: enter bot token + chat ID, send test notification
3. Navigate to an app detail page — verify update policy and backup schedule controls
4. Change update policy to "auto-patch" — verify saved
5. Enable backups with daily schedule — verify saved
6. Navigate to /ops — verify activity timeline shows recent agent runs
7. Check sidebar — verify "Ops Agent" link with activity badge

## Files Changed

- `src/app/(dashboard)/settings/` — notification channels + ops agent sections
- `src/app/(dashboard)/apps/[id]/` — update policy, backup schedule controls
- `src/app/(dashboard)/ops/page.tsx` — new ops activity page
- `src/app/api/ops/runs/route.ts` — ops runs API
- `src/app/api/ops/runs/[id]/route.ts` — single run API
- `src/app/api/ops/trigger/route.ts` — manual trigger API
- `src/components/ops/` — shared ops UI components (timeline, status badges, etc.)
- `src/app/(dashboard)/layout.tsx` — sidebar nav update
