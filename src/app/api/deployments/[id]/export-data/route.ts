import { auth } from "@/lib/auth";
import { exportDeploymentData } from "@/lib/deployer/data-export";

// ─── POST /api/deployments/[id]/export-data ─────────────
// Streams the deployment's data as a downloadable file.
// Uses the recipe's dataExport strategy (command or files).

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = await params;

    const result = await exportDeploymentData(id, session.user.tenantId);

    // Convert Node.js Readable to a Web ReadableStream for the Response
    const webStream = new ReadableStream({
      start(controller) {
        result.stream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        result.stream.on("end", () => {
          controller.close();
        });
        result.stream.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        result.stream.destroy();
      },
    });

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Export-Description": result.description,
      },
    });
  } catch (error) {
    console.error("[POST /api/deployments/[id]/export-data]", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("not found")
      ? 404
      : message.includes("must be running")
        ? 400
        : message.includes("does not support")
          ? 400
          : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
