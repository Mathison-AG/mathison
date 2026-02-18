import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userExists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!userExists) {
    redirect("/api/auth/signout");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Minimal header */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Mathison</span>
        </div>
        <a
          href="/api/auth/signout"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </a>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
