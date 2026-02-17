# Step 18 — App Access & URL Management

## Goal

Make installed apps easily accessible via clean, predictable URLs. Each app gets a URL that users can bookmark and share. Handle the connection between Kubernetes services and user-facing URLs, with support for local development (port-forward) and future production (ingress/custom domains). After this step, clicking "Open" on an installed app actually takes you to that app.

## Prerequisites

- Steps 12–17 completed (app store, install, my apps, agent, onboarding)
- Kind cluster running with at least one deployed app
- Ingress config in recipe data

## What to Build

### 1. URL Strategy

For local/kind development:
- Apps get URLs via `kubectl port-forward` (automated)
- URL pattern: `http://localhost:{port}` where port is auto-assigned from a range (10000-10999)
- Port mapping stored in the Deployment record

For production (future):
- Apps get URLs via K8s Ingress: `https://{app-name}-{workspace}.{base-domain}`
- Or wildcard: `https://{app-name}.{username}.mathison.app`
- Custom domain support via Ingress + cert-manager

This step implements the local strategy and lays groundwork for production.

### 2. Port Manager (`src/lib/cluster/port-manager.ts`)

Manages local port assignments for kind clusters:

```typescript
interface PortAssignment {
  deploymentId: string;
  localPort: number;
  servicePort: number;
  serviceName: string;
  namespace: string;
}

export async function assignPort(deploymentId: string): Promise<number>
// Finds the next available port in range 10000-10999
// Stores assignment in database (or in-memory map for MVP)

export async function releasePort(deploymentId: string): Promise<void>
// Frees the port when app is removed

export async function getPortAssignment(deploymentId: string): Promise<PortAssignment | null>
```

### 3. Auto Port-Forward (`src/lib/cluster/port-forward.ts`)

Start port-forwarding automatically when an app reaches RUNNING state:

```typescript
export async function startPortForward(params: {
  namespace: string;
  serviceName: string;
  servicePort: number;
  localPort: number;
}): Promise<{ pid: number; url: string }>

export async function stopPortForward(deploymentId: string): Promise<void>

export async function isPortForwardActive(deploymentId: string): Promise<boolean>
```

Options for implementation:
- **Option A**: Use `child_process.spawn` for `kubectl port-forward` (simplest, works with kind)
- **Option B**: Use `@kubernetes/client-node` portForward API (more robust, no kubectl dependency)
- Recommend Option A for MVP — it's simpler and reliable with kind

### 4. Update Deployment URL on Ready

In the worker, after a deployment reaches RUNNING state:
1. Determine the K8s service name from the Helm release (using recipe's `ingressConfig` or convention)
2. Determine the service port (from recipe metadata or by querying the Service resource)
3. Assign a local port
4. Start port-forward
5. Update `deployment.url` with `http://localhost:{localPort}`

### 5. Add Port/URL Fields to Deployment

Add to Prisma schema if needed:

```prisma
model Deployment {
  // ... existing fields
  localPort    Int?       @map("local_port")    // Port-forward local port
  servicePort  Int?       @map("service_port")  // K8s service port
  serviceName  String?    @map("service_name")  // K8s service name
}
```

### 6. "Open App" Button Logic (`src/components/my-apps/open-button.tsx`)

Smart open button:
- If `deployment.url` exists and port-forward is active → open in new tab
- If port-forward is down → restart it, then open
- If no URL → show "URL not available yet" tooltip
- For apps without a web UI (like databases) → show connection info instead of "Open"

Determine if an app has a web UI from recipe metadata. Add a `hasWebUI: boolean` field to recipes:
- n8n: true → "Open n8n"
- Uptime Kuma: true → "Open Uptime Kuma"
- PostgreSQL: false → "View Connection Info"
- Redis: false → "View Connection Info"
- MinIO: true → "Open MinIO Console"

### 7. Connection Info Dialog (`src/components/my-apps/connection-info.tsx`)

For apps without web UIs (databases, caches):

```
┌──────────────────────────────────┐
│  PostgreSQL Connection Details   │
│                                  │
│  Host: localhost                 │
│  Port: 10003                     │
│  Database: app                   │
│  Username: postgres              │
│  Password: ••••••• [👁 Show]     │
│                                  │
│  Connection String:              │
│  postgresql://postgres:***@      │
│  localhost:10003/app             │
│  [📋 Copy]                       │
│                                  │
└──────────────────────────────────┘
```

- Read credentials from K8s Secret (using `readK8sSecret` from deployer)
- Copy-to-clipboard button
- Show/hide password toggle
- Format connection string for the specific database type

### 8. Health-Check Port Forwards

Add a periodic check (every 60s) that verifies port-forwards are still active:
- If a port-forward process died → restart it
- If an app was removed → clean up the port-forward
- Run this in the worker or as a cron-style job

### 9. Update Recipe Seed Data

Add `hasWebUI` and default port info to each recipe:

| Recipe | hasWebUI | Default Port | Service Name Pattern |
|--------|----------|-------------|---------------------|
| PostgreSQL | false | 5432 | `{release}-postgresql` |
| Redis | false | 6379 | `{release}-redis-master` |
| n8n | true | 5678 | `{release}-n8n` |
| Uptime Kuma | true | 3001 | `{release}-uptime-kuma` |
| MinIO | true | 9001 (console) | `{release}-minio` |

## Deliverables

- [ ] Installed apps with web UIs have working "Open" buttons
- [ ] Port-forwarding starts automatically when apps reach RUNNING state
- [ ] Port assignments are tracked and don't conflict
- [ ] Database apps show connection info dialog instead of "Open"
- [ ] Connection details include copy-to-clipboard
- [ ] Port-forwards are restarted if they die
- [ ] URLs are stored on the Deployment record
- [ ] "Open" works reliably after page refresh
- [ ] Port-forwards are cleaned up when apps are removed
- [ ] `yarn typecheck` passes

## Key Files

```
src/
├── lib/cluster/
│   ├── port-manager.ts              # NEW — port assignment logic
│   └── port-forward.ts             # NEW — auto port-forward
├── components/my-apps/
│   ├── open-button.tsx              # NEW — smart open/connection button
│   └── connection-info.tsx          # NEW — connection details dialog
├── prisma/
│   └── schema.prisma               # Updated Deployment + Recipe fields
worker/
└── main.ts                          # Updated — start port-forward on RUNNING
```

## Notes

- Port-forwarding is a **local development** solution. In production, apps would be accessed via Ingress with proper DNS. This step focuses on making the local experience work well.
- Port-forward processes are child processes — they'll die if the worker/web server restarts. The health check loop handles recovery.
- An alternative to port-forwarding is using `kubectl proxy` or the K8s API server proxy. Port-forward is simpler and more portable.
- For the connection info dialog, credentials are read from K8s Secrets, not from the database. The deployment engine already stores secret references.
- The `hasWebUI` field on Recipe is a simple boolean. A more nuanced approach would be to specify "access modes" (web, TCP, API), but boolean is enough for MVP.
- Consider: in production, all of this gets replaced by Ingress rules + DNS. The port-manager and port-forward modules are only needed for local/development mode. Gate them behind `MATHISON_MODE === "self-hosted"` or similar.
