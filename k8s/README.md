# Mathison — Kubernetes Manifests

Plain YAML manifests for deploying Mathison to a Kubernetes cluster. No Helm, no Kustomize.

## Directory Structure

```
k8s/
└── base/
    ├── namespace.yaml       # mathison-system namespace
    ├── rbac.yaml            # ServiceAccount + ClusterRole + ClusterRoleBinding
    ├── configmap.yaml       # Non-secret configuration (DB host, Redis URL, etc.)
    ├── secret.yaml          # Template for secrets (fill before applying)
    ├── postgres.yaml        # PostgreSQL 16 + pgvector StatefulSet + Services
    ├── redis.yaml           # Redis 7 StatefulSet + Services
    ├── web.yaml             # Web Deployment + Service (future)
    ├── worker.yaml          # Worker Deployment (future)
    ├── ingress.yaml         # Ingress for web UI (future)
    └── migrate-job.yaml     # One-shot migration Job (future)
```

## Quick Start

### 1. Create Namespace & RBAC

```bash
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/rbac.yaml
```

### 2. Configure Secrets

Edit `k8s/base/secret.yaml` and fill in the values:

```bash
# Generate secrets
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 24   # → POSTGRES_PASSWORD

# Then edit the file with your values
$EDITOR k8s/base/secret.yaml
```

Apply config and secrets:

```bash
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secret.yaml
```

### 3. Deploy PostgreSQL & Redis

```bash
kubectl apply -f k8s/base/postgres.yaml
kubectl apply -f k8s/base/redis.yaml
```

Wait for pods to become ready:

```bash
kubectl -n mathison-system get pods -w
```

### 4. Verify Backing Services

**PostgreSQL**:

```bash
# Pod is running and ready
kubectl -n mathison-system get statefulset postgres

# Connect and run a query
kubectl -n mathison-system exec -it postgres-0 -- \
  psql -U mathison -c "SELECT 1"

# pgvector extension is loaded
kubectl -n mathison-system exec -it postgres-0 -- \
  psql -U mathison -c "SELECT * FROM pg_extension WHERE extname = 'vector'"
```

**Redis**:

```bash
# Pod is running and ready
kubectl -n mathison-system get statefulset redis

# Ping
kubectl -n mathison-system exec -it redis-0 -- redis-cli ping
```

**Service DNS** (from any pod in the namespace):

```
postgres.mathison-system.svc.cluster.local:5432
redis.mathison-system.svc.cluster.local:6379
```

### 5. Verify RBAC

```bash
kubectl auth can-i create namespaces \
  --as=system:serviceaccount:mathison-system:mathison

kubectl auth can-i create deployments \
  --as=system:serviceaccount:mathison-system:mathison \
  --all-namespaces

kubectl auth can-i get pods/log \
  --as=system:serviceaccount:mathison-system:mathison \
  --all-namespaces

kubectl auth can-i create pods/exec \
  --as=system:serviceaccount:mathison-system:mathison \
  --all-namespaces
```

All commands should return `yes`.

## Connection Strings

The web and worker pods will construct `DATABASE_URL` from the ConfigMap fields + secret password:

```
DATABASE_URL=postgresql://mathison:<password>@postgres.mathison-system.svc.cluster.local:5432/mathison
REDIS_URL=redis://redis.mathison-system.svc.cluster.local:6379
```

`REDIS_URL` is in the ConfigMap directly. `DATABASE_URL` must be assembled by the web/worker deployment (future step) since it contains a secret reference.

## Resource Budgets

| Service    | CPU Request | CPU Limit | Memory Request | Memory Limit | Storage |
|------------|-------------|-----------|----------------|--------------|---------|
| PostgreSQL | 250m        | 1         | 512Mi          | 1Gi          | 10Gi    |
| Redis      | 50m         | 250m      | 64Mi           | 256Mi        | 1Gi     |

## RBAC Permissions Summary

The `mathison` ClusterRole grants permissions needed by both web and worker pods:

| Resource | Verbs | Purpose |
|----------|-------|---------|
| namespaces | create, get, list, delete | Workspace provisioning |
| deployments, statefulsets, daemonsets | get, list, create, patch, delete | SSA apply/delete for tenant apps |
| services | get, list, create, patch, delete | Service creation for tenant apps |
| secrets | get, list, create, patch, delete | Secret management for tenant apps |
| configmaps | get, list, create, patch, delete | ConfigMap management |
| persistentvolumeclaims | get, list, create, delete | PVC management for StatefulSets |
| ingresses | get, list, create, patch, delete | Tenant app ingress |
| networkpolicies | get, list, create, patch, delete | Tenant network isolation |
| resourcequotas | get, list, create, patch, delete | Workspace quotas |
| pods | get, list, watch | Pod status monitoring |
| pods/log | get | Log retrieval |
| pods/exec | create | Data export/import |
| nodes | get, list | Cluster stats |

## Notes

- All resources use the `app.kubernetes.io/managed-by: mathison` label.
- PostgreSQL uses `pgvector/pgvector:pg16` which includes the vector extension. An init script creates the extension on first boot.
- Redis uses AOF persistence (`appendonly yes`) so BullMQ jobs survive pod restarts.
- Redis runs without authentication (protected by K8s network policies in production).
- The `mathison` ServiceAccount is shared by web and worker pods. Split into `mathison-web` and `mathison-worker` if you need different permission levels later.
- Never commit `secret.yaml` with real values. The file in this repo is a template with empty placeholders.
