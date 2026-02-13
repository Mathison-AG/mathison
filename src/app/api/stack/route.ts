import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace/context";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getActiveWorkspace(
      session.user.tenantId,
      session.user.id
    );
    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const deployments = await prisma.deployment.findMany({
      where: { workspaceId: workspace.id },
      include: {
        recipe: {
          select: {
            displayName: true,
            slug: true,
            iconUrl: true,
            category: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const nodes = deployments.map((d) => ({
      id: d.id,
      type: "service" as const,
      position: { x: 0, y: 0 }, // Auto-laid out by dagre on the client
      data: {
        deploymentId: d.id,
        displayName: d.name,
        recipeName: d.recipe.displayName,
        recipeSlug: d.recipe.slug,
        iconUrl: d.recipe.iconUrl || `/icons/${d.recipe.slug}.svg`,
        status: d.status,
        url: d.url,
        category: d.recipe.category
      }
    }));

    const edges = deployments.flatMap((d) =>
      d.dependsOn.map((depId) => ({
        id: `${depId}-${d.id}`,
        source: depId,
        target: d.id,
        type: "dependency" as const,
        animated: true
      }))
    );

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    console.error("[GET /api/stack]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
