import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { auth } from "@/lib/auth";
import { setActiveWorkspace } from "@/lib/workspace/context";

const switchSchema = z.object({
  workspaceId: z.string().min(1, "Workspace ID is required"),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsed = switchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: z.flattenError(parsed.error) },
        { status: 400 }
      );
    }

    const workspace = await setActiveWorkspace(
      parsed.data.workspaceId,
      session.user.tenantId,
      session.user.id
    );

    return NextResponse.json({
      message: `Switched to workspace '${workspace.name}'`,
      workspace,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[POST /api/workspaces/switch]", error);

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
