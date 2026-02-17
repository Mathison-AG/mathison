# Step 32 — K8s Manifests: Namespace + RBAC

## Goal

Create the foundational Kubernetes manifests for deploying Mathison: the system namespace, ServiceAccount, and RBAC rules. These grant the web and worker pods permission to manage tenant namespaces and resources.

## Prerequisites

- Step 30 (production Dockerfile) — for testing, though manifests can be written first

## What to Build

### 1. Manifest Directory Structure

```
k8s/
├── base/                    # Raw manifests (no templating)
│   ├── namespace.yaml       # mathison-system namespace
│   ├── rbac.yaml           # ServiceAccount + ClusterRole + ClusterRoleBinding
│   ├── configmap.yaml      # Non-secret configuration
│   ├── secret.yaml         # Template for secrets (values injected at deploy time)
│   ├── postgres.yaml       # PostgreSQL StatefulSet (Step 33)
│   ├── redis.yaml          # Redis StatefulSet (Step 33)
│   ├── web.yaml            # Web Deployment + Service (Step 34)
│   ├── worker.yaml         # Worker Deployment (Step 34)
│   ├── ingress.yaml        # Ingress for web UI (Step 34)
│   └── migrate-job.yaml    # One-shot migration Job (Step 34)
└── README.md               # Deployment instructions
```

All manifests are plain YAML — no Helm, no Kustomize for now. Keep it simple and auditable.

### 2. Namespace (`namespace.yaml`)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: mathison-system
  labels:
    app.kubernetes.io/name: mathison
    app.kubernetes.io/managed-by: mathison
```

### 3. RBAC (`rbac.yaml`)

**ServiceAccount**: Used by both web and worker pods.

**ClusterRole** — needs permissions to:

| Resource | Verbs | Why |
|----------|-------|-----|
| namespaces | create, get, list, delete | Workspace provisioning |
| deployments, statefulsets, daemonsets | get, list, create, patch, delete | SSA apply/delete for tenant apps |
| services | get, list, create, patch, delete | Service creation for tenant apps |
| secrets | get, list, create, patch, delete | Secret management for tenant apps |
| configmaps | get, list, create, patch, delete | ConfigMap management for tenant apps |
| persistentvolumeclaims | get, list, create, delete | PVC management for StatefulSets |
| ingresses | get, list, create, patch, delete | Tenant app ingress |
| networkpolicies | get, list, create, patch, delete | Tenant isolation |
| resourcequotas | get, list, create, patch, delete | Workspace quotas |
| pods | get, list, watch | Pod status monitoring |
| pods/log | get | Log retrieval |
| pods/exec | create | Data export/import |
| nodes | get, list | Cluster stats |
| pods (all namespaces) | list | Cluster-wide pod counting |

**ClusterRoleBinding**: Binds the ClusterRole to the ServiceAccount in `mathison-system`.

### 4. ConfigMap (`configmap.yaml`)

Non-secret configuration:

```yaml
data:
  MATHISON_MODE: "self-hosted"
  NODE_ENV: "production"
  # MATHISON_BASE_DOMAIN set per deployment
```

### 5. Secret Template (`secret.yaml`)

Template with placeholder comments — actual values are set during deployment:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mathison-secrets
  namespace: mathison-system
type: Opaque
stringData:
  AUTH_SECRET: ""           # Generate with: openssl rand -base64 32
  ANTHROPIC_API_KEY: ""     # Your Anthropic API key
  DATABASE_URL: ""          # Set after PostgreSQL is up
  REDIS_URL: ""             # Set after Redis is up
```

## Verification

- [ ] `kubectl apply -f k8s/base/namespace.yaml` creates the namespace
- [ ] `kubectl apply -f k8s/base/rbac.yaml` creates SA + ClusterRole + binding
- [ ] `kubectl auth can-i create namespaces --as=system:serviceaccount:mathison-system:mathison` returns `yes`
- [ ] `kubectl auth can-i create deployments --as=system:serviceaccount:mathison-system:mathison --all-namespaces` returns `yes`
- [ ] Permissions are scoped to required resource types only (no wildcard `*`)

## Notes

- We're using a cluster-scoped ClusterRole for simplicity. This can be tightened later to per-namespace Roles created dynamically when workspaces are provisioned.
- The ServiceAccount name `mathison` is used by both web and worker. If we later need different permission levels, split into `mathison-web` and `mathison-worker`.
