"use client";

import { useEffect, useRef } from "react";
import { Bot, Loader2, User } from "lucide-react";
import Markdown from "react-markdown";

import { cn } from "@/lib/utils";
import { useChatContext } from "./chat-provider";
import { ToolInvocationCard } from "./tool-invocation";

// ─── Message list ────────────────────────────────────────

export function ChatMessages() {
  const { messages, status, addToolApprovalResponse } = useChatContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-1 p-4">
        {messages.map((message) => (
          <div key={message.id}>
            {message.role === "user" ? (
              <UserMessage parts={message.parts} />
            ) : (
              <AssistantMessage
                parts={message.parts}
                isStreaming={
                  isLoading &&
                  message.id === messages[messages.length - 1]?.id
                }
                onToolApprovalResponse={addToolApprovalResponse}
              />
            )}
          </div>
        ))}

        {/* Thinking indicator when submitted but no assistant message yet */}
        {status === "submitted" &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-start gap-2.5 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="size-3.5" />
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Thinking...
              </div>
            </div>
          )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── User message ────────────────────────────────────────

interface MessagePartProps {
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

function UserMessage({ parts }: MessagePartProps) {
  const textContent = parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");

  if (!textContent) return null;

  return (
    <div className="flex items-start justify-end gap-2.5 py-2">
      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        {textContent}
      </div>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
        <User className="size-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}

// ─── Assistant message ───────────────────────────────────

interface AssistantMessageProps extends MessagePartProps {
  isStreaming?: boolean;
  onToolApprovalResponse?: (params: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void | PromiseLike<void>;
}

function AssistantMessage({
  parts,
  isStreaming,
  onToolApprovalResponse,
}: AssistantMessageProps) {
  if (parts.length === 0) return null;

  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Bot className="size-3.5" />
      </div>
      <div className="min-w-0 max-w-[85%] space-y-1">
        {parts.map((part, i) => {
          // Text part
          if (part.type === "text" && part.text) {
            return (
              <div
                key={`text-${i}`}
                className={cn(
                  "rounded-xl rounded-bl-sm bg-muted px-4 py-2.5",
                  "prose prose-sm dark:prose-invert max-w-none",
                  "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5",
                  "prose-pre:bg-background/50 prose-pre:text-xs prose-pre:p-2 prose-pre:rounded-md",
                  "prose-code:text-xs prose-code:before:content-none prose-code:after:content-none"
                )}
              >
                <Markdown>{part.text}</Markdown>
                {isStreaming &&
                  i === parts.length - 1 &&
                  part.state === "streaming" && (
                    <span className="inline-block size-1.5 rounded-full bg-foreground/60 animate-pulse ml-0.5 align-baseline" />
                  )}
              </div>
            );
          }

          // Tool invocation part (type is "tool-<name>" or "dynamic-tool")
          if (
            part.type.startsWith("tool-") ||
            part.type === "dynamic-tool"
          ) {
            const toolName =
              part.type === "dynamic-tool"
                ? (part.toolName as string)
                : part.type.replace(/^tool-/, "");

            return (
              <ToolInvocationCard
                key={`tool-${part.toolCallId ?? i}`}
                type={part.type}
                toolName={toolName}
                state={part.state as string}
                input={part.input}
                output={part.output}
                errorText={part.errorText as string | undefined}
                approval={
                  part.approval as
                    | { id: string }
                    | undefined
                }
                onToolApprovalResponse={onToolApprovalResponse}
              />
            );
          }

          // Step start part — skip rendering
          if (part.type === "step-start") {
            return null;
          }

          // Reasoning part
          if (part.type === "reasoning" && part.text) {
            return (
              <div
                key={`reasoning-${i}`}
                className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground italic"
              >
                {part.text}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
