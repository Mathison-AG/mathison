import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/db";
import { generateEmbedding, buildEmbeddingText } from "./embedding";

import type {
  Recipe,
  RecipeListFilters,
  RecipeCreateInput,
  RecipeUpdateInput,
  RecipeSearchResult,
  AiHints,
} from "@/types/recipe";

// ─── Helpers ─────────────────────────────────────────────

/** Map a Prisma recipe row to our Recipe interface (cast JSON fields) */
function toRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: row.id as string,
    slug: row.slug as string,
    displayName: row.displayName as string,
    description: row.description as string,
    category: row.category as string,
    tags: row.tags as string[],
    iconUrl: (row.iconUrl as string) ?? null,
    sourceType: row.sourceType as string,
    chartUrl: row.chartUrl as string,
    chartVersion: (row.chartVersion as string) ?? null,
    configSchema: row.configSchema as Recipe["configSchema"],
    secretsSchema: row.secretsSchema as Recipe["secretsSchema"],
    valuesTemplate: row.valuesTemplate as string,
    dependencies: row.dependencies as Recipe["dependencies"],
    ingressConfig: row.ingressConfig as Recipe["ingressConfig"],
    resourceDefaults: row.resourceDefaults as Recipe["resourceDefaults"],
    resourceLimits: row.resourceLimits as Recipe["resourceLimits"],
    healthCheck: row.healthCheck as Recipe["healthCheck"],
    aiHints: row.aiHints as Recipe["aiHints"],
    shortDescription: (row.shortDescription as string) ?? null,
    useCases: (row.useCases as string[]) ?? [],
    gettingStarted: (row.gettingStarted as string) ?? null,
    screenshots: (row.screenshots as string[]) ?? [],
    websiteUrl: (row.websiteUrl as string) ?? null,
    documentationUrl: (row.documentationUrl as string) ?? null,
    installCount: (row.installCount as number) ?? 0,
    featured: (row.featured as boolean) ?? false,
    tier: row.tier as Recipe["tier"],
    status: row.status as Recipe["status"],
    version: row.version as number,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

// ─── List Recipes ────────────────────────────────────────

export async function listRecipes(
  filters?: RecipeListFilters
): Promise<Recipe[]> {
  const where: Prisma.RecipeWhereInput = {
    status: filters?.status ?? "PUBLISHED",
  };

  if (filters?.category) {
    where.category = filters.category;
  }

  if (filters?.search) {
    where.OR = [
      { displayName: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { tags: { has: filters.search.toLowerCase() } },
    ];
  }

  const rows = await prisma.recipe.findMany({
    where,
    orderBy: [{ tier: "asc" }, { displayName: "asc" }],
  });

  return rows.map((r) => toRecipe(r as unknown as Record<string, unknown>));
}

// ─── Get Single Recipe ───────────────────────────────────

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const row = await prisma.recipe.findUnique({
    where: { slug },
  });

  if (!row) return null;
  return toRecipe(row as unknown as Record<string, unknown>);
}

// ─── Create Recipe ───────────────────────────────────────

export async function createRecipe(data: RecipeCreateInput): Promise<Recipe> {
  const row = await prisma.recipe.create({
    data: {
      slug: data.slug,
      displayName: data.displayName,
      description: data.description,
      category: data.category,
      tags: data.tags ?? [],
      iconUrl: data.iconUrl,
      sourceType: data.sourceType ?? "helm",
      chartUrl: data.chartUrl,
      chartVersion: data.chartVersion,
      configSchema: (data.configSchema as unknown as Prisma.InputJsonValue) ?? {},
      secretsSchema:
        (data.secretsSchema as unknown as Prisma.InputJsonValue) ?? {},
      valuesTemplate: data.valuesTemplate ?? "",
      dependencies:
        (data.dependencies as unknown as Prisma.InputJsonValue) ?? [],
      ingressConfig:
        (data.ingressConfig as unknown as Prisma.InputJsonValue) ?? {},
      resourceDefaults:
        (data.resourceDefaults as unknown as Prisma.InputJsonValue) ?? {},
      resourceLimits:
        (data.resourceLimits as unknown as Prisma.InputJsonValue) ?? {},
      healthCheck:
        (data.healthCheck as unknown as Prisma.InputJsonValue) ?? {},
      aiHints: (data.aiHints as unknown as Prisma.InputJsonValue) ?? {},
      shortDescription: data.shortDescription,
      useCases: data.useCases ?? [],
      gettingStarted: data.gettingStarted,
      screenshots: data.screenshots ?? [],
      websiteUrl: data.websiteUrl,
      documentationUrl: data.documentationUrl,
      featured: data.featured ?? false,
      status: "DRAFT",
      tier: "COMMUNITY",
    },
  });

  // Generate and store embedding
  if (data.aiHints) {
    try {
      const text = buildEmbeddingText({
        displayName: data.displayName,
        description: data.description,
        category: data.category,
        tags: data.tags ?? [],
        aiHints: data.aiHints,
      });
      const embedding = await generateEmbedding(text);
      const vectorStr = `[${embedding.join(",")}]`;
      await prisma.$executeRaw`
        UPDATE recipes SET embedding = ${vectorStr}::vector WHERE id = ${row.id}
      `;
    } catch (err) {
      // Embedding generation is non-critical — log and continue
      console.error("[createRecipe] Failed to generate embedding:", err);
    }
  }

  return toRecipe(row as unknown as Record<string, unknown>);
}

