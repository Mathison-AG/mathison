import { tool } from "ai";
import { z } from "zod/v4";

import { prisma } from "@/lib/db";
import { searchRecipes } from "@/lib/catalog/service";
import { getRecipeMetadataOrFallback } from "@/lib/catalog/metadata";
import { getReleasePodStatus, getReleaseLogs } from "@/lib/cluster/kubernetes";
import {
  getRecipeDefinition,
  listRecipeDefinitions,
} from "@/recipes/registry";
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
import { exportWorkspace } from "@/lib/workspace/export";
import { validateSnapshot, importWorkspace } from "@/lib/workspace/import";
import { getRecipeMetadataOrFallback as getRecipeMeta } from "@/lib/catalog/metadata";

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

/** Get live K8s pod status for a deployment (by name used as label selector) */
async function getK8sPodStatus(
  namespace: string,
  deploymentName: string
): Promise<{
  pods: Array<{ name: string; status: string; restarts: number }>;
}> {
  try {
    const result = await getReleasePodStatus(namespace, deploymentName);
    return {
      pods: result.pods.map((p) => ({
        name: p.name,
        status: p.status,
        restarts: p.restarts,
      })),
    };
  } catch (err) {
    console.error(`[getK8sPodStatus] Failed for ${deploymentName}:`, err);
    return { pods: [] };
  }
}

