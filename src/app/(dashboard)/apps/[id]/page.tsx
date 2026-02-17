import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

import { AppDetail } from "@/components/my-apps/app-detail";

interface AppDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AppDetailPage({ params }: AppDetailPageProps) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  // Fetch the deployment to get the recipeId, then fetch the recipe for gettingStarted
  const deployment = await prisma.deployment.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { recipeId: true },
  });

  let gettingStarted: string | null = null;
  if (deployment?.recipeId) {
    const recipe = await prisma.recipe.findUnique({
      where: { id: deployment.recipeId },
      select: { gettingStarted: true },
    });
    gettingStarted = recipe?.gettingStarted ?? null;
  }

  return (
    <div className="p-6 max-w-3xl">
      <AppDetail id={id} gettingStarted={gettingStarted} />
    </div>
  );
}
