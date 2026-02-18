# Mathison — Kubernetes Manifests

Plain YAML manifests for deploying Mathison to a Kubernetes cluster. No Helm, no Kustomize.

## Directory Structure

```
k8s/
└── base/
    ├── namespace.yaml       # mathison-system namespace
    ├── rbac.yaml            # ServiceAccount + ClusterRole + ClusterRoleBinding
    ├── configmap.yaml       # Non-secret configuration (Redis URL, mode, etc.)
    ├── secret.yaml          # Template for secrets (fill before applying)
    ├── postgres.yaml        # PostgreSQL 16 + pgvector StatefulSet + Services
    ├── redis.yaml           # Redis 7 StatefulSet + Services
    ├── migrate-job.yaml     # One-shot migration + seed Job
    ├── web.yaml             # Web Deployment (2 replicas) + Service
    ├── worker.yaml          # Worker Deployment (1 replica)
    └── ingress.yaml         # Ingress for web UI (nginx, SSE-optimized)
```

## Quick Start

### 1. Build Images

```bash
docker build --target web -t mathison-web .
docker build --target worker -t mathison-worker .
docker build --target migrate -t mathison-migrate .
```

For a kind cluster, load images after building:

```bash
kind load docker-image mathison-web --name mathison-dev
kind load docker-image mathison-worker --name mathison-dev
kind load docker-image mathison-migrate --name mathison-dev
```

### 2. Create Namespace & RBAC

```bash
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/rbac.yaml
```

### 3. Configure Secrets & Config

Generate secrets and edit `k8s/base/secret.yaml`:

```bash
# Generate values
PG_PASS=$(openssl rand -base64 24)
AUTH=$(openssl rand -base64 32)

echo "POSTGRES_PASSWORD: $PG_PASS"
echo "AUTH_SECRET:       $AUTH"
echo "DATABASE_URL:      postgresql://mathison:${PG_PASS}@postgres.mathison-system.svc.cluster.local:5432/mathison"
echo "ANTHROPIC_API_KEY: <your key>"
```

Fill in the values in `secret.yaml`, then configure `configmap.yaml`:
- Uncomment and set `AUTH_URL` to match your Ingress hostname (e.g. `https://mathison.example.com`)
- Uncomment and set `MATHISON_BASE_DOMAIN` if needed

Apply both:

```bash
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secret.yaml
```

### 4. Deploy Backing Services

```bash
kubectl apply -f k8s/base/postgres.yaml
kubectl apply -f k8s/base/redis.yaml
```

Wait for both to become ready:

```bash
kubectl -n mathison-system get pods -w
# Wait until postgres-0 and redis-0 show 1/1 Ready
```

### 5. Run Migrations

```bash
kubectl apply -f k8s/base/migrate-job.yaml
```

Watch the job:

```bash
kubectl -n mathison-system logs -f job/mathison-migrate
# Should end with "Done."
```

Wait for completion:

```bash
kubectl -n mathison-system wait --for=condition=complete job/mathison-migrate --timeout=120s
```

> **On new releases**: Delete the old job and re-apply before rolling out new images:
> ```bash
> kubectl -n mathison-system delete job mathison-migrate
> kubectl apply -f k8s/base/migrate-job.yaml
> ```

### 6. Deploy Application

```bash
kubectl apply -f k8s/base/web.yaml
kubectl apply -f k8s/base/worker.yaml
```

Watch rollout:

```bash
kubectl -n mathison-system rollout status deployment/mathison-web
kubectl -n mathison-system rollout status deployment/mathison-worker
```

### 7. Expose via Ingress

Edit `k8s/base/ingress.yaml`:
- Set your domain (replace `mathison.example.com`)
- Uncomment `ingressClassName` and set it for your cluster (nginx, traefik, etc.)
- Configure TLS (cert-manager or manual secret)

```bash
kubectl apply -f k8s/base/ingress.yaml
```

## Full Deploy Script

