"use client";

import { useState, useCallback } from "react";
import { Grid3X3 } from "lucide-react";

import { useCatalog } from "@/hooks/use-catalog";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { RecipeGrid } from "@/components/catalog/recipe-grid";

export default function CatalogPage() {
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Grid3X3 className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Service Catalog</h2>
          <p className="text-muted-foreground">
            Browse and deploy services from the catalog.
          </p>
        </div>
      </div>

      {/* Filters */}
      <CatalogFilters
        search={search}
        onSearchChange={handleSearchChange}
        category={category}
        onCategoryChange={handleCategoryChange}
      />

      {/* Grid */}
      <RecipeGrid recipes={recipes ?? []} isLoading={isLoading} />
    </div>
  );
}
