"use client";

import { use, useMemo } from "react";
import { Loader2 } from "lucide-react";

import { useRecipe } from "@/hooks/use-catalog";
import { useDeployments } from "@/hooks/use-deployments";
import { AppDetail } from "@/components/store/app-detail";

interface AppPageProps {
  params: Promise<{ slug: string }>;
}

export default function AppPage({ params }: AppPageProps) {
  const { slug } = use(params);
  const { data: recipe, isLoading, error } = useRecipe(slug);
  const { data: deployments } = useDeployments();

  const isInstalled = useMemo(() => {
    if (!deployments || !recipe) return false;
    return deployments.some(
      (d) =>
        d.recipe.slug === recipe.slug &&
        d.status !== "STOPPED" &&
        d.status !== "FAILED"
    );
  }, [deployments, recipe]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">App not found</p>
          <p className="text-sm text-muted-foreground">
            The app you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <AppDetail recipe={recipe} isInstalled={isInstalled} />
    </div>
  );
}
