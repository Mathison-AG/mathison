"use client";

import { use } from "react";
import { Loader2 } from "lucide-react";

import { useRecipe } from "@/hooks/use-catalog";
import { RecipeDetail } from "@/components/catalog/recipe-detail";

interface RecipePageProps {
  params: Promise<{ slug: string }>;
}

export default function RecipePage({ params }: RecipePageProps) {
  const { slug } = use(params);
  const { data: recipe, isLoading, error } = useRecipe(slug);

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
        <div className="text-center">
          <p className="text-sm font-medium">Service not found</p>
          <p className="text-sm text-muted-foreground">
            The service you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <RecipeDetail recipe={recipe} />
    </div>
  );
}
