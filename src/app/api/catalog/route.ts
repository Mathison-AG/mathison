import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { auth } from "@/lib/auth";
import { listRecipes, createRecipe } from "@/lib/catalog/service";

import type { RecipeStatus } from "@/generated/prisma/enums";

// ─── GET /api/catalog ────────────────────────────────────
// List published recipes with optional filters

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const status = (searchParams.get("status") as RecipeStatus) ?? undefined;

    const recipes = await listRecipes({ category, search, status });

    return NextResponse.json(recipes);
  } catch (error) {
    console.error("[GET /api/catalog]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST /api/catalog ───────────────────────────────────
// Create a new draft recipe (auth required)

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  displayName: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.string().min(1).max(50),
  tags: z.array(z.string()).optional(),
  iconUrl: z.string().url().optional(),
  sourceType: z.string().optional(),
  chartUrl: z.string().min(1),
  chartVersion: z.string().optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
  secretsSchema: z.record(z.string(), z.unknown()).optional(),
  valuesTemplate: z.string().optional(),
  dependencies: z.array(z.unknown()).optional(),
  ingressConfig: z.record(z.string(), z.unknown()).optional(),
  resourceDefaults: z.record(z.string(), z.unknown()).optional(),
  resourceLimits: z.record(z.string(), z.unknown()).optional(),
  healthCheck: z.record(z.string(), z.unknown()).optional(),
  aiHints: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: z.flattenError(parsed.error) },
        { status: 400 }
      );
    }

    const recipe = await createRecipe(
      parsed.data as Parameters<typeof createRecipe>[0]
    );

    return NextResponse.json(recipe, { status: 201 });
  } catch (error) {
    // Handle unique constraint violation (duplicate slug)
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { error: "A recipe with this slug already exists" },
        { status: 409 }
      );
    }

    console.error("[POST /api/catalog]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
