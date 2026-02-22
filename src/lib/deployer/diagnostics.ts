/**
 * Pod Diagnostics & Auto-Remediation
 *
 * Gathers rich diagnostic data from K8s (pod status, events, logs, previous logs)
 * and uses an LLM to reason about failures and suggest/apply fixes.
 *
 * Used by:
 * - diagnoseApp agent tool (returns structured data for the chat LLM to reason about)
 * - AUTO_DIAGNOSE worker job (headless LLM call that can apply fixes automatically)
 */

import { generateObject } from "ai";
import { z } from "zod/v4";

import { prisma } from "@/lib/db";
import {
  getDetailedPodDiagnostics,
  getReleaseEvents,
  getReleaseLogs,
  getReleasePreviousLogs,
} from "@/lib/cluster/kubernetes";
import { getRecipeDefinition } from "@/recipes/registry";
import { getRecipeMetadataOrFallback } from "@/lib/catalog/metadata";
import { recordAutoRemediation } from "./events";
import { initiateUpgrade } from "./engine";

import type { DetailedPodDiagnostics, PodEvent } from "@/lib/cluster/kubernetes";

// ─── Diagnostic Snapshot ──────────────────────────────────

export interface DiagnosticSnapshot {
  deploymentId: string;
  deploymentName: string;
  recipeSlug: string;
  displayName: string;
  status: string;
  errorMessage: string | null;
  config: Record<string, unknown>;
  availableSettings: string[];
  pods: DetailedPodDiagnostics[];
  events: PodEvent[];
  logs: string;
  previousLogs: string;
  tenantId: string;
}

/**
 * Gather all diagnostic signals for a deployment into a single snapshot.
 * Returns null if the deployment doesn't exist.
 */
export async function gatherDiagnosticSnapshot(
  deploymentId: string
): Promise<DiagnosticSnapshot | null> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      name: true,
      namespace: true,
      status: true,
      errorMessage: true,
      config: true,
      tenantId: true,
      recipe: { select: { slug: true } },
    },
  });

  if (!deployment) return null;

  const recipeSlug = deployment.recipe.slug;
  const recipeMeta = getRecipeMetadataOrFallback(recipeSlug);
  const recipeDef = getRecipeDefinition(recipeSlug);

  const availableSettings = extractSettingNames(recipeDef?.configSchema);

  const [pods, events, logs, previousLogs] = await Promise.all([
    getDetailedPodDiagnostics(deployment.namespace, deployment.name),
    getReleaseEvents(deployment.namespace, deployment.name),
    safeGetLogs(() => getReleaseLogs(deployment.namespace, deployment.name, 80)),
    safeGetLogs(() => getReleasePreviousLogs(deployment.namespace, deployment.name, 80)),
  ]);

  return {
    deploymentId: deployment.id,
    deploymentName: deployment.name,
    recipeSlug,
    displayName: recipeMeta.displayName,
    status: deployment.status,
    errorMessage: deployment.errorMessage,
    config: (deployment.config ?? {}) as Record<string, unknown>,
    availableSettings,
    pods,
    events: events.slice(0, 15),
    logs,
    previousLogs,
    tenantId: deployment.tenantId,
  };
}

// ─── Auto-Remediation ─────────────────────────────────────

const MAX_REMEDIATION_ATTEMPTS = 3;
const REMEDIATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const remediationSchema = z.object({
  diagnosis: z.string().describe("What's wrong, in 1-2 sentences"),
  action: z.enum(["change_settings", "restart", "none"]).describe(
    "change_settings = modify config to fix the issue, restart = just restart the app, none = cannot auto-fix"
  ),
  configChanges: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Config changes to apply (only when action is change_settings)"),
  reason: z.string().describe("Why this action should fix the issue"),
  userMessage: z.string().describe(
    "A friendly message to show the user about what happened and what was done"
  ),
});

export type RemediationResult = z.infer<typeof remediationSchema>;

/**
 * Check if auto-remediation should run for this deployment.
 * Enforces max attempts and cooldown period.
 */
export async function shouldAutoRemediate(
  deploymentId: string
): Promise<boolean> {
  const recentAttempts = await prisma.deploymentEvent.count({
    where: {
      deploymentId,
      action: "auto_remediation",
      createdAt: { gte: new Date(Date.now() - REMEDIATION_COOLDOWN_MS) },
    },
  });

  return recentAttempts < MAX_REMEDIATION_ATTEMPTS;
}

/**
 * Run the auto-remediation agent: gather diagnostics, call the LLM,
 * and apply the recommended fix if possible.
 *
 * Returns the remediation result, or null if diagnostics couldn't be gathered.
 */
