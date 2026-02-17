/**
 * Workspace Manager
 *
 * CRUD operations for workspaces + K8s namespace lifecycle.
 * Each workspace maps to a K8s namespace: "{tenantSlug}-{workspaceSlug}".
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  createNamespace,
  deleteNamespace,
  applyResourceQuota,
  applyNetworkPolicy,
} from "@/lib/cluster/kubernetes";
import { deleteResources } from "@/recipes/_base/apply";
import { buildQuotaSpec } from "@/lib/tenant/quota";

import type { QuotaSpec } from "@/lib/tenant/quota";

// ─── Types ────────────────────────────────────────────────

interface CreateWorkspaceInput {
  tenantId: string;
  name: string;
  slug?: string;
  quota?: QuotaSpec;
}

interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  namespace: string;
  status: string;
  deploymentCount: number;
  createdAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────

function getDefaultQuota(): QuotaSpec {
  return {
    cpu: process.env.DEFAULT_WORKSPACE_CPU_QUOTA || "4",
    memory: process.env.DEFAULT_WORKSPACE_MEMORY_QUOTA || "8Gi",
    storage: process.env.DEFAULT_WORKSPACE_STORAGE_QUOTA || "50Gi",
  };
}

/**
 * Derive a URL-safe slug from a name.
 * "My Cool Workspace" → "my-cool-workspace"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Create ───────────────────────────────────────────────

/**
 * Create a new workspace with a K8s namespace.
 *
 * Namespace naming: "{tenantSlug}-{workspaceSlug}"
 */
export async function createWorkspace(
  input: CreateWorkspaceInput
): Promise<{ id: string; slug: string; name: string; namespace: string }> {
  const { tenantId, name, quota } = input;

  // Look up tenant for slug
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  // Generate slug
  let slug = input.slug || slugify(name);
  if (!slug) slug = "workspace";

  // Check uniqueness within tenant
  const existing = await prisma.workspace.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
  });
  if (existing) {
    throw new Error(`A workspace named '${slug}' already exists`);
  }

  const namespace = `${tenant.slug}-${slug}`;

  // Check namespace uniqueness globally
  const existingNs = await prisma.workspace.findUnique({
    where: { namespace },
  });
  if (existingNs) {
    throw new Error(`Namespace '${namespace}' is already in use`);
  }

  // Create DB record
  const workspace = await prisma.workspace.create({
    data: {
      tenantId,
      slug,
      name,
      namespace,
      quota: (quota ?? getDefaultQuota()) as unknown as Prisma.InputJsonValue,
    },
  });

  // Provision K8s namespace (fire-and-forget — workspace creation succeeds even if K8s fails)
  provisionWorkspaceNamespace({
    namespace,
    tenantSlug: tenant.slug,
    workspaceSlug: slug,
    quota: quota ?? getDefaultQuota(),
  }).catch((err) => {
    console.error(
      `[workspace] K8s provisioning failed for ${namespace} (will retry):`,
      err
    );
  });

  console.log(
    `[workspace] Created workspace '${name}' (${slug}) → namespace: ${namespace}`
  );

  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    namespace: workspace.namespace,
  };
}

// ─── List ─────────────────────────────────────────────────

/**
 * List all workspaces for a tenant with deployment counts.
 */
export async function listWorkspaces(
  tenantId: string
): Promise<WorkspaceSummary[]> {
  const workspaces = await prisma.workspace.findMany({
    where: { tenantId, status: { not: "DELETED" } },
    include: {
      _count: { select: { deployments: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return workspaces.map((w) => ({
    id: w.id,
    slug: w.slug,
    name: w.name,
    namespace: w.namespace,
    status: w.status,
    deploymentCount: w._count.deployments,
    createdAt: w.createdAt,
  }));
}

// ─── Get ──────────────────────────────────────────────────

/**
 * Get a single workspace with tenant authorization check.
 */
export async function getWorkspace(
  workspaceId: string,
  tenantId: string
): Promise<WorkspaceSummary | null> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, tenantId, status: { not: "DELETED" } },
    include: {
      _count: { select: { deployments: true } },
    },
  });

  if (!workspace) return null;

  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    namespace: workspace.namespace,
    status: workspace.status,
    deploymentCount: workspace._count.deployments,
    createdAt: workspace.createdAt,
  };
}

// ─── Delete ───────────────────────────────────────────────

/**
 * Delete a workspace: uninstall all Helm releases, delete K8s namespace,
 * update deployment statuses, and mark workspace as DELETED.
 */
