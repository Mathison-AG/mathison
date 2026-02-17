/**
 * Workspace Import / Restore
 *
 * Restores a workspace from a portable JSON snapshot. For each service:
 *   1. Validates the recipe exists in the registry
 *   2. Validates config against the recipe's Zod schema
 *   3. Generates new secrets (secrets are never exported)
 *   4. Creates a Deployment record and queues a deploy job
 *
 * Services are deployed in dependency order (topological sort).
 * Circular dependencies are detected and rejected.
 */

import { z } from "zod/v4";

import { prisma } from "@/lib/db";
import { getRecipeDefinition } from "@/recipes/registry";
import { initiateDeployment } from "@/lib/deployer/engine";
import { workspaceSnapshotSchema } from "@/types/snapshot";

import type {
  WorkspaceSnapshot,
  SnapshotService,
  ImportResult,
  ImportServiceResult,
} from "@/types/snapshot";

// ─── Validation ───────────────────────────────────────────

interface ValidationError {
  service: string;
  error: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  snapshot: WorkspaceSnapshot | null;
}

/**
 * Validate a snapshot before importing. Checks:
 * - Snapshot structure matches schema
 * - All referenced recipes exist in registry
 * - All configs validate against their recipe's Zod schema
 * - No circular dependencies
 */
export function validateSnapshot(
  data: unknown,
  checkConflicts?: { existingNames: Set<string>; force: boolean }
): ValidationResult {
  // 1. Validate snapshot structure
  const parsed = workspaceSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    return {
      valid: false,
      errors: [
        {
          service: "(snapshot)",
          error: `Invalid snapshot format: ${z.flattenError(parsed.error).formErrors.join(", ") || "schema validation failed"}`,
        },
      ],
      snapshot: null,
    };
  }

  const snapshot = parsed.data as WorkspaceSnapshot;
  const errors: ValidationError[] = [];

  // 2. Validate each service
  const serviceNames = new Set<string>();

  for (const svc of snapshot.services) {
    // Check for duplicate names within snapshot
    if (serviceNames.has(svc.name)) {
      errors.push({
        service: svc.name,
        error: `Duplicate service name '${svc.name}' in snapshot`,
      });
    }
    serviceNames.add(svc.name);

    // Check recipe exists
    const recipe = getRecipeDefinition(svc.recipe);
    if (!recipe) {
      errors.push({
        service: svc.name,
        error: `Recipe '${svc.recipe}' not found in the app catalog`,
      });
      continue;
    }

    // Validate config against recipe's Zod schema
    const configParsed = recipe.configSchema.safeParse(svc.config);
    if (!configParsed.success) {
      errors.push({
        service: svc.name,
        error: `Invalid configuration: ${String(configParsed.error)}`,
      });
    }

    // Check dependencies reference known services in the snapshot
    for (const dep of svc.dependsOn) {
      if (!snapshot.services.some((s) => s.name === dep)) {
        errors.push({
          service: svc.name,
          error: `Dependency '${dep}' is not included in the snapshot`,
        });
      }
    }
  }

  // 3. Check for circular dependencies
  const cycle = detectCycle(snapshot.services);
  if (cycle) {
    errors.push({
      service: cycle,
      error: `Circular dependency detected involving '${cycle}'`,
    });
  }

  // 4. Check for name conflicts with existing deployments
  if (checkConflicts && !checkConflicts.force) {
    for (const svc of snapshot.services) {
      if (checkConflicts.existingNames.has(svc.name)) {
        errors.push({
          service: svc.name,
          error: `A service named '${svc.name}' already exists in this workspace`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    snapshot: errors.length === 0 ? snapshot : snapshot,
  };
}

// ─── Import ───────────────────────────────────────────────

/**
 * Import/restore a workspace from a validated snapshot.
 *
 * Deploys services in dependency order (dependencies first).
 * If `force` is true, removes existing deployments that conflict.
 */
export async function importWorkspace(params: {
  workspaceId: string;
  tenantId: string;
  snapshot: WorkspaceSnapshot;
  force?: boolean;
}): Promise<ImportResult> {
  const { workspaceId, tenantId, snapshot, force = false } = params;

  // 1. If force, remove conflicting deployments
  if (force) {
    const existingNames = snapshot.services.map((s) => s.name);
    const conflicting = await prisma.deployment.findMany({
      where: {
        workspaceId,
        name: { in: existingNames },
        status: { not: "STOPPED" },
      },
      select: { id: true, name: true },
    });

    if (conflicting.length > 0) {
      // Mark as STOPPED so initiateDeployment won't conflict
      await prisma.deployment.updateMany({
        where: { id: { in: conflicting.map((c) => c.id) } },
        data: { status: "STOPPED" },
      });
      console.log(
        `[import] Force-stopped ${conflicting.length} conflicting deployment(s): ${conflicting.map((c) => c.name).join(", ")}`
      );
    }
  }

  // 2. Topological sort — dependencies first
  const ordered = topologicalSort(snapshot.services);

  // 3. Deploy each service in order
  const results: ImportServiceResult[] = [];
  let totalQueued = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const svc of ordered) {
    try {
      const result = await initiateDeployment({
        tenantId,
        workspaceId,
        recipeSlug: svc.recipe,
        name: svc.name,
        config: svc.config,
      });

      results.push({
        name: svc.name,
        recipe: svc.recipe,
        deploymentId: result.deploymentId,
        status: "queued",
      });
      totalQueued++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[import] Failed to deploy '${svc.name}':`, err);

      // If it already exists, treat as skipped
      if (message.includes("already deployed")) {
        results.push({
          name: svc.name,
          recipe: svc.recipe,
          deploymentId: "",
          status: "skipped",
          message: "Already exists in workspace",
        });
        totalSkipped++;
      } else {
        results.push({
          name: svc.name,
          recipe: svc.recipe,
          deploymentId: "",
          status: "error",
          message,
        });
        totalErrors++;
      }
    }
  }

  return { services: results, totalQueued, totalSkipped, totalErrors };
}

// ─── Topological Sort ─────────────────────────────────────

/**
 * Sort services so dependencies come before dependents.
 * Uses Kahn's algorithm.
 */
function topologicalSort(services: SnapshotService[]): SnapshotService[] {
  const nameToService = new Map<string, SnapshotService>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const svc of services) {
    nameToService.set(svc.name, svc);
    inDegree.set(svc.name, 0);
    adjacency.set(svc.name, []);
  }

  // Build graph: for each dependency, add an edge from dep → dependent
  for (const svc of services) {
    for (const dep of svc.dependsOn) {
      if (nameToService.has(dep)) {
        adjacency.get(dep)!.push(svc.name);
        inDegree.set(svc.name, (inDegree.get(svc.name) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [name, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  const sorted: SnapshotService[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const svc = nameToService.get(current)!;
    sorted.push(svc);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all services are in the sorted output, there's a cycle
  // (handled by detectCycle in validation — here we just return what we have
  // plus any remaining services appended at the end)
  if (sorted.length < services.length) {
    const sortedNames = new Set(sorted.map((s) => s.name));
    for (const svc of services) {
      if (!sortedNames.has(svc.name)) {
        sorted.push(svc);
      }
    }
  }

  return sorted;
}

// ─── Cycle Detection ──────────────────────────────────────

/**
 * Detect circular dependencies in the service graph.
 * Returns the name of a service involved in a cycle, or null if clean.
 */
function detectCycle(services: SnapshotService[]): string | null {
  const nameSet = new Set(services.map((s) => s.name));
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const adjMap = new Map<string, string[]>();
  for (const svc of services) {
    adjMap.set(
      svc.name,
      svc.dependsOn.filter((d) => nameSet.has(d))
    );
  }

  function dfs(node: string): string | null {
    visited.add(node);
    recursionStack.add(node);

    for (const neighbor of adjMap.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        const result = dfs(neighbor);
        if (result) return result;
      } else if (recursionStack.has(neighbor)) {
        return neighbor;
      }
    }

    recursionStack.delete(node);
    return null;
  }

  for (const svc of services) {
    if (!visited.has(svc.name)) {
      const result = dfs(svc.name);
      if (result) return result;
    }
  }

  return null;
}
