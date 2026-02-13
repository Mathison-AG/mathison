/**
 * Workspace Context
 *
 * Resolves the active workspace for the current request.
 * Active workspace is stored in a cookie ("mathison-workspace")
 * and falls back to the user's persisted activeWorkspaceId in DB.
 */

import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

// ─── Constants ────────────────────────────────────────────

export const WORKSPACE_COOKIE = "mathison-workspace";

// ─── Types ────────────────────────────────────────────────

export interface ActiveWorkspace {
  id: string;
  slug: string;
  name: string;
  namespace: string;
}

// ─── Get Active Workspace ─────────────────────────────────

/**
 * Resolve the active workspace for the current user.
 *
 * Priority:
 * 1. Cookie "mathison-workspace" (fast switching, no JWT re-sign)
 * 2. User's activeWorkspaceId in DB (persisted preference)
 * 3. First workspace for the tenant (fallback)
 *
 * Returns null if user has no workspaces (shouldn't happen in practice).
 */
export async function getActiveWorkspace(
  tenantId: string,
  userId: string
): Promise<ActiveWorkspace | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(WORKSPACE_COOKIE)?.value;

  // 1. Try cookie value
  if (cookieValue) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: cookieValue, tenantId, status: "ACTIVE" },
      select: { id: true, slug: true, name: true, namespace: true },
    });
    if (workspace) return workspace;
  }

  // 2. Try user's persisted activeWorkspaceId
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeWorkspaceId: true },
  });

  if (user?.activeWorkspaceId) {
    const workspace = await prisma.workspace.findFirst({
      where: { id: user.activeWorkspaceId, tenantId, status: "ACTIVE" },
      select: { id: true, slug: true, name: true, namespace: true },
    });
    if (workspace) return workspace;
  }

  // 3. Fallback: first active workspace for this tenant
  const fallback = await prisma.workspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, namespace: true },
  });

  return fallback;
}

// ─── Set Active Workspace ─────────────────────────────────

/**
 * Set the active workspace via cookie.
 * Also updates the user's persisted preference in DB.
 */
export async function setActiveWorkspace(
  workspaceId: string,
  tenantId: string,
  userId: string
): Promise<ActiveWorkspace> {
  // Validate workspace belongs to tenant
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, tenantId, status: "ACTIVE" },
    select: { id: true, slug: true, name: true, namespace: true },
  });

  if (!workspace) {
    throw new Error("Workspace not found or not accessible");
  }

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  // Update user's persisted preference
  await prisma.user.update({
    where: { id: userId },
    data: { activeWorkspaceId: workspaceId },
  });

  return workspace;
}
