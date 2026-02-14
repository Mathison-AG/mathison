import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace/context";
import { getReleaseResources } from "@/lib/cluster/kubernetes";
import type { PodResources } from "@/lib/cluster/kubernetes";

// ─── GET /api/deployments ─────────────────────────────────
// List deployments for the active workspace, enriched with K8s resources

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
        ...(status ? { status: status as never } : {}),
      },
      include: {
        recipe: {
          select: {
            slug: true,
            displayName: true,
            iconUrl: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch K8s resources for all running deployments in parallel
    const resourceMap = new Map<string, PodResources[]>();
    const runningDeployments = deployments.filter(
      (d) => d.status === "RUNNING" || d.status === "DEPLOYING"
    );

    if (runningDeployments.length > 0) {
      const results = await Promise.allSettled(
        runningDeployments.map(async (d) => {
          const resources = await getReleaseResources(
            d.namespace,
            d.helmRelease
          );
          return { helmRelease: d.helmRelease, resources };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          resourceMap.set(result.value.helmRelease, result.value.resources);
        }
      }
    }

    const enriched = deployments.map((d) => ({
      ...d,
      resources: resourceMap.get(d.helmRelease) ?? [],
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("[GET /api/deployments]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
