import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getRecipeDefinition } from "@/recipes/registry";

import { AppDetail } from "@/components/my-apps/app-detail";

interface AppDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AppDetailPage({ params }: AppDetailPageProps) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  // Fetch the deployment to get the recipe slug, then look up gettingStarted from registry
  const deployment = await prisma.deployment.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { recipe: { select: { slug: true } } }
  });

  let gettingStarted: string | null = null;
  if (deployment?.recipe.slug) {
    const recipe = getRecipeDefinition(deployment.recipe.slug);
    gettingStarted = recipe?.gettingStarted ?? null;
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <AppDetail id={id} gettingStarted={gettingStarted} />
    </div>
  );
}
