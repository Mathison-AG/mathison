import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { searchRecipes } from "@/lib/catalog/service";

// ─── POST /api/catalog/search ────────────────────────────
// Semantic search over the recipe catalog

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  category: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: z.flattenError(parsed.error) },
        { status: 400 }
      );
    }

    const { query, category } = parsed.data;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Search is not available — OPENAI_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const results = await searchRecipes(query, category);

    return NextResponse.json(results);
  } catch (error) {
    console.error("[POST /api/catalog/search]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
