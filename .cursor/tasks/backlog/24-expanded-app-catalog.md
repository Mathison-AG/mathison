# Step 24 — Expanded App Catalog

## Goal

Grow the app catalog from 5 to 20+ apps using the new archetype-based recipe system. Each new recipe uses `webApp()`, `database()`, or other archetypes — roughly 40-60 lines of typed code per app. Add icons, consumer metadata, and validate every recipe deploys successfully. After this step, the App Store feels rich and useful.

## Prerequisites

- Steps 19–22 completed (typed recipe system fully operational)
- Archetypes working and tested with the initial 5 recipes

## What to Build

### 1. New Dependency Recipes

These are backend services needed by other apps:

- **MySQL** — `database()` archetype. Image: `mysql`. Needed by: BookStack, others.
- **MongoDB** — `database()` archetype. Image: `mongo`. Needed by: Rocket.Chat, others.

### 2. New Application Recipes

Each recipe uses an archetype and is ~40-60 lines:

**Automation & Workflows:**
- **Activepieces** — `webApp()` archetype. No-code automation alternative to Zapier. Depends on: PostgreSQL, Redis.
- **Node-RED** — `webApp()` archetype. IoT-focused wiring tool.

**Project Management:**
- **Plane** — `webApp()` archetype. Jira/Linear alternative. Depends on: PostgreSQL, Redis, MinIO.
- **Vikunja** — `webApp()` archetype. Lightweight task management.

**Communication:**
- **Rocket.Chat** — `webApp()` archetype. Self-hosted Slack alternative. Depends on: MongoDB.

**Knowledge & Notes:**
- **Outline** — `webApp()` archetype. Team wiki. Depends on: PostgreSQL, Redis, MinIO.
- **BookStack** — `webApp()` archetype. Simple wiki. Depends on: MySQL.

**Development Tools:**
- **Gitea** — `webApp()` archetype. Lightweight GitHub alternative. Depends on: PostgreSQL.
- **Code Server** — `webApp()` archetype. VS Code in the browser.

**Media & Files:**
- **Nextcloud** — `webApp()` archetype. Self-hosted cloud (files, calendar, contacts). Depends on: PostgreSQL, Redis.
- **Immich** — Complex (multiple components). May use custom `build()`. Depends on: PostgreSQL, Redis.

**Analytics & Dashboards:**
- **Metabase** — `webApp()` archetype. Business intelligence dashboards. Depends on: PostgreSQL.
- **Grafana** — `webApp()` archetype. Monitoring dashboards.

**Security:**
- **Vaultwarden** — `webApp()` archetype. Self-hosted password manager.

### 3. Recipe Quality Checklist

Each recipe must pass:
- [ ] `yarn recipe:validate <slug>` passes (type-check + dry-run)
- [ ] Deploys successfully on kind cluster with default config
- [ ] Reaches RUNNING state within 5 minutes
- [ ] Dependencies auto-deploy correctly
- [ ] Health check passes
- [ ] Port-forward works (web UI loads or DB connects)
- [ ] Consumer metadata complete: `shortDescription`, `useCases` (3+), `gettingStarted`
- [ ] AI hints accurate: `summary`, `whenToSuggest`, `pairsWellWith`

### 4. Recipe Validation CLI

Add `yarn recipe:validate [slug]` command that:
- Type-checks the recipe module
- Validates the config schema has sensible defaults
- Calls `build()` with default config and inspects the output
- Optionally: dry-runs against the kind cluster

### 5. Updated Categories

- Popular (featured / high install count)
- Automation
- Project Management
- Communication
- Knowledge & Notes
- Dev Tools
- Media & Files
- Analytics
- Monitoring
- Storage
- Databases (backend services, often installed as dependencies)

### 6. App Icons

SVG icons for all new apps in `public/icons/`. Consistent sizing, works at 40px and 80px.

## Key Files

```
src/recipes/
  mysql/index.ts             # NEW — database() archetype
  mongodb/index.ts           # NEW — database() archetype
  activepieces/index.ts      # NEW — webApp() archetype
  node-red/index.ts          # NEW — webApp() archetype
  plane/index.ts             # NEW — webApp() archetype
  vikunja/index.ts           # NEW — webApp() archetype
  rocket-chat/index.ts       # NEW — webApp() archetype
  outline/index.ts           # NEW — webApp() archetype
  bookstack/index.ts         # NEW — webApp() archetype
  gitea/index.ts             # NEW — webApp() archetype
  code-server/index.ts       # NEW — webApp() archetype
  nextcloud/index.ts         # NEW — webApp() archetype
  immich/index.ts            # NEW — possibly custom build()
  metabase/index.ts          # NEW — webApp() archetype
  grafana/index.ts           # NEW — webApp() archetype
  vaultwarden/index.ts       # NEW — webApp() archetype
  registry.ts                # MODIFIED — register all new recipes

public/icons/
  *.svg                      # NEW — icons for all new apps

scripts/
  validate-recipe.ts         # NEW — recipe validation CLI
```

## Testing

### Manual Verification

- [ ] All new recipes pass `yarn recipe:validate`
- [ ] At least 5 new apps tested with actual deployment on kind cluster
- [ ] Dependency chains work (e.g., Outline → PostgreSQL + Redis + MinIO)
- [ ] App Store UI shows all new apps with correct metadata
- [ ] Category filters work with new categories
- [ ] Semantic search finds new apps

### Edge Cases

- [ ] App with 3+ dependencies — all auto-deployed correctly
- [ ] Two apps sharing the same dependency (e.g., both need PostgreSQL) — reuses existing
- [ ] Complex app (Immich) with multiple components — custom build handles it

## Notes

- Start with the simplest apps (Vaultwarden, Vikunja, Code Server — few or no dependencies) and work toward complex ones (Plane, Outline, Immich).
- The archetype system should make this step much faster than the old approach. Each recipe is ~40-60 lines, not 150+ lines of Helm values template.
- Some apps (Immich, Plane) have complex multi-component architectures. If they're too complex for the archetype, use custom `build()`. If even that's too complex, mark as "Coming Soon" and revisit.
- Test each recipe individually before committing. A broken recipe that fails on install is worse than not having it.
