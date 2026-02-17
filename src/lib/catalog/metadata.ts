/**
 * Recipe Metadata Helper
 *
 * Bridges the slim DB Recipe model (slug, installCount, featured, embedding)
 * with the full static metadata from the typed recipe registry.
 * Used by API routes, agent tools, and services that need display data.
 */

import {
  getRecipeDefinition,
  listRecipeDefinitions,
} from "@/recipes/registry";

import type { RecipeDefinition } from "@/recipes/_base/types";

// ─── Types ───────────────────────────────────────────────

/** Full recipe data for catalog display (registry + DB combined) */
export interface CatalogRecipe {
  slug: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  category: string;
  tags: string[];
  iconUrl: string;
  useCases: string[];
  gettingStarted: string | null;
  websiteUrl: string | null;
  documentationUrl: string | null;
  hasWebUI: boolean;
  featured: boolean;
  installCount: number;
  dependencies: Array<{ recipe: string; reason: string }>;
  screenshots: string[];
}

/** Recipe metadata for deployment display (enriches Prisma recipe includes) */
export interface RecipeMetadata {
  slug: string;
  displayName: string;
  category: string;
  iconUrl: string;
  hasWebUI: boolean;
  gettingStarted?: string;
}

// ─── Helpers ─────────────────────────────────────────────

/** Get display metadata for a recipe slug from the registry */
export function getRecipeMetadata(slug: string): RecipeMetadata | null {
  const recipe = getRecipeDefinition(slug);
  if (!recipe) return null;

  return {
    slug: recipe.slug,
    displayName: recipe.displayName,
    category: recipe.category,
    iconUrl: `/icons/${recipe.slug}.svg`,
    hasWebUI: recipe.hasWebUI,
    gettingStarted: recipe.gettingStarted,
  };
}

/** Get display metadata, with fallback for unknown recipes */
export function getRecipeMetadataOrFallback(slug: string): RecipeMetadata {
  return (
    getRecipeMetadata(slug) ?? {
      slug,
      displayName: slug,
      category: "unknown",
      iconUrl: `/icons/${slug}.svg`,
      hasWebUI: false,
    }
  );
}

/** Get full recipe definition from registry (for config schema, build, etc.) */
export function getRecipeDefinitionBySlug(
  slug: string
): RecipeDefinition<unknown> | undefined {
  return getRecipeDefinition(slug);
}

/**
 * Build a full CatalogRecipe by merging registry metadata with DB dynamic data.
 */
export function buildCatalogRecipe(
  recipe: RecipeDefinition<unknown>,
  dbData?: { installCount?: number; featured?: boolean }
): CatalogRecipe {
  return {
    slug: recipe.slug,
    displayName: recipe.displayName,
    description: recipe.description,
    shortDescription: recipe.shortDescription ?? null,
    category: recipe.category,
    tags: recipe.tags,
    iconUrl: `/icons/${recipe.slug}.svg`,
    useCases: recipe.useCases,
    gettingStarted: recipe.gettingStarted ?? null,
    websiteUrl: recipe.websiteUrl ?? null,
    documentationUrl: recipe.documentationUrl ?? null,
    hasWebUI: recipe.hasWebUI,
    featured: dbData?.featured ?? recipe.featured ?? false,
    installCount: dbData?.installCount ?? 0,
    dependencies: Object.values(recipe.dependencies ?? {}).map((d) => ({
      recipe: d.recipe,
      reason: d.reason,
    })),
    screenshots: [],
  };
}

/**
 * List all recipes from registry, enriched with DB data.
 * Used by the catalog API.
 */
export function listAllCatalogRecipes(
  dbMap: Map<string, { installCount: number; featured: boolean }>
): CatalogRecipe[] {
  return listRecipeDefinitions().map((recipe) => {
    const db = dbMap.get(recipe.slug);
    return buildCatalogRecipe(recipe, db);
  });
}

/**
 * Enrich a Prisma deployment result with recipe metadata from the registry.
 * Takes an object with `recipe: { slug: string }` and replaces it with full metadata.
 */
export function enrichDeploymentRecipe<
  T extends { recipe: { slug: string } },
>(deployment: T): T & { recipe: RecipeMetadata } {
  const metadata = getRecipeMetadataOrFallback(deployment.recipe.slug);
  return {
    ...deployment,
    recipe: metadata,
  };
}
