# Mathison — Kubernetes Manifests

Plain YAML manifests for deploying Mathison to a Kubernetes cluster. No Helm, no Kustomize.

## Directory Structure

```
k8s/
└── base/
    ├── namespace.yaml       # mathison-system namespace
    ├── rbac.yaml            # ServiceAccount + ClusterRole + ClusterRoleBinding
    ├── configmap.yaml       # Non-secret configuration
    ├── secret.yaml          # Template for secrets (fill before applying)
    ├── postgres.yaml        # PostgreSQL StatefulSet (future)
    ├── redis.yaml           # Redis StatefulSet (future)
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
# Generate an auth secret
openssl rand -base64 32

# Then edit the file with your values
$EDITOR k8s/base/secret.yaml
```

Apply config and secrets:

```bash
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secret.yaml
```

### 3. Verify RBAC

```bash
# ServiceAccount can create namespaces (workspace provisioning)
kubectl auth can-i create namespaces \
  --as=system:serviceaccount:mathison-system:mathison

# ServiceAccount can manage deployments in any namespace
kubectl auth can-i create deployments \
  --as=system:serviceaccount:mathison-system:mathison \
  --all-namespaces

# ServiceAccount can read pod logs
kubectl auth can-i get pods/log \
  --as=system:serviceaccount:mathison-system:mathison \
  --all-namespaces

# ServiceAccount can exec into pods (data export/import)
kubectl auth can-i create pods/exec \
  --as=system:serviceaccount:mathison-system:mathison \
  --all-namespaces
```

All commands should return `yes`.

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
- The `mathison` ServiceAccount is shared by web and worker pods. Split into `mathison-web` and `mathison-worker` if you need different permission levels later.
- The ClusterRole is cluster-scoped for simplicity. It can be tightened to per-namespace Roles created dynamically when workspaces are provisioned.
- Never commit `secret.yaml` with real values. The file in this repo is a template with empty placeholders.
