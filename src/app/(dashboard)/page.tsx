"use client";

import { useState, useCallback, useMemo } from "react";

import { useCatalog } from "@/hooks/use-catalog";
import { StoreSearch } from "@/components/store/store-search";
import { FeaturedApps } from "@/components/store/featured-apps";
import { CategoryRow } from "@/components/store/category-row";
import { CategoryFilters } from "@/components/store/category-filters";
import { AppGrid } from "@/components/store/app-grid";

import type { Recipe } from "@/types/recipe";

const CATEGORY_LABELS: Record<string, string> = {
  automation: "Automation",
  monitoring: "Monitoring",
  database: "Databases",
  storage: "Storage",
  analytics: "Analytics",
};

const CATEGORY_ORDER = ["automation", "monitoring", "storage", "database", "analytics"];

export default function AppStorePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const { data: recipes, isLoading } = useCatalog(
    search || undefined,
    category !== "all" ? category : undefined
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    setCategory(value);
  }, []);

  // Separate featured apps
  const featured = useMemo(
    () => (recipes ?? []).filter((r) => r.featured),
    [recipes]
  );

  // Group by category
  const byCategory = useMemo(() => {
    const map: Record<string, Recipe[]> = {};
    for (const recipe of recipes ?? []) {
      const cat = recipe.category;
      if (!map[cat]) map[cat] = [];
      map[cat].push(recipe);
    }
    return map;
  }, [recipes]);

  // When searching or filtering by category, show flat grid
  const isFiltered = search.length > 0 || category !== "all";

  return (
    <div className="p-6 pb-12 space-y-8 max-w-7xl mx-auto">
      {/* Hero / Search */}
      <div className="text-center space-y-4 py-6">
        <h1 className="text-3xl font-bold tracking-tight">
          What do you want to set up today?
        </h1>
        <p className="text-muted-foreground text-base max-w-lg mx-auto">
          Browse and install open-source apps in one click. No technical
          knowledge required.
        </p>
        <StoreSearch value={search} onChange={handleSearchChange} />
      </div>

      {isFiltered ? (
        /* Filtered view: category chips + flat grid */
        <div className="space-y-6">
          <CategoryFilters selected={category} onChange={handleCategoryChange} />
          <AppGrid recipes={recipes ?? []} isLoading={isLoading} />
        </div>
      ) : (
        /* Browse view: featured + categories */
        <div className="space-y-10">
          {/* Featured */}
          {!isLoading && <FeaturedApps recipes={featured} />}

          {/* Category rows */}
          {!isLoading &&
            CATEGORY_ORDER.map((cat) => {
              const catRecipes = byCategory[cat];
              if (!catRecipes || catRecipes.length === 0) return null;
              return (
                <CategoryRow
                  key={cat}
                  title={CATEGORY_LABELS[cat] ?? cat}
                  recipes={catRecipes}
                  onViewAll={() => handleCategoryChange(cat)}
                />
              );
            })}

          {/* Loading state */}
          {isLoading && <AppGrid recipes={[]} isLoading />}

          {/* Browse All section with filter chips */}
          {!isLoading && (recipes ?? []).length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Browse All</h2>
              <CategoryFilters
                selected={category}
                onChange={handleCategoryChange}
              />
              <AppGrid recipes={recipes ?? []} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
