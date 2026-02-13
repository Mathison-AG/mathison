# Mathison — Testing Guide

How to verify each step works. These are the checks I (the AI agent) run after completing each step.

## Tools Available

| Tool | What it does | When to use |
|------|-------------|-------------|
| **Shell** (`curl`, `npm`, etc.) | Run commands, hit API endpoints, check processes | API testing, build verification, DB operations |
| **Browser** (MCP browser) | Navigate web pages, click elements, fill forms, take screenshots | UI testing, full user flow verification |
| **Linter** (ReadLints) | Check TypeScript/ESLint errors | After every code edit |
| **Database** (`npx prisma studio`, raw SQL) | Inspect data, verify migrations | After schema changes, seed operations |
| **kubectl / helm** | Verify cluster operations on local kind cluster (`kind-mathison-dev` context) | Steps 06+ (K8s integration) |

## Pre-Flight Checks (Every Session)

```bash
# 1. Docker services running?
docker compose -f mathison/docker-compose.yaml ps

# 2. If not, start them:
docker compose -f mathison/docker-compose.yaml up -d

# 3. Dev server needed? Start in background:
cd mathison && npm run dev

# 4. Verify server is up:
curl -s http://localhost:3000 | head -20
```

---

## Step 01 — Project Bootstrap

```bash
# Build succeeds
cd mathison && npm run typecheck
npm run lint
npm run build

# Dev server starts
npm run dev   # → verify http://localhost:3000 returns HTML

# Docker Compose works
docker compose up -d
docker compose ps   # postgres and redis both "Up"

# Postgres is reachable
docker compose exec postgres psql -U mathison -c "SELECT 1"

# Redis is reachable
docker compose exec redis redis-cli ping   # → PONG

# Env validation exists
node -e "require('./src/lib/config.ts')"   # Should fail without .env (that's correct)
```

**Browser test**: Navigate to `http://localhost:3000` — should see default Next.js page or our root page.

---

## Step 02 — Database Schema

```bash
# Migration runs
cd mathison && npx prisma migrate dev

# All tables exist
npx prisma db execute --stdin <<< "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"

# Expected tables: users, tenants, recipes, recipe_versions, stacks, deployments, conversations, messages

# pgvector extension
npx prisma db execute --stdin <<< "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Prisma client generates
npx prisma generate

# Seed runs (stub)
npx prisma db seed

# Prisma Studio opens
npx prisma studio   # check manually if needed
```

---

## Step 03 — Authentication

```bash
# Signup endpoint works
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@mathison.dev","password":"Test1234!","name":"Test User","workspaceName":"Test Workspace"}' \
  | jq .

# User + Tenant created in DB
npx prisma db execute --stdin <<< "SELECT u.email, t.slug, t.namespace FROM users u JOIN tenants t ON u.tenant_id = t.id;"
```

**Browser test** (full flow):
1. Navigate to `http://localhost:3000/signup`
2. Fill form: email, password, name, workspace name
3. Submit → should redirect to `/login`
4. Navigate to `/login`
5. Enter credentials → should redirect to `/` (dashboard)
6. Navigate to `http://localhost:3000/` while logged in → should see dashboard
7. Navigate to `http://localhost:3000/` in incognito → should redirect to `/login`

---

## Step 04 — Service Catalog

```bash
# Seed creates 5 recipes
cd mathison && npx prisma db seed
npx prisma db execute --stdin <<< "SELECT slug, display_name, category, status FROM recipes ORDER BY slug;"

# List endpoint
curl -s http://localhost:3000/api/catalog | jq '.[] | {slug, displayName, category}'

# Single recipe
curl -s http://localhost:3000/api/catalog/postgresql | jq '{slug, displayName, configSchema}'

# Semantic search
curl -s -X POST http://localhost:3000/api/catalog/search \
  -H "Content-Type: application/json" \
  -d '{"query":"I need a relational database"}' \
  | jq '.[] | {slug, displayName, similarity}'

# Verify embeddings exist
npx prisma db execute --stdin <<< "SELECT slug, embedding IS NOT NULL as has_embedding FROM recipes;"
```

---

## Step 05 — AI Agent

```bash
# Chat endpoint (need auth cookie — use a session token)
# First, get a session by logging in via browser, then:

curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"messages":[{"role":"user","content":"What services can I deploy?"}]}'

# Should return streaming response with searchCatalog tool invocation
```

**Browser test** (if chat UI exists from Step 09, otherwise defer):
1. Log in
2. Open chat panel
3. Type "What can I deploy?" → agent should call searchCatalog and list recipes
4. Type "Tell me about PostgreSQL" → agent should call getRecipe
5. Type "Deploy PostgreSQL" → agent should call deployService (creates DB record)

