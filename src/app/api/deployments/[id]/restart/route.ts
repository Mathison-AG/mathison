import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { initiateUpgrade } from "@/lib/deployer/engine";

// ─── POST /api/deployments/[id]/restart ──────────────────
// Restart an app by triggering an upgrade with the same config

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const config = body.config ?? {};

    const result = await initiateUpgrade({
      tenantId: session.user.tenantId,
      deploymentId: id,
      config,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;

    if (status === 500) {
      console.error("[POST /api/deployments/[id]/restart]", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
