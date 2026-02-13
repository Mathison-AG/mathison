import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReleaseLogs } from "@/lib/cluster/kubernetes";

// ─── GET /api/deployments/[id]/logs ───────────────────────
// Get pod logs for a deployment

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const lines = parseInt(searchParams.get("lines") || "100", 10);

    const deployment = await prisma.deployment.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { namespace: true, helmRelease: true, status: true }
    });

    if (!deployment) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 }
      );
    }

    // Only attempt to get logs for deployed services
    if (deployment.status === "PENDING") {
      return NextResponse.json({
        logs: "Service is pending deployment — no logs available yet."
      });
    }

    const logs = await getReleaseLogs(
      deployment.namespace,
      deployment.helmRelease,
      lines
    );

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("[GET /api/deployments/[id]/logs]", error);
    return NextResponse.json({
      logs: "Failed to retrieve logs. The service may not be running."
    });
  }
}
