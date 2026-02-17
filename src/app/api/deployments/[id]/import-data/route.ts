import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { importDeploymentData } from "@/lib/deployer/data-export";
import { initiateUpgrade } from "@/lib/deployer/engine";
import { prisma } from "@/lib/db";

// ─── POST /api/deployments/[id]/import-data ─────────────
// Accepts a file upload and imports it into the deployment.
// Uses the recipe's dataImport strategy (command or files).

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Read the uploaded file from the request body
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded. Send a file in the 'file' form field." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty" },
        { status: 400 }
      );
    }

    const result = await importDeploymentData(
      id,
      session.user.tenantId,
      buffer
    );

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // If the recipe requires a restart after import, trigger one
    if (result.restartNeeded) {
      try {
        const deployment = await prisma.deployment.findFirst({
          where: { id, tenantId: session.user.tenantId },
          select: { config: true },
        });
        if (deployment) {
          await initiateUpgrade({
            tenantId: session.user.tenantId,
            deploymentId: id,
            config: (deployment.config ?? {}) as Record<string, unknown>,
          });
        }
      } catch (restartErr) {
        console.warn(
          "[POST /api/deployments/[id]/import-data] Restart after import failed:",
          restartErr
        );
        return NextResponse.json({
          message: `${result.message}. Note: automatic restart failed — you may need to restart manually.`,
          restartFailed: true,
        });
      }
    }

    return NextResponse.json({
      message: result.message,
      restarting: result.restartNeeded,
    });
  } catch (error) {
    console.error("[POST /api/deployments/[id]/import-data]", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found")
      ? 404
      : message.includes("must be running")
        ? 400
        : message.includes("does not support")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
