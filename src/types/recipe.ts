/**
 * Recipe Types
 *
 * Types for the catalog API responses. These describe the shape of data
 * returned by API routes — sourced from the recipe registry (static metadata)
 * and database (dynamic data like install counts).
 *
 * For recipe system internals (config schemas, build contexts, etc.), see
 * src/recipes/_base/types.ts.
 */

// ─── AI Hints ────────────────────────────────────────────

export interface AiHints {
  summary: string;
  whenToSuggest: string;
  pairsWellWith: string[];
}

// ─── Recipe (Catalog API Response) ───────────────────────

export interface Recipe {
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

// ─── Search Result ───────────────────────────────────────

export interface RecipeSearchResult {
  slug: string;
  displayName: string;
  description: string;
  shortDescription?: string;
  category: string;
  installCount: number;
  featured: boolean;
  similarity: number;
}

// ─── List Filters ────────────────────────────────────────

export interface RecipeListFilters {
  category?: string;
  search?: string;
}
