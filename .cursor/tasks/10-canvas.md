# Step 10 — Canvas (React Flow)

## Goal

Build the visual stack canvas using React Flow: service nodes showing deployment status, dependency edges, auto-layout, and the API endpoint that provides canvas data. After this step, the dashboard shows a live visual graph of the user's deployed stack.

## Prerequisites

- Steps 01–09 completed (full backend + frontend shell + chat panel)
- Some test deployments in the database (can be manually created or via AI agent)

## What to Build

### 1. Stack API Route (`src/app/api/stack/route.ts`)

GET endpoint that returns canvas data (nodes + edges) for the authenticated user's tenant:

```typescript
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const deployments = await prisma.deployment.findMany({
    where: { tenantId: session.user.tenantId },
    include: { recipe: true },
  });

  const nodes = deployments.map((d, i) => ({
    id: d.id,
    type: "service",
    position: { x: 0, y: 0 },  // Will be auto-laid out by dagre
    data: {
      deploymentId: d.id,
      displayName: d.name,
      recipeName: d.recipe.displayName,
      recipeSlug: d.recipe.slug,
      iconUrl: d.recipe.iconUrl || `/icons/${d.recipe.slug}.svg`,
      status: d.status,
      url: d.url,
      category: d.recipe.category,
    },
  }));

  const edges = deployments.flatMap((d) =>
    d.dependsOn.map((depId) => ({
      id: `${depId}-${d.id}`,
      source: depId,
      target: d.id,
      type: "dependency",
      animated: true,
    }))
  );

  return Response.json({ nodes, edges });
}
```

### 2. Canvas Data Hook (`src/hooks/use-canvas-data.ts`)

TanStack Query hook for fetching and polling canvas data:

```typescript
import { useQuery } from "@tanstack/react-query";

export function useCanvasData() {
  return useQuery({
    queryKey: ["stack"],
    queryFn: async () => {
      const res = await fetch("/api/stack");
      if (!res.ok) throw new Error("Failed to fetch stack");
      return res.json();
    },
    refetchInterval: (query) => {
      // Poll every 5s if any deployment is in a transitional state
      const data = query.state.data;
      if (!data) return false;
      const hasTransitional = data.nodes.some((n: any) =>
        ["PENDING", "DEPLOYING", "DELETING"].includes(n.data.status)
      );
      return hasTransitional ? 5000 : false;
    },
  });
}
```

### 3. Stack Canvas (`src/components/canvas/stack-canvas.tsx`)

React Flow canvas wrapper with auto-layout:

```typescript
"use client";

import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from "@xyflow/react";
import { ServiceNode } from "./service-node";
import { DependencyEdge } from "./dependency-edge";
import { useCanvasData } from "@/hooks/use-canvas-data";
import { useAutoLayout } from "./use-auto-layout";

const nodeTypes = { service: ServiceNode };
const edgeTypes = { dependency: DependencyEdge };

export function StackCanvas() {
  const { data, isLoading } = useCanvasData();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Auto-layout with dagre when data changes
  useAutoLayout(data, setNodes, setEdges);

  if (isLoading) return <LoadingSkeleton />;
  if (!data?.nodes.length) return <EmptyState />;

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

### 4. Auto-Layout with Dagre (`src/components/canvas/use-auto-layout.ts`)

Use the `dagre` library for automatic graph layout:

```typescript
import dagre from "dagre";

export function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: 250, height: 100 });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x - 125, y: pos.y - 50 } };
  });
}
```

### 5. Service Node (`src/components/canvas/service-node.tsx`)

Custom React Flow node for deployed services:

```typescript
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StatusBadge } from "@/components/deployments/status-badge";

