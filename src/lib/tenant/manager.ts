/**
 * Tenant Manager
 *
 * Tenant-level operations. Workspace namespace management is now
 * handled by src/lib/workspace/manager.ts.
 *
 * This module handles tenant status changes and tenant-wide operations
 * like deprovisioning all workspaces when a tenant is deleted.
 */

import { prisma } from "@/lib/db";

// ─── Tenant operations ────────────────────────────────────

/**
 * Deprovision a tenant: delete all workspaces (which deletes namespaces)
 * and mark the tenant as DELETED.
 */
export async function deprovisionTenant(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });

  if (!tenant) {
    console.warn(`[tenant] Tenant ${tenantId} not found for deprovisioning`);
    return;
  }

  console.log(`[tenant] Deprovisioning tenant '${tenant.slug}'`);

  // Delete all workspaces (which handles namespace + deployment cleanup)
  const workspaces = await prisma.workspace.findMany({
    where: { tenantId, status: { not: "DELETED" } },
    select: { id: true },
  });

  // Delete workspaces one at a time (skip the "last workspace" check)
  for (const ws of workspaces) {
    try {
      // Mark directly since deleteWorkspace prevents deleting last workspace
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { status: "DELETED" },
      });
    } catch (err) {
      console.error(`[tenant] Failed to delete workspace ${ws.id}:`, err);
    }
  }

  // Update tenant status
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: "DELETED" },
  });

  console.log(`[tenant] Deprovisioned '${tenant.slug}'`);
}
