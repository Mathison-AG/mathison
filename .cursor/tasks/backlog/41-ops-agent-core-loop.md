# Step 41 — Ops Agent: Core Loop & Scheduler

## Goal

Build the autonomous ops agent's core loop — a BullMQ repeatable job that runs every 5 minutes per tenant, gathers workspace state, calls Claude with an SRE-focused system prompt and ops tools, and records results. This is the "brain" that all subsequent phases plug capabilities into.

## Prerequisites

- Step 40 complete (database models, notification foundation)

## What to Build

### 1. BullMQ Queue & Job Types

Add a new queue `"ops-agent"` in `src/lib/queue/`:

- New queue instance in `queues.ts`
- New job type `OPS_CYCLE` with data: `{ tenantId: string }`
- Separate concurrency/rate limits from the deployment queue

### 2. Ops Agent Scheduler

`src/lib/ops-agent/scheduler.ts`:

- `ensureOpsSchedule(tenantId)` — creates/updates a BullMQ repeatable job for the tenant (every 5 minutes)
- `removeOpsSchedule(tenantId)` — removes the repeatable job
- `isOpsEnabled(tenantId)` — check if the agent is active
- Called from the worker on startup (scans all tenants with RUNNING deployments)

### 3. Agent Loop

`src/lib/ops-agent/loop.ts` — `runOpsCycle(tenantId)`:

1. **Record start**: Create `OpsAgentRun` with status `"running"`
2. **Gather state**: Query all workspaces for the tenant, all RUNNING/FAILED deployments, recent `DeploymentEvent`s since last run, notification channel configs, version check status, backup status
3. **Build context message**: Format the gathered state into a structured user message for the LLM
4. **Call LLM**: Use `generateText()` (not streaming — background job) with ops system prompt + ops tools, `maxSteps: 8`
5. **Record completion**: Update `OpsAgentRun` with status, summary, actions taken, token usage
6. **Handle errors**: On failure, update run status to `"failed"`, check circuit breaker

### 4. Ops System Prompt

`src/lib/ops-agent/system-prompt.ts`:

SRE-focused prompt that instructs Claude to:
- Review the infrastructure state provided
- Prioritize issues by severity (critical > warning > info)
- Check health of degraded/failed apps first
- Check for available version updates
- Check backup schedules
- Always explain reasoning before acting
- Use `sendAlert` for anything the user should know about
- Respect cooldowns and rate limits
- Be conservative — when in doubt, notify rather than act

### 5. Guardrails

`src/lib/ops-agent/guardrails.ts`:

- `maxActionsPerCycle: 5` — prevent runaway tool calls
- `getCooldown(deploymentId, action)` — check if an action was recently performed (e.g., no restart within 30 min)
- `recordCooldown(deploymentId, action)` — mark an action as performed
- `checkCircuitBreaker(tenantId)` — if 3 consecutive cycles failed, return `true` (pause agent)
- `resetCircuitBreaker(tenantId)` — reset on successful cycle
- Action classification: `safe` (read-only, notify) vs `mutating` (restart, update, scale)

### 6. Worker Integration

In `worker/main.ts`:

- Add a second `Worker` instance on the `"ops-agent"` queue
- Handler calls `runOpsCycle(tenantId)` from the loop module
- Concurrency: 1 (one ops cycle at a time)
- On worker startup: scan tenants and register repeatable jobs via scheduler

### 7. Initial Tools (Skeleton)

`src/lib/ops-agent/tools.ts` — define the tool interface but only implement basic ones in this phase:

- `getInfrastructureOverview()` — returns the formatted state (already gathered)
- `sendAlert(workspaceId, severity, title, body)` — sends notification via the notification system from Step 40
- `recordAction(action, reasoning, result)` — logs the action in the current run's actionsJson

Health, version, and backup tools are added in Phases 3–5.

## Key Decisions

- Use `generateText()` not `streamText()` — no need to stream in a background job
- Concurrency 1 on the ops queue — only one agent cycle runs at a time globally
- The agent gets workspace state as a structured message, not via tool calls for the initial read — reduces LLM cost
- Guardrail cooldowns stored in Redis (TTL keys) for simplicity
- Circuit breaker checks last 3 `OpsAgentRun` rows for the tenant

## Testing

1. Start worker: verify ops agent scheduler registers repeatable jobs
2. Wait for 5-minute cycle (or trigger manually via BullMQ dashboard/API)
3. Check `OpsAgentRun` table: should see a completed run with summary
4. Verify no actions taken on healthy infrastructure (agent should report "all clear")
5. Simulate a FAILED deployment: verify agent detects it and sends alert

## Files Changed

- `src/lib/queue/queues.ts` — new ops-agent queue
- `src/lib/queue/jobs.ts` — new OPS_CYCLE job type
- `src/lib/ops-agent/scheduler.ts` — repeatable job management
- `src/lib/ops-agent/loop.ts` — main agent cycle
- `src/lib/ops-agent/system-prompt.ts` — SRE system prompt
- `src/lib/ops-agent/tools.ts` — tool definitions (skeleton)
- `src/lib/ops-agent/guardrails.ts` — safety mechanisms
- `worker/main.ts` — second Worker instance for ops-agent queue
