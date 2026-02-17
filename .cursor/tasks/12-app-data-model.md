# Step 12 — App Data Model & Recipe Enrichment

## Goal

Transform the Recipe model from a technical Helm chart wrapper into a rich "App Store" listing. Add consumer-facing metadata: short descriptions, use-case tags, getting-started guides, screenshots, and popularity tracking. After this step, every recipe has the data needed to render a polished app store card and detail page.

## Prerequisites

- Steps 01–11 completed (full MVP)
- Multi-workspace support merged
- Database running (`docker compose -f docker-compose.local.yml up -d`)

## What to Build

### 1. Prisma Schema Changes (`prisma/schema.prisma`)

Add new consumer-facing fields to the Recipe model:

```prisma
model Recipe {
  // ... existing fields stay ...

  // Consumer-facing (NEW)
  shortDescription  String?         @map("short_description")   // 1-line tagline for cards
  useCases          String[]        @map("use_cases")           // ["Automate workflows", "Connect APIs"]
  gettingStarted    String?         @map("getting_started")     // Markdown: first steps after install
  screenshots       String[]                                     // URLs to screenshot images
  websiteUrl        String?         @map("website_url")         // Link to the app's official site
  documentationUrl  String?         @map("documentation_url")   // Link to official docs

  // Popularity tracking (NEW)
  installCount      Int             @default(0) @map("install_count")
  featured          Boolean         @default(false)
}
```

### 2. Migration

Generate and apply the Prisma migration:

```bash
docker compose -f docker-compose.local.yml exec web npx prisma migrate dev --name add-consumer-fields
```

### 3. Update Seed Data (`src/lib/catalog/seed-data.ts`)

Enrich all 5 existing recipes with consumer-facing content:

**PostgreSQL:**
- shortDescription: "Powerful open-source relational database"
- useCases: ["Store application data", "Run SQL queries", "Backend for other apps"]
- gettingStarted: Markdown with connection instructions

**Redis:**
- shortDescription: "Lightning-fast in-memory data store"
- useCases: ["Caching", "Session storage", "Message queuing"]
- gettingStarted: Connection string, basic CLI commands

**n8n:**
- shortDescription: "Visual workflow automation — connect anything to everything"
- useCases: ["Automate repetitive tasks", "Connect apps without coding", "Build custom workflows"]
- gettingStarted: "Open n8n, create your first workflow, pick a trigger..."
- websiteUrl: "https://n8n.io"

**Uptime Kuma:**
- shortDescription: "Beautiful uptime monitoring for all your services"
- useCases: ["Monitor website uptime", "Get alerts when services go down", "Track response times"]
- gettingStarted: "Add your first monitor by entering a URL..."
- websiteUrl: "https://uptime.kuma.pet"

**MinIO:**
- shortDescription: "Store files and media — your own cloud storage"
- useCases: ["File storage", "Backup destination", "Media hosting"]
- gettingStarted: "Access the MinIO console, create a bucket..."
- websiteUrl: "https://min.io"

### 4. Update Catalog Service (`src/lib/catalog/service.ts`)

Update `getRecipe()` and `searchRecipes()` to include the new fields in their return types and queries. Ensure the catalog API routes expose these fields.

### 5. Update Catalog API (`src/app/api/catalog/route.ts`, `[slug]/route.ts`)

Include new fields in API responses:
- List endpoint: add `shortDescription`, `useCases`, `installCount`, `featured`
- Detail endpoint: add all new fields including `gettingStarted`, `screenshots`, `websiteUrl`

### 6. Increment Install Count

Add a helper function `incrementInstallCount(recipeId: string)` in the catalog service. Call it from `initiateDeployment()` in the engine when a deployment is successfully queued.

## Deliverables

- [ ] Prisma migration runs cleanly, new columns exist
- [ ] All 5 seed recipes have consumer-facing content (shortDescription, useCases, gettingStarted)
- [ ] `GET /api/catalog` returns enriched recipe data
- [ ] `GET /api/catalog/[slug]` returns full detail including gettingStarted
- [ ] Install count increments when a deployment is initiated
- [ ] `yarn typecheck` passes with no new errors
- [ ] Existing features (chat, deploy, canvas) still work — no regressions

## Key Files

```
prisma/
├── schema.prisma                    # Updated Recipe model
└── migrations/YYYYMMDD_add_consumer_fields/

src/
├── lib/catalog/
│   ├── seed-data.ts                 # Enriched recipe data
│   └── service.ts                   # Updated queries + installCount helper
└── app/api/catalog/
    ├── route.ts                     # Include new fields
    └── [slug]/route.ts              # Include full detail
```

## Notes

- This step is backend/data only — no UI changes yet. The UI comes in Step 13.
- Keep all existing fields intact. The new fields are additive — nothing breaks.
- `gettingStarted` is Markdown — it'll be rendered with `react-markdown` in the UI later.
- Screenshots are URLs (strings). For MVP, we can use placeholder images or skip them. Real screenshots come later.
- The `featured` boolean is manual for now — we'll use it to highlight apps on the store homepage.
- Resource sizing (CPU/memory tiers) is intentionally deferred — will be designed later as the project matures toward open-source release.
