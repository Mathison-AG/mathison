import { NextResponse } from "next/server";

import { getCatalogRecipe } from "@/lib/catalog/service";

// ─── GET /api/catalog/[slug] ─────────────────────────────
// Get a single recipe by slug (registry + DB dynamic data)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const recipe = await getCatalogRecipe(slug);

    if (!recipe) {
      return NextResponse.json(
        { error: "Recipe not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("[GET /api/catalog/[slug]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
