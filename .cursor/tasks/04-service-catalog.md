# Step 04 — Service Catalog Backend

## Goal

Implement the complete service catalog: CRUD API for recipes, semantic search using pgvector embeddings, embedding generation, and seed data for the 5 initial recipes. After this step, the catalog is fully functional and searchable.

## Prerequisites

- Steps 01–03 completed (project, database, auth)
- OpenAI API key in `.env.local` (for embedding generation via `text-embedding-3-small`)

## What to Build

### 1. Catalog Service (`src/lib/catalog/service.ts`)

Business logic layer for recipe operations:

- `listRecipes(filters?)` — list published recipes with optional category/tag filters
- `getRecipe(slug)` — get single recipe by slug with full details
- `createRecipe(data)` — create new recipe (status=DRAFT, tier=COMMUNITY)
- `updateRecipe(slug, data)` — update recipe fields
- `deleteRecipe(slug)` — soft-delete (set status=DEPRECATED)
- `searchRecipes(query, category?)` — semantic search via pgvector

### 2. Embedding Generation (`src/lib/catalog/embedding.ts`)

Generate embeddings for recipe text (displayName + description + category + tags + aiHints summary):

```typescript
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding;
}

export function buildEmbeddingText(recipe: {
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  aiHints: any;
}): string {
  // Combine fields into a single text for embedding
}
```

### 3. Semantic Search (pgvector)

Use Prisma's `$queryRaw` for vector similarity search:

```typescript
export async function searchRecipes(query: string, category?: string) {
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRaw`
    SELECT id, slug, display_name, description, category, tier,
           1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM recipes
    WHERE status = 'PUBLISHED'
    ${category ? Prisma.sql`AND category = ${category}` : Prisma.empty}
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT 10
  `;

  return results;
}
```

### 4. API Route Handlers

**`/api/catalog/route.ts`** — GET (list/search), POST (create)
- GET: query params for `category`, `search` (text), returns array of recipes
- POST: body validated with Zod, requires auth, creates recipe

**`/api/catalog/[slug]/route.ts`** — GET, PUT, DELETE single recipe
- GET: returns full recipe details (public)
- PUT: update recipe, requires auth
- DELETE: deprecate recipe, requires auth + ADMIN role

**`/api/catalog/search/route.ts`** — POST semantic search
- Body: `{ query: string, category?: string }`
- Returns ranked results with similarity scores
- Generates query embedding on the fly

### 5. Seed Data (`prisma/seed.ts`)

Populate the catalog with 5 initial recipes (status=PUBLISHED, tier=OFFICIAL). Each must include ALL fields:

**1. PostgreSQL** (`bitnami/postgresql`)
- Category: database
- Config schema: `{ version: {type: "select", options: ["16","15","14"], default: "16"}, storage_size: {type: "string", default: "8Gi"}, max_connections: {type: "number", default: 100} }`
- No ingress (internal only)
- Dependencies: none
- AI hints: `{ summary: "relational database", whenToSuggest: "user needs a database, SQL, persistent storage", pairsWellWith: ["redis", "n8n"] }`
- Values template: Handlebars template for Helm values
- Resource defaults: `{ cpu: "250m", memory: "256Mi" }`
- Resource limits: `{ cpu: "1", memory: "1Gi" }`

**2. Redis** (`bitnami/redis`)
- Category: database
- Config: version, storage_size, maxmemory
- No ingress
- AI hints: cache, message broker, session store

**3. n8n** (`oci://8gears.container-registry.com/library/n8n`)
- Category: automation
- Depends on: PostgreSQL
- Config: execution_mode (regular/queue)
- Ingress: `n8n-{tenant}.{domain}`
- AI hints: workflow automation, Zapier alternative

**4. Uptime Kuma** (`louislam/uptime-kuma`)
- Category: monitoring
- Config: storage_size
- Ingress: `status-{tenant}.{domain}`
- AI hints: uptime monitoring, status page

**5. MinIO** (`bitnami/minio`)
- Category: storage
- Config: storage_size, root_user, root_password
- Ingress: `minio-{tenant}.{domain}` (console)
- AI hints: S3-compatible object storage

The seed script should:
1. Upsert each recipe (idempotent — safe to run multiple times)
2. Generate embeddings for each recipe
3. Store embeddings via raw SQL (`UPDATE recipes SET embedding = $1::vector WHERE id = $2`)

### 6. Shared Types (`src/types/recipe.ts`)

```typescript
export interface Recipe {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  iconUrl: string | null;
  sourceType: string;
  chartUrl: string;
  chartVersion: string | null;
  configSchema: Record<string, any>;
  secretsSchema: Record<string, any>;
  valuesTemplate: string;
  dependencies: Array<{ service: string; alias?: string; config?: Record<string, any> }>;
  ingressConfig: Record<string, any>;
  resourceDefaults: Record<string, any>;
  resourceLimits: Record<string, any>;
  healthCheck: Record<string, any>;
  aiHints: Record<string, any>;
  tier: "OFFICIAL" | "VERIFIED" | "COMMUNITY";
  status: "DRAFT" | "PUBLISHED" | "DEPRECATED";
}
```

## Deliverables

- [ ] `npx prisma db seed` populates 5 recipes with complete data + embeddings
- [ ] `GET /api/catalog` returns list of published recipes
- [ ] `GET /api/catalog/postgresql` returns full recipe details
- [ ] `POST /api/catalog/search` with `{ query: "I need a database" }` returns PostgreSQL and Redis ranked by relevance
- [ ] `POST /api/catalog` creates a new draft recipe (auth required)
- [ ] All API responses use consistent JSON format with proper HTTP status codes
- [ ] Each seed recipe has a complete `valuesTemplate`, `configSchema`, `dependencies`, `aiHints`, `resourceDefaults`, `resourceLimits`

## Key Files

```
src/
├── lib/catalog/
│   ├── service.ts          # Catalog business logic
│   ├── embedding.ts        # Embedding generation
│   └── seed.ts             # Seed data definitions
├── app/api/catalog/
│   ├── route.ts            # GET list, POST create
│   ├── [slug]/route.ts     # GET, PUT, DELETE single
│   └── search/route.ts     # POST semantic search
└── types/
    └── recipe.ts           # Shared Recipe types
prisma/
└── seed.ts                 # Seed script (calls catalog/seed.ts)
```

## Notes

- Embedding model: `text-embedding-3-small` (1536 dimensions) — matches the `vector(1536)` column.
- Seed should be idempotent: use `upsert` by slug so it can be re-run safely.
- Values templates use Handlebars syntax (`{{config.storage_size}}`, `{{secrets.password}}`, `{{deps.postgresql.host}}`). The template renderer is built in Step 07.
- For the seed, write realistic Helm values templates that would actually work with the respective charts.
- The API routes should return consistent error responses: `{ error: string, details?: any }`.
