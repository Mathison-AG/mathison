"use client";

import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useChatContext } from "./chat-provider";

// ─── Chat input ──────────────────────────────────────────

export function ChatInput() {
  const { sendMessage, status, stop } = useChatContext();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !isLoading;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;

    const text = input.trim();
    setInput("");
    sendMessage({ text });

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        handleSubmit(e as unknown as FormEvent);
      }
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    // Auto-resize textarea
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <form onSubmit={handleSubmit} className="border-t p-3">
      <div className="flex items-end gap-2 rounded-xl border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring/20 transition-shadow">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask Mathison anything..."
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 max-h-[120px]"
        />
        {isLoading ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={() => stop()}
          >
            <Square className="size-3.5" />
            <span className="sr-only">Stop</span>
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="size-8 shrink-0 rounded-lg"
            disabled={!canSend}
          >
            <ArrowUp className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        )}
      </div>
    </form>
  );
}

// ─── Suggested prompts (for empty state) ─────────────────

const SUGGESTIONS = [
  "What services can I deploy?",
  "Set up a PostgreSQL database",
  "Deploy n8n with a database",
  "What's running in my workspace?",
];

interface SuggestedPromptsProps {
  onSelect: (text: string) => void;
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="grid grid-cols-1 gap-2 px-4">
      {SUGGESTIONS.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
