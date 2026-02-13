import type { DeploymentStatus } from "@/generated/prisma/enums";

// ─── Deployment (API response shape) ──────────────────────

export interface Deployment {
  id: string;
  name: string;
  namespace: string;
  helmRelease: string;
  status: DeploymentStatus;
  url: string | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
  dependsOn: string[];
  recipe: {
    slug: string;
    displayName: string;
    iconUrl: string | null;
    category: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Deployment detail (extended) ─────────────────────────

export interface DeploymentDetail extends Deployment {
  recipeId: string;
  recipeVersion: number;
  secretsRef: string | null;
}
