"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";

import { useCatalog } from "@/hooks/use-catalog";
import { useDeployments } from "@/hooks/use-deployments";
import { useInstall } from "@/hooks/use-install";
import { StoreSearch } from "@/components/store/store-search";
import { FeaturedApps } from "@/components/store/featured-apps";
import { CategoryRow } from "@/components/store/category-row";
import { CategoryFilters } from "@/components/store/category-filters";
import { AppGrid } from "@/components/store/app-grid";
import { InstallModal } from "@/components/store/install-modal";
import { Button } from "@/components/ui/button";

import type { Recipe } from "@/types/recipe";

const CATEGORY_LABELS: Record<string, string> = {
  automation: "Automation",
  monitoring: "Monitoring",
  database: "Databases",
  storage: "Storage",
  analytics: "Analytics"
};

const CATEGORY_ORDER = [
  "automation",
  "monitoring",
  "storage",
  "database",
  "analytics"
];

export default function AppStorePage() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") ?? "all";
  const fromWelcome = searchParams.has("category");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(fromWelcome);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const { data: recipes, isLoading } = useCatalog(
    search || undefined,
    category !== "all" ? category : undefined
  );

  const { data: deployments } = useDeployments();
  const {
    phase,
    deployment: installDeployment,
    error: installError,
    install,
    reset
  } = useInstall();

  // Build set of installed recipe slugs
  const installedSlugs = useMemo(() => {
    const slugs = new Set<string>();
    if (deployments) {
      for (const d of deployments) {
        if (d.status !== "STOPPED" && d.status !== "FAILED") {
          slugs.add(d.recipe.slug);
        }
      }
    }
    return slugs;
  }, [deployments]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    setCategory(value);
  }, []);

  const handleInstallClick = useCallback((recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setModalOpen(true);
  }, []);

  const handleConfirmInstall = useCallback(() => {
    if (selectedRecipe) {
      install(selectedRecipe.slug);
    }
  }, [selectedRecipe, install]);

  const handleModalClose = useCallback(
    (open: boolean) => {
      setModalOpen(open);
      if (
        !open &&
        (phase === "success" || phase === "idle" || phase === "error")
      ) {
        setSelectedRecipe(null);
        reset();
      }
    },
    [phase, reset]
  );

  const handleReset = useCallback(() => {
    reset();
    setSelectedRecipe(null);
  }, [reset]);

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
    <div className="p-4 sm:p-6 pb-12 space-y-6 sm:space-y-8 max-w-7xl mx-auto">
      {/* Hero / Search */}
      <div className="text-center space-y-3 sm:space-y-4 py-4 sm:py-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          What do you want to set up today?
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto">
          Browse and install open-source apps in one click. No technical
          knowledge required.
        </p>
        <StoreSearch value={search} onChange={handleSearchChange} />
      </div>

      {/* Welcome banner for users coming from onboarding */}
      {showWelcomeBanner && (
        <div className="relative flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/10 px-4 py-3">
          <Sparkles className="size-5 text-primary shrink-0" />
          <p className="text-sm text-foreground">
            Ready to install your first app? Just click <strong>Get</strong> on
            any app below!
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-6"
            onClick={() => setShowWelcomeBanner(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {isFiltered ? (
        /* Filtered view: category chips + flat grid */
        <div className="space-y-6">
          <CategoryFilters
            selected={category}
            onChange={handleCategoryChange}
          />
          <AppGrid
            recipes={recipes ?? []}
            isLoading={isLoading}
            installedSlugs={installedSlugs}
            onInstall={handleInstallClick}
          />
        </div>
      ) : (
        /* Browse view: featured + categories */
        <div className="space-y-10">
          {/* Featured */}
          {!isLoading && (
            <FeaturedApps
              recipes={featured}
              installedSlugs={installedSlugs}
              onInstall={handleInstallClick}
            />
          )}

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
                  installedSlugs={installedSlugs}
                  onInstall={handleInstallClick}
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
              <AppGrid
                recipes={recipes ?? []}
                installedSlugs={installedSlugs}
                onInstall={handleInstallClick}
              />
            </section>
          )}
        </div>
      )}

      {/* Install Modal */}
      <InstallModal
        recipe={selectedRecipe}
        open={modalOpen}
        onOpenChange={handleModalClose}
        phase={phase}
        deployment={installDeployment}
        error={installError}
        onConfirm={handleConfirmInstall}
        onReset={handleReset}
      />
    </div>
  );
}
