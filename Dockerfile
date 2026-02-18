# syntax=docker/dockerfile:1
# ═══════════════════════════════════════════════════════════════
# Mathison — Production Dockerfile
#
# Multi-stage build with three targets:
#   docker build --target web -t mathison-web .
#   docker build --target worker -t mathison-worker .
#   docker build --target migrate -t mathison-migrate .
# ═══════════════════════════════════════════════════════════════

# ─── Stage 1: Install all dependencies ──────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# ─── Stage 2: Build everything ──────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (dummy URL — only schema is needed)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

# Build-time env placeholders (validated at module load; overridden at runtime)
# check=skip=SecretsUsedInArgOrEnv
ENV NEXT_TELEMETRY_DISABLED=1
ENV AUTH_SECRET="build-time-placeholder"
RUN yarn build

# Bundle worker into a single ESM file.
# ESM format is required because the Prisma generated client uses import.meta.url.
# External packages are kept out of the bundle and resolved from node_modules at runtime.
RUN npx esbuild worker/start.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=esm \
    --outfile=dist/worker/index.mjs \
    --alias:@=./src \
    --external:@prisma/client \
    --external:@prisma/adapter-pg \
    --external:pg \
    --external:pg-pool \
    --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"

# Collect the minimal node_modules the worker needs at runtime.
# Only @prisma (client + adapter), pg, and their transitive deps.
# Prune WASM query compilers for non-PostgreSQL engines, Prisma Studio,
# engine binaries, and dev tools to save ~100MB.
RUN mkdir -p /worker-deps/node_modules/@prisma /worker-deps/src && \
    cp -r node_modules/@prisma/client /worker-deps/node_modules/@prisma/ && \
    cp -r node_modules/@prisma/adapter-pg /worker-deps/node_modules/@prisma/ && \
    cp -r node_modules/@prisma/driver-adapter-utils /worker-deps/node_modules/@prisma/ && \
    cp -r node_modules/@prisma/client-runtime-utils /worker-deps/node_modules/@prisma/ && \
    cp -r node_modules/@prisma/debug /worker-deps/node_modules/@prisma/ && \
    cp -r node_modules/@prisma/config /worker-deps/node_modules/@prisma/ 2>/dev/null; \
    cp -r node_modules/@prisma/engines-version /worker-deps/node_modules/@prisma/ 2>/dev/null; \
    cp -r node_modules/pg /worker-deps/node_modules/ && \
    cp -r node_modules/pg-pool /worker-deps/node_modules/ && \
    cp -r node_modules/pg-protocol /worker-deps/node_modules/ && \
    cp -r node_modules/pg-types /worker-deps/node_modules/ && \
    cp -r node_modules/pg-cloudflare /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/pg-connection-string /worker-deps/node_modules/ && \
    cp -r node_modules/pgpass /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/pg-int8 /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/pg-numeric /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/postgres-array /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/postgres-bytea /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/postgres-date /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/postgres-interval /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/postgres-range /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/obuf /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/split2 /worker-deps/node_modules/ 2>/dev/null; \
    cp -r node_modules/xtend /worker-deps/node_modules/ 2>/dev/null; \
    cp -r src/generated /worker-deps/src/generated && \
    # Prune non-PostgreSQL WASM compilers (~60MB) and source maps (~3MB)
    cd /worker-deps/node_modules/@prisma/client/runtime && \
    rm -f *mysql* *sqlite* *sqlserver* *cockroachdb* *.map && \
    echo "Worker deps collected"

# ─── Stage 3: Shared production base ────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# ─── Target: web ────────────────────────────────────────────
FROM runner AS web
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

# ─── Target: worker ─────────────────────────────────────────
FROM runner AS worker

# kubectl is needed for execInPod (data export/import, port-forward)
RUN apk add --no-cache --virtual .kubectl-deps curl && \
    curl -sLo /usr/local/bin/kubectl \
      "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/amd64/')/kubectl" && \
    chmod +x /usr/local/bin/kubectl && \
    apk del .kubectl-deps

COPY --from=builder --chown=nextjs:nodejs /app/dist/worker ./dist/worker
COPY --from=builder --chown=nextjs:nodejs /worker-deps/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /worker-deps/src/generated ./src/generated

USER nextjs
CMD ["node", "dist/worker/index.mjs"]

# ─── Target: migrate (K8s Job / init container) ─────────────
FROM node:22-alpine AS migrate
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
CMD ["npx", "prisma", "migrate", "deploy"]
