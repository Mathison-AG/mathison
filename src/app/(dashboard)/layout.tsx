import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace/context";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompletedAt: true },
  });

  if (!user) {
    redirect("/api/auth/signout");
  }

  if (!user.onboardingCompletedAt) {
    redirect("/welcome");
  }

  // Fetch all workspaces for the sidebar selector
  const workspaces = await prisma.workspace.findMany({
    where: { tenantId: session.user.tenantId, status: { not: "DELETED" } },
    select: { id: true, slug: true, name: true, namespace: true },
    orderBy: { createdAt: "asc" },
  });

  // Resolve the active workspace
  const activeWorkspace = await getActiveWorkspace(
    session.user.tenantId,
    session.user.id
  );

  return (
    <DashboardShell
      userName={session.user.name}
      userEmail={session.user.email}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspace?.id ?? workspaces[0]?.id ?? ""}
      activeWorkspaceName={activeWorkspace?.name ?? workspaces[0]?.name ?? "Workspace"}
    >
      {children}
    </DashboardShell>
  );
}
