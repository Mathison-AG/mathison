import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace/context";
import { getReleaseResources, getReleaseServicePorts } from "@/lib/cluster/kubernetes";
import { getRecipeMetadataOrFallback } from "@/lib/catalog/metadata";
import type { PodResources, ReleaseServicePort } from "@/lib/cluster/kubernetes";

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
      where: { workspaceId: workspace.id, status: { not: "STOPPED" } },
      include: {
        recipe: {
          select: { slug: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Fetch K8s resources + service ports for running deployments
    const resourceMap = new Map<string, PodResources[]>();
    const portMap = new Map<string, ReleaseServicePort[]>();
    const running = deployments.filter(
      (d) => d.status === "RUNNING" || d.status === "DEPLOYING"
    );

    if (running.length > 0) {
      const results = await Promise.allSettled(
        running.map(async (d) => {
          const [resources, ports] = await Promise.all([
            getReleaseResources(d.namespace, d.name),
            getReleaseServicePorts(d.namespace, d.name),
          ]);
          return { name: d.name, resources, ports };
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          resourceMap.set(result.value.name, result.value.resources);
          portMap.set(result.value.name, result.value.ports);
        }
      }
    }

    const nodes = deployments.map((d) => {
      // Summarize resources from first pod's first container
      const podResources = resourceMap.get(d.name);
      const mainContainer = podResources?.[0]?.containers?.[0];
      const recipeMeta = getRecipeMetadataOrFallback(d.recipe.slug);

      return {
        id: d.id,
        type: "service" as const,
        position: { x: 0, y: 0 }, // Auto-laid out by dagre on the client
        data: {
          deploymentId: d.id,
          displayName: d.name,
          recipeName: recipeMeta.displayName,
          recipeSlug: recipeMeta.slug,
          iconUrl: recipeMeta.iconUrl,
          status: d.status,
          url: d.url,
          appVersion: d.appVersion,
          category: recipeMeta.category,
          resources: mainContainer
            ? {
                cpuRequest: mainContainer.requests.cpu,
                memoryRequest: mainContainer.requests.memory,
                cpuLimit: mainContainer.limits.cpu,
                memoryLimit: mainContainer.limits.memory,
              }
            : null,
          ports: (portMap.get(d.name) ?? []).map((p) => ({
            port: p.port,
            name: p.name,
          })),
        },
      };
    });

    const edges = deployments.flatMap((d) =>
      d.dependsOn.map((depId) => ({
        id: `${depId}-${d.id}`,
        source: depId,
        target: d.id,
        type: "dependency" as const,
        animated: true,
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
