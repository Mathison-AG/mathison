import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ollama-ai-provider";

import { env } from "@/lib/config";

import type { LanguageModelV3 } from "@ai-sdk/provider";

/**
 * Returns the configured LLM model instance based on LLM_PROVIDER env var.
 * Supports OpenAI, Anthropic (Claude), and Ollama (local).
 */
export function getProvider(): LanguageModelV3 {
  switch (env.LLM_PROVIDER) {
    case "openai":
      return openai(env.LLM_MODEL || "gpt-4o");
    case "anthropic":
      return anthropic(env.LLM_MODEL || "claude-sonnet-4-20250514");
    case "ollama": {
      const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
      // ollama-ai-provider returns LanguageModelV1 — cast for AI SDK v6 compat
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ollama(env.LLM_MODEL || "llama3") as any as LanguageModelV3;
    }
    default:
      return openai("gpt-4o");
  }
}
