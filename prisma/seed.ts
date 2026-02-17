import { config } from "dotenv";

// Load env before any other imports that depend on env vars
config({ path: ".env.local" });

import { prisma } from "../src/lib/db";
import { listRecipeDefinitions } from "../src/recipes/registry";
import {
  generateEmbedding,
  buildEmbeddingText,
} from "../src/lib/catalog/embedding";

import type { AiHints } from "../src/recipes/_base/types";

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

  // Get all recipes from the typed registry
  const recipes = listRecipeDefinitions();

  for (const recipe of recipes) {
    console.log(`  📦 Upserting: ${recipe.displayName} (${recipe.slug})`);

    // Upsert slim recipe entry (idempotent)
    const row = await prisma.recipe.upsert({
      where: { slug: recipe.slug },
      create: {
        slug: recipe.slug,
        featured: recipe.featured ?? false,
      },
      update: {
        featured: recipe.featured ?? false,
      },
    });

    // Generate embedding if OpenAI key is available
    if (hasOpenAiKey) {
      try {
        const text = buildEmbeddingText({
          displayName: recipe.displayName,
          description: recipe.description,
          category: recipe.category,
          tags: recipe.tags,
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

  const count = await prisma.recipe.count();

  console.log(`\n✅ Seed complete. ${count} recipes in catalog.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
