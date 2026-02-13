"use client";

import { createContext, useContext } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQueryClient } from "@tanstack/react-query";

import type { UIMessage } from "ai";

// ─── Types ───────────────────────────────────────────────

interface ChatContextValue {
  messages: UIMessage[];
  sendMessage: (
    message: { text: string } | { parts: UIMessage["parts"] },
    options?: Record<string, unknown>
  ) => Promise<void>;
  status: "ready" | "submitted" | "streaming" | "error";
  error: Error | undefined;
  stop: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────

const ChatContext = createContext<ChatContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const chat = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: () => {
      // Invalidate deployment queries so the UI refreshes after agent actions
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      queryClient.invalidateQueries({ queryKey: ["stack"] });
    },
    onError: (error) => {
      console.error("[ChatProvider] Error:", error);
    },
  });

  const value: ChatContextValue = {
    messages: chat.messages,
    sendMessage: chat.sendMessage as ChatContextValue["sendMessage"],
    status: chat.status,
    error: chat.error,
    stop: chat.stop,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return ctx;
}
