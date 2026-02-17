# Step 31 — Health Check Endpoints

## Goal

Add health and readiness endpoints for the web app and a health reporting mechanism for the worker. Kubernetes liveness and readiness probes need something to hit — without these, K8s can't properly manage pod lifecycle.

## Prerequisites

- None (can be done independently, useful even in local dev)

## What to Build

### 1. Web Health Endpoint (`src/app/api/health/route.ts`)

A lightweight endpoint for K8s probes:

```
GET /api/health → 200 { status: "ok", uptime: 1234 }
GET /api/health?ready=true → 200/503 (checks DB + Redis connectivity)
```

**Liveness** (`/api/health`): Always returns 200 if the process is alive. No dependency checks — this is for restart decisions only.

**Readiness** (`/api/health?ready=true`): Checks that the app can actually serve traffic:
- PostgreSQL connection (quick `SELECT 1`)
- Redis connection (quick `PING`)
- Returns 503 if either is down (K8s removes pod from Service endpoints)

Keep it fast — probe timeout is typically 3-5s. No auth required.

### 2. Worker Health Mechanism

The worker doesn't serve HTTP, so we need an alternative:

**Option A — HTTP sidecar**: Add a tiny HTTP server (e.g., `http.createServer`) in the worker process that responds to health checks on a dedicated port (e.g., 8080).

**Option B — File-based liveness**: Worker writes a timestamp to `/tmp/healthy` every N seconds. Use an `exec` liveness probe: `test $(( $(date +%s) - $(cat /tmp/healthy) )) -lt 30`.

**Option A is preferred** — simpler to configure in K8s, more reliable, and lets us check BullMQ connection state:

```
GET :8080/health → 200 { status: "ok", queue: "connected", uptime: 1234 }
GET :8080/health → 503 { status: "unhealthy", queue: "disconnected" }
```

Check:
- Redis/BullMQ connection is alive
- Worker is actively processing (not hung)

### 3. Startup Probe Consideration

Next.js can take 10-30s to start in production (especially first request that triggers compilation). Use a startup probe with generous settings:
- `initialDelaySeconds: 5`
- `periodSeconds: 5`
- `failureThreshold: 12` (gives 60s to start)

After startup succeeds, liveness probe takes over with tighter settings.

## Verification

- [ ] `GET /api/health` returns 200 with status info
- [ ] `GET /api/health?ready=true` returns 200 when DB + Redis are up
- [ ] `GET /api/health?ready=true` returns 503 when DB or Redis is down
- [ ] Worker health server starts on port 8080
- [ ] Worker health returns connected/disconnected based on Redis state
- [ ] No auth required for health endpoints
- [ ] Health endpoints are excluded from auth middleware matcher
