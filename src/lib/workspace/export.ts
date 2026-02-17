/**
 * Workspace Export
 *
 * Exports a workspace's complete desired state to a portable JSON snapshot.
 * Secrets are never exported (security). K8s resource state is not captured
 * (recreated from recipes on restore). Dependency references use service
 * names (not IDs) for portability.
 */

import { prisma } from "@/lib/db";
import { getRecipeDefinition } from "@/recipes/registry";

import type { WorkspaceSnapshot, SnapshotService } from "@/types/snapshot";

// ─── Export ───────────────────────────────────────────────

/**
 * Export a workspace to a portable snapshot.
 *
 * Reads all non-STOPPED deployments, validates their configs against
 * recipe Zod schemas, and produces a snapshot with dependency references
 * translated from deployment IDs to service names.
 */
export async function exportWorkspace(params: {
  workspaceId: string;
  tenantId: string;
  exportedBy: string;
}): Promise<WorkspaceSnapshot> {
  const { workspaceId, tenantId, exportedBy } = params;

  // 1. Look up the workspace
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, tenantId, status: "ACTIVE" },
    select: { slug: true, name: true },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // 2. Get all deployments in the workspace (exclude STOPPED)
  const deployments = await prisma.deployment.findMany({
    where: {
      workspaceId,
      status: { not: "STOPPED" },
    },
    include: {
      recipe: { select: { slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // 3. Build ID → name map for dependency resolution
  const idToName = new Map<string, string>();
  for (const d of deployments) {
    idToName.set(d.id, d.name);
  }

  // 4. Convert each deployment to a snapshot service
  const services: SnapshotService[] = [];

  for (const deployment of deployments) {
    const recipeSlug = deployment.recipe.slug;
    const config = (deployment.config ?? {}) as Record<string, unknown>;

    // Validate config still matches the recipe's Zod schema
    const recipe = getRecipeDefinition(recipeSlug);
    if (recipe) {
      const parsed = recipe.configSchema.safeParse(config);
      if (!parsed.success) {
        console.warn(
          `[export] Config for '${deployment.name}' (${recipeSlug}) doesn't validate against current schema — exporting as-is`
        );
      }
    }

    // Translate dependency IDs to names
    const dependsOn = deployment.dependsOn
      .map((id) => idToName.get(id))
      .filter((name): name is string => name !== undefined);

    services.push({
      recipe: recipeSlug,
      name: deployment.name,
      config,
      dependsOn,
      status: deployment.status,
    });
  }

  // 5. Build the snapshot
  const snapshot: WorkspaceSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy,
    workspace: {
      slug: workspace.slug,
      name: workspace.name,
    },
    services,
    metadata: {
      platform: "mathison",
      engineVersion: "2",
    },
  };

  return snapshot;
}
