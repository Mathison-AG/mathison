# Step 02 — Database Schema & Prisma

## Goal

Define the complete Prisma schema, run initial migration, set up the Prisma client singleton, and verify pgvector is working. After this step, the database is ready for all subsequent features.

## Prerequisites

- Step 01 completed (project scaffolded, Docker Compose running PostgreSQL with pgvector)
- `docker compose up -d` running (postgres available on localhost:5432)
- `.env.local` created with `DATABASE_URL=postgresql://mathison:mathison@localhost:5432/mathison`

## What to Build

### 1. Prisma Schema (`prisma/schema.prisma`)

Implement the FULL schema from the Platform Prompt. This includes all models:

**Auth & Tenancy:**
- `User` — email, passwordHash, role (ADMIN/USER), belongs to Tenant
- `Tenant` — slug, name, K8s namespace, quota (JSON), status (ACTIVE/SUSPENDED/DELETED)

**Service Catalog:**
- `Recipe` — slug, displayName, description, category, tags, chart info, configSchema, secretsSchema, valuesTemplate, dependencies, ingressConfig, resourceDefaults, resourceLimits, healthCheck, aiHints, embedding (pgvector), tier, status
- `RecipeVersion` — version snapshots for audit trail
- `Stack` — bundled recipes (deferred from MVP but define the model now)

**Deployments:**
- `Deployment` — tenant, recipe, name, namespace, helmRelease, config, status, url, dependsOn

**Conversations:**
- `Conversation` — tenant, user, title
- `Message` — role (USER/ASSISTANT/SYSTEM/TOOL), content, toolInvocations (JSON)

**Enums:** Role, TenantStatus, RecipeTier, RecipeStatus, DeploymentStatus, MessageRole

Key details:
- Use `@map("snake_case")` for all columns and `@@map("table_name")` for tables
- pgvector extension: `extensions = [pgvector(map: "vector", schema: "public")]`
- Embedding fields: `Unsupported("vector(1536)")?`
- `previewFeatures = ["postgresqlExtensions"]` in generator

The complete schema is in the Platform Prompt under "Prisma Schema" — implement it exactly.

### 2. Prisma Client Singleton (`src/lib/db.ts`)

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

This prevents connection pool exhaustion during Next.js hot reloading.

### 3. Initial Migration

```bash
npx prisma migrate dev --name init
```

This creates the migration files and applies them to the local database.

### 4. Verify pgvector

After migration, verify that the vector extension is installed:

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 5. Seed Script Stub (`prisma/seed.ts`)

Create a minimal seed script that will be expanded in Step 04:

```typescript
import { prisma } from "../src/lib/db";

async function main() {
  console.log("Seeding database...");
  // Recipes will be seeded in Step 04
  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Add to `package.json`:
```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

## Deliverables

- [ ] `prisma/schema.prisma` contains ALL models, enums, and relations from the Platform Prompt
- [ ] `npx prisma migrate dev` runs successfully — migration files created
- [ ] `npx prisma generate` produces typed client
- [ ] `src/lib/db.ts` exports Prisma singleton
- [ ] pgvector extension is active in the database
- [ ] `npx prisma studio` opens and shows all tables
- [ ] `npx prisma db seed` runs the stub seed without errors

## Key Files

```
prisma/
├── schema.prisma
├── seed.ts
└── migrations/
    └── <timestamp>_init/
        └── migration.sql
src/lib/
└── db.ts
```

## Notes

- The `embedding` field uses `Unsupported("vector(1536)")` — Prisma can't query it natively. Raw SQL via `prisma.$queryRaw` will be used in Step 04 for vector search.
- Stack model is defined in the schema but not used in the MVP. Include it anyway so the schema is complete.
- All JSON fields use Prisma's `Json` type with `@default("{}")` or `@default("[]")`.
