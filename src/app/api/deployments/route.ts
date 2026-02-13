import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace/context";

// ─── GET /api/deployments ─────────────────────────────────
// List deployments for the active workspace

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;

    const deployments = await prisma.deployment.findMany({
      where: {
        workspaceId: workspace.id,
        ...(status ? { status: status as never } : {})
      },
      include: {
        recipe: {
          select: {
            slug: true,
            displayName: true,
            iconUrl: true,
            category: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(deployments);
  } catch (error) {
    console.error("[GET /api/deployments]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
