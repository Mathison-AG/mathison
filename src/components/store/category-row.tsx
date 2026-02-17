"use client";

import { ChevronRight } from "lucide-react";

import { AppCard } from "./app-card";

import type { Recipe } from "@/types/recipe";

interface CategoryRowProps {
  title: string;
  recipes: Recipe[];
  onViewAll?: () => void;
  installedSlugs?: Set<string>;
  onInstall?: (recipe: Recipe) => void;
}

export function CategoryRow({
  title,
  recipes,
  onViewAll,
  installedSlugs,
  onInstall,
}: CategoryRowProps) {
  if (recipes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            See All
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {recipes.map((recipe) => (
          <AppCard
            key={recipe.slug}
            recipe={recipe}
            isInstalled={installedSlugs?.has(recipe.slug)}
            onInstall={onInstall}
          />
        ))}
      </div>
    </section>
  );
}
