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
import {
  createWorkspace,
  listWorkspaces,
  deleteWorkspace,
} from "@/lib/workspace/manager";

import type { ConfigSchema, AiHints, RecipeCreateInput } from "@/types/recipe";

// ─── Time helpers ────────────────────────────────────────

/** Simple relative time formatter (e.g., "2 days ago") */
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

// ─── Status helpers ──────────────────────────────────────

/** Translate internal status to consumer-friendly label */
function consumerStatusLabel(status: string, healthy: boolean): string {
  switch (status) {
    case "RUNNING":
      return healthy ? "Running and healthy" : "Running but needs attention";
    case "PENDING":
    case "DEPLOYING":
      return "Setting up...";
    case "FAILED":
      return "Something went wrong";
    case "STOPPED":
      return "Stopped";
    case "DELETING":
      return "Being removed...";
    default:
      return status.toLowerCase();
  }
}

/** Check if pods are healthy (all running, no recent restarts) */
function arePodHealthy(
  pods: Array<{ status: string; restarts: number }>
): boolean {
  if (pods.length === 0) return false;
  return pods.every((p) => p.status === "Running" && p.restarts < 3);
}

// ─── K8s helpers (internal only) ─────────────────────────

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
    return `Failed to retrieve logs: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

// ─── Log diagnosis helpers ───────────────────────────────

interface DiagnosisResult {
  appName: string;
  diagnosis: string;
  suggestion: string | null;
}

/** Analyze raw logs and produce a plain-English diagnosis */
function analyzeLogs(appName: string, logs: string, restarts: number): DiagnosisResult {
  const lines = logs.split("\n").filter(Boolean);
  const lowerLogs = logs.toLowerCase();

  // Check for common error patterns
  if (lowerLogs.includes("out of memory") || lowerLogs.includes("oom") || lowerLogs.includes("memory limit")) {
    return {
      appName,
      diagnosis: `${appName} is running out of memory. It's been restarting because it needs more resources to handle its workload.`,
      suggestion: "changeAppSettings to increase resources",
    };
  }

  if (lowerLogs.includes("connection refused") || lowerLogs.includes("econnrefused")) {
    return {
      appName,
      diagnosis: `${appName} is having trouble connecting to another app it depends on. The other app might still be starting up or may have stopped.`,
      suggestion: "Check the status of dependent apps with listMyApps",
    };
  }

  if (lowerLogs.includes("connection timeout") || lowerLogs.includes("etimedout") || lowerLogs.includes("timed out")) {
    return {
      appName,
      diagnosis: `${appName} is experiencing slow connections. It's trying to reach something that isn't responding quickly enough.`,
      suggestion: "Wait a minute and check again, or restart the app",
    };
  }

  if (lowerLogs.includes("permission denied") || lowerLogs.includes("access denied") || lowerLogs.includes("authentication failed")) {
    return {
      appName,
      diagnosis: `${appName} is having trouble with its credentials. This usually means a password or access token needs to be reset.`,
      suggestion: "Try reinstalling the app to regenerate credentials",
    };
  }

  if (lowerLogs.includes("disk full") || lowerLogs.includes("no space left") || lowerLogs.includes("enospc")) {
    return {
      appName,
      diagnosis: `${appName} has run out of storage space. It can't save any more data until space is freed up.`,
      suggestion: "changeAppSettings to increase storage, or clean up old data",
    };
  }

  if (lowerLogs.includes("crashloopbackoff") || lowerLogs.includes("crash loop")) {
    return {
      appName,
      diagnosis: `${appName} keeps crashing and restarting. This usually means it can't start properly — often due to a configuration issue or a missing dependency.`,
      suggestion: "Check if all dependent apps are running, then try reinstalling",
    };
  }

  if (restarts > 0) {
    return {
      appName,
      diagnosis: `${appName} has restarted ${restarts} time${restarts > 1 ? "s" : ""} recently. The logs don't show a clear error, but it may be under heavy load or experiencing intermittent issues.`,
      suggestion: restarts >= 3
        ? "changeAppSettings to give it more resources"
        : "Monitor it for a bit — occasional restarts can be normal",
    };
  }

  // No obvious issues found
  if (lines.length < 5) {
    return {
      appName,
      diagnosis: `${appName} doesn't have many logs yet. It may have just started or is running very quietly.`,
      suggestion: null,
    };
  }

  return {
    appName,
    diagnosis: `${appName} looks like it's running normally. The logs don't show any obvious issues.`,
    suggestion: null,
  };
}

