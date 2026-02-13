"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function ChatPanel() {
  const [open, setOpen] = useState(false);

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
          <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3 space-y-0">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MessageCircle className="size-4" />
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

          {/* Chat content — placeholder for Step 09 */}
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center space-y-3">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <MessageCircle className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Chat with Mathison</p>
                <p className="text-sm text-muted-foreground">
                  Ask me to deploy services, check status, or manage your
                  infrastructure.
                </p>
              </div>
            </div>
          </div>

          {/* Input area placeholder */}
          <div className="border-t p-4">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                disabled
              />
              <Button size="sm" variant="ghost" disabled>
                Send
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Chat will be active in the next step
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
