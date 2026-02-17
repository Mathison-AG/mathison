import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readK8sSecret } from "@/lib/deployer/secrets";

import type { ConfigSchema, SecretsSchema } from "@/types/recipe";

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
          select: {
            slug: true,
            displayName: true,
            category: true,
            hasWebUI: true,
            configSchema: true,
            secretsSchema: true,
            ingressConfig: true,
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
    const configSchema = deployment.recipe.configSchema as unknown as ConfigSchema;
    const secretsSchema = deployment.recipe.secretsSchema as SecretsSchema;
    const ingressConfig = deployment.recipe.ingressConfig as {
      port?: number;
    } | null;

    // Only include connection-relevant config values (credentials, identifiers)
    const CONNECTION_KEYS = new Set([
      "database", "username", "user", "db_name", "schema",
    ]);
    const configValues: Record<string, { label: string; value: string }> = {};
    for (const [key, field] of Object.entries(configSchema)) {
      if (!CONNECTION_KEYS.has(key)) continue;
      const val = config[key] ?? field.default;
      if (val !== undefined) {
        configValues[key] = {
          label: field.label || key,
          value: String(val),
        };
      }
    }

    // Collect secret values with labels
    const secretValues: Record<string, { label: string; value: string }> = {};
    for (const [key, field] of Object.entries(secretsSchema)) {
      if (credentials[key]) {
        secretValues[key] = {
          label: field.description || key,
          value: credentials[key],
        };
      }
    }

    // Build connection string for common database types
    let connectionString: string | null = null;
    const host = "localhost";
    const port = deployment.localPort;

    if (port && deployment.recipe.category === "database") {
      switch (deployment.recipe.slug) {
        case "postgresql": {
          const db = (config.database as string) || "app";
          const user = (config.username as string) || "app";
          const pass = credentials.password || "***";
          connectionString = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
          break;
        }
        case "redis": {
          const pass = credentials.password;
          connectionString = pass
            ? `redis://:${pass}@${host}:${port}`
            : `redis://${host}:${port}`;
          break;
        }
        case "mysql": {
          const db = (config.database as string) || "app";
          const user = (config.username as string) || "root";
          const pass = credentials.password || "***";
          connectionString = `mysql://${user}:${pass}@${host}:${port}/${db}`;
          break;
        }
      }
    }

    return NextResponse.json({
      id: deployment.id,
      name: deployment.name,
      displayName: deployment.recipe.displayName,
      category: deployment.recipe.category,
      slug: deployment.recipe.slug,
      hasWebUI: deployment.recipe.hasWebUI,
      status: deployment.status,
      url: deployment.url,
      host,
      port,
      servicePort: ingressConfig?.port || deployment.servicePort,
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
