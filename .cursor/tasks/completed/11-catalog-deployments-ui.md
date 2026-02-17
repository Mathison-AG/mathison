# Step 11 — Catalog & Deployments UI

## Goal

Build the remaining frontend pages: catalog browser with search and filtering, recipe detail pages, deployment list, deployment detail with logs viewer. After this step, the MVP is feature-complete.

## Prerequisites

- Steps 01–10 completed (full backend, frontend shell, chat, canvas)
- Seed data in database (5 recipes)
- Some test deployments (created via AI agent or directly)

## What to Build

### 1. Catalog Browser (`src/app/(dashboard)/catalog/page.tsx`)

Server component page that fetches and displays recipes:

- **Search bar** with debounced input (client component) → calls `/api/catalog/search`
- **Category filter chips**: All, Database, Automation, Monitoring, Storage, Analytics
- **Recipe grid**: responsive grid of RecipeCard components
- **Loading skeleton** while data is fetching

### 2. Recipe Card (`src/components/catalog/recipe-card.tsx`)

Card component for the catalog grid:

```
┌─────────────────────────────┐
│  [Icon]  PostgreSQL         │
│          Database            │
│                             │
│  Relational database with   │
│  advanced features...       │
│                             │
│  [OFFICIAL]  [database]     │
│                [Deploy →]   │
└─────────────────────────────┘
```

- Service icon (from `public/icons/`)
- Display name + category subtitle
- Truncated description (2-3 lines)
- Tier badge (OFFICIAL = blue, VERIFIED = green, COMMUNITY = gray)
- Category badge
- Click navigates to `/catalog/[slug]`

### 3. Recipe Detail Page (`src/app/(dashboard)/catalog/[slug]/page.tsx`)

Full recipe information page:

- **Header**: icon, name, description, tier/status badges
- **Config options**: rendered from `configSchema` — show available settings with types, defaults, descriptions
- **Dependencies**: list of required services
- **Resource requirements**: CPU, memory defaults and limits
- **Deploy button**: opens a dialog or pre-fills the chat with "Deploy {name}"
  - Option A: Simple dialog with config form → calls deploy API
  - Option B: Opens chat panel with pre-filled message (leverages the AI agent)
  - Recommended: Option B (AI-first approach)

### 4. Catalog Search Hook (`src/hooks/use-catalog.ts`)

```typescript
import { useQuery } from "@tanstack/react-query";

export function useCatalog(search?: string, category?: string) {
  return useQuery({
    queryKey: ["catalog", search, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      const res = await fetch(`/api/catalog?${params}`);
      return res.json();
    },
  });
}

export function useRecipe(slug: string) {
  return useQuery({
    queryKey: ["catalog", slug],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/${slug}`);
      return res.json();
    },
  });
}
```

### 5. Deployment List (`src/app/(dashboard)/deployments/page.tsx`)

List of all deployments for the current tenant:

- **Table or card layout** with columns: Name, Service, Status, URL, Created
- **Status filtering**: All, Running, Deploying, Failed, Stopped
- **Refresh button** + auto-refresh when transitional states exist
- **Click** navigates to `/deployments/[id]`
- **Empty state** when no deployments

### 6. Deployment Card (`src/components/deployments/deployment-card.tsx`)

Row/card for the deployment list:

```
┌──────────────────────────────────────────────────────────────┐
│  [Icon]  my-postgresql    PostgreSQL    ● Running            │
│          https://...                    2 hours ago   [→]    │
└──────────────────────────────────────────────────────────────┘
```

- Recipe icon + deployment name
- Recipe display name
- Status badge (reuse from Step 10)
- URL (clickable link)
- Relative time since creation
- Click → detail page

### 7. Deployment Detail (`src/app/(dashboard)/deployments/[id]/page.tsx`)

Full deployment information:

- **Header**: name, recipe, status badge, URL
- **Info section**: namespace, Helm release name, created date, config
- **Actions**: Update config, Remove (with confirmation dialog)
- **Tabs or sections**:
  - **Overview**: config values, resource usage, connection info
  - **Logs**: live log viewer
  - **Events**: deployment history (future — placeholder for now)

### 8. Log Viewer (`src/components/deployments/log-viewer.tsx`)

Streaming log viewer component:

- Monospace font, dark background
- Auto-scroll to bottom (with option to pause)
- Line count selector (50, 100, 500)
- Refresh button
- Fetches from `/api/deployments/[id]/logs`

### 9. Deployment Logs API (`src/app/api/deployments/[id]/logs/route.ts`)

```typescript
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const deployment = await prisma.deployment.findFirst({
    where: { id: params.id, tenantId: session.user.tenantId },
  });
  if (!deployment) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const lines = parseInt(url.searchParams.get("lines") || "50");

  // Get pod logs via K8s API
  const logs = await getPodLogs(deployment.namespace, deployment.helmRelease, lines);
  return Response.json({ logs });
}
```

### 10. Deployments API Routes

**`/api/deployments/route.ts`** — GET (list), POST (deploy)
- GET: list deployments for authenticated tenant, with optional status filter
- POST: initiate deployment (alternative to going through the AI agent)

**`/api/deployments/[id]/route.ts`** — GET (detail), DELETE (remove)
- GET: full deployment details including live K8s status
- DELETE: initiate removal (queue undeploy job)

### 11. Deployment Hook (`src/hooks/use-deployments.ts`)

```typescript
import { useQuery } from "@tanstack/react-query";

