/**
 * Deployment Audit Trail
 *
 * Append-only event log for every deployment state change.
 * Events are never updated or deleted — they form the audit trail.
 */

import { prisma } from "@/lib/db";

import type { Prisma } from "@/generated/prisma/client";

// ─── Types ────────────────────────────────────────────────

export type DeploymentAction =
  | "created"
  | "config_changed"
  | "upgraded"
  | "restarted"
  | "health_changed"
  | "removed"
  | "failed"
  | "status_changed";

interface RecordEventParams {
  deploymentId: string;
  action: DeploymentAction;
  previousState?: Record<string, unknown> | null;
  newState: Record<string, unknown>;
  reason?: string;
  triggeredBy?: string; // User ID or "system"
}

// ─── Core ─────────────────────────────────────────────────

/**
 * Record a deployment event in the audit trail.
 * Fire-and-forget safe — errors are logged but don't propagate.
 */
export async function recordDeploymentEvent(
  params: RecordEventParams
): Promise<void> {
  try {
    await prisma.deploymentEvent.create({
      data: {
        deploymentId: params.deploymentId,
        action: params.action,
        previousState: (params.previousState ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        newState: params.newState as Prisma.InputJsonValue,
        reason: params.reason,
        triggeredBy: params.triggeredBy,
      },
    });
  } catch (err) {
    console.error(
      `[events] Failed to record deployment event (${params.action}):`,
      err
    );
  }
}

// ─── Convenience helpers ──────────────────────────────────

/** Record the initial deployment creation */
export function recordCreated(params: {
  deploymentId: string;
  recipeSlug: string;
  config: Record<string, unknown>;
  triggeredBy?: string;
}): Promise<void> {
  return recordDeploymentEvent({
    deploymentId: params.deploymentId,
    action: "created",
    newState: {
      recipe: params.recipeSlug,
      config: params.config,
    },
    reason: "User requested",
    triggeredBy: params.triggeredBy,
  });
}

/** Record a configuration change (upgrade with new config) */
export function recordConfigChanged(params: {
  deploymentId: string;
  previousConfig: Record<string, unknown>;
  newConfig: Record<string, unknown>;
  triggeredBy?: string;
}): Promise<void> {
  return recordDeploymentEvent({
    deploymentId: params.deploymentId,
    action: "config_changed",
    previousState: { config: params.previousConfig },
    newState: { config: params.newConfig },
    reason: "User requested",
    triggeredBy: params.triggeredBy,
  });
}

/** Record a restart (upgrade with same config) */
export function recordRestarted(params: {
  deploymentId: string;
  triggeredBy?: string;
}): Promise<void> {
  return recordDeploymentEvent({
    deploymentId: params.deploymentId,
    action: "restarted",
    newState: {},
    reason: "User requested",
    triggeredBy: params.triggeredBy,
  });
}

/** Record a status change from the worker (e.g. DEPLOYING → RUNNING) */
export function recordStatusChanged(params: {
  deploymentId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}): Promise<void> {
  return recordDeploymentEvent({
    deploymentId: params.deploymentId,
    action: "status_changed",
    previousState: { status: params.previousStatus },
    newState: { status: params.newStatus },
    reason: params.reason,
    triggeredBy: "system",
  });
}

/** Record a health change detected by the worker */
export function recordHealthChanged(params: {
  deploymentId: string;
  healthy: boolean;
  reason: string;
}): Promise<void> {
  return recordDeploymentEvent({
    deploymentId: params.deploymentId,
    action: "health_changed",
    newState: { healthy: params.healthy, reason: params.reason },
    reason: params.reason,
    triggeredBy: "system",
  });
}

/** Record a deployment failure */
export function recordFailed(params: {
  deploymentId: string;
  error: string;
}): Promise<void> {
  return recordDeploymentEvent({
    deploymentId: params.deploymentId,
    action: "failed",
    newState: { error: params.error },
    reason: params.error,
    triggeredBy: "system",
  });
}

/** Record removal initiation */
export function recordRemoved(params: {
  deploymentId: string;
  lastConfig: Record<string, unknown>;
  triggeredBy?: string;
}): Promise<void> {
  return recordDeploymentEvent({
    deploymentId: params.deploymentId,
    action: "removed",
    previousState: { config: params.lastConfig },
    newState: {},
    reason: "User requested",
    triggeredBy: params.triggeredBy,
  });
}
