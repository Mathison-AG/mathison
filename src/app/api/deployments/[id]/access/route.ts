import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readK8sSecret } from "@/lib/deployer/secrets";
import { getRecipeMetadataOrFallback } from "@/lib/catalog/metadata";
import { getRecipeDefinition } from "@/recipes/registry";

// ─── GET /api/deployments/[id]/access ─────────────────────
// Returns connection info for a deployment (credentials, host, port)

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
      select: {
        id: true,
        name: true,
        status: true,
        url: true,
        localPort: true,
        servicePort: true,
        serviceName: true,
        namespace: true,
        secretsRef: true,
        config: true,
        recipe: {
          select: { slug: true },
        },
      },
    });

    if (!deployment) {
      return NextResponse.json(
        { error: "Deployment not found" },
        { status: 404 }
      );
    }

    // Get recipe metadata from registry
    const recipeMeta = getRecipeMetadataOrFallback(deployment.recipe.slug);
    const recipeDef = getRecipeDefinition(deployment.recipe.slug);

    // Read credentials from K8s secrets
    let credentials: Record<string, string> = {};
    if (deployment.secretsRef) {
      try {
        credentials = await readK8sSecret(
          deployment.namespace,
          deployment.secretsRef
        );
      } catch (err) {
        console.warn(
          `[GET /api/deployments/[id]/access] Failed to read secrets:`,
          err
        );
      }
    }

    // Build connection info based on recipe type
    const config = (deployment.config ?? {}) as Record<string, unknown>;

    // Collect config values relevant to connections
    const CONNECTION_KEYS = new Set([
      "database", "username", "user", "db_name", "schema",
    ]);
    const configValues: Record<string, { label: string; value: string }> = {};
    if (recipeDef) {
      // Parse the config through the Zod schema to get defaults
      const parsed = recipeDef.configSchema.safeParse(config);
      const fullConfig = parsed.success
        ? (parsed.data as Record<string, unknown>)
        : config;

      for (const key of CONNECTION_KEYS) {
        const val = fullConfig[key];
        if (val !== undefined) {
          configValues[key] = {
            label: key,
            value: String(val),
          };
        }
      }
    }

    // Collect secret values with labels
    const secretValues: Record<string, { label: string; value: string }> = {};
    if (recipeDef) {
      for (const [key, field] of Object.entries(recipeDef.secrets)) {
        if (credentials[key]) {
          secretValues[key] = {
            label: field.description || key,
            value: credentials[key],
          };
        }
      }
    }

    // Determine access host/port — use ingress URL when available, else localhost port-forward
    const hasIngressUrl = deployment.url?.startsWith("http") && !deployment.url.includes("localhost");
    let host: string;
    let port: number | null;

    if (hasIngressUrl) {
      // Production: parse hostname from ingress URL
      const parsed = new URL(deployment.url!);
      host = parsed.hostname;
      port = deployment.servicePort;
    } else {
      // Local dev: port-forward to localhost
      host = "localhost";
      port = deployment.localPort;
    }

    // Build connection string for common database types
    let connectionString: string | null = null;

    if (recipeMeta.category === "database") {
      // Database connections use internal K8s DNS in production, localhost port-forward in dev
      const dbHost = hasIngressUrl
        ? `${deployment.serviceName}.${deployment.namespace}.svc.cluster.local`
        : "localhost";
      const dbPort = hasIngressUrl ? deployment.servicePort : deployment.localPort;

      if (dbPort) {
        switch (recipeMeta.slug) {
          case "postgresql": {
            const db = (config.database as string) || "app";
            const user = (config.username as string) || "app";
            const pass = credentials.password || "***";
            connectionString = `postgresql://${user}:${pass}@${dbHost}:${dbPort}/${db}`;
            break;
          }
          case "redis": {
            const pass = credentials.password;
            connectionString = pass
              ? `redis://:${pass}@${dbHost}:${dbPort}`
              : `redis://${dbHost}:${dbPort}`;
            break;
          }
          case "mysql": {
            const db = (config.database as string) || "app";
            const user = (config.username as string) || "root";
            const pass = credentials.password || "***";
            connectionString = `mysql://${user}:${pass}@${dbHost}:${dbPort}/${db}`;
            break;
          }
        }
      }
    }

    return NextResponse.json({
      id: deployment.id,
      name: deployment.name,
      displayName: recipeMeta.displayName,
      category: recipeMeta.category,
      slug: recipeMeta.slug,
      hasWebUI: recipeMeta.hasWebUI,
      status: deployment.status,
      url: deployment.url,
      host,
      port,
      servicePort: recipeDef?.ingress?.port || deployment.servicePort,
      config: configValues,
      secrets: secretValues,
      connectionString,
    });
  } catch (error) {
    console.error("[GET /api/deployments/[id]/access]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
