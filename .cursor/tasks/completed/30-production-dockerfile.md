# Step 30 — Production Dockerfile

## Goal

Create a multi-stage production Dockerfile that builds optimized images for both the Next.js web app and the BullMQ worker. This is the foundation for all K8s deployment work — nothing else can be deployed without a buildable production image.

## Prerequisites

- Current dev setup working (docker-compose.local.yml)
- Existing `Dockerfile.dev` as reference for what the dev image needs

## What to Build

### 1. Multi-Stage Dockerfile (`Dockerfile`)

Three stages:

**Stage 1 — `deps`**: Install production + dev dependencies
- Base: `node:22-alpine`
- Copy `package.json`, `yarn.lock`
- Run `yarn install --frozen-lockfile`

**Stage 2 — `builder`**: Build the Next.js app + generate Prisma client
- Copy source code + deps from stage 1
- Run `npx prisma generate`
- Run `yarn build` (Next.js standalone output)
- Compile worker: `npx tsx --compile worker/index.ts` (or use esbuild to bundle `worker/`)

**Stage 3 — `runner`**: Minimal production image
- Base: `node:22-alpine`
- Install runtime-only system deps: `kubectl` (needed by worker for `exec`)
- Copy Next.js standalone output from builder
- Copy compiled worker from builder
- Copy Prisma client + migration files
- Set `NODE_ENV=production`
- Non-root user (`node` or custom)

### 2. Build Targets

Use Docker build args or separate Dockerfiles to produce two images from the same build:

```dockerfile
# Option A: Single Dockerfile with build arg
ARG APP_TARGET=web
# ... conditionally set CMD based on APP_TARGET

# Option B: Shared base + thin final stages
FROM runner AS web
CMD ["node", "server.js"]

FROM runner AS worker
CMD ["node", "worker/index.js"]
```

**Option B (separate targets) is preferred** — lets you build `docker build --target web` or `--target worker`.

### 3. `.dockerignore`

Ensure the production build ignores:
- `node_modules/` (installed in build stage)
- `.cursor/`, `.git/`, `.env*`
- `docker-compose*.yml`, `Dockerfile.dev`

### 4. Next.js Standalone Output

Ensure `next.config.ts` has `output: "standalone"` set for production builds. This produces a self-contained `server.js` with only the dependencies it needs (~50MB vs ~500MB full node_modules).

### 5. Image Size Budget

Target: **< 300MB** for the final image (Alpine + Node.js runtime + app + kubectl).

## Verification

- [ ] `docker build --target web -t mathison-web .` succeeds
- [ ] `docker build --target worker -t mathison-worker .` succeeds
- [ ] `docker run mathison-web` starts and responds on port 3000
- [ ] `docker run mathison-worker` starts (will fail to connect to Redis/DB, but should boot cleanly)
- [ ] Image sizes are under 300MB each
- [ ] Existing `docker-compose.local.yml` dev workflow is unaffected (still uses `Dockerfile.dev`)

## Notes

- The worker needs `kubectl` in the image for `execInPod` (data export/import). This adds ~50MB but is necessary until we migrate to the native K8s WebSocket exec API.
- Prisma needs the generated client at runtime. The migration files are only needed if we run migrations from the container (setup/init job pattern).
- Consider adding a `migrate` target that runs `prisma migrate deploy` — useful as a K8s Job or init container.
