"use client";

import { useState, useEffect } from "react";
import { Bot, MessageCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";

import { ChatProvider, useChatContext } from "@/components/chat/chat-provider";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatInput, SuggestedPrompts } from "@/components/chat/chat-input";
import { chatEvents } from "@/lib/events";

// ─── Outer wrapper with provider ─────────────────────────

interface ChatPanelProps {
  userName?: string | null;
}

export function ChatPanel({ userName }: ChatPanelProps) {
  return (
    <ChatProvider>
      <ChatPanelInner userName={userName} />
    </ChatProvider>
  );
}

// ─── Inner panel (has access to ChatContext) ─────────────

function ChatPanelInner({ userName }: { userName?: string | null }) {
  const [open, setOpen] = useState(false);
  const { messages, sendMessage } = useChatContext();

  const isEmpty = messages.length === 0;
  const firstName = userName?.split(" ")[0] ?? null;

  // Listen for "open chat with message" events from other components
  useEffect(() => {
    return chatEvents.onOpenWithMessage((message) => {
      setOpen(true);
      // Small delay to ensure sheet is open before sending
      setTimeout(() => {
        sendMessage({ text: message });
      }, 100);
    });
  }, [sendMessage]);

  function handleSuggestion(text: string) {
    sendMessage({ text });
  }

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          size="lg"
          className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        >
          <MessageCircle className="size-6" />
          <span className="sr-only">Open chat</span>
        </Button>
      )}

      {/* Chat sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[440px] sm:max-w-[440px] p-0 flex flex-col"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          {/* Header */}
          <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3 space-y-0">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </div>
              <SheetTitle className="text-base">Mathison AI</SheetTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </SheetHeader>

          {/* Messages area */}
          {isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
              <div className="text-center space-y-3">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                  <Bot className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">
                    Hi{firstName ? ` ${firstName}` : ""}! I&apos;m Mathison
                  </p>
                  <p className="text-sm text-muted-foreground">
                    I can help you find and set up apps — or fix anything that&apos;s not working right. Try asking me something like:
                  </p>
                </div>
              </div>
              <SuggestedPrompts onSelect={handleSuggestion} />
            </div>
          ) : (
            <ChatMessages />
          )}

          {/* Input */}
          <ChatInput />
        </SheetContent>
      </Sheet>
    </>
  );
}