```bash
# 1. Namespace + RBAC
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/rbac.yaml

# 2. Config + Secrets (edit values first!)
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secret.yaml

# 3. Backing services
kubectl apply -f k8s/base/postgres.yaml
kubectl apply -f k8s/base/redis.yaml
kubectl -n mathison-system wait --for=condition=ready pod/postgres-0 --timeout=120s
kubectl -n mathison-system wait --for=condition=ready pod/redis-0 --timeout=120s

# 4. Migrations
kubectl -n mathison-system delete job mathison-migrate --ignore-not-found
kubectl apply -f k8s/base/migrate-job.yaml
kubectl -n mathison-system wait --for=condition=complete job/mathison-migrate --timeout=120s

# 5. Application
kubectl apply -f k8s/base/web.yaml
kubectl apply -f k8s/base/worker.yaml
kubectl -n mathison-system rollout status deployment/mathison-web --timeout=120s
kubectl -n mathison-system rollout status deployment/mathison-worker --timeout=120s

# 6. Ingress
kubectl apply -f k8s/base/ingress.yaml
```

## Verification

```bash
# All pods running
kubectl -n mathison-system get pods

# Web health (from inside the cluster or via port-forward)
kubectl -n mathison-system port-forward svc/mathison-web 3000:3000 &
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health?ready=true

# Worker health
kubectl -n mathison-system port-forward deployment/mathison-worker 8080:8080 &
curl http://localhost:8080/health

# Via Ingress (after DNS + TLS are configured)
curl https://mathison.example.com/api/health
```

## Resource Budgets

| Component  | Replicas | CPU Request | CPU Limit | Memory Request | Memory Limit | Storage |
|------------|----------|-------------|-----------|----------------|--------------|---------|
| Web        | 2        | 200m        | 1         | 256Mi          | 512Mi        | —       |
| Worker     | 1        | 100m        | 500m      | 256Mi          | 512Mi        | —       |
| PostgreSQL | 1        | 250m        | 1         | 512Mi          | 1Gi          | 10Gi    |
| Redis      | 1        | 50m         | 250m      | 64Mi           | 256Mi        | 1Gi     |
| **Total**  |          | **800m**    | **2.75**  | **1.3Gi**      | **2.7Gi**    | **11Gi**|

## Important Notes

### AUTH_URL Must Match Ingress Hostname

`AUTH_URL` in the ConfigMap must exactly match the URL users access (e.g. `https://mathison.example.com`). Mismatches break OAuth callbacks and CSRF checks.

### SSE Streaming Through Ingress

The Ingress annotations disable proxy buffering (`proxy-buffering: "off"`) and extend timeouts to 300s. Without these, AI chat responses will appear to hang because the reverse proxy buffers the streaming response. **Test streaming explicitly after setup.**

### Rolling Updates

Both web and worker use `maxSurge: 1, maxUnavailable: 0` for zero-downtime deploys. The web is stateless. The worker processes in-flight BullMQ jobs to completion during graceful shutdown (60s termination grace period).

### Image Tags

All manifests default to `:latest`. For production, pin to a specific tag or digest:

```bash
kubectl -n mathison-system set image deployment/mathison-web web=mathison-web:v1.0.0
kubectl -n mathison-system set image deployment/mathison-worker worker=mathison-worker:v1.0.0
```

### RBAC

The `mathison` ServiceAccount is shared by web and worker. The worker needs cluster-wide permissions to create/delete resources in tenant namespaces. See `rbac.yaml` for the full permission set.

### Tenant App Ingress

When users deploy apps (n8n, Uptime Kuma, MinIO, etc.), Mathison can create real K8s Ingress resources for each app. To enable this:

1. **Set `INGRESS_ENABLED: "true"`** in `configmap.yaml`
2. **Set `MATHISON_BASE_DOMAIN`** to your root domain (e.g. `mathison.io`). App URLs follow the pattern: `{app}-{workspace}.apps.{domain}` (e.g. `n8n-default.apps.mathison.io`)
3. **Configure a wildcard DNS record**: `*.apps.{domain}` pointing to your ingress controller
4. **Optionally set TLS**: `TLS_ENABLED: "true"` + `TLS_CLUSTER_ISSUER` for cert-manager integration

When disabled (default), apps use kubectl port-forwarding for local access. Database apps (PostgreSQL, Redis) never get Ingress — they're accessed via internal K8s DNS.

### Never Commit Secrets

`secret.yaml` contains empty placeholders. Never commit it with real values. Consider using Sealed Secrets, SOPS, or an external secrets operator for production.

## Connection Strings

The `DATABASE_URL` in the Secret should be:

```
postgresql://mathison:<POSTGRES_PASSWORD>@postgres.mathison-system.svc.cluster.local:5432/mathison
```

`REDIS_URL` is in the ConfigMap:

```
redis://redis.mathison-system.svc.cluster.local:6379
```
