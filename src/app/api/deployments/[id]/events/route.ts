import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReleaseEvents } from "@/lib/cluster/kubernetes";

// ─── GET /api/deployments/[id]/events ─────────────────────
// Get K8s pod events for a deployment (warnings, probe failures, etc.)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const deployment = await prisma.deployment.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { namespace: true, name: true, status: true },
    });

    if (!deployment) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 }
      );
    }

    if (deployment.status === "PENDING" || deployment.status === "STOPPED") {
      return NextResponse.json({ events: [] });
    }

    const events = await getReleaseEvents(
      deployment.namespace,
      deployment.name
    );

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[GET /api/deployments/[id]/events]", error);
    return NextResponse.json({ events: [] });
  }
}
