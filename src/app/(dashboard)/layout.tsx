import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  // Fetch tenant name for the header workspace badge
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true },
  });

  return (
    <DashboardShell
      userName={session.user.name}
      userEmail={session.user.email}
      workspaceName={tenant?.name ?? "Workspace"}
    >
      {children}
    </DashboardShell>
  );
}
