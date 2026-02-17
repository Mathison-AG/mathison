import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { exportWorkspace } from "@/lib/workspace/export";

// ─── GET: Export workspace to snapshot ────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const snapshot = await exportWorkspace({
      workspaceId: id,
      tenantId: session.user.tenantId,
      exportedBy: session.user.id,
    });

    // Check if client wants a file download
    const url = new URL(req.url);
    const download = url.searchParams.get("download") === "true";

    if (download) {
      const filename = `${snapshot.workspace.slug}-backup-${new Date().toISOString().split("T")[0]}.json`;
      return new NextResponse(JSON.stringify(snapshot, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[GET /api/workspaces/[id]/export]", error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
