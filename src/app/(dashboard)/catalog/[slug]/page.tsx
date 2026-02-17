"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useRecipe } from "@/hooks/use-catalog";
import { useDeployments } from "@/hooks/use-deployments";
import { AppDetail } from "@/components/store/app-detail";

interface AppPageProps {
  params: Promise<{ slug: string }>;
}

function DetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Back link */}
      <Skeleton className="h-4 w-24" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-5">
        <Skeleton className="size-20 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>

      <Separator />

      {/* Use cases */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-44" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-4 w-60" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
    </div>
  );
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
      <div className="p-4 sm:p-6">
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="size-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">This app doesn&apos;t exist</p>
            <p className="text-sm text-muted-foreground">
              It may have been removed, or the link might be wrong.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="mr-1.5 size-3.5" />
              Back to App Store
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 animate-fade-in">
      <AppDetail recipe={recipe} isInstalled={isInstalled} />
    </div>
  );
}