export function ServiceNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm min-w-[200px] hover:shadow-md transition-shadow">
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />

      <div className="flex items-center gap-3">
        <img src={data.iconUrl} alt="" className="h-8 w-8 rounded" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{data.displayName}</div>
          <div className="text-xs text-muted-foreground">{data.recipeName}</div>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {data.url && (
        <a href={data.url} target="_blank" rel="noopener"
           className="mt-2 block text-xs text-blue-500 hover:underline truncate">
          {data.url}
        </a>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}
```

### 6. Dependency Edge (`src/components/canvas/dependency-edge.tsx`)

Custom animated edge for dependencies:

```typescript
"use client";

import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export function DependencyEdge(props: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
  });

  return <BaseEdge path={edgePath} {...props} />;
}
```

### 7. Canvas Controls (`src/components/canvas/canvas-controls.tsx`)

Custom control buttons:
- Fit view (zoom to fit all nodes)
- Zoom in / Zoom out
- Auto-layout (re-run dagre)

### 8. Status Badge (`src/components/deployments/status-badge.tsx`)

Reusable status indicator:

```typescript
const statusConfig = {
  PENDING:   { label: "Pending",   variant: "outline",     icon: Clock },
  DEPLOYING: { label: "Deploying", variant: "secondary",   icon: Loader2, animate: true },
  RUNNING:   { label: "Running",   variant: "default",     icon: CheckCircle, color: "green" },
  FAILED:    { label: "Failed",    variant: "destructive",  icon: XCircle },
  STOPPED:   { label: "Stopped",   variant: "outline",     icon: StopCircle },
  DELETING:  { label: "Deleting",  variant: "secondary",   icon: Loader2, animate: true },
};
```

### 9. Empty State

When there are no deployments, show an inviting empty state:
- Illustration or icon
- "Your workspace is empty"
- "Chat with Mathison to deploy your first service"
- Button that opens the chat panel

### 10. Service Icons

Add SVG icons for the seed recipes to `public/icons/`:
- `postgresql.svg`
- `redis.svg`
- `n8n.svg`
- `uptime-kuma.svg`
- `minio.svg`

Use simple, recognizable icons (can be sourced from Simple Icons or similar).

### 11. Additional Dependencies

```bash
npm install dagre @types/dagre
```

## Deliverables

- [ ] Dashboard page shows React Flow canvas with deployed services as nodes
- [ ] Nodes display: icon, name, recipe name, status badge, URL link
- [ ] Edges show dependency relationships (e.g., n8n → PostgreSQL)
- [ ] Auto-layout positions nodes cleanly using dagre
- [ ] Canvas auto-refreshes when deployments are in transitional states (DEPLOYING, DELETING)
- [ ] Deploying via chat → canvas updates within 5 seconds
- [ ] Empty state shows when no deployments exist
- [ ] Fit-to-view, zoom controls work
- [ ] Status badges show correct colors and icons for each state
- [ ] Service icons render for all 5 seed recipes

## Key Files

```
src/
├── app/api/
│   └── stack/route.ts              # Canvas data endpoint
├── hooks/
│   └── use-canvas-data.ts          # TanStack Query hook
├── components/
│   ├── canvas/
│   │   ├── stack-canvas.tsx        # React Flow wrapper
│   │   ├── service-node.tsx        # Custom service node
│   │   ├── dependency-edge.tsx     # Custom dependency edge
│   │   ├── canvas-controls.tsx     # Zoom/layout controls
│   │   └── use-auto-layout.ts     # Dagre layout hook
│   └── deployments/
│       └── status-badge.tsx        # Reusable status badge
public/icons/
├── postgresql.svg
├── redis.svg
├── n8n.svg
├── uptime-kuma.svg
└── minio.svg
```

## Notes

- **React Flow** requires `@xyflow/react` (v12+). Make sure to import from `@xyflow/react`, not `reactflow`.
- **dagre** handles the auto-layout. It computes positions given a directed graph — perfect for dependency trees.
- Import React Flow CSS: `import "@xyflow/react/dist/style.css"` in the canvas component or root layout.
- The canvas should fill the entire main content area (use `h-full w-full`).
- Polling only happens when deployments are in transitional states — otherwise the data is static.
- Clicking a node could open the deployment detail in the future (not needed for MVP, but make nodes look clickable).
