/**
 * Recipe Registry
 *
 * Central registry for all typed recipe definitions. Provides lookup by slug
 * and listing functions. Validates recipe definitions at import time.
 */

import { postgresql } from "./postgresql";
import { redis } from "./redis";
import { n8n } from "./n8n";
import { uptimeKuma } from "./uptime-kuma";
import { minio } from "./minio";

import type { RecipeDefinition } from "./_base/types";

// ─── Registry Storage ─────────────────────────────────────

// Use `unknown` to store heterogeneous generic types
const recipes = new Map<string, RecipeDefinition<unknown>>();

/**
 * Register a recipe definition. Validates that required fields are present.
 */
function register(recipe: RecipeDefinition<unknown>): void {
  if (!recipe.slug) {
    throw new Error("Recipe is missing required field: slug");
  }
  if (!recipe.displayName) {
    throw new Error(`Recipe '${recipe.slug}' is missing required field: displayName`);
  }
  if (!recipe.build) {
    throw new Error(`Recipe '${recipe.slug}' is missing required method: build`);
  }
  if (!recipe.configSchema) {
    throw new Error(`Recipe '${recipe.slug}' is missing required field: configSchema`);
  }
  if (recipes.has(recipe.slug)) {
    throw new Error(`Duplicate recipe slug: '${recipe.slug}'`);
  }

  recipes.set(recipe.slug, recipe);
}

// ─── Register All Recipes ─────────────────────────────────

// Cast to unknown since we're storing heterogeneous generics
register(postgresql as RecipeDefinition<unknown>);
register(redis as RecipeDefinition<unknown>);
register(n8n as RecipeDefinition<unknown>);
register(uptimeKuma as RecipeDefinition<unknown>);
register(minio as RecipeDefinition<unknown>);

// ─── Public API ───────────────────────────────────────────

/**
 * Get a recipe definition by slug.
 * Returns undefined if not found.
 */
export function getRecipeDefinition(slug: string): RecipeDefinition<unknown> | undefined {
  return recipes.get(slug);
}

/**
 * Get a recipe definition by slug, throwing if not found.
 */
export function requireRecipeDefinition(slug: string): RecipeDefinition<unknown> {
  const recipe = recipes.get(slug);
  if (!recipe) {
    throw new Error(`Recipe '${slug}' not found in registry`);
  }
  return recipe;
}

/**
 * List all registered recipe definitions.
 */
export function listRecipeDefinitions(): RecipeDefinition<unknown>[] {
  return Array.from(recipes.values());
}

/**
 * List all registered recipe slugs.
 */
export function listRecipeSlugs(): string[] {
  return Array.from(recipes.keys());
}

/**
 * Check if a recipe exists in the registry.
 */
export function hasRecipe(slug: string): boolean {
  return recipes.has(slug);
}

/**
 * Get the total number of registered recipes.
 */
export function recipeCount(): number {
  return recipes.size;
}
