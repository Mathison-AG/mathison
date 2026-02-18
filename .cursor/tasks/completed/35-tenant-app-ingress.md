# Step 35 — Tenant App Ingress (Production Mode)

## Goal

Replace the local-dev port-forward pattern with real Kubernetes Ingress resources for tenant apps. When a user deploys n8n, Uptime Kuma, or MinIO, the app should be accessible via a real URL (e.g., `n8n-myworkspace.apps.yourdomain.com`) instead of `localhost:10042`. This is the final step to make Mathison fully functional in a production K8s cluster.

## Prerequisites

- Steps 30–34 complete (Mathison running in K8s)
- Wildcard DNS record pointing to the cluster's ingress controller (e.g., `*.apps.yourdomain.com`)
- Ingress controller installed in the cluster (nginx-ingress, Traefik, etc.)
- cert-manager (optional but recommended for automatic TLS)

## What to Build

### 1. Environment-Aware Ingress in Recipes

The recipe system already has `ingressConfig` on web app recipes. Update the ingress builder to generate real Ingress resources in production mode:

**Detection**: Use `MATHISON_MODE` env var or `MATHISON_BASE_DOMAIN`:
- Local dev (`MATHISON_MODE=self-hosted` + localhost): Skip ingress, rely on port-forward
- Production: Generate Ingress resource with the proper hostname

**Hostname pattern**: `{deploymentName}.{workspaceSlug}.apps.{baseDomain}`  
Example: `n8n.default.apps.mathison.io`

Or simpler: `{deploymentName}-{workspaceSlug}.apps.{baseDomain}`  
Example: `n8n-default.apps.mathison.io`

Update `src/recipes/_base/builders.ts` ingress builder to use the configured base domain.

### 2. Update Recipe Archetype Ingress Generation

The `webApp()` and `objectStore()` archetypes already produce Ingress resources when `ingress.enabled` is true. Ensure:

- Hostname uses the real domain pattern (not localhost)
- TLS section references a wildcard cert or cert-manager annotation
- Ingress class name is configurable via env var (`MATHISON_INGRESS_CLASS`, default: `nginx`)
- Annotations include SSE-friendly settings for apps that stream

### 3. Store Generated URL on Deployment

When a tenant app is deployed with Ingress:
- Compute the URL and store it on the Deployment record (new field or use existing `accessUrl` if present)
- The "Open" button in My Apps uses this URL instead of `localhost:{localPort}`
- Connection info API returns this URL

### 4. Conditional Port-Forward

The existing port-forward logic in the worker should be **conditional**:
- **Local dev**: Port-forward as today (kind cluster, no ingress controller)
- **Production**: Skip port-forward entirely, Ingress handles routing

Detection: Check if `MATHISON_INGRESS_ENABLED=true` (or similar env var). When enabled:
- `startPortForward()` becomes a no-op
- `stopPortForward()` becomes a no-op  
- Health check loop skips port-forward restart

### 5. Update Access URL Resolution

Currently, the "Open" button and connection info use `localhost:{localPort}`. Update:

- `GET /api/deployments/[id]/access` — return the Ingress URL when available
- My Apps "Open" button — use Ingress URL
- AI agent tool responses — include the real URL

### 6. TLS / Cert-Manager Integration

For automatic TLS on tenant app Ingresses:

```yaml
annotations:
  cert-manager.io/cluster-issuer: "letsencrypt-prod"  # configurable
spec:
  tls:
    - hosts:
        - n8n-default.apps.mathison.io
      secretName: n8n-default-tls
```

Make the cluster-issuer name configurable via `MATHISON_CERT_ISSUER` env var. If not set, skip TLS (HTTP only).

## Verification

- [ ] Deploying a web app (e.g., Uptime Kuma) creates an Ingress resource in the tenant namespace
- [ ] The Ingress hostname matches the expected pattern
- [ ] The app is accessible via `https://{name}.{workspace}.apps.{domain}`
- [ ] TLS works if cert-manager is configured
- [ ] "Open" button in My Apps links to the Ingress URL (not localhost)
- [ ] Connection info API returns the Ingress URL
- [ ] AI agent reports the correct URL after deployment
- [ ] Non-web apps (PostgreSQL, Redis) don't get Ingress resources (no change)
- [ ] Local dev mode (docker-compose) still uses port-forward as before (no regression)

## Notes

- This task also effectively removes the need for the `10000-10049` port range mapping in production. That port range is purely for local dev port-forwarding.
- Wildcard DNS is already configured (per user confirmation). We just need to generate the right hostnames.
- Some apps may need specific Ingress annotations (WebSocket support for n8n, large uploads for MinIO). Add these to the recipe's `ingressConfig` as needed.
- Database apps (PostgreSQL, Redis) are accessed via K8s internal DNS — they don't need Ingress. The connection info dialog should show the internal service DNS name + credentials.
