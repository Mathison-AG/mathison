# Step 33 — K8s Manifests: PostgreSQL + Redis

## Goal

Create Kubernetes manifests to run PostgreSQL (with pgvector) and Redis inside the cluster as Mathison's backing services. These are Mathison's own databases — not tenant workloads.

## Prerequisites

- Step 32 (namespace + RBAC) — the `mathison-system` namespace must exist

## What to Build

### 1. PostgreSQL StatefulSet (`postgres.yaml`)

**Image**: `pgvector/pgvector:pg16` (official PostgreSQL 16 + pgvector extension)

**Resources**:
- StatefulSet with 1 replica
- PVC: 10Gi (configurable)
- Service: ClusterIP on port 5432
- Resource requests: 250m CPU, 512Mi memory
- Resource limits: 1 CPU, 1Gi memory

**Configuration**:
- Database name: `mathison`
- User: `mathison`
- Password: from Secret reference
- pgvector extension: auto-enabled via init script or the image includes it

**Init**: Create the pgvector extension on first boot:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
This can be done via a ConfigMap-mounted init script (`/docker-entrypoint-initdb.d/`).

**Probes**:
- Liveness: `pg_isready -U mathison`
- Readiness: `pg_isready -U mathison`
- Startup: same with generous timeout (60s)

### 2. Redis StatefulSet (`redis.yaml`)

**Image**: `redis:7-alpine`

**Resources**:
- StatefulSet with 1 replica (or Deployment if persistence isn't critical)
- Optional PVC: 1Gi (BullMQ jobs are transient, but nice to survive restarts)
- Service: ClusterIP on port 6379
- Resource requests: 50m CPU, 64Mi memory
- Resource limits: 250m CPU, 256Mi memory

**Configuration**:
- No password for now (internal cluster network, protected by NetworkPolicy)
- Or: password from Secret if we want defense-in-depth
- `maxmemory-policy: allkeys-lru` (sensible default)

**Probes**:
- Liveness: `redis-cli ping`
- Readiness: `redis-cli ping`

### 3. Services

Each StatefulSet needs a headless Service (for stable DNS) and optionally a ClusterIP Service (for simple `postgres.mathison-system.svc.cluster.local` access).

**PostgreSQL service DNS**: `postgres.mathison-system.svc.cluster.local:5432`
**Redis service DNS**: `redis.mathison-system.svc.cluster.local:6379`

These hostnames go into the ConfigMap/Secret as `DATABASE_URL` and `REDIS_URL`.

### 4. Resulting Connection Strings

```
DATABASE_URL=postgresql://mathison:<password>@postgres.mathison-system.svc.cluster.local:5432/mathison
REDIS_URL=redis://redis.mathison-system.svc.cluster.local:6379
```

## Verification

- [ ] PostgreSQL StatefulSet starts and becomes ready
- [ ] `kubectl exec` into postgres pod, run `psql -U mathison -c "SELECT 1"` succeeds
- [ ] pgvector extension is available: `SELECT * FROM pg_extension WHERE extname = 'vector'`
- [ ] Redis StatefulSet starts and becomes ready
- [ ] `kubectl exec` into redis pod, run `redis-cli ping` returns `PONG`
- [ ] Services resolve from other pods in the namespace
- [ ] Data survives pod restart (PVC persistence)
- [ ] Resource limits are applied

## Notes

- This is Mathison's own infrastructure DB, not a tenant deployment. It lives in `mathison-system` namespace.
- For production hardening later: consider backup CronJobs (pg_dump to S3), connection pooling (PgBouncer), and migration to a managed service.
- PostgreSQL password should be in the `mathison-secrets` Secret created in Step 32.
