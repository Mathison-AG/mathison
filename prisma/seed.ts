import { config } from "dotenv";

// Load env before any other imports that depend on env vars
config({ path: ".env.local" });

import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";
import { seedRecipes } from "../src/lib/catalog/seed-data";
import {
  generateEmbedding,
  buildEmbeddingText,
} from "../src/lib/catalog/embedding";

import type { AiHints } from "../src/types/recipe";

async function main() {
  console.log("🌱 Seeding database...\n");

  // Check if OPENAI_API_KEY is available for embedding generation
  const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
  if (!hasOpenAiKey) {
    console.warn(
      "⚠️  OPENAI_API_KEY not set — recipes will be seeded WITHOUT embeddings."
    );
    console.warn(
      "   Set OPENAI_API_KEY in .env.local and re-run to generate embeddings.\n"
    );
  }

  for (const recipe of seedRecipes) {
    console.log(`  📦 Upserting: ${recipe.displayName} (${recipe.slug})`);

    // Upsert the recipe (idempotent)
    const recipeData = {
      displayName: recipe.displayName,
      description: recipe.description,
      category: recipe.category,
      tags: recipe.tags ?? [],
      iconUrl: recipe.iconUrl ?? null,
      sourceType: recipe.sourceType ?? "helm",
      chartUrl: recipe.chartUrl,
      chartVersion: recipe.chartVersion ?? null,
      configSchema:
        (recipe.configSchema as unknown as Prisma.InputJsonValue) ?? {},
      secretsSchema:
        (recipe.secretsSchema as unknown as Prisma.InputJsonValue) ?? {},
      valuesTemplate: recipe.valuesTemplate ?? "",
      dependencies:
        (recipe.dependencies as unknown as Prisma.InputJsonValue) ?? [],
      ingressConfig:
        (recipe.ingressConfig as unknown as Prisma.InputJsonValue) ?? {},
      resourceDefaults:
        (recipe.resourceDefaults as unknown as Prisma.InputJsonValue) ?? {},
      resourceLimits:
        (recipe.resourceLimits as unknown as Prisma.InputJsonValue) ?? {},
      healthCheck:
        (recipe.healthCheck as unknown as Prisma.InputJsonValue) ?? {},
      aiHints:
        (recipe.aiHints as unknown as Prisma.InputJsonValue) ?? {},
      shortDescription: recipe.shortDescription ?? null,
      useCases: recipe.useCases ?? [],
      gettingStarted: recipe.gettingStarted ?? null,
      screenshots: recipe.screenshots ?? [],
      websiteUrl: recipe.websiteUrl ?? null,
      documentationUrl: recipe.documentationUrl ?? null,
      featured: recipe.featured ?? false,
      hasWebUI: recipe.hasWebUI ?? false,
      tier: "OFFICIAL" as const,
      status: "PUBLISHED" as const,
    };

    const row = await prisma.recipe.upsert({
      where: { slug: recipe.slug },
      create: { slug: recipe.slug, ...recipeData },
      update: recipeData,
    });

    // Generate embedding if OpenAI key is available
    if (hasOpenAiKey && recipe.aiHints) {
      try {
        const text = buildEmbeddingText({
          displayName: recipe.displayName,
          description: recipe.description,
          category: recipe.category,
          tags: recipe.tags ?? [],
          aiHints: recipe.aiHints as AiHints,
        });

        const embedding = await generateEmbedding(text);
        const vectorStr = `[${embedding.join(",")}]`;

        await prisma.$executeRaw`
          UPDATE recipes SET embedding = ${vectorStr}::vector WHERE id = ${row.id}
        `;

        console.log(`     ✅ Embedding generated (${embedding.length}d)`);
      } catch (err) {
        console.error(
          `     ❌ Embedding failed for ${recipe.slug}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  const count = await prisma.recipe.count({
    where: { status: "PUBLISHED" },
  });

  console.log(`\n✅ Seed complete. ${count} published recipes in catalog.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