export async function runAutoRemediation(
  deploymentId: string,
  getModel: () => import("@ai-sdk/provider").LanguageModelV3
): Promise<RemediationResult | null> {
  const snapshot = await gatherDiagnosticSnapshot(deploymentId);
  if (!snapshot) {
    console.warn(`[auto-remediate] Deployment ${deploymentId} not found`);
    return null;
  }

  if (snapshot.pods.length === 0 && snapshot.events.length === 0) {
    console.log(`[auto-remediate] No pod data available for ${snapshot.deploymentName}`);
    return null;
  }

  console.log(
    `[auto-remediate] Analyzing ${snapshot.displayName} (${snapshot.deploymentName})...`
  );

  try {
    const { object: result } = await generateObject({
      model: getModel(),
      schema: remediationSchema,
      prompt: buildRemediationPrompt(snapshot),
    });

    console.log(
      `[auto-remediate] Diagnosis: "${result.diagnosis}" → action: ${result.action}`
    );

    if (result.action === "change_settings" && result.configChanges) {
      try {
        await initiateUpgrade({
          tenantId: snapshot.tenantId,
          deploymentId: snapshot.deploymentId,
          config: result.configChanges,
        });
        console.log(
          `[auto-remediate] Applied config changes to ${snapshot.deploymentName}:`,
          result.configChanges
        );
      } catch (err) {
        console.error(
          `[auto-remediate] Failed to apply config changes:`,
          err instanceof Error ? err.message : err
        );
        result.action = "none";
      }
    } else if (result.action === "restart") {
      try {
        await initiateUpgrade({
          tenantId: snapshot.tenantId,
          deploymentId: snapshot.deploymentId,
          config: {},
        });
        console.log(`[auto-remediate] Restarted ${snapshot.deploymentName}`);
      } catch (err) {
        console.error(
          `[auto-remediate] Failed to restart:`,
          err instanceof Error ? err.message : err
        );
        result.action = "none";
      }
    }

    recordAutoRemediation({
      deploymentId: snapshot.deploymentId,
      diagnosis: result.diagnosis,
      action: result.action,
      configChanges: result.configChanges,
      success: result.action !== "none",
    });

    return result;
  } catch (err) {
    console.error(
      `[auto-remediate] LLM call failed for ${snapshot.deploymentName}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─── Prompt Builder ───────────────────────────────────────

function buildRemediationPrompt(snapshot: DiagnosticSnapshot): string {
  const sections: string[] = [];

  sections.push(`# Auto-Remediation Analysis

You are analyzing a failing app deployment. Your goal is to determine what's wrong
and whether it can be fixed automatically by changing configuration or restarting.

## App Info
- Name: ${snapshot.deploymentName}
- Type: ${snapshot.displayName} (recipe: ${snapshot.recipeSlug})
- Status: ${snapshot.status}
- Error: ${snapshot.errorMessage ?? "none"}
- Current config: ${JSON.stringify(snapshot.config, null, 2)}
- Available settings: ${snapshot.availableSettings.join(", ") || "none"}`);

  if (snapshot.pods.length > 0) {
    sections.push(`## Pod Status
${snapshot.pods.map((p) => {
  const containers = p.containers
    .map((c) => {
      let s = `  - ${c.name}: ${c.state}`;
      if (c.stateReason) s += ` (${c.stateReason})`;
      if (c.stateMessage) s += ` — ${c.stateMessage}`;
      if (c.exitCode !== undefined) s += ` [exit code: ${c.exitCode}]`;
      if (c.restartCount > 0) s += ` [${c.restartCount} restarts]`;
      if (c.lastState) {
        s += `\n    last state: ${c.lastState.state}`;
        if (c.lastState.reason) s += ` (${c.lastState.reason})`;
        if (c.lastState.exitCode !== undefined) s += ` [exit: ${c.lastState.exitCode}]`;
      }
      return s;
    })
    .join("\n");
  const inits = p.initContainers.length > 0
    ? "\n  Init containers:\n" +
      p.initContainers.map((c) => `  - ${c.name}: ${c.state}${c.stateReason ? ` (${c.stateReason})` : ""}`).join("\n")
    : "";
  return `Pod: ${p.name} | phase: ${p.phase} | ready: ${p.ready} | restarts: ${p.restarts} | age: ${p.age}\n  Containers:\n${containers}${inits}`;
}).join("\n\n")}`);
  }

  if (snapshot.events.length > 0) {
    sections.push(`## K8s Events (most recent first)
${snapshot.events.map((e) => `[${e.type}] ${e.reason}: ${e.message} (×${e.count})`).join("\n")}`);
  }

  if (snapshot.logs && !snapshot.logs.startsWith("(no") && !snapshot.logs.startsWith("No pods")) {
    const trimmedLogs = snapshot.logs.length > 3000
      ? snapshot.logs.slice(-3000) + "\n... (truncated)"
      : snapshot.logs;
    sections.push(`## Current Logs\n\`\`\`\n${trimmedLogs}\n\`\`\``);
  }

  if (snapshot.previousLogs && !snapshot.previousLogs.startsWith("(no")) {
    const trimmedPrev = snapshot.previousLogs.length > 2000
      ? snapshot.previousLogs.slice(-2000) + "\n... (truncated)"
      : snapshot.previousLogs;
    sections.push(`## Previous Container Logs\n\`\`\`\n${trimmedPrev}\n\`\`\``);
  }

  sections.push(`## Rules
- Only suggest config changes using the available settings listed above.
- For OOMKilled (exit code 137): increase memory_limit (double the current value or set 512Mi minimum).
- For connection errors to dependencies: action should be "none" — dependency issues require human attention.
- For ImagePullBackOff: action should be "none" — image issues can't be fixed via config.
- For config/startup errors visible in logs: check if a setting can fix it, otherwise "none".
- For generic CrashLoopBackOff with no clear cause: try "restart" first.
- The userMessage should be friendly, non-technical, and explain what happened and what was done.
- NEVER mention Kubernetes, pods, containers, namespaces, or other infrastructure terms in userMessage.`);

  return sections.join("\n\n");
}

// ─── Helpers ──────────────────────────────────────────────

function extractSettingNames(schema: unknown): string[] {
  try {
    if (schema && typeof schema === "object" && "shape" in schema) {
      const shape = (schema as { shape: Record<string, unknown> }).shape;
      return Object.keys(shape);
    }
  } catch {
    // Schema introspection failed
  }
  return [];
}

async function safeGetLogs(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (err) {
    console.error("[diagnostics] Failed to get logs:", err instanceof Error ? err.message : err);
    return "(failed to retrieve logs)";
  }
}
