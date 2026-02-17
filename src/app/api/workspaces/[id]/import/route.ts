import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateSnapshot, importWorkspace } from "@/lib/workspace/import";

// ─── POST: Import/restore workspace from snapshot ─────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    // Parse the snapshot from request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    // Check workspace exists and belongs to tenant
    const workspace = await prisma.workspace.findFirst({
      where: { id, tenantId: session.user.tenantId, status: "ACTIVE" },
      select: { id: true },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get existing deployment names for conflict detection
    const existingDeployments = await prisma.deployment.findMany({
      where: {
        workspaceId: id,
        status: { not: "STOPPED" },
      },
      select: { name: true },
    });
    const existingNames = new Set(existingDeployments.map((d) => d.name));

    // Validate the snapshot
    const validation = validateSnapshot(body, { existingNames, force });

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Snapshot validation failed",
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    // Import the snapshot
    const result = await importWorkspace({
      workspaceId: id,
      tenantId: session.user.tenantId,
      snapshot: validation.snapshot!,
      force,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[POST /api/workspaces/[id]/import]", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
