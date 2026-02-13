# Step 01 — Project Bootstrap & Configuration

## Goal

Scaffold the entire Next.js 15 project with all dependencies, TypeScript strict config, Docker Compose for local dev, and the environment variable validation layer. This step produces a working `npm run dev` with an empty app — the foundation everything else builds on.

## Prerequisites

- None — this is the first step.
- Node.js 20+ and Docker installed locally.

## What to Build

### 1. Initialize Next.js 15 (App Router)

```bash
npx create-next-app@latest mathison --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Then harden `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 2. Install All Dependencies

Production:
```
next react react-dom
@ai-sdk/openai @ai-sdk/anthropic ai ollama-ai-provider
@auth/prisma-adapter next-auth@beta
@prisma/client
@kubernetes/client-node execa
bullmq ioredis
zod
@tanstack/react-query
@xyflow/react
handlebars
```

Dev:
```
prisma
typescript @types/node @types/react @types/react-dom
tailwindcss postcss autoprefixer
tsx
```

shadcn/ui:
```bash
npx shadcn@latest init
# Then add components as needed: button, card, input, dialog, badge, separator, sheet, dropdown-menu, avatar, scroll-area, tooltip
```

### 3. Docker Compose — Local Dev Dependencies

Create `docker-compose.yaml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: mathison
      POSTGRES_USER: mathison
      POSTGRES_PASSWORD: mathison
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

### 4. Environment Variable Validation

Create `src/lib/config.ts` with Zod schema:

```typescript
import { z } from "zod";

const envSchema = z.object({
  // Platform
  MATHISON_MODE: z.enum(["cloud", "self-hosted"]).default("self-hosted"),
  MATHISON_BASE_DOMAIN: z.string().default("localhost:3000"),
  MATHISON_WILDCARD_DOMAIN: z.string().optional(),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Auth
  AUTH_SECRET: z.string(),
  AUTH_URL: z.string().optional(),

  // LLM
  LLM_PROVIDER: z.enum(["openai", "anthropic", "ollama"]).default("openai"),
  LLM_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),

  // Kubernetes
  KUBECONFIG: z.string().optional(),

  // Cluster
  INGRESS_CLASS: z.string().default(""),
  TLS_ENABLED: z.coerce.boolean().default(true),
  TLS_CLUSTER_ISSUER: z.string().default("letsencrypt-prod"),
  STORAGE_CLASS: z.string().default(""),

  // Tenant defaults
  DEFAULT_TENANT_CPU_QUOTA: z.string().default("4"),
  DEFAULT_TENANT_MEMORY_QUOTA: z.string().default("8Gi"),
  DEFAULT_TENANT_STORAGE_QUOTA: z.string().default("50Gi"),
});

export const env = envSchema.parse(process.env);
```

### 5. `.env.example`

Create a fully documented `.env.example` with all variables, comments, and sensible defaults. See the Platform Prompt "Configuration" section for the full list.

### 6. `package.json` Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx watch worker/index.ts",
    "worker:prod": "node dist/worker/index.js",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

### 7. Placeholder Directories

Create the directory structure with placeholder files so the project shape is visible:

```
src/
  app/
    layout.tsx          # Root layout (basic for now)
    page.tsx            # Redirect to /login or /dashboard
  lib/
    config.ts           # Env validation (implemented above)
    db.ts               # Prisma singleton (placeholder)
  types/                # Empty dir with .gitkeep
worker/                 # Empty dir with .gitkeep
prisma/                 # Will be populated in Step 02
public/
  icons/                # Empty dir for service icons
```

## Deliverables

- [ ] `npm run dev` starts successfully (shows default Next.js page)
- [ ] `docker compose up -d` starts PostgreSQL 16 (pgvector) + Redis 7
- [ ] `src/lib/config.ts` validates env vars with Zod (fails fast on missing required vars)
- [ ] `.env.example` is complete and documented
- [ ] TypeScript strict mode is on, project compiles with `npm run typecheck`
- [ ] All production + dev dependencies are installed
- [ ] shadcn/ui is initialized with base components
- [ ] Directory structure matches the project layout from the Platform Prompt

## Key Files

```
mathison/
├── docker-compose.yaml
├── .env.example
├── .env.local              (gitignored, created by developer)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx
    └── lib/
        └── config.ts
```

## Notes

- Do NOT implement auth, database schema, or any features yet — just the scaffolding.
- The `src/lib/config.ts` will fail at runtime until `.env.local` is created — that's intentional (fail-fast).
- Use `next.config.ts` (not `.js`) since we're all TypeScript.
- Set up path alias `@/*` → `src/*` in tsconfig.
