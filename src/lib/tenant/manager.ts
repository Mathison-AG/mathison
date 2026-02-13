/**
 * Tenant Manager
 *
 * Namespace lifecycle management for tenants.
 * Creates/deletes namespaces, applies resource quotas and network policies.
 */

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  createNamespace,
  deleteNamespace,
  applyResourceQuota,
  applyNetworkPolicy,
} from "@/lib/cluster/kubernetes";
import { buildQuotaSpec } from "@/lib/tenant/quota";

import type { QuotaSpec } from "@/lib/tenant/quota";

// ─── Types ────────────────────────────────────────────────

interface TenantProvisionInput {
  slug: string;
  namespace: string;
  quota?: QuotaSpec;
}

// ─── Default quota from env ───────────────────────────────

function getDefaultQuota(): QuotaSpec {
  return {
    cpu: process.env.DEFAULT_TENANT_CPU_QUOTA || "4",
    memory: process.env.DEFAULT_TENANT_MEMORY_QUOTA || "8Gi",
    storage: process.env.DEFAULT_TENANT_STORAGE_QUOTA || "50Gi",
  };
}

// ─── Tenant operations ────────────────────────────────────

/**
 * Provision a new tenant: create namespace + resource quota + network policy.
 *
 * This is called after a tenant is created in the DB (e.g., during signup).
 * All operations are idempotent — safe to retry.
 */
export async function provisionTenant(
  tenant: TenantProvisionInput
): Promise<{ namespace: string; quotaApplied: boolean; policyApplied: boolean }> {
  const quota = tenant.quota ?? getDefaultQuota();

  console.log(`[tenant] Provisioning namespace for tenant '${tenant.slug}': ${tenant.namespace}`);

  // 1. Create namespace with tenant labels
  await createNamespace(tenant.namespace, {
    "mathison.io/tenant": tenant.slug,
    "mathison.io/managed-by": "mathison",
  });

  // 2. Apply resource quota
  let quotaApplied = false;
  try {
    const quotaSpec = buildQuotaSpec(quota);
    await applyResourceQuota(tenant.namespace, {
      cpu: quotaSpec.spec?.hard?.["limits.cpu"],
      memory: quotaSpec.spec?.hard?.["limits.memory"],
      storage: quotaSpec.spec?.hard?.["requests.storage"],
    });
    quotaApplied = true;
  } catch (err) {
    console.error(`[tenant] Failed to apply quota for '${tenant.slug}':`, err);
  }

  // 3. Apply default network policy (deny cross-tenant traffic)
  let policyApplied = false;
  try {
    await applyNetworkPolicy(tenant.namespace);
    policyApplied = true;
  } catch (err) {
    console.error(`[tenant] Failed to apply network policy for '${tenant.slug}':`, err);
  }

  console.log(
    `[tenant] Provisioned '${tenant.slug}': namespace=${tenant.namespace}, quota=${quotaApplied}, policy=${policyApplied}`
  );

  return { namespace: tenant.namespace, quotaApplied, policyApplied };
}

/**
 * Deprovision a tenant: delete namespace and all resources.
 * Also updates the tenant status in the DB.
 */
export async function deprovisionTenant(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, namespace: true },
  });

  if (!tenant) {
    console.warn(`[tenant] Tenant ${tenantId} not found for deprovisioning`);
    return;
  }

  console.log(`[tenant] Deprovisioning tenant '${tenant.slug}': ${tenant.namespace}`);

  // Delete the namespace (which deletes all resources within it)
  await deleteNamespace(tenant.namespace);

  // Update tenant status
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: "DELETED" },
  });

  console.log(`[tenant] Deprovisioned '${tenant.slug}'`);
}

/**
 * Update a tenant's resource quota.
 * Updates both K8s and the DB record.
 */
export async function updateQuota(
  tenantId: string,
  newQuota: QuotaSpec
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, namespace: true },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  console.log(`[tenant] Updating quota for '${tenant.slug}': ${JSON.stringify(newQuota)}`);

  // Apply to K8s
  await applyResourceQuota(tenant.namespace, newQuota);

  // Update DB
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      quota: newQuota as unknown as Prisma.InputJsonValue,
    },
  });

  console.log(`[tenant] Quota updated for '${tenant.slug}'`);
}