/** Get K8s pod logs for a deployment */
async function getK8sPodLogs(
  namespace: string,
  deploymentName: string,
  lines: number
): Promise<string> {
  try {
    return await getReleaseLogs(namespace, deploymentName, lines);
  } catch (err) {
    console.error(`[getK8sPodLogs] Failed for ${deploymentName}:`, err);
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

// ─── Config description helper ───────────────────────────

/** Extract human-readable config option descriptions from a Zod schema */
function describeConfigSchema(
  schema: z.ZodType<unknown>
): Record<string, string> | null {
  try {
    // Try to get the shape from the Zod schema
    if ("shape" in schema && typeof schema.shape === "object" && schema.shape !== null) {
      const shape = schema.shape as Record<string, z.ZodType<unknown>>;
      const descriptions: Record<string, string> = {};

      for (const [key, fieldSchema] of Object.entries(shape)) {
        const desc = fieldSchema.description;
        if (desc) {
          descriptions[key] = desc;
        } else {
          descriptions[key] = key;
        }
      }

      return Object.keys(descriptions).length > 0 ? descriptions : null;
    }
  } catch {
    // Schema introspection failed — not critical
  }
  return null;
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
            "[findApps] Semantic search failed, falling back to registry search:",
            error
          );
          // Fallback: search registry directly
          const allRecipes = listRecipeDefinitions();
          const q = query.toLowerCase();
          const filtered = allRecipes
            .filter((r) => {
              if (category && r.category !== category) return false;
              return (
                r.displayName.toLowerCase().includes(q) ||
                r.description.toLowerCase().includes(q) ||
                r.tags.some((t) => t.includes(q)) ||
                r.aiHints.summary.toLowerCase().includes(q)
              );
            })
            .slice(0, 10);

          return filtered.map((r) => ({
            slug: r.slug,
            name: r.displayName,
            tagline: r.shortDescription || r.description,
            category: r.category,
            popular: false,
            installCount: 0,
          }));
        }
      },
    }),

    getAppInfo: tool({
      description:
        "Get details about a specific app — what it does, what it's good for, how to set it up, and what settings are available.",
      inputSchema: z.object({
        slug: z.string().describe("App identifier, e.g. 'n8n' or 'postgresql'"),
      }),
      execute: async ({ slug }) => {
        const recipe = getRecipeDefinition(slug);
        if (!recipe) {
          return { error: `App '${slug}' not found in our catalog.` };
        }

        // Get install count from DB
        const dbRecipe = await prisma.recipe.findUnique({
          where: { slug },
          select: { installCount: true },
        });

        // Describe available config options
        const configOptions = describeConfigSchema(recipe.configSchema);

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
          installCount: dbRecipe?.installCount ?? 0,
          configOptions,
          needsOtherApps: recipe.dependencies && Object.keys(recipe.dependencies).length > 0
            ? Object.values(recipe.dependencies).map((d) => ({
                app: d.recipe,
                reason: d.reason,
              }))
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
          // Validate config against recipe's Zod schema before deploying
          if (config && Object.keys(config).length > 0) {
            const recipe = getRecipeDefinition(appSlug);
            if (!recipe) {
              return { error: `App '${appSlug}' not found in our catalog.` };
            }
            const parsed = recipe.configSchema.safeParse(config);
            if (!parsed.success) {
              return {
                error: `Invalid settings: ${String(parsed.error)}`,
                hint: "Check the available settings with getAppInfo first.",
              };
            }
          }

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
              select: { slug: true },
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
            const k8sStatus = await getK8sPodStatus(d.namespace, d.name);
            const healthy = arePodHealthy(k8sStatus.pods);
            const recipeMeta = getRecipeMetadataOrFallback(d.recipe.slug);
            return {
              appId: d.id,
              appName: d.name,
              displayName: recipeMeta.displayName,
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
              select: { slug: true },
            },
          },
        });

        if (!deployment) {
          return { error: "App not found" };
        }

        const recipeMeta = getRecipeMetadataOrFallback(deployment.recipe.slug);
        const recipeDef = getRecipeDefinition(deployment.recipe.slug);

        const k8sStatus = await getK8sPodStatus(
          deployment.namespace,
          deployment.name
        );
        const healthy = arePodHealthy(k8sStatus.pods);

        return {
          appId: deployment.id,
          appName: deployment.name,
          displayName: recipeMeta.displayName,
          status: deployment.status === "RUNNING" ? (healthy ? "running" : "running") : deployment.status.toLowerCase(),
          statusLabel: consumerStatusLabel(deployment.status, healthy),
          url: deployment.url,
          healthy: deployment.status === "RUNNING" ? healthy : false,
          installedAt: timeAgo(deployment.createdAt),
          gettingStarted: recipeDef?.gettingStarted ?? null,
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
            name: true,
            status: true,
            recipe: { select: { slug: true } },
          },
        });

        if (!deployment) {
          return { error: "App not found" };
        }

        const recipeMeta = getRecipeMetadataOrFallback(deployment.recipe.slug);

        if (deployment.status === "PENDING") {
          return {
            appName: recipeMeta.displayName,
            diagnosis: `${recipeMeta.displayName} is still being set up. Give it a minute and check back.`,
            suggestion: null,
          };
        }

        const k8sStatus = await getK8sPodStatus(
          deployment.namespace,
          deployment.name
        );
        const totalRestarts = k8sStatus.pods.reduce((sum, p) => sum + p.restarts, 0);

        const logs = await getK8sPodLogs(
          deployment.namespace,
          deployment.name,
          100
        );

        return analyzeLogs(
          recipeMeta.displayName,
          logs,
          totalRestarts
        );
      },
    }),

    // ── App history ────────────────────────────────────────

    getAppHistory: tool({
      description:
        "Look up what happened to an app over time — when it was installed, changed, restarted, or had issues. Use this to answer questions like 'what happened to my PostgreSQL?'.",
      inputSchema: z.object({
        appId: z.string().describe("The app's ID to get history for"),
      }),
      execute: async ({ appId }) => {
        const deployment = await prisma.deployment.findFirst({
          where: { id: appId, tenantId },
          select: {
            name: true,
            recipe: { select: { slug: true } },
          },
        });

        if (!deployment) {
          return { error: "App not found" };
        }

        const recipeMeta = getRecipeMetadataOrFallback(deployment.recipe.slug);

        const events = await prisma.deploymentEvent.findMany({
          where: { deploymentId: appId },
          orderBy: { createdAt: "desc" },
          take: 25,
        });

        if (events.length === 0) {
          return {
            appName: recipeMeta.displayName,
            message: "No history recorded for this app yet.",
            events: [] as Array<{
              action: string;
              when: string;
              reason: string | null;
              details: string | null;
            }>,
          };
        }

        return {
          appName: recipeMeta.displayName,
          events: events.map((e) => {
            const newState = (e.newState ?? {}) as Record<string, unknown>;
            const previousState = (e.previousState ?? {}) as Record<string, unknown>;

            let details: string | null = null;
            if (e.action === "config_changed") {
              const prev = previousState.config as Record<string, unknown> | undefined;
              const next = newState.config as Record<string, unknown> | undefined;
              if (prev && next) {
                const changes: string[] = [];
                for (const key of Object.keys(next)) {
                  if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
                    changes.push(`${key}: ${String(prev[key] ?? "default")} → ${String(next[key])}`);
                  }
                }
                details = changes.length > 0 ? changes.join(", ") : "Configuration updated";
              }
            } else if (e.action === "failed") {
              details = (newState.error as string) || null;
            } else if (e.action === "health_changed") {
              details = (newState.reason as string) || null;
            } else if (e.action === "status_changed") {
              details = `${String(previousState.status ?? "unknown")} → ${String(newState.status ?? "unknown")}`;
            }

            return {
              action: e.action,
              when: timeAgo(e.createdAt),
              reason: e.reason,
              details,
            };
          }),
        };
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
          // Look up the deployment to get its recipe slug for validation
          const deployment = await prisma.deployment.findFirst({
            where: { id: appId, tenantId },
            select: { recipe: { select: { slug: true } }, config: true },
          });

          if (!deployment) {
            return { error: "App not found" };
          }

          // Validate the new config against the recipe's Zod schema
          const recipe = getRecipeDefinition(deployment.recipe.slug);
          if (recipe) {
            const existingConfig = (deployment.config ?? {}) as Record<string, unknown>;
            const merged = { ...existingConfig, ...config };
            const parsed = recipe.configSchema.safeParse(merged);
            if (!parsed.success) {
              return {
                error: `Invalid settings: ${String(parsed.error)}`,
                hint: "Check the available settings with getAppInfo first.",
              };
            }
          }

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

    previewChanges: tool({
      description:
        "Preview what would change before applying new settings. Shows a summary of the differences without making any changes. Use this to let the user review before modifying an app.",
      inputSchema: z.object({
        appId: z.string().describe("The app's ID to preview changes for"),
        config: z
          .record(z.string(), z.unknown())
          .describe("New settings to preview"),
      }),
      execute: async ({ appId, config }) => {
        try {
          const deployment = await prisma.deployment.findFirst({
            where: { id: appId, tenantId },
            select: {
              name: true,
              config: true,
              recipe: { select: { slug: true } },
            },
          });

          if (!deployment) {
            return { error: "App not found" };
          }

          const recipeMeta = getRecipeMetadataOrFallback(deployment.recipe.slug);
          const recipe = getRecipeDefinition(deployment.recipe.slug);

          if (!recipe) {
            return { error: `Recipe '${deployment.recipe.slug}' not found in registry.` };
          }

          const existingConfig = (deployment.config ?? {}) as Record<string, unknown>;
          const merged = { ...existingConfig, ...config };

          // Validate the merged config
          const parsed = recipe.configSchema.safeParse(merged);
          if (!parsed.success) {
            return {
              error: `Invalid settings: ${String(parsed.error)}`,
              hint: "Check the available settings with getAppInfo first.",
            };
          }

          const validatedConfig = parsed.data as Record<string, unknown>;

          // Build a diff of what would change
          const changes: Array<{ setting: string; from: string; to: string }> = [];
          for (const [key, newVal] of Object.entries(validatedConfig)) {
            const oldVal = existingConfig[key];
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
              changes.push({
                setting: key,
                from: oldVal !== undefined ? String(oldVal) : "(default)",
                to: String(newVal),
              });
            }
          }

          if (changes.length === 0) {
            return {
              appName: recipeMeta.displayName,
              message: "No changes detected — the new settings match the current configuration.",
              changes: [],
            };
          }

          return {
            appName: recipeMeta.displayName,
            message: `Preview of changes to ${recipeMeta.displayName}:`,
            changes,
            note: "Use changeAppSettings to apply these changes.",
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[previewChanges]", { appId, tenantId }, err);
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

    // ── Backup & Restore ──────────────────────────────────

    backupWorkspace: tool({
      description:
        "Create a backup of the current workspace. Exports all installed apps and their settings to a portable snapshot. Secrets are not included (they'll be regenerated on restore). Use this when the user wants to save their setup, migrate, or create a restore point.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const snapshot = await exportWorkspace({
            workspaceId,
            tenantId,
            exportedBy: "agent",
          });

          const serviceNames = snapshot.services.map((s) => {
            const meta = getRecipeMeta(s.recipe);
            return meta.displayName;
          });

          return {
            status: "success",
            serviceCount: snapshot.services.length,
            services: serviceNames,
            message:
              snapshot.services.length === 0
                ? "Backup created, but there are no apps installed in this workspace."
                : `Backup created with ${snapshot.services.length} app${snapshot.services.length > 1 ? "s" : ""}: ${serviceNames.join(", ")}. The backup can be used to restore this setup later.`,
            snapshot,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[backupWorkspace]", { workspaceId, tenantId }, err);
          return { error: message };
        }
      },
    }),

    restoreWorkspace: tool({
      description:
        "Restore apps from a backup snapshot. Recreates all services with fresh secrets and deploys them in the correct order. Use when the user wants to restore from a previous backup or set up a workspace from a snapshot. The user will see a confirmation dialog first.",
      inputSchema: z.object({
        snapshot: z
          .record(z.string(), z.unknown())
          .describe("The backup snapshot to restore from (the full JSON object from a previous backup)"),
        force: z
          .boolean()
          .optional()
          .describe("If true, replaces existing apps with the same names. Default: false."),
      }),
      needsApproval: true,
      execute: async ({ snapshot: snapshotData, force }) => {
        try {
          // Validate the snapshot
          const existingDeployments = await prisma.deployment.findMany({
            where: {
              workspaceId,
              status: { not: "STOPPED" },
            },
            select: { name: true },
          });
          const existingNames = new Set(existingDeployments.map((d) => d.name));

          const validation = validateSnapshot(snapshotData, {
            existingNames,
            force: force ?? false,
          });

          if (!validation.valid) {
            const errorMessages = validation.errors
              .map((e) => `${e.service}: ${e.error}`)
              .join("; ");
            return {
              error: `Backup validation failed: ${errorMessages}`,
            };
          }

          // Import
          const result = await importWorkspace({
            workspaceId,
            tenantId,
            snapshot: validation.snapshot!,
            force: force ?? false,
          });

          const queuedNames = result.services
            .filter((s) => s.status === "queued")
            .map((s) => {
              const meta = getRecipeMeta(s.recipe);
              return meta.displayName;
            });

          let message: string;
          if (result.totalQueued === 0 && result.totalSkipped > 0) {
            message = "All apps from the backup already exist in this workspace. Nothing to restore.";
          } else if (result.totalErrors > 0) {
            message = `Restored ${result.totalQueued} app${result.totalQueued !== 1 ? "s" : ""}, but ${result.totalErrors} failed. Check the details below.`;
          } else {
            message = `Restoring ${result.totalQueued} app${result.totalQueued !== 1 ? "s" : ""}: ${queuedNames.join(", ")}. They'll be set up in the right order — dependencies first. This usually takes a couple of minutes.`;
          }

          return {
            status: "restoring",
            message,
            totalQueued: result.totalQueued,
            totalSkipped: result.totalSkipped,
            totalErrors: result.totalErrors,
            services: result.services.map((s) => ({
              name: s.name,
              status: s.status,
              message: s.message,
            })),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[restoreWorkspace]", { workspaceId, tenantId }, err);
          return { error: message };
        }
      },
    }),
  };
}
