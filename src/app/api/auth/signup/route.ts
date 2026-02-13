import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

import { prisma } from "@/lib/db";
import { createNamespace, applyNetworkPolicy } from "@/lib/cluster/kubernetes";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(100),
  workspace: z.string().min(1, "Workspace name is required").max(100),
});

/**
 * Derive a URL-safe slug from a workspace name.
 * "My Cool Workspace" → "my-cool-workspace"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove special chars
    .replace(/[\s_]+/g, "-") // spaces/underscores → hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: z.flattenError(parsed.error) },
        { status: 400 }
      );
    }

    const { email, password, name, workspace } = parsed.data;

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Generate slug and check uniqueness
    let slug = slugify(workspace);
    if (!slug) slug = "workspace";

    const existingTenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingTenant) {
      // Append random suffix if slug already taken
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create tenant + user + default workspace in a transaction
    const { user, defaultWorkspace } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: workspace,
        },
      });

      // Create default workspace
      const ws = await tx.workspace.create({
        data: {
          tenantId: tenant.id,
          slug: "default",
          name: "Default",
          namespace: `${slug}-default`,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          role: "ADMIN",
          tenantId: tenant.id,
          activeWorkspaceId: ws.id,
        },
        select: {
          id: true,
          email: true,
        },
      });

      return { tenant, user, defaultWorkspace: ws };
    });

    // Provision K8s namespace for the default workspace (non-blocking)
    (async () => {
      try {
        await createNamespace(defaultWorkspace.namespace, {
          "mathison.io/tenant": slug,
          "mathison.io/workspace": "default",
          "mathison.io/managed-by": "mathison",
        });
        await applyNetworkPolicy(defaultWorkspace.namespace);
      } catch (err) {
        console.error(
          `[POST /api/auth/signup] K8s provisioning failed for ${defaultWorkspace.namespace} (will retry):`,
          err
        );
      }
    })();

    console.log(
      `[POST /api/auth/signup] Created user ${user.id} (${user.email}) with workspace ${defaultWorkspace.namespace}`
    );

    return NextResponse.json(
      { message: "Account created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/auth/signup]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