// ─── Update Recipe ───────────────────────────────────────

export async function updateRecipe(
  slug: string,
  data: RecipeUpdateInput
): Promise<Recipe | null> {
  const existing = await prisma.recipe.findUnique({ where: { slug } });
  if (!existing) return null;

  const row = await prisma.recipe.update({
    where: { slug },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.iconUrl !== undefined && { iconUrl: data.iconUrl }),
      ...(data.chartUrl !== undefined && { chartUrl: data.chartUrl }),
      ...(data.chartVersion !== undefined && {
        chartVersion: data.chartVersion,
      }),
      ...(data.configSchema !== undefined && {
        configSchema: data.configSchema as unknown as Prisma.InputJsonValue,
      }),
      ...(data.secretsSchema !== undefined && {
        secretsSchema: data.secretsSchema as unknown as Prisma.InputJsonValue,
      }),
      ...(data.valuesTemplate !== undefined && {
        valuesTemplate: data.valuesTemplate,
      }),
      ...(data.dependencies !== undefined && {
        dependencies: data.dependencies as unknown as Prisma.InputJsonValue,
      }),
      ...(data.ingressConfig !== undefined && {
        ingressConfig: data.ingressConfig as unknown as Prisma.InputJsonValue,
      }),
      ...(data.resourceDefaults !== undefined && {
        resourceDefaults:
          data.resourceDefaults as unknown as Prisma.InputJsonValue,
      }),
      ...(data.resourceLimits !== undefined && {
        resourceLimits:
          data.resourceLimits as unknown as Prisma.InputJsonValue,
      }),
      ...(data.healthCheck !== undefined && {
        healthCheck: data.healthCheck as unknown as Prisma.InputJsonValue,
      }),
      ...(data.aiHints !== undefined && {
        aiHints: data.aiHints as unknown as Prisma.InputJsonValue,
      }),
      ...(data.status !== undefined && { status: data.status }),
      version: { increment: 1 },
    },
  });

  // Re-generate embedding if relevant fields changed
  const needsReEmbed =
    data.displayName !== undefined ||
    data.description !== undefined ||
    data.category !== undefined ||
    data.tags !== undefined ||
    data.aiHints !== undefined;

  if (needsReEmbed) {
    try {
      const fresh = await prisma.recipe.findUnique({ where: { slug } });
      if (fresh) {
        const text = buildEmbeddingText({
          displayName: fresh.displayName,
          description: fresh.description,
          category: fresh.category,
          tags: fresh.tags,
          aiHints: fresh.aiHints as unknown as AiHints,
        });
        const embedding = await generateEmbedding(text);
        const vectorStr = `[${embedding.join(",")}]`;
        await prisma.$executeRaw`
          UPDATE recipes SET embedding = ${vectorStr}::vector WHERE id = ${fresh.id}
        `;
      }
    } catch (err) {
      console.error("[updateRecipe] Failed to update embedding:", err);
    }
  }

  return toRecipe(row as unknown as Record<string, unknown>);
}

// ─── Delete (Deprecate) Recipe ───────────────────────────

export async function deleteRecipe(slug: string): Promise<boolean> {
  const existing = await prisma.recipe.findUnique({ where: { slug } });
  if (!existing) return false;

  await prisma.recipe.update({
    where: { slug },
    data: { status: "DEPRECATED" },
  });

  return true;
}

// ─── Semantic Search ─────────────────────────────────────

export async function searchRecipes(
  query: string,
  category?: string
): Promise<RecipeSearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await prisma.$queryRaw<RecipeSearchResult[]>`
    SELECT
      id,
      slug,
      display_name AS "displayName",
      description,
      short_description AS "shortDescription",
      category,
      tier,
      install_count AS "installCount",
      featured,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM recipes
    WHERE status = 'PUBLISHED'
      AND embedding IS NOT NULL
      ${category ? Prisma.sql`AND category = ${category}` : Prisma.empty}
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT 10
  `;

  return results;
}

// ─── Install Count ──────────────────────────────────────

/** Increment the install count for a recipe. Fire-and-forget — never throws. */
export async function incrementInstallCount(recipeId: string): Promise<void> {
  try {
    await prisma.recipe.update({
      where: { id: recipeId },
      data: { installCount: { increment: 1 } },
    });
  } catch (err) {
    console.error("[incrementInstallCount] Failed:", err);
  }
}
