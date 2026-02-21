# Step 42 — Ops Agent: Health Monitoring & Remediation

## Goal

Give the ops agent deep health monitoring tools so it can diagnose issues, correlate failures across dependencies, and remediate problems (restart, notify). This replaces the basic `HEALTH_CHECK` job with intelligent, LLM-driven health management.

## Prerequisites

- Step 41 complete (ops agent core loop running)

## What to Build

### 1. Health Monitoring Tools

Add to `src/lib/ops-agent/tools.ts`:

**`getDeploymentHealth(deploymentId)`**
- Pod status (Running, Pending, CrashLoopBackOff, etc.)
- Restart count and last restart time
- Pod age and conditions (Ready, Scheduled, etc.)
- Resource usage: CPU/memory requests vs limits vs actual (via metrics API if available, graceful fallback if not)
- Container statuses (waiting reasons, terminated reasons)

**`getPodLogs(deploymentId, tailLines)`**
- Last N lines (default 100) of the primary container's logs
- Filters out noise, returns most recent relevant output
- Handles multi-container pods (pick the main app container)

**`getKubernetesEvents(namespace, deploymentName)`**
- Recent K8s events for the deployment's resources
- Filtered to last 1 hour
- Highlights: OOMKilled, CrashLoopBackOff, FailedScheduling, ImagePullBackOff, FailedMount

**`restartDeployment(deploymentId, reason)`**
- Checks cooldown (no restart within 30 min of last restart)
- Triggers `initiateUpgrade()` with same config (existing restart mechanism)
- Records the action with reasoning
- Returns success/failure + cooldown status

**`sendAlert(workspaceId, severity, title, body)`**
- Already skeletal from Step 41 — flesh out with proper formatting
- Severity levels affect Telegram emoji: critical = red circle, warning = yellow, info = blue
- Include deployment name, namespace, and timestamp in the message

### 2. Dependency Health Correlation

`src/lib/ops-agent/health.ts`:

- `getDependencyTree(deploymentId)` — walks `deployment.dependsOn` to build a dependency graph
- When analyzing a failed app, the agent checks dependencies first
- If PostgreSQL is down and 3 apps depend on it, the agent:
  1. Identifies the root cause (PostgreSQL)
  2. Attempts to fix PostgreSQL
  3. Sends ONE notification about the root cause affecting N apps
  4. Doesn't restart the dependent apps (they'll recover when the DB comes back)

### 3. Enhanced State Gathering

Update the state gathering in `loop.ts` to include:
- Restart counts for all running deployments (highlight any > 0)
- Deployments in FAILED status with error messages
- Dependencies map (which apps depend on which)
- Recent health-related events from `DeploymentEvent`
- Last restart time per deployment (for cooldown checking)

### 4. System Prompt Update

Update the ops system prompt to include health-specific guidance:
- Check FAILED deployments first
- Look for restart loops (high restart count in short time)
- Correlate dependency failures before acting on dependent apps
- Be conservative: restart once, then notify if it fails again
- Always include log excerpts in alerts when relevant

## Key Decisions

- Pod logs are retrieved via `@kubernetes/client-node` CoreV1Api `readNamespacedPodLog`
- K8s events via CoreV1Api `listNamespacedEvent` with field selectors
- Resource metrics via Metrics API (optional — gracefully degrade if metrics-server not installed)
- Cooldowns tracked via Redis TTL keys: `ops:cooldown:{deploymentId}:{action}`
- Dependency correlation is a pre-LLM step — the gathered state includes dependency info so the LLM can reason about it

## Testing

1. Deploy an app (e.g., uptime-kuma) and verify health tools report healthy status
2. Manually break an app (e.g., scale to 0 replicas) and wait for the next ops cycle
3. Verify: agent detects the issue, reads logs/events, attempts restart, sends Telegram notification
4. Verify cooldown: break the app again immediately — agent should notify but NOT restart (within 30-min cooldown)
5. Test dependency correlation: stop PostgreSQL, verify agent identifies it as root cause for dependent apps

## Files Changed

- `src/lib/ops-agent/tools.ts` — health monitoring tools
- `src/lib/ops-agent/health.ts` — dependency tree, health helpers
- `src/lib/ops-agent/loop.ts` — enhanced state gathering
- `src/lib/ops-agent/system-prompt.ts` — health-specific guidance
- `src/lib/ops-agent/guardrails.ts` — cooldown implementation
