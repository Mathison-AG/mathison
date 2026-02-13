import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { auth } from "@/lib/auth";
import { getRecipe, updateRecipe, deleteRecipe } from "@/lib/catalog/service";

// ─── GET /api/catalog/[slug] ─────────────────────────────
// Get a single recipe by slug (public)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const recipe = await getRecipe(slug);

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

// ─── PUT /api/catalog/[slug] ─────────────────────────────
// Update a recipe (auth required)

const updateSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  category: z.string().min(1).max(50).optional(),
  tags: z.array(z.string()).optional(),
  iconUrl: z.string().url().nullable().optional(),
  chartUrl: z.string().min(1).optional(),
  chartVersion: z.string().nullable().optional(),
  configSchema: z.record(z.string(), z.unknown()).optional(),
  secretsSchema: z.record(z.string(), z.unknown()).optional(),
  valuesTemplate: z.string().optional(),
  dependencies: z.array(z.unknown()).optional(),
  ingressConfig: z.record(z.string(), z.unknown()).optional(),
  resourceDefaults: z.record(z.string(), z.unknown()).optional(),
  resourceLimits: z.record(z.string(), z.unknown()).optional(),
  healthCheck: z.record(z.string(), z.unknown()).optional(),
  aiHints: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "DEPRECATED"]).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const body: unknown = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: z.flattenError(parsed.error) },
        { status: 400 }
      );
    }

    const recipe = await updateRecipe(
      slug,
      parsed.data as Parameters<typeof updateRecipe>[1]
    );

    if (!recipe) {
      return NextResponse.json(
        { error: "Recipe not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("[PUT /api/catalog/[slug]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/catalog/[slug] ──────────────────────────
// Soft-delete (deprecate) a recipe (auth + ADMIN required)

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can delete recipes" },
        { status: 403 }
      );
    }

    const { slug } = await params;
    const deleted = await deleteRecipe(slug);

    if (!deleted) {
      return NextResponse.json(
        { error: "Recipe not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Recipe deprecated" });
  } catch (error) {
    console.error("[DELETE /api/catalog/[slug]]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