export async function deleteWorkspace(
  workspaceId: string,
  tenantId: string
): Promise<{ message: string }> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, tenantId },
    select: {
      id: true,
      slug: true,
      name: true,
      namespace: true,
      status: true,
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.status === "DELETED") {
    throw new Error("Workspace is already deleted");
  }

  if (workspace.status === "DELETING") {
    throw new Error("Workspace deletion is already in progress");
  }

  // Prevent deleting the last workspace
  const workspaceCount = await prisma.workspace.count({
    where: { tenantId, status: { not: "DELETED" } },
  });
  if (workspaceCount <= 1) {
    throw new Error("Cannot delete the last workspace. Create another one first.");
  }

  console.log(
    `[workspace] Deleting workspace '${workspace.name}' (${workspace.slug}) → namespace: ${workspace.namespace}`
  );

  // 1. Mark workspace as DELETING
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { status: "DELETING" },
  });

  // 2. Mark all deployments in this workspace as DELETING
  const deployments = await prisma.deployment.findMany({
    where: { workspaceId, status: { notIn: ["STOPPED", "DELETING"] } },
    select: { id: true, name: true, namespace: true, managedResources: true },
  });

  if (deployments.length > 0) {
    await prisma.deployment.updateMany({
      where: { workspaceId, status: { notIn: ["STOPPED"] } },
      data: { status: "DELETING" },
    });
  }

  // 3. Delete managed K8s resources (best-effort, namespace deletion will clean up anyway)
  for (const dep of deployments) {
    try {
      if (dep.managedResources) {
        const resources = JSON.parse(dep.managedResources) as Array<Record<string, unknown>>;
        await deleteResources(resources as never);
      }
    } catch (err) {
      console.warn(
        `[workspace] Failed to delete resources for ${dep.name} (will be cleaned up by namespace deletion):`,
        err
      );
    }
  }

  // 4. Delete K8s namespace (cascades all remaining resources)
  try {
    await deleteNamespace(workspace.namespace);
  } catch (err) {
    console.error(`[workspace] Failed to delete namespace ${workspace.namespace}:`, err);
    // Continue with DB cleanup even if K8s fails
  }

  // 5. Delete deployment records — resources no longer exist in the cluster
  await prisma.deployment.deleteMany({
    where: { workspaceId },
  });

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { status: "DELETED" },
  });

  // 6. Reassign any users whose active workspace was this one
  const firstOtherWorkspace = await prisma.workspace.findFirst({
    where: { tenantId, status: "ACTIVE", id: { not: workspaceId } },
    select: { id: true },
  });

  if (firstOtherWorkspace) {
    await prisma.user.updateMany({
      where: { activeWorkspaceId: workspaceId },
      data: { activeWorkspaceId: firstOtherWorkspace.id },
    });
  }

  console.log(`[workspace] Deleted workspace '${workspace.name}'`);

  return {
    message: `Workspace '${workspace.name}' and all its resources have been deleted.`,
  };
}

// ─── K8s Provisioning ─────────────────────────────────────

/**
 * Provision a K8s namespace for a workspace.
 * Creates namespace, applies resource quota and network policy.
 * Idempotent — safe to retry.
 */
async function provisionWorkspaceNamespace(params: {
  namespace: string;
  tenantSlug: string;
  workspaceSlug: string;
  quota: QuotaSpec;
}): Promise<void> {
  const { namespace, tenantSlug, workspaceSlug, quota } = params;

  console.log(`[workspace] Provisioning namespace: ${namespace}`);

  // 1. Create namespace with labels
  await createNamespace(namespace, {
    "mathison.io/tenant": tenantSlug,
    "mathison.io/workspace": workspaceSlug,
    "mathison.io/managed-by": "mathison",
  });

  // 2. Apply resource quota
  try {
    const quotaSpec = buildQuotaSpec(quota);
    await applyResourceQuota(namespace, {
      cpu: quotaSpec.spec?.hard?.["limits.cpu"],
      memory: quotaSpec.spec?.hard?.["limits.memory"],
      storage: quotaSpec.spec?.hard?.["requests.storage"],
    });
  } catch (err) {
    console.error(`[workspace] Failed to apply quota for ${namespace}:`, err);
  }

  // 3. Apply network policy
  try {
    await applyNetworkPolicy(namespace);
  } catch (err) {
    console.error(`[workspace] Failed to apply network policy for ${namespace}:`, err);
  }

  console.log(`[workspace] Provisioned namespace: ${namespace}`);
}
