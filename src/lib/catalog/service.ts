/**
 * Catalog Service
 *
 * Sources recipe data from the typed registry (static metadata) and the
 * database (install counts, featured flags, embeddings for semantic search).
 */

import { prisma } from "@/lib/db";
import { generateEmbedding, buildEmbeddingText } from "./embedding";
import {
  listAllCatalogRecipes,
  buildCatalogRecipe,
} from "./metadata";
import { getRecipeDefinition } from "@/recipes/registry";

import type { CatalogRecipe } from "./metadata";
import type { AiHints } from "@/recipes/_base/types";

// ─── Types ───────────────────────────────────────────────

export interface CatalogListFilters {
  category?: string;
  search?: string;
}

export interface CatalogSearchResult {
  slug: string;
  displayName: string;
  description: string;
  shortDescription?: string;
  category: string;
  installCount: number;
  featured: boolean;
  similarity: number;
}

// ─── List Recipes ────────────────────────────────────────

export async function listCatalogRecipes(
  filters?: CatalogListFilters
): Promise<CatalogRecipe[]> {
  // Get install counts and featured flags from DB
  const dbRecipes = await prisma.recipe.findMany({
    select: { slug: true, installCount: true, featured: true },
  });

  const dbMap = new Map(
    dbRecipes.map((r) => [
      r.slug,
      { installCount: r.installCount, featured: r.featured },
    ])
  );

  // Build full catalog from registry + DB data
  let recipes = listAllCatalogRecipes(dbMap);

  // Apply filters
  if (filters?.category) {
    recipes = recipes.filter((r) => r.category === filters.category);
  }

  if (filters?.search) {
    const search = filters.search.toLowerCase();
    recipes = recipes.filter(
      (r) =>
        r.displayName.toLowerCase().includes(search) ||
        r.description.toLowerCase().includes(search) ||
        r.tags.some((t) => t.toLowerCase().includes(search))
    );
  }

  // Sort: featured first, then alphabetical
  recipes.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return recipes;
}

// ─── Get Single Recipe ───────────────────────────────────

export async function getCatalogRecipe(
  slug: string
): Promise<CatalogRecipe | null> {
  const recipe = getRecipeDefinition(slug);
  if (!recipe) return null;

  // Get dynamic data from DB
  const dbRecipe = await prisma.recipe.findUnique({
    where: { slug },
    select: { installCount: true, featured: true },
  });

  return buildCatalogRecipe(recipe, dbRecipe ?? undefined);
}

// ─── Semantic Search ─────────────────────────────────────

export async function searchRecipes(
  query: string,
  category?: string
): Promise<CatalogSearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Search by embedding similarity — DB only has slug, install_count, featured
  const dbResults = await prisma.$queryRaw<
    Array<{
      slug: string;
      installCount: number;
      featured: boolean;
      similarity: number;
    }>
  >`
    SELECT
      slug,
      install_count AS "installCount",
      featured,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM recipes
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT 20
  `;

  // Enrich with registry metadata and apply category filter
  const results: CatalogSearchResult[] = [];
  for (const row of dbResults) {
    const recipe = getRecipeDefinition(row.slug);
    if (!recipe) continue; // Legacy DB entry not in registry — skip

    if (category && recipe.category !== category) continue;

    results.push({
      slug: recipe.slug,
      displayName: recipe.displayName,
      description: recipe.description,
      shortDescription: recipe.shortDescription,
      category: recipe.category,
      installCount: row.installCount,
      featured: row.featured,
      similarity: row.similarity,
    });

    if (results.length >= 10) break;
  }

  return results;
}

// ─── Install Count ──────────────────────────────────────

/** Increment the install count for a recipe. Fire-and-forget — never throws. */
export async function incrementInstallCount(slug: string): Promise<void> {
  try {
    await prisma.recipe.update({
      where: { slug },
      data: { installCount: { increment: 1 } },
    });
  } catch (err) {
    console.error("[incrementInstallCount] Failed:", err);
  }
}

// ─── Embedding Update ────────────────────────────────────

/** Regenerate embedding for a recipe (used by seed and admin tools) */
export async function updateRecipeEmbedding(slug: string): Promise<void> {
  const recipe = getRecipeDefinition(slug);
  if (!recipe) throw new Error(`Recipe '${slug}' not found in registry`);

  const text = buildEmbeddingText({
    displayName: recipe.displayName,
    description: recipe.description,
    category: recipe.category,
    tags: recipe.tags,
    aiHints: recipe.aiHints as AiHints,
  });

  const embedding = await generateEmbedding(text);
  const vectorStr = `[${embedding.join(",")}]`;

  const dbRecipe = await prisma.recipe.findUnique({ where: { slug } });
  if (!dbRecipe) throw new Error(`Recipe '${slug}' not found in database`);

  await prisma.$executeRaw`
    UPDATE recipes SET embedding = ${vectorStr}::vector WHERE id = ${dbRecipe.id}
  `;
}
