import { streamText, stepCountIs, convertToModelMessages } from "ai";

import { auth } from "@/lib/auth";
import { getProvider } from "@/lib/agent/provider";
import { getTools } from "@/lib/agent/tools";
import { systemPrompt } from "@/lib/agent/system-prompt";
import { getActiveWorkspace } from "@/lib/workspace/context";

import type { UIMessage } from "ai";

export async function POST(req: Request) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.tenantId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Resolve active workspace
    const workspace = await getActiveWorkspace(
      session.user.tenantId,
      session.user.id
    );
    if (!workspace) {
      return new Response(
        JSON.stringify({ error: "No workspace found. Create one first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Parse UI messages from request body (sent by useChat)
    const body = (await req.json()) as { messages?: UIMessage[] };

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: messages array required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Get LLM provider and workspace-scoped tools
    const provider = getProvider();
    const tools = getTools(session.user.tenantId, workspace.id);

    // 5. Convert UI messages to model messages for streamText
    const modelMessages = await convertToModelMessages(body.messages, {
      tools,
    });

    // 6. Stream the response with multi-step tool calling
    const result = streamText({
      model: provider,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10)
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[POST /api/chat]", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
