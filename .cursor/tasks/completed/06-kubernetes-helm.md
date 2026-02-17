# Step 06 — Kubernetes & Helm Integration

## Goal

Build the Kubernetes client wrapper and Helm CLI wrapper that the deployer will use. These are the low-level building blocks: creating namespaces, listing pods, getting logs, running `helm install/upgrade/uninstall`, and managing ingress rules. After this step, we can talk to a K8s cluster and run Helm commands.

## Prerequisites

- Steps 01–05 completed (project, database, auth, catalog, AI agent)
- A local **kind** cluster: `brew install kind && kind create cluster --name mathison-dev`
- `helm` CLI installed locally (already at `/opt/homebrew/bin/helm`)
- kind automatically sets the kubectl context — no KUBECONFIG env var needed

## What to Build

### 1. Kubernetes Client Wrapper (`src/lib/cluster/kubernetes.ts`)

Wraps `@kubernetes/client-node` with higher-level functions:

```typescript
import * as k8s from "@kubernetes/client-node";

// Initialize client (supports in-cluster + kubeconfig)
function getKubeConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  if (process.env.KUBECONFIG) {
    kc.loadFromFile(process.env.KUBECONFIG);
  } else {
    kc.loadFromCluster(); // in-cluster service account
  }
  return kc;
}
```

Functions to implement:

- **`createNamespace(name, labels?)`** — Create K8s namespace (idempotent — skip if exists)
- **`deleteNamespace(name)`** — Delete namespace and all resources
- **`applyResourceQuota(namespace, quota)`** — Apply CPU/memory/storage quotas
- **`applyNetworkPolicy(namespace)`** — Default deny ingress from other tenant namespaces
- **`listPods(namespace, labelSelector?)`** — List pods with status
- **`getPodLogs(namespace, podName, lines?)`** — Get pod logs (tail N lines)
- **`getDeploymentStatus(namespace, name)`** — Check if deployment/statefulset is ready
- **`waitForReady(namespace, labelSelector, timeout?)`** — Poll until pods are ready or timeout
- **`listServices(namespace)`** — List K8s services
- **`getIngressUrl(namespace, name)`** — Get URL from Ingress resource

Each function should:
- Handle errors gracefully (wrap K8s API errors into readable messages)
- Log operations for debugging
- Never expose raw K8s internals in return values — return clean objects

### 2. Helm CLI Wrapper (`src/lib/cluster/helm.ts`)

Execute Helm commands via `execa` (subprocess). Always use `--output json` for parseable results.

```typescript
import { execa } from "execa";

interface HelmInstallOptions {
  releaseName: string;
  chart: string;
  namespace: string;
  values?: Record<string, any>;   // passed as --values <tmpfile>
  valuesYaml?: string;            // raw YAML string
  version?: string;               // chart version
  wait?: boolean;                  // --wait flag
  timeout?: string;                // --timeout (default "5m")
  createNamespace?: boolean;       // --create-namespace
}
```

Functions to implement:

- **`helmInstall(options)`** — `helm install` with values file
- **`helmUpgrade(options)`** — `helm upgrade` (same options)
- **`helmUninstall(releaseName, namespace)`** — `helm uninstall`
- **`helmStatus(releaseName, namespace)`** — `helm status --output json`
- **`helmList(namespace?)`** — `helm list --output json`
- **`addRepo(name, url)`** — `helm repo add` + `helm repo update`

Implementation details:
- Write values to a temp file, pass via `--values <path>`, delete after command completes
- Parse JSON output from Helm
- Capture stderr for error messages
- Set `KUBECONFIG` env var in subprocess if configured
- Always use `--namespace` flag
- Use `--wait` + `--timeout 5m` for installs/upgrades

### 3. Ingress Helper (`src/lib/cluster/ingress.ts`)

Utilities for managing ingress rules:

- **`detectIngressClass()`** — Auto-detect available ingress class (nginx, traefik, etc.)
- **`buildIngressSpec(options)`** — Generate K8s Ingress manifest from recipe's ingressConfig
  - Support: host-based routing, TLS with cert-manager annotation, custom ingress class
  - Template: `{serviceName}-{tenantSlug}.{domain}`
- **`createOrUpdateIngress(namespace, spec)`** — Apply ingress resource

### 4. Tenant Manager (`src/lib/tenant/manager.ts`)

Namespace lifecycle management for tenants:

- **`provisionTenant(tenant)`** — Create namespace + resource quota + network policy
- **`deprovisionTenant(tenantId)`** — Delete namespace and all resources
- **`updateQuota(tenantId, newQuota)`** — Update resource quota

```typescript
export async function provisionTenant(tenant: { slug: string; namespace: string; quota: any }) {
  // 1. Create namespace with labels (tenant-slug, managed-by: mathison)
  await createNamespace(tenant.namespace, {
    "mathison.io/tenant": tenant.slug,
    "mathison.io/managed-by": "mathison",
  });

  // 2. Apply resource quota
  await applyResourceQuota(tenant.namespace, tenant.quota);

  // 3. Apply default network policy (deny cross-tenant traffic)
  await applyNetworkPolicy(tenant.namespace);
}
```

### 5. Quota Helper (`src/lib/tenant/quota.ts`)

Helper functions for resource quota management:

- **`buildQuotaSpec(quota)`** — Convert `{cpu: "4", memory: "8Gi", storage: "50Gi"}` to K8s ResourceQuota spec
- **`checkQuotaAvailability(namespace, requested)`** — Check if deployment would exceed tenant quota

## Deliverables

- [ ] `createNamespace("tenant-test")` creates a namespace (idempotent)
- [ ] `applyResourceQuota("tenant-test", {cpu: "4", memory: "8Gi"})` applies quota
- [ ] `helmInstall({releaseName: "test-pg", chart: "bitnami/postgresql", namespace: "tenant-test", ...})` installs a chart
- [ ] `helmStatus("test-pg", "tenant-test")` returns parsed JSON status
- [ ] `helmUninstall("test-pg", "tenant-test")` removes the release
- [ ] `getPodLogs("tenant-test", "test-pg-0", 50)` returns log lines
- [ ] `waitForReady("tenant-test", "app.kubernetes.io/name=postgresql", 120)` polls until pods are ready
- [ ] `provisionTenant({slug: "acme", namespace: "tenant-acme", quota: ...})` creates full tenant namespace
- [ ] All functions handle errors gracefully (no raw K8s stack traces in return values)

## Key Files

```
src/lib/
├── cluster/
│   ├── kubernetes.ts    # K8s client wrapper
│   ├── helm.ts          # Helm CLI wrapper (execa)
│   └── ingress.ts       # Ingress helper
└── tenant/
    ├── manager.ts       # Tenant namespace lifecycle
    └── quota.ts         # Resource quota helpers
```

## Notes

- **Helm CLI is the stable interface** — never use a Helm SDK or library. The CLI with `--output json` is the correct approach.
- **`execa`** is already in dependencies from Step 01. Import as `import { execa } from "execa"`.
- **Temp files for values**: use `os.tmpdir()` and `crypto.randomUUID()` for temp file names. Clean up in a `finally` block.
- **No cloud-provider-specific code.** These wrappers must work on any K8s cluster (k3s, EKS, GKE, kind, etc.).
- **Error handling**: catch K8s API errors (409 Conflict for "already exists", 404 for "not found") and handle them gracefully rather than throwing.
- The tenant provisioning in Step 03's signup flow should now be wired to call `provisionTenant` instead of the placeholder.
