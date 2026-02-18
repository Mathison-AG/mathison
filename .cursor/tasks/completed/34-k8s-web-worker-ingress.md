# Step 34 — K8s Manifests: Web + Worker + Ingress

## Goal

Create Kubernetes manifests for Mathison's application layer: the Next.js web Deployment, the BullMQ worker Deployment, an Ingress for the web UI, and a database migration Job. After this step, the full Mathison stack can run in Kubernetes.

## Prerequisites

- Step 30 (production Dockerfile) — images must be buildable
- Step 31 (health endpoints) — probes need endpoints to hit
- Step 32 (namespace + RBAC) — ServiceAccount must exist
- Step 33 (PostgreSQL + Redis) — backing services must be running

## What to Build

### 1. Migration Job (`migrate-job.yaml`)

A one-shot Job that runs before the app starts:

- Runs `npx prisma migrate deploy` against the production database
- Runs `npx prisma db seed` (idempotent — seeds only if data is missing)
- Uses the `web` image (has Prisma CLI + migration files)
- References the same Secret for `DATABASE_URL`
- `restartPolicy: OnFailure`, `backoffLimit: 3`

This replaces the `setup` service from docker-compose. Run it manually or as part of a deploy script before rolling out new versions.

### 2. Web Deployment (`web.yaml`)

**Deployment**:
- Replicas: 2 (HA, can scale horizontally)
- Image: `mathison-web:<tag>`
- ServiceAccount: `mathison` (from Step 32)
- Port: 3000

**Environment** (from ConfigMap + Secret):
- `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `AUTH_URL`
- `ANTHROPIC_API_KEY`, `LLM_PROVIDER`
- `MATHISON_MODE`, `MATHISON_BASE_DOMAIN`
- `NODE_ENV=production`

**Probes**:
- Startup: `httpGet /api/health`, `initialDelaySeconds: 5`, `periodSeconds: 5`, `failureThreshold: 12`
- Liveness: `httpGet /api/health`, `periodSeconds: 15`, `failureThreshold: 3`
- Readiness: `httpGet /api/health?ready=true`, `periodSeconds: 10`, `failureThreshold: 2`

**Resources**:
- Requests: 200m CPU, 256Mi memory
- Limits: 1 CPU, 512Mi memory

**Service**: ClusterIP on port 3000, selector matches the web pods.

### 3. Worker Deployment (`worker.yaml`)

**Deployment**:
- Replicas: 1 (can scale, but BullMQ handles concurrency internally)
- Image: `mathison-worker:<tag>`
- ServiceAccount: `mathison` (from Step 32) — this is critical, the worker needs RBAC
- No port exposed (worker doesn't serve HTTP... unless health endpoint is added in Step 31)

**Environment**: Same as web minus `AUTH_URL`.

**Probes** (if Step 31 adds worker health HTTP):
- Liveness: `httpGet :8080/health`, `periodSeconds: 15`
- Readiness: `httpGet :8080/health`, `periodSeconds: 10`

**Resources**:
- Requests: 100m CPU, 256Mi memory
- Limits: 500m CPU, 512Mi memory

**Note**: The worker's ServiceAccount is what gives it permission to create/delete resources in tenant namespaces. Without this, all deployments will fail with 403.

### 4. Ingress (`ingress.yaml`)

Route the main Mathison web UI:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mathison-web
  namespace: mathison-system
  annotations:
    # Adjust for your ingress controller (nginx, traefik, etc.)
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
spec:
  ingressClassName: nginx  # or traefik, etc.
  tls:
    - hosts:
        - mathison.yourdomain.com
      secretName: mathison-tls  # cert-manager or manual
  rules:
    - host: mathison.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mathison-web
                port:
                  number: 3000
```

**Important annotations for SSE** (AI chat streaming):
- Increase proxy timeouts (streaming responses can last minutes)
- Disable buffering: `nginx.ingress.kubernetes.io/proxy-buffering: "off"` (critical for SSE)
- Large body size for data import uploads

### 5. Deployment Script / README

A simple `k8s/README.md` with the deployment order:

```bash
# 1. Create namespace + RBAC
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/rbac.yaml

# 2. Create secrets (edit values first!)
kubectl apply -f k8s/base/secret.yaml

# 3. Deploy backing services
kubectl apply -f k8s/base/postgres.yaml
kubectl apply -f k8s/base/redis.yaml
# Wait for postgres + redis to be ready

# 4. Run migrations
kubectl apply -f k8s/base/migrate-job.yaml
# Wait for job completion

# 5. Deploy application
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/web.yaml
kubectl apply -f k8s/base/worker.yaml
kubectl apply -f k8s/base/ingress.yaml
```

## Verification

- [ ] Migration Job runs successfully (check logs for "All migrations applied")
- [ ] Web Deployment reaches 2/2 ready replicas
- [ ] Worker Deployment reaches 1/1 ready
- [ ] Web pods pass liveness and readiness probes
- [ ] `curl https://mathison.yourdomain.com/api/health` returns 200
- [ ] Login works via the Ingress URL
- [ ] AI chat streaming works through the Ingress (SSE not broken by proxy buffering)
- [ ] Worker can create a namespace (test: deploy an app via chat)

## Notes

- `AUTH_URL` must match the Ingress hostname (e.g., `https://mathison.yourdomain.com`). Mismatches break OAuth callbacks.
- SSE streaming through Ingress requires disabling proxy buffering — test this explicitly or chat will appear to hang.
- The migration Job should be re-run on every new release (before rolling out new web/worker images). Consider a CI/CD hook for this.
- Rolling updates: default strategy is fine. The web is stateless. The worker processes in-flight jobs to completion (BullMQ handles graceful shutdown).
