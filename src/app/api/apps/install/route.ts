import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace/context";
import { getRecipe } from "@/lib/catalog/service";
import { initiateDeployment } from "@/lib/deployer/engine";

// ─── POST /api/apps/install ────────────────────────────────
// One-click install: takes a recipe slug, deploys with defaults

const bodySchema = z.object({
  recipeSlug: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: z.flattenError(parsed.error) },
        { status: 400 }
      );
    }

    const { recipeSlug } = parsed.data;

    // Look up recipe
    const recipe = await getRecipe(recipeSlug);
    if (!recipe) {
      return NextResponse.json(
        { error: "App not found" },
        { status: 404 }
      );
    }

    // Get active workspace
    const workspace = await getActiveWorkspace(
      session.user.tenantId,
      session.user.id
    );
    if (!workspace) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    // Generate a unique deployment name (recipe slug, append number if conflict)
    const baseName = recipe.slug;
    let deploymentName = baseName;
    let suffix = 2;

    const existingNames = await prisma.deployment.findMany({
      where: {
        workspaceId: workspace.id,
        name: { startsWith: baseName },
        status: { not: "STOPPED" },
      },
      select: { name: true },
    });

    const nameSet = new Set(existingNames.map((d) => d.name));
    while (nameSet.has(deploymentName)) {
      deploymentName = `${baseName}-${suffix}`;
      suffix++;
    }

    // Deploy with default config
    const result = await initiateDeployment({
      tenantId: session.user.tenantId,
      workspaceId: workspace.id,
      recipeSlug,
      name: deploymentName,
    });

    return NextResponse.json({
      deploymentId: result.deploymentId,
      name: result.name,
      status: result.status,
      displayName: recipe.displayName,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";

    console.error("[POST /api/apps/install]", message);

    // Map known engine errors to friendly messages
    if (message.includes("already deployed") || message.includes("already exists")) {
      return NextResponse.json(
        { error: "This app is already running in your workspace. Check your apps to see its status." },
        { status: 409 }
      );
    }

    if (message.includes("not found in catalog")) {
      return NextResponse.json(
        { error: "This app is no longer available in the catalog." },
        { status: 404 }
      );
    }

    if (message.includes("Workspace not found")) {
      return NextResponse.json(
        { error: "Your workspace isn't ready yet. Please try again in a moment." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Something went wrong while starting the installation. Please try again." },
      { status: 500 }
    );
  }
}
