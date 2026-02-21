# Step 47 — Ops Agent: Chat Agent Integration

## Goal

Connect the autonomous ops agent to the existing chat experience. Users can ask about ops agent activity, configure update policies and backup schedules, and manage notification channels — all through natural language.

## Prerequisites

- Steps 40–46 complete (ops agent fully functional with UI)

## What to Build

### 1. New Chat Agent Tools

Add to `src/lib/agent/tools.ts`:

**`getOpsAgentActivity(workspaceId, limit)`**
- Returns recent ops agent actions across the workspace
- Formatted for human readability: timestamps, app names, actions, reasoning
- Default limit: 10

**`getOpsAgentStatus(workspaceId)`**
- Is the agent enabled?
- Last run time + status
- Circuit breaker state
- Summary of recent activity (actions in last 24h)

**`configureUpdatePolicy(deploymentId, policy)`**
- Validates policy is one of: `auto_patch`, `auto_minor`, `notify_only`, `disabled`
- Updates the deployment
- Confirms the change to the user

**`configureBackupSchedule(deploymentId, enabled, schedule)`**
- Enables/disables backups
- Sets cron schedule (with friendly aliases: "daily", "weekly", "hourly" → cron expressions)
- Validates the deployment's recipe has `dataExport` defined
- Confirms the change

**`configureNotificationChannel(workspaceId, provider, config)`**
- Creates or updates a notification channel
- Guided flow: asks for bot token, chat ID, etc.
- Sends a test notification to verify it works
- Confirms setup

**`getLatestIncidentReport(workspaceId)`**
- Finds the most recent incident report from `OpsAgentRun.actionsJson`
- Formats it in a user-friendly way

**`triggerOpsCheck(workspaceId)`**
- Manually triggers an ops cycle for the workspace
- Returns "check initiated, results will be available shortly"

### 2. System Prompt Update

Update the chat agent's system prompt (`src/lib/agent/system-prompt.ts`) to include:
- Awareness of the ops agent and its capabilities
- How to answer questions like "what's the ops agent doing?"
- How to guide users through notification setup
- How to explain update policies in plain language
- User-facing language: "your infrastructure assistant" not "ops agent"

### 3. Conversational Flows

The chat agent should handle these natural language patterns:

- "What has the ops agent been doing?" → `getOpsAgentActivity`
- "Is everything running smoothly?" → `getOpsAgentStatus` + health overview
- "Enable auto-updates for my PostgreSQL" → `configureUpdatePolicy`
- "Set up daily backups for n8n" → `configureBackupSchedule`
- "Set up Telegram notifications" → guided `configureNotificationChannel` flow
- "Show me the last incident" → `getLatestIncidentReport`
- "Run an infrastructure check now" → `triggerOpsCheck`
- "What updates are available?" → check `latestAvailableVersion` across deployments

## Key Decisions

- Chat tools call the same underlying functions as the UI — no duplication
- Friendly aliases for cron: "daily" = `"0 3 * * *"`, "weekly" = `"0 3 * * 0"`, "hourly" = `"0 * * * *"`
- Notification setup is conversational: agent asks one field at a time
- "Ops agent" is called "your infrastructure assistant" in user-facing chat

## Testing

1. Ask the chat agent: "what has the ops agent been doing?" — verify it returns recent activity
2. Say "enable auto-updates for PostgreSQL" — verify policy changed
3. Say "set up Telegram notifications" — verify guided flow works
4. Say "run a check now" — verify ops cycle triggered
5. Say "set up daily backups for n8n" — verify backup schedule configured
6. Say "show me the last incident" — verify incident report returned

## Files Changed

- `src/lib/agent/tools.ts` — new ops-related chat tools
- `src/lib/agent/system-prompt.ts` — ops agent awareness
