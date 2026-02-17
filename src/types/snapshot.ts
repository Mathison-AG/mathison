/**
 * Workspace Snapshot Types
 *
 * Defines the portable export format for a workspace's desired state.
 * Snapshots capture service configuration but never secrets (security)
 * or K8s resource state (recreated from recipes on restore).
 */

import { z } from "zod/v4";

// ─── Zod Schema ───────────────────────────────────────────

export const snapshotServiceSchema = z.object({
  recipe: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  dependsOn: z.array(z.string()),
  status: z.string(),
});

export const workspaceSnapshotSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  exportedBy: z.string(),
  workspace: z.object({
    slug: z.string(),
    name: z.string(),
  }),
  services: z.array(snapshotServiceSchema),
  metadata: z
    .object({
      platform: z.string(),
      engineVersion: z.string(),
    })
    .optional(),
});

// ─── TypeScript Interfaces ────────────────────────────────

export interface SnapshotService {
  recipe: string;
  name: string;
  config: Record<string, unknown>;
  dependsOn: string[];
  status: string;
}

export interface WorkspaceSnapshot {
  version: 1;
  exportedAt: string;
  exportedBy: string;
  workspace: {
    slug: string;
    name: string;
  };
  services: SnapshotService[];
  metadata?: {
    platform: string;
    engineVersion: string;
  };
}

// ─── Import Result ────────────────────────────────────────

export interface ImportServiceResult {
  name: string;
  recipe: string;
  deploymentId: string;
  status: "queued" | "skipped" | "error";
  message?: string;
}

export interface ImportResult {
  services: ImportServiceResult[];
  totalQueued: number;
  totalSkipped: number;
  totalErrors: number;
}
