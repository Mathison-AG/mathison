"use client";

import { Sparkles } from "lucide-react";

import { AppCard } from "./app-card";

import type { Recipe } from "@/types/recipe";

interface FeaturedAppsProps {
  recipes: Recipe[];
  installedSlugs?: Set<string>;
  onInstall?: (recipe: Recipe) => void;
}

export function FeaturedApps({
  recipes,
  installedSlugs,
  onInstall
}: FeaturedAppsProps) {
  if (recipes.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Featured</h2>
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {recipes.map((recipe) => (
          <AppCard
            key={recipe.slug}
            recipe={recipe}
            variant="featured"
            isInstalled={installedSlugs?.has(recipe.slug)}
            onInstall={onInstall}
          />
        ))}
      </div>
    </section>
  );
}
