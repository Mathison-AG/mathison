import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getReleaseResources, getReleaseServicePorts } from "@/lib/cluster/kubernetes";
import { initiateRemoval } from "@/lib/deployer/engine";
import type { ReleaseServicePort } from "@/lib/cluster/kubernetes";

// ─── GET /api/deployments/[id] ────────────────────────────
// Get deployment detail (tenant-scoped for authorization)
// Enriches with live K8s resource allocations when deployment is RUNNING

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
      include: {
        recipe: {
          select: {
            slug: true,
            displayName: true,
            iconUrl: true,
            category: true,
            hasWebUI: true,
          },
        },
      },
    });

    if (!deployment) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 }
      );
    }

    // Fetch live resource allocations + service ports from K8s for running deployments
    let resources: Awaited<ReturnType<typeof getReleaseResources>> = [];
    let ports: ReleaseServicePort[] = [];
    if (deployment.status === "RUNNING" || deployment.status === "DEPLOYING") {
      try {
        [resources, ports] = await Promise.all([
          getReleaseResources(deployment.namespace, deployment.name),
          getReleaseServicePorts(deployment.namespace, deployment.name),
        ]);
      } catch (err) {
        console.warn(
          `[GET /api/deployments/[id]] Failed to fetch K8s data for ${deployment.name}:`,
          err
        );
      }
    }

    return NextResponse.json({ ...deployment, resources, ports });
  } catch (error) {
    console.error("[GET /api/deployments/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/deployments/[id] ─────────────────────────
// Initiate removal of a deployment

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const result = await initiateRemoval({
      tenantId: session.user.tenantId,
      deploymentId: id
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found")
      ? 404
      : message.includes("Cannot remove")
        ? 409
        : 500;

    if (status === 500) {
      console.error("[DELETE /api/deployments/[id]]", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