// ─── Tools ───────────────────────────────────────────────

export function getTools(tenantId: string, workspaceId: string) {
  return {
    // ── Workspace tools (hidden — only surface when asked) ──

    listWorkspaces: tool({
      description:
        "List all the user's projects/environments. Only use this when the user explicitly asks about workspaces or projects.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const workspaces = await listWorkspaces(tenantId);
          return {
            workspaces: workspaces.map((w) => ({
              id: w.id,
              name: w.name,
              appCount: w.deploymentCount,
              isActive: w.id === workspaceId,
            })),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[listWorkspaces]", { tenantId }, err);
          return { error: message };
        }
      },
    }),

    createWorkspace: tool({
      description:
        "Create a new project/environment for organizing apps. Only use when the user explicitly asks.",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(100)
          .describe("Name for the new project, e.g. 'Testing' or 'Production'"),
      }),
      execute: async ({ name }) => {
        try {
          const result = await createWorkspace({
            tenantId,
            name,
          });
          return {
            name: result.name,
            message: `Project '${result.name}' created! Switch to it using the project selector in the sidebar to start installing apps there.`,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[createWorkspace]", { tenantId, name }, err);
          return { error: message };
        }
      },
    }),

    deleteWorkspace: tool({
      description:
        "Delete a project and all its apps. Only use when the user explicitly asks. The user will see a confirmation dialog.",
      inputSchema: z.object({
        workspaceId: z.string().describe("The project ID to delete"),
        workspaceName: z
          .string()
          .describe("The name of the project being deleted"),
      }),
      needsApproval: true,
      execute: async ({ workspaceId: wsId }) => {
        try {
          const result = await deleteWorkspace(wsId, tenantId);
          return {
            message: result.message,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[deleteWorkspace]", { workspaceId: wsId, tenantId }, err);
          return { error: message };
        }
      },
    }),

    // ── Finding apps ─────────────────────────────────────

    findApps: tool({
      description:
        "Search for apps that match what the user is looking for. Search by problem description, not just app name. For example: 'automate tasks', 'monitor websites', 'store files'.",
      inputSchema: z.object({
        query: z.string().describe("What the user is looking for — describe the problem or need"),
        category: z
          .string()
          .optional()
          .describe(
            "Filter by category: database, automation, monitoring, storage, analytics"
          ),
      }),
      execute: async ({ query, category }) => {
        try {
          const results = await searchRecipes(query, category);
          return results.map((r) => ({
            slug: r.slug,
            name: r.displayName,
            tagline: r.shortDescription || r.description,
            category: r.category,
            popular: r.installCount > 0,
            installCount: r.installCount,
          }));
        } catch (error) {
          console.error(
            "[findApps] Semantic search failed, falling back to text search:",
            error
          );
          const recipes = await prisma.recipe.findMany({
            where: {
              status: "PUBLISHED",
              ...(category ? { category } : {}),
              OR: [
                { displayName: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
                { shortDescription: { contains: query, mode: "insensitive" } },
                { tags: { has: query.toLowerCase() } },
                { useCases: { hasSome: [query.toLowerCase()] } },
              ],
            },
            select: {
              slug: true,
              displayName: true,
              description: true,
              shortDescription: true,
              category: true,
              installCount: true,
            },
            orderBy: { displayName: "asc" },
            take: 10,
          });
          return recipes.map((r) => ({
            slug: r.slug,
            name: r.displayName,
            tagline: r.shortDescription || r.description,
            category: r.category,
            popular: r.installCount > 0,
            installCount: r.installCount,
          }));
        }
      },
    }),

    getAppInfo: tool({
      description:
        "Get details about a specific app — what it does, what it's good for, and how to set it up.",
      inputSchema: z.object({
        slug: z.string().describe("App identifier, e.g. 'n8n' or 'postgresql'"),
      }),
      execute: async ({ slug }) => {
        const recipe = await getRecipe(slug);
        if (!recipe) {
          return { error: `App '${slug}' not found in our catalog.` };
        }
        return {
          slug: recipe.slug,
          name: recipe.displayName,
          description: recipe.description,
          tagline: recipe.shortDescription,
          useCases: recipe.useCases,
          gettingStarted: recipe.gettingStarted,
          category: recipe.category,
          websiteUrl: recipe.websiteUrl,
          documentationUrl: recipe.documentationUrl,
          needsOtherApps: recipe.dependencies.length > 0
            ? recipe.dependencies.map((d) => d.service)
            : null,
        };
      },
    }),

    // ── Installing apps ──────────────────────────────────

    installApp: tool({
      description:
        "Install an app for the user. Uses sensible defaults automatically. If the app needs other apps (like a database), they'll be set up automatically too.",
      inputSchema: z.object({
        appSlug: z
          .string()
          .describe("The app to install, e.g. 'n8n' or 'postgresql'"),
        name: z
          .string()
          .optional()
          .describe("Custom name for this app (optional — a good default is chosen automatically)"),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Custom settings (optional — sensible defaults are used)"),
      }),
      execute: async ({ appSlug, name, config }) => {
        try {
          const result = await initiateDeployment({
            tenantId,
            workspaceId,
            recipeSlug: appSlug,
            name,
            config,
          });

          return {
            appId: result.deploymentId,
            appName: result.name,
            status: "installing",
            message: `${result.name} is being set up now. This usually takes about a minute.`,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[installApp]", { appSlug, tenantId, workspaceId }, err);
          return { error: message };
        }
      },
    }),

    // ── Checking app status ──────────────────────────────

    listMyApps: tool({
      description:
        "See all the user's installed apps and whether they're running properly.",
      inputSchema: z.object({}),
      execute: async () => {
        const deployments = await prisma.deployment.findMany({
          where: { workspaceId },
          include: {
            recipe: {
              select: { displayName: true, slug: true, category: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        if (deployments.length === 0) {
          return {
            message: "You don't have any apps installed yet. Want me to help you find something?",
            apps: [] as Array<{
              appId: string;
              appName: string;
              displayName: string;
              status: string;
              statusLabel: string;
              url: string | null;
              installedAt: string;
              healthy: boolean;
            }>,
          };
        }

        const apps = await Promise.all(
          deployments.map(async (d) => {
            const k8sStatus = await getK8sPodStatus(d.namespace, d.helmRelease);
            const healthy = arePodHealthy(k8sStatus.pods);
            return {
              appId: d.id,
              appName: d.name,
              displayName: d.recipe.displayName,
              status: d.status === "RUNNING" ? (healthy ? "running" : "running") : d.status.toLowerCase(),
              statusLabel: consumerStatusLabel(d.status, healthy),
              url: d.url,
              installedAt: timeAgo(d.createdAt),
              healthy: d.status === "RUNNING" ? healthy : false,
            };
          })
        );

        return { apps };
      },
    }),

    getAppStatus: tool({
      description:
        "Check the detailed status of a specific installed app — is it running well, when was it installed, and how to access it.",
      inputSchema: z.object({
        appId: z.string().describe("The app's ID"),
      }),
      execute: async ({ appId }) => {
        const deployment = await prisma.deployment.findFirst({
          where: { id: appId, tenantId },
          include: {
            recipe: {
              select: {
                displayName: true,
                slug: true,
                category: true,
                gettingStarted: true,
              },
            },
          },
        });

        if (!deployment) {
          return { error: "App not found" };
        }

        const k8sStatus = await getK8sPodStatus(
          deployment.namespace,
          deployment.helmRelease
        );
        const healthy = arePodHealthy(k8sStatus.pods);

        return {
          appId: deployment.id,
          appName: deployment.name,
          displayName: deployment.recipe.displayName,
          status: deployment.status === "RUNNING" ? (healthy ? "running" : "running") : deployment.status.toLowerCase(),
          statusLabel: consumerStatusLabel(deployment.status, healthy),
          url: deployment.url,
          healthy: deployment.status === "RUNNING" ? healthy : false,
          installedAt: timeAgo(deployment.createdAt),
          gettingStarted: deployment.recipe.gettingStarted,
          errorMessage: deployment.status === "FAILED"
            ? "This app had trouble starting. You can try reinstalling it or ask me to diagnose the issue."
            : null,
        };
      },
    }),

    // ── Diagnosing issues ────────────────────────────────

    diagnoseApp: tool({
      description:
        "Look at an app's internal logs to figure out what's wrong. Read the logs yourself and explain the issue in plain language — never show raw logs to the user.",
      inputSchema: z.object({
        appId: z.string().describe("The app's ID to diagnose"),
      }),
      execute: async ({ appId }) => {
        const deployment = await prisma.deployment.findFirst({
          where: { id: appId, tenantId },
          select: {
            namespace: true,
            helmRelease: true,
            name: true,
            status: true,
            recipe: { select: { displayName: true } },
          },
        });

        if (!deployment) {
          return { error: "App not found" };
        }

        if (deployment.status === "PENDING") {
          return {
            appName: deployment.recipe.displayName,
            diagnosis: `${deployment.recipe.displayName} is still being set up. Give it a minute and check back.`,
            suggestion: null,
          };
        }

        // Get pod status for restart info
        const k8sStatus = await getK8sPodStatus(
          deployment.namespace,
          deployment.helmRelease
        );
        const totalRestarts = k8sStatus.pods.reduce((sum, p) => sum + p.restarts, 0);

        // Get logs
        const logs = await getK8sPodLogs(
          deployment.namespace,
          deployment.helmRelease,
          100
        );

        return analyzeLogs(
          deployment.recipe.displayName,
          logs,
          totalRestarts
        );
      },
    }),

    // ── Managing apps ────────────────────────────────────

    changeAppSettings: tool({
      description:
        "Change settings for an installed app. Map user requests to config changes. For example, 'make it faster' → increase CPU/memory, 'give it more storage' → increase storage. Call getAppInfo first if you need to see what settings are available.",
      inputSchema: z.object({
        appId: z.string().describe("The app's ID to update"),
        config: z
          .record(z.string(), z.unknown())
          .describe(
            "Settings to change. Only include the settings you want to modify — everything else stays the same."
          ),
      }),
      execute: async ({ appId, config }) => {
        try {
          const result = await initiateUpgrade({
            tenantId,
            deploymentId: appId,
            config,
          });

          return {
            appId: result.deploymentId,
            status: "updating",
            message: "Applying your changes now. This usually takes about 30 seconds.",
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[changeAppSettings]", { appId, tenantId }, err);
          return { error: message };
        }
      },
    }),

    uninstallApp: tool({
      description:
        "Remove an installed app. Always mention that any data stored in the app will be lost. The user will see a confirmation dialog before anything happens.",
      inputSchema: z.object({
        appId: z.string().describe("The app's ID to remove"),
        appName: z
          .string()
          .describe("The name of the app being removed (shown in confirmation)"),
      }),
      needsApproval: true,
      execute: async ({ appId }) => {
        try {
          const result = await initiateRemoval({
            tenantId,
            deploymentId: appId,
          });

          return {
            appId: result.deploymentId,
            status: "removing",
            message: "The app is being removed now.",
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[uninstallApp]", { appId, tenantId }, err);
          return { error: message };
        }
      },
    }),

    // ── Requesting new apps ──────────────────────────────

    requestApp: tool({
      description:
        "Request a new app to be added to the store. Use when the user wants something we don't have in the catalog.",
      inputSchema: z.object({
        slug: z.string().describe("Short identifier for the app, e.g. 'grafana'"),
        displayName: z.string().describe("Human-readable name, e.g. 'Grafana'"),
        description: z.string().describe("What this app does, in plain language"),
        category: z
          .string()
          .describe(
            "Category: database, automation, monitoring, storage, analytics"
          ),
        chartUrl: z.string().describe("Package source URL"),
        chartVersion: z.string().optional().describe("Specific version"),
        valuesTemplate: z
          .string()
          .optional()
          .describe("Configuration template"),
        configSchema: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Available settings"),
        aiHints: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("AI metadata: summary, whenToSuggest, pairsWellWith"),
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
          aiHints: params.aiHints as AiHints | undefined,
        };

        const recipe = await createRecipe(input);

        return {
          appName: recipe.displayName,
          message: `Great news! ${recipe.displayName} has been submitted for review. Once approved, it'll be available in the app store.`,
        };
      },
    }),
  };
}
