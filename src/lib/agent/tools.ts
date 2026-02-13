import { tool } from "ai";
import { z } from "zod/v4";

import { prisma } from "@/lib/db";
import { searchRecipes, getRecipe, createRecipe } from "@/lib/catalog/service";
import { getReleasePodStatus, getReleaseLogs } from "@/lib/cluster/kubernetes";
import {
  initiateDeployment,
  initiateUpgrade,
  initiateRemoval,
} from "@/lib/deployer/engine";

import type { ConfigSchema, AiHints, RecipeCreateInput } from "@/types/recipe";

// ─── Helpers ─────────────────────────────────────────────

/** Get live K8s pod status for a Helm release */
async function getK8sPodStatus(
  namespace: string,
  helmRelease: string
): Promise<{
  pods: Array<{ name: string; status: string; restarts: number }>;
}> {
  try {
    const result = await getReleasePodStatus(namespace, helmRelease);
    return {
      pods: result.pods.map((p) => ({
        name: p.name,
        status: p.status,
        restarts: p.restarts,
      })),
    };
  } catch (err) {
    console.error(`[getK8sPodStatus] Failed for ${helmRelease}:`, err);
    return { pods: [] };
  }
}

/** Get K8s pod logs for a Helm release */
async function getK8sPodLogs(
  namespace: string,
  helmRelease: string,
  lines: number
): Promise<string> {
  try {
    return await getReleaseLogs(namespace, helmRelease, lines);
  } catch (err) {
    console.error(`[getK8sPodLogs] Failed for ${helmRelease}:`, err);
    return `Failed to retrieve logs for '${helmRelease}': ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ─── Tools ──────────────────────────────────────────────

export function getTools(tenantId: string) {
  return {
    // ── Catalog tools ─────────────────────────────────────

    searchCatalog: tool({
      description:
        "Search the service catalog for available services to deploy. Use this when the user asks what's available or wants to find a specific type of service.",
      inputSchema: z.object({
        query: z.string().describe("Natural language search query"),
        category: z
          .string()
          .optional()
          .describe(
            "Filter by category: database, automation, monitoring, storage, analytics"
          )
      }),
      execute: async ({ query, category }) => {
        try {
          const results = await searchRecipes(query, category);
          return results.map((r) => ({
            slug: r.slug,
            displayName: r.displayName,
            description: r.description,
            category: r.category,
            tier: r.tier
          }));
        } catch (error) {
          // Fallback to text search if embeddings aren't available
          console.error(
            "[searchCatalog] Semantic search failed, falling back to text search:",
            error
          );
          const recipes = await prisma.recipe.findMany({
            where: {
              status: "PUBLISHED",
              ...(category ? { category } : {}),
              OR: [
                { displayName: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
                { tags: { has: query.toLowerCase() } }
              ]
            },
            select: {
              slug: true,
              displayName: true,
              description: true,
              category: true,
              tier: true
            },
            orderBy: { displayName: "asc" },
            take: 10
          });
          return recipes;
        }
      }
    }),

    getRecipe: tool({
      description:
        "Get full details about a specific service recipe including its configuration options.",
      inputSchema: z.object({
        slug: z.string().describe("Recipe slug, e.g. 'postgresql'")
      }),
      execute: async ({ slug }) => {
        const recipe = await getRecipe(slug);
        if (!recipe) {
          return { error: `Recipe '${slug}' not found` };
        }
        return {
          slug: recipe.slug,
          displayName: recipe.displayName,
          description: recipe.description,
          category: recipe.category,
          tier: recipe.tier,
          configSchema: recipe.configSchema,
          dependencies: recipe.dependencies,
          resourceDefaults: recipe.resourceDefaults,
          tags: recipe.tags
        };
      }
    }),

    // ── Deployment tools ──────────────────────────────────

    deployService: tool({
      description:
        "Deploy a service from the catalog to the user's workspace. This will install the service and all its dependencies.",
      inputSchema: z.object({
        recipeSlug: z
          .string()
          .describe("The recipe to deploy, e.g. 'postgresql'"),
        name: z
          .string()
          .optional()
          .describe("Custom name for this deployment, e.g. 'my-database'"),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Configuration overrides matching the recipe's config schema"
          )
      }),
      execute: async ({ recipeSlug, name, config }) => {
        try {
          const result = await initiateDeployment({
            tenantId,
            recipeSlug,
            name,
            config,
          });

          return {
            deploymentId: result.deploymentId,
            name: result.name,
            status: result.status,
            message: result.message,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[deployService]", { recipeSlug, tenantId }, err);
          return { error: message };
        }
      }
    }),

    getStackStatus: tool({
      description:
        "Get the status of all deployed services in the user's workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        const deployments = await prisma.deployment.findMany({
          where: { tenantId },
          include: {
            recipe: {
              select: { displayName: true, slug: true, category: true }
            }
          },
          orderBy: { createdAt: "desc" }
        });

        if (deployments.length === 0) {
          return {
            message: "No services deployed yet.",
            services: [] as Array<{
              deploymentId: string;
              name: string;
              recipe: string;
              recipeSlug: string;
              category: string;
              status: string;
              url: string | null;
              pods: Array<{
                name: string;
                status: string;
                restarts: number;
              }>;
              createdAt: string;
            }>
          };
        }

        const services = await Promise.all(
          deployments.map(async (d) => {
            const k8sStatus = await getK8sPodStatus(d.namespace, d.helmRelease);
            return {
              deploymentId: d.id,
              name: d.name,
              recipe: d.recipe.displayName,
              recipeSlug: d.recipe.slug,
              category: d.recipe.category,
              status: d.status as string,
              url: d.url,
              pods: k8sStatus.pods,
              createdAt: d.createdAt.toISOString()
            };
          })
        );

        return { services };
      }
    }),

    getServiceDetail: tool({
      description:
        "Get detailed information about a specific deployed service including resource usage and connection details.",
      inputSchema: z.object({
        deploymentId: z.string().describe("The deployment ID")
      }),
      execute: async ({ deploymentId }) => {
        const deployment = await prisma.deployment.findFirst({
          where: { id: deploymentId, tenantId },
          include: {
            recipe: {
              select: {
                displayName: true,
                slug: true,
                category: true,
                configSchema: true,
                resourceDefaults: true,
                ingressConfig: true
              }
            }
          }
        });

        if (!deployment) {
          return { error: "Deployment not found" };
        }

        const k8sStatus = await getK8sPodStatus(
          deployment.namespace,
          deployment.helmRelease
        );

        return {
          deploymentId: deployment.id,
          name: deployment.name,
          recipe: deployment.recipe.displayName,
          recipeSlug: deployment.recipe.slug,
          status: deployment.status as string,
          url: deployment.url,
          namespace: deployment.namespace,
          helmRelease: deployment.helmRelease,
          config: deployment.config as Record<string, unknown>,
          pods: k8sStatus.pods,
          resourceDefaults: deployment.recipe.resourceDefaults as Record<
            string,
            unknown
          >,
          dependsOn: deployment.dependsOn,
          errorMessage: deployment.errorMessage,
          createdAt: deployment.createdAt.toISOString(),
          updatedAt: deployment.updatedAt.toISOString()
        };
      }
    }),

    getServiceLogs: tool({
      description:
        "Get recent logs from a deployed service. Useful for debugging.",
      inputSchema: z.object({
        deploymentId: z.string().describe("The deployment ID"),
        lines: z
          .number()
          .optional()
          .default(50)
          .describe("Number of log lines to retrieve")
      }),
      execute: async ({ deploymentId, lines }) => {
        const deployment = await prisma.deployment.findFirst({
          where: { id: deploymentId, tenantId },
          select: {
            namespace: true,
            helmRelease: true,
            name: true,
            status: true
          }
        });

        if (!deployment) {
          return { error: "Deployment not found" };
        }

        if (deployment.status === "PENDING") {
          return {
            logs: `Service '${deployment.name}' is still pending deployment — no logs available yet.`
          };
        }

        const logs = await getK8sPodLogs(
          deployment.namespace,
          deployment.helmRelease,
          lines
        );

        return { name: deployment.name, logs };
      }
    }),

    // ── Management tools ──────────────────────────────────

    updateService: tool({
      description:
        "Update the configuration of a running service. This performs a Helm upgrade.",
      inputSchema: z.object({
        deploymentId: z.string().describe("The deployment ID"),
        config: z
          .record(z.string(), z.unknown())
          .describe("New configuration values")
      }),
      execute: async ({ deploymentId, config }) => {
        try {
          const result = await initiateUpgrade({
            tenantId,
            deploymentId,
            config,
          });

          return {
            deploymentId: result.deploymentId,
            status: result.status,
            message: result.message,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[updateService]", { deploymentId, tenantId }, err);
          return { error: message };
        }
      }
    }),

    removeService: tool({
      description:
        "Remove a deployed service. IMPORTANT: Always ask the user for confirmation before calling this tool. Never call this without explicit user confirmation.",
      inputSchema: z.object({
        deploymentId: z.string().describe("The deployment ID to remove"),
        confirmed: z
          .boolean()
          .describe("Must be true — confirm the user has agreed to removal")
      }),
      execute: async ({ deploymentId, confirmed }) => {
        if (!confirmed) {
          return {
            error:
              "User must confirm removal first. Please ask the user to confirm before removing."
          };
        }

        try {
          const result = await initiateRemoval({
            tenantId,
            deploymentId,
          });

          return {
            deploymentId: result.deploymentId,
            status: result.status,
            message: result.message,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[removeService]", { deploymentId, tenantId }, err);
          return { error: message };
        }
      }
    }),

    // ── Catalog management ────────────────────────────────

    createRecipe: tool({
      description:
        "Create a new service recipe in the catalog. Use this when you find a Helm chart that isn't in the catalog yet.",
      inputSchema: z.object({
        slug: z.string().describe("URL-friendly identifier, e.g. 'grafana'"),
        displayName: z.string().describe("Human-readable name, e.g. 'Grafana'"),
        description: z.string().describe("What this service does"),
        category: z
          .string()
          .describe(
            "Category: database, automation, monitoring, storage, analytics"
          ),
        chartUrl: z.string().describe("Helm chart URL or repo/chart reference"),
        chartVersion: z.string().optional().describe("Specific chart version"),
        valuesTemplate: z
          .string()
          .optional()
          .describe("Handlebars template for Helm values"),
        configSchema: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Config fields the user can customize"),
        aiHints: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("AI metadata: summary, whenToSuggest, pairsWellWith")
      }),
      execute: async (params) => {
        const input: RecipeCreateInput = {
          slug: params.slug,
          displayName: params.displayName,
          description: params.description,
          category: params.category,
          chartUrl: params.chartUrl,
          chartVersion: params.chartVersion,
          valuesTemplate: params.valuesTemplate,
          configSchema: params.configSchema as ConfigSchema | undefined,
          aiHints: params.aiHints as AiHints | undefined
        };

        const recipe = await createRecipe(input);

        return {
          slug: recipe.slug,
          displayName: recipe.displayName,
          status: recipe.status,
          message: `Recipe '${recipe.displayName}' created as ${recipe.status} (${recipe.tier}). It can be published by an admin.`
        };
      }
    }),

    // ── External search (Artifact Hub) ────────────────────

    searchHelmCharts: tool({
      description:
        "Search Artifact Hub for Helm charts. Use as fallback when the catalog doesn't have what the user needs.",
      inputSchema: z.object({
        query: z.string().describe("Search query for Artifact Hub")
      }),
      execute: async ({ query }) => {
        try {
          const url = `https://artifacthub.io/api/v1/packages/search?ts_query_web=${encodeURIComponent(query)}&kind=0&limit=10`;
          const res = await fetch(url, {
            headers: { Accept: "application/json" }
          });

          if (!res.ok) {
            return {
              error: `Artifact Hub search failed (HTTP ${res.status})`
            };
          }

          const data = (await res.json()) as {
            packages?: Array<{
              name: string;
              normalized_name: string;
              description: string;
              version: string;
              repository: { name: string; url: string };
              package_id: string;
            }>;
          };

          const packages = data.packages ?? [];

          return packages.slice(0, 10).map((pkg) => ({
            name: pkg.name,
            repo: pkg.repository?.name,
            repoUrl: pkg.repository?.url,
            description: pkg.description,
            version: pkg.version,
            url: `https://artifacthub.io/packages/helm/${pkg.repository?.name}/${pkg.name}`
          }));
        } catch (error) {
          console.error("[searchHelmCharts]", error);
          return { error: "Failed to search Artifact Hub" };
        }
      }
    })
  };
}
