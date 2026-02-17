# Step 19 — Expanded App Catalog

## Goal

Grow the app catalog from 5 to 20+ apps, covering the most popular open-source self-hosted tools that consumers actually want. Each app has full consumer-facing metadata: descriptions, use cases, getting started guides, size tiers, and tested values templates. After this step, the App Store feels rich and useful — not a demo with 5 items.

## Prerequisites

- Steps 12–18 completed (full consumer experience working)
- Deployment engine tested with existing 5 apps
- Size tier abstraction working

## What to Build

### 1. New App Recipes

Add these recipes to `src/lib/catalog/seed-data.ts`. Each needs:
- Full Helm chart configuration (chartUrl, valuesTemplate, dependencies, secretsSchema)
- Consumer metadata (shortDescription, useCases, gettingStarted, sizeTiers)
- Tested default values that work out of the box on a kind cluster

**Automation & Workflows:**
- **Activepieces** — "No-code automation for your business"
  - Alternative to Zapier. Simpler than n8n for non-technical users.
  - Depends on: PostgreSQL, Redis
- **Node-RED** — "Wire together hardware, APIs, and online services"
  - IoT-focused automation. Good for smart home enthusiasts.

**Project Management:**
- **Plane** — "Open-source project tracking"
  - Alternative to Jira/Linear. Modern, clean UI.
  - Depends on: PostgreSQL, Redis, MinIO
- **Vikunja** — "Simple, fast task management"
  - Lighter alternative to Plane. To-do lists and kanban boards.

**Communication:**
- **Rocket.Chat** — "Team messaging and collaboration"
  - Alternative to Slack. Self-hosted chat.
  - Depends on: MongoDB (new dependency recipe needed)

**Knowledge & Notes:**
- **Outline** — "Beautiful team wiki and knowledge base"
  - Alternative to Notion/Confluence for documentation.
  - Depends on: PostgreSQL, Redis, MinIO
- **BookStack** — "Simple wiki for organizing information"
  - Lighter alternative to Outline.
  - Depends on: MySQL (new dependency recipe needed)

**Development Tools:**
- **Gitea** — "Lightweight code hosting"
  - Alternative to GitHub/GitLab. Git hosting with CI.
  - Depends on: PostgreSQL
- **Code Server** — "VS Code in the browser"
  - Code from anywhere. Instant development environment.

**Media & Files:**
- **Nextcloud** — "Your own cloud — files, calendars, contacts"
  - Alternative to Google Drive/Dropbox. All-in-one.
  - Depends on: PostgreSQL, Redis
- **Immich** — "Self-hosted photo and video backup"
  - Alternative to Google Photos. Privacy-first.
  - Depends on: PostgreSQL, Redis

**Analytics & Dashboards:**
- **Metabase** — "Ask questions about your data"
  - Business intelligence, dashboards, SQL queries made visual.
  - Depends on: PostgreSQL
- **Grafana** — "Beautiful monitoring dashboards"
  - Metrics visualization. Pairs with Prometheus.

**Security & Networking:**
- **Vaultwarden** — "Password manager for you and your team"
  - Alternative to Bitwarden. Self-hosted password vault.

**Backend Services (new dependency recipes):**
- **MySQL** — needed by BookStack, others
  - Bitnami MySQL chart
  - hasWebUI: false
- **MongoDB** — needed by Rocket.Chat, others
  - Bitnami MongoDB chart
  - hasWebUI: false

### 2. Recipe Quality Checklist

Each new recipe must pass:
- [ ] `helm install` succeeds on kind cluster with default values
- [ ] App reaches RUNNING state within 5 minutes
- [ ] Dependencies auto-deploy correctly
- [ ] Default secrets are generated properly
- [ ] Port-forward works (for web UI apps: page loads, for DBs: connection works)
- [ ] Size tiers (small/medium/large) produce working configurations
- [ ] `gettingStarted` instructions are accurate and tested
- [ ] `useCases` array has at least 3 entries
- [ ] `shortDescription` is one clear sentence

### 3. New Category: "Popular"

Add a virtual category that shows apps sorted by `installCount` (or manually curated via `featured`).

Update the category list:
- Popular (featured/high install count)
- Automation
- Project Management
- Communication
- Knowledge & Notes
- Dev Tools
- Media & Files
- Analytics
- Monitoring
- Storage
- Databases (shown last — these are "backend" apps most consumers install indirectly)

### 4. App Icons

Add SVG icons for all new apps to `public/icons/`:
- Each icon should be a clean, recognizable logo
- Consistent sizing (square, works at 40px and 80px)
- Source from official brand assets or recreate as simple SVGs

### 5. Update Seed Script

The seed script (`prisma/seed.ts`) should be idempotent:
- New apps are added
- Existing apps are updated (new fields filled in)
- No data is lost on re-seed
- Embeddings are regenerated for new apps (if OPENAI_API_KEY available)

### 6. Bitnami Chart Compatibility

All Bitnami charts should use `chartVersion: null` (latest), following decision D57.
Test each chart's current latest version works with our values templates.

### 7. Values Template Patterns

Document and standardize Helm values template patterns:
- All apps use the same Handlebars context: `config`, `secrets`, `deps`, `tenant`, `platform`, `cluster`
- Resource config: `{{config.cpu_request}}`, `{{config.memory_request}}`, etc.
- Dependency connection: `{{deps.app-db.host}}`, `{{deps.app-db.password}}`, etc.
- Ingress: controlled by `{{cluster.ingress_enabled}}`, `{{cluster.domain}}`

## Deliverables

- [ ] 15+ new app recipes added (total catalog: 20+ apps)
- [ ] MySQL and MongoDB added as dependency recipes
- [ ] All new apps deploy successfully on kind cluster
- [ ] All new apps have consumer metadata (shortDescription, useCases, gettingStarted, sizeTiers)
- [ ] Icons exist for all apps
- [ ] Categories are updated and populated
- [ ] Seed script runs idempotently
- [ ] Dependency auto-deploy works for all new apps
- [ ] App Store feels rich with diverse options

## Key Files

```
src/lib/catalog/
└── seed-data.ts                     # EXPANDED — 20+ recipes

public/icons/
├── activepieces.svg                 # NEW
├── plane.svg                        # NEW
├── outline.svg                      # NEW
├── gitea.svg                        # NEW
├── nextcloud.svg                    # NEW
├── immich.svg                       # NEW
├── metabase.svg                     # NEW
├── grafana.svg                      # NEW
├── vaultwarden.svg                  # NEW
├── ... (all new app icons)

prisma/
└── seed.ts                          # Updated for new recipes
```

## Notes

- This is the most labor-intensive step. Each recipe needs a tested values template, correct dependencies, and sensible defaults. Budget extra time.
- Not all 15+ apps need to be perfect at once. Start with the ones that have Bitnami charts (easiest) and work toward community charts.
- Some apps (Immich, Plane) are complex with many components. If they're too complex for the current engine, mark them as "Coming Soon" in the catalog and add them later.
- Test each recipe individually before committing. A broken recipe that fails on install is worse than not having it.
- For community charts (not Bitnami), find the most popular/maintained chart on Artifact Hub. Prefer charts from the app's official organization.
- The seed file will get large. Consider splitting it into one file per recipe (`seed-data/n8n.ts`, `seed-data/plane.ts`, etc.) and importing them into the main seed.
