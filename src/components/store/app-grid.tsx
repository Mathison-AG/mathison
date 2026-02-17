"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { AppCard } from "./app-card";

import type { Recipe } from "@/types/recipe";

interface AppGridProps {
  recipes: Recipe[];
  isLoading?: boolean;
}

export function AppGrid({ recipes, isLoading }: AppGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <AppCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">No apps found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search or filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {recipes.map((recipe) => (
        <AppCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  );
}

function AppCardSkeleton() {
  return (
    <Card className="flex flex-col items-center gap-3 p-6">
      <Skeleton className="size-16 rounded-2xl" />
      <div className="space-y-1.5 w-full text-center">
        <Skeleton className="h-4 w-20 mx-auto" />
        <Skeleton className="h-3 w-14 mx-auto" />
      </div>
      <div className="space-y-1.5 w-full">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4 mx-auto" />
      </div>
      <Skeleton className="h-8 w-full rounded-lg mt-auto" />
    </Card>
  );
}