export function useDeployments(status?: string) {
  return useQuery({
    queryKey: ["deployments", status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : "";
      const res = await fetch(`/api/deployments${params}`);
      return res.json();
    },
    refetchInterval: (query) => {
      // Poll every 5s if transitional deployments exist
      const data = query.state.data;
      if (!data) return false;
      const hasTransitional = data.some((d: any) =>
        ["PENDING", "DEPLOYING", "DELETING"].includes(d.status)
      );
      return hasTransitional ? 5000 : false;
    },
  });
}

export function useDeployment(id: string) {
  return useQuery({
    queryKey: ["deployments", id],
    queryFn: async () => {
      const res = await fetch(`/api/deployments/${id}`);
      return res.json();
    },
  });
}
```

### 12. Shared Types

**`src/types/deployment.ts`**:
```typescript
export interface Deployment {
  id: string;
  name: string;
  namespace: string;
  helmRelease: string;
  status: "PENDING" | "DEPLOYING" | "RUNNING" | "FAILED" | "STOPPED" | "DELETING";
  url: string | null;
  errorMessage: string | null;
  config: Record<string, any>;
  dependsOn: string[];
  recipe: { slug: string; displayName: string; iconUrl: string | null; category: string };
  createdAt: string;
  updatedAt: string;
}
```

**`src/types/canvas.ts`**:
```typescript
export interface CanvasNode {
  id: string;
  type: "service";
  position: { x: number; y: number };
  data: {
    deploymentId: string;
    displayName: string;
    recipeName: string;
    recipeSlug: string;
    iconUrl: string;
    status: string;
    url: string | null;
    category: string;
  };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: "dependency";
  animated: boolean;
}
```

## Deliverables

- [ ] `/catalog` page shows all published recipes in a responsive grid
- [ ] Search bar filters recipes by text (semantic search)
- [ ] Category chips filter recipes by category
- [ ] Recipe cards show icon, name, description, tier badge, category badge
- [ ] `/catalog/[slug]` shows full recipe details with config options
- [ ] Deploy button on recipe detail opens chat with pre-filled message
- [ ] `/deployments` page lists all tenant deployments with status
- [ ] Status filter works on deployment list
- [ ] `/deployments/[id]` shows full deployment detail
- [ ] Log viewer shows pod logs with auto-scroll
- [ ] Remove button shows confirmation dialog before deleting
- [ ] All pages have loading states and empty states
- [ ] All pages are responsive (mobile-friendly)

## Key Files

```
src/
├── app/(dashboard)/
│   ├── catalog/
│   │   ├── page.tsx                  # Catalog browser
│   │   └── [slug]/page.tsx           # Recipe detail
│   └── deployments/
│       ├── page.tsx                  # Deployment list
│       └── [id]/page.tsx             # Deployment detail
├── app/api/
│   └── deployments/
│       ├── route.ts                  # GET list, POST deploy
│       ├── [id]/route.ts             # GET detail, DELETE
│       └── [id]/logs/route.ts        # GET logs
├── components/
│   ├── catalog/
│   │   ├── recipe-card.tsx           # Card in catalog grid
│   │   ├── recipe-grid.tsx           # Grid layout
│   │   └── recipe-detail.tsx         # Full recipe info
│   └── deployments/
│       ├── deployment-card.tsx       # Row in deployment list
│       ├── deployment-detail.tsx     # Full detail view
│       └── log-viewer.tsx            # Streaming log viewer
├── hooks/
│   ├── use-catalog.ts               # Catalog data hooks
│   └── use-deployments.ts           # Deployment data hooks
└── types/
    ├── deployment.ts
    └── canvas.ts
```

## Notes

- This is the final step of the MVP. After this, all features from the "MVP Scope" section of the Platform Prompt are implemented.
- The "Deploy" action on recipe detail should prefer the AI-first approach: open the chat panel with a pre-filled message like "Deploy PostgreSQL" rather than building a separate deploy form.
- Use Server Components where possible (catalog page can be a server component that fetches data). Use client components only for interactive parts (search, filters, log viewer).
- The log viewer can be simple for MVP — just a pre-formatted text block that fetches and displays logs. Streaming (SSE) logs can be a later enhancement.
- After all 11 steps are done, the application should be fully functional: sign up → browse catalog → chat with agent → deploy services → see them on canvas → view logs.
