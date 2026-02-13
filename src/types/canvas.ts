// ─── Canvas Node ──────────────────────────────────────────

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

// ─── Canvas Edge ──────────────────────────────────────────

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: "dependency";
  animated: boolean;
}
