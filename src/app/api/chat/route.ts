import { streamText, stepCountIs } from "ai";

import { auth } from "@/lib/auth";
import { getProvider } from "@/lib/agent/provider";
import { getTools } from "@/lib/agent/tools";
import { systemPrompt } from "@/lib/agent/system-prompt";

import type { ModelMessage } from "ai";

export async function POST(req: Request) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.tenantId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Parse messages from request body
    const body = (await req.json()) as { messages?: ModelMessage[] };

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: messages array required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Get LLM provider and tenant-scoped tools
    const provider = getProvider();
    const tools = getTools(session.user.tenantId);

    // 4. Stream the response with multi-step tool calling
    const result = streamText({
      model: provider,
      system: systemPrompt,
      messages: body.messages,
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