For Step 05 specifically (before chat UI exists), test via `curl` with streaming:
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"messages":[{"role":"user","content":"What services are available?"}]}'
```

---

## Step 06 — Kubernetes & Helm

```bash
# Install kind and create cluster (if not already done)
brew install kind
kind create cluster --name mathison-dev
kubectl cluster-info --context kind-mathison-dev

# K8s cluster is reachable
kubectl get nodes

# Create test namespace
kubectl create namespace mathison-test-ns --dry-run=client -o yaml

# Test via code (run a quick script)
cd mathison && npx tsx -e "
  const { createNamespace } = require('./src/lib/cluster/kubernetes');
  createNamespace('mathison-test-ns').then(console.log).catch(console.error);
"

# Helm wrapper test
npx tsx -e "
  const { helmList } = require('./src/lib/cluster/helm');
  helmList('default').then(console.log).catch(console.error);
"

# Clean up test namespace
kubectl delete namespace mathison-test-ns --ignore-not-found
```

---

## Step 07 — Deployment Engine & Worker

```bash
# Worker starts
cd mathison && npm run worker
# Should print: "Mathison worker started, waiting for jobs..."

# Redis queue inspection
docker compose exec redis redis-cli KEYS "bull:*"

# End-to-end: deploy via agent tool → verify in DB + K8s
npx prisma db execute --stdin <<< "SELECT id, name, status, namespace FROM deployments ORDER BY created_at DESC LIMIT 5;"

# Verify Helm release was created
helm list -n mathison-platform-dev

# Verify pods are running
kubectl get pods -n mathison-platform-dev
```

---

## Step 08 — Frontend Shell

**Browser test** (primary):
1. Navigate to `http://localhost:3000` → should redirect to login or dashboard
2. Log in → should see dashboard with sidebar
3. Sidebar: click each nav item (Dashboard, Catalog, Deployments, Settings) → pages load
4. Sidebar: collapse toggle works
5. Header: workspace name shows, user menu opens
6. User menu: logout works → redirects to login
7. Chat FAB visible in bottom-right corner
8. Click chat FAB → panel slides open from right
9. Test dark mode toggle
10. Test on narrow viewport (responsive sidebar)

---

## Step 09 — Chat Panel

**Browser test**:
1. Open chat panel
2. See suggested prompts when chat is empty
3. Click a suggestion → message sends
4. Type "What can I deploy?" → send
5. See "Thinking..." while streaming
6. See tool invocation card (searchCatalog)
7. See formatted response with available services
8. Type "Deploy PostgreSQL" → see deployService tool card
9. Verify auto-scroll works with long conversations
10. Close and reopen panel → messages persist (client state)

---

## Step 10 — Canvas

**Browser test**:
1. Navigate to dashboard
2. If no deployments: see empty state ("Your workspace is empty")
3. Deploy something via chat (or create test data in DB)
4. Canvas shows service nodes with icons, names, status badges
5. If dependencies exist: edges connect nodes
6. Zoom controls work (fit view, zoom in/out)
7. Deploy something → canvas updates within 5 seconds
8. Nodes show correct status colors (green=running, red=failed, etc.)

---

## Step 11 — Catalog & Deployments UI

**Browser test** (Catalog):
1. Navigate to `/catalog`
2. See grid of recipe cards (5 seed recipes)
3. Search "database" → filters to PostgreSQL + Redis
4. Click category chip "monitoring" → shows Uptime Kuma
5. Click a recipe card → navigates to detail page
6. Detail page shows config options, dependencies, deploy button
7. Click deploy → opens chat with pre-filled message

**Browser test** (Deployments):
1. Navigate to `/deployments`
2. See list of deployments (or empty state)
3. Status filter works
4. Click a deployment → detail page
5. Detail shows name, recipe, status, URL, config
6. Logs tab shows recent logs
7. Remove button shows confirmation dialog

---

## Full Integration Test (After Step 11)

The complete user journey:

1. Open `http://localhost:3000` → signup page
2. Create account (email, password, workspace name)
3. Log in → dashboard with empty canvas
4. Open chat → "What services can I deploy?"
5. Agent lists available services
6. "Deploy PostgreSQL with 16Gi storage"
7. Agent deploys → canvas shows PostgreSQL node (DEPLOYING → RUNNING)
8. "Now deploy n8n"
9. Agent auto-detects PostgreSQL dependency is already running, deploys n8n
10. Canvas shows n8n → PostgreSQL dependency edge
11. Navigate to `/catalog` → browse recipes
12. Navigate to `/deployments` → see both deployments running
13. Click PostgreSQL deployment → see details + logs
14. Back to chat → "Remove n8n" → agent asks for confirmation → confirm → removed
15. Canvas updates (n8n node removed)
