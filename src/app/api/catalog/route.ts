import { NextResponse } from "next/server";

import { listCatalogRecipes } from "@/lib/catalog/service";

// ─── GET /api/catalog ────────────────────────────────────
// List recipes from the registry, enriched with DB install counts

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const recipes = await listCatalogRecipes({ category, search });

    return NextResponse.json(recipes);
  } catch (error) {
    console.error("[GET /api/catalog]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
