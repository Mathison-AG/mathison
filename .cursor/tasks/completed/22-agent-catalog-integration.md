# Step 22 — Agent & Catalog Integration

## Goal

Connect the new typed recipe system to the AI agent tools and catalog API. Agent tools validate config against recipe Zod schemas (clear errors before deployment). The catalog API reads from the recipe registry for static metadata and the DB for dynamic data. Remove all Helm/Handlebars code. After this step, the old deployment system is fully removed and the new typed system is the only path.

## Prerequisites

- Steps 19–21 completed (recipes, engine v2, state model all working)

## What to Build

### 1. Update Agent Tools (`src/lib/agent/tools.ts`)

**`installApp` tool:**
- Resolve recipe from registry (not DB)
- Validate `config` against the recipe's Zod schema before calling engine
- Return clear validation errors to the agent: "Invalid config: storageSize must be a string, got number"
- The agent can read the configSchema to suggest valid values

**`changeAppSettings` tool:**
- Validate new config against recipe's Zod schema
- Show what will change (diff old vs new config)
- The agent explains the change to the user before applying

**`getAppInfo` tool:**
- Read from recipe registry (static metadata) + DB (install count)
- Return configSchema field descriptions so the agent can explain options

**New: `previewChanges` tool (dry-run):**
- Takes appId + new config
- Runs build() with new config, diffs against current K8s state
- Returns human-readable summary of what would change
- Agent uses this to preview changes before applying

### 2. Update Catalog API

**`GET /api/catalog`:**
- Source: recipe registry for all static fields + DB for install counts, featured flags
- The Recipe DB model becomes slim: just `slug`, `installCount`, `featured`, `embedding`

**`GET /api/catalog/[slug]`:**
- Static data from registry, dynamic data from DB

**`GET /api/catalog/search`:**
- Semantic search still uses pgvector embeddings in DB
- But recipe metadata (for display) comes from the registry

### 3. Remove Old System

**Delete:**
- `src/lib/catalog/seed-data.ts` (776 lines — replaced by recipe modules)
- `src/lib/deployer/template.ts` (Handlebars rendering)
- `src/lib/cluster/helm.ts` (Helm CLI wrapper)
- Handlebars dependency from `package.json`
- Helm binary from `Dockerfile.dev`

**Simplify:**
- `prisma/seed.ts` — no longer seeds full recipe data, just creates slim DB entries for install counts + embeddings
- Recipe DB model — remove deployment-logic fields (configSchema, secretsSchema, valuesTemplate, dependencies, ingressConfig, resourceDefaults, resourceLimits, healthCheck, chartUrl, chartVersion, sourceType)

### 4. Update Recipe DB Model

The Recipe model in Prisma becomes minimal — only stores data that's dynamic or needs DB features:

```prisma
model Recipe {
  id            String       @id @default(cuid())
  slug          String       @unique
  installCount  Int          @default(0) @map("install_count")
  featured      Boolean      @default(false)
  embedding     Unsupported("vector(1536)")?
  deployments   Deployment[]
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  @@map("recipes")
}
```

All other fields come from the recipe registry at runtime.

### 5. Seed Script Update

The seed script creates/updates slim Recipe DB entries for each recipe in the registry:
- Creates entry if slug doesn't exist
- Updates embedding if OPENAI_API_KEY is available
- Idempotent — safe to run multiple times

## Key Files

```
src/lib/agent/
  tools.ts                  # MODIFIED — config validation, preview tool

src/app/api/catalog/
  route.ts                  # MODIFIED — reads from registry + DB
  [slug]/route.ts           # MODIFIED — reads from registry + DB
  search/route.ts           # MODIFIED — search uses DB embeddings, display from registry

src/lib/catalog/
  service.ts                # MODIFIED — queries registry + DB
  seed-data.ts              # DELETED

src/lib/deployer/
  template.ts               # DELETED
  
src/lib/cluster/
  helm.ts                   # DELETED

prisma/
  schema.prisma             # MODIFIED — slim Recipe model
  seed.ts                   # MODIFIED — simplified seed

package.json                # MODIFIED — remove handlebars
Dockerfile.dev              # MODIFIED — remove Helm binary
```

## Testing

### Manual Verification

- [ ] Agent `installApp` with invalid config → clear error message returned
- [ ] Agent `installApp` with valid config → deploys successfully
- [ ] Agent `changeAppSettings` validates config before applying
- [ ] Agent `previewChanges` shows diff without applying
- [ ] `GET /api/catalog` returns all recipes with correct metadata
- [ ] `GET /api/catalog/postgresql` returns full recipe details
- [ ] Semantic search still works (embeddings in DB, display from registry)
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
- [ ] No references to Helm, Handlebars, or seed-data remain

### Edge Cases

- [ ] Recipe slug in DB but not in registry → handled gracefully (legacy entry)
- [ ] Agent asks for recipe info on unknown slug → clear "not found" response
- [ ] Config validation with extra unknown fields → rejected or stripped

## Notes

- This is the cleanup step. After this, the codebase has no Helm code, no Handlebars, no 776-line seed file.
- The Recipe DB model becoming slim is a significant migration. Existing Deployment records reference Recipe by ID — make sure the relation still works.
- The `previewChanges` tool is important for building trust. The agent should always show what will change before making modifications.
- Removing Helm from `Dockerfile.dev` means the Docker image gets smaller and builds faster.
