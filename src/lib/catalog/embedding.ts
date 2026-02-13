import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

import type { AiHints } from "@/types/recipe";

/**
 * Generate a 1536-dimension embedding vector using text-embedding-3-small.
 * Used for both recipe indexing and search query embedding.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding;
}

/**
 * Build a single text string from recipe fields for embedding generation.
 * Combines display name, description, category, tags, and AI hints
 * into a coherent text that captures the recipe's semantic meaning.
 */
export function buildEmbeddingText(recipe: {
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  aiHints: AiHints;
}): string {
  const parts = [
    recipe.displayName,
    recipe.description,
    `Category: ${recipe.category}`,
    `Tags: ${recipe.tags.join(", ")}`,
    recipe.aiHints.summary,
    `Use when: ${recipe.aiHints.whenToSuggest}`,
    `Pairs well with: ${recipe.aiHints.pairsWellWith.join(", ")}`,
  ];

  return parts.filter(Boolean).join(". ");
}
