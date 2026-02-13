# Step 09 — Chat Panel UI

## Goal

Build the complete chat interface: ChatProvider wrapping Vercel AI SDK's `useChat`, message rendering with streaming support, tool invocation cards, and the chat input. After this step, users can chat with the AI agent through the sliding panel and see tool calls rendered as action cards.

## Prerequisites

- Steps 01–08 completed (full backend + frontend shell with chat panel container)
- `/api/chat` endpoint working (Step 05)
- Chat panel shell exists (Step 08) — we're filling it with content

## What to Build

### 1. Chat Provider (`src/components/chat/chat-provider.tsx`)

Wraps the Vercel AI SDK `useChat` hook and provides it via React Context:

```typescript
"use client";

import { useChat } from "@ai-sdk/react";
import { createContext, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";

const ChatContext = createContext<ReturnType<typeof useChat> | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const chat = useChat({
    api: "/api/chat",
    maxSteps: 10,
    onFinish: () => {
      // Invalidate deployment queries so the UI refreshes after agent actions
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      queryClient.invalidateQueries({ queryKey: ["stack"] });
    },
  });

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
```

### 2. Chat Messages (`src/components/chat/chat-messages.tsx`)

Renders the message list with streaming support:

- User messages: right-aligned, primary color background
- Assistant messages: left-aligned, muted background
- Support markdown rendering in assistant messages (use `react-markdown` or similar)
- Auto-scroll to bottom on new messages
- "Thinking..." indicator while streaming
- Tool invocations rendered inline between text segments

```typescript
"use client";

import { useChatContext } from "./chat-provider";
import { ToolInvocation } from "./tool-invocation";

export function ChatMessages() {
  const { messages, isLoading } = useChatContext();

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {messages.map((message) => (
        <div key={message.id}>
          {message.content && (
            <div className={cn(
              "rounded-lg px-4 py-2 max-w-[85%]",
              message.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted"
            )}>
              {message.content}
            </div>
          )}
          {message.toolInvocations?.map((invocation) => (
            <ToolInvocation key={invocation.toolCallId} invocation={invocation} />
          ))}
        </div>
      ))}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Thinking...
        </div>
      )}
    </div>
  );
}
```

### 3. Tool Invocation Cards (`src/components/chat/tool-invocation.tsx`)

Render AI tool calls as visual action cards instead of raw JSON:

Each tool type gets a distinct card:

- **searchCatalog**: "Searching catalog..." → shows results as a mini-list
- **deployService**: "Deploying {name}..." → shows deployment card with status badge
- **getStackStatus**: "Checking your stack..." → shows status summary
- **getServiceLogs**: "Fetching logs..." → shows log snippet in monospace
- **removeService**: "Removing {name}..." → shows confirmation result
- **searchHelmCharts**: "Searching Artifact Hub..." → shows results

States:
- **Pending** (tool called, waiting for result): show loading spinner + tool name
- **Completed** (result received): show formatted result card
- **Error**: show error message in red

```typescript
"use client";

export function ToolInvocation({ invocation }: { invocation: any }) {
  const { toolName, state, result } = invocation;

  if (state === "call") {
    // Pending — show loading card
    return (
      <div className="rounded-lg border p-3 my-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium">{getToolLabel(toolName)}</span>
        </div>
      </div>
    );
  }

  if (state === "result") {
    // Completed — render tool-specific card
    return (
      <div className="rounded-lg border p-3 my-2">
        {renderToolResult(toolName, result)}
      </div>
    );
  }

  return null;
}

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchCatalog: "Searching catalog...",
    deployService: "Deploying service...",
    getStackStatus: "Checking stack status...",
    getServiceLogs: "Fetching logs...",
    removeService: "Removing service...",
    // etc.
  };
  return labels[toolName] || toolName;
}
```

### 4. Chat Input (`src/components/chat/chat-input.tsx`)

Input component with send button:

- Text input (or textarea for multiline)
- Send button (arrow icon) — enabled only when input is non-empty
- Submit on Enter (Shift+Enter for newline if textarea)
- Disable input while loading
- Placeholder: "Ask Mathison anything..."

```typescript
"use client";

import { useChatContext } from "./chat-provider";

export function ChatInput() {
  const { input, handleInputChange, handleSubmit, isLoading } = useChatContext();

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 border-t">
      <Input
        value={input}
        onChange={handleInputChange}
        placeholder="Ask Mathison anything..."
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
```

### 5. Assemble Chat Panel (`src/components/layout/chat-panel.tsx`)

Wire the chat components into the panel shell from Step 08:

```typescript
<Sheet>
  <SheetContent side="right" className="w-[400px] sm:w-[450px] flex flex-col p-0">
    <SheetHeader className="p-4 border-b">
      <SheetTitle className="flex items-center gap-2">
        <Bot className="h-5 w-5" />
        Mathison
      </SheetTitle>
    </SheetHeader>
    <div className="flex-1 overflow-hidden">
      <ChatMessages />
    </div>
    <ChatInput />
  </SheetContent>
</Sheet>
```

### 6. Suggested Prompts

When chat is empty (no messages), show suggested prompts:

- "What services can I deploy?"
- "Set up a PostgreSQL database"
- "Deploy n8n with a database"
- "What's running in my workspace?"

Clicking a suggestion fills the input and submits.

### 7. Additional Dependencies

```bash
npm install react-markdown
```

## Deliverables

- [ ] Chat panel opens from the floating button in bottom-right
- [ ] User can type a message and send it (Enter or click send)
- [ ] Messages stream in real-time from the AI agent
- [ ] User messages appear right-aligned, agent messages left-aligned
- [ ] Tool invocations render as styled cards (not raw JSON)
- [ ] Loading state shows "Thinking..." with spinner
- [ ] Auto-scrolls to newest message
- [ ] Suggested prompts appear when chat is empty
- [ ] Clicking a suggestion starts that conversation
- [ ] After agent deploys something, deployment queries are invalidated (TanStack Query)
- [ ] Chat works on mobile (responsive width)

## Key Files

```
src/components/chat/
├── chat-provider.tsx      # useChat wrapper + context
├── chat-messages.tsx      # Message list with streaming
├── chat-input.tsx         # Input + send button
└── tool-invocation.tsx    # Tool call action cards
src/components/layout/
└── chat-panel.tsx         # Updated with chat content
```

## Notes

- The AI SDK's `useChat` hook handles all the streaming, message state, and tool invocation lifecycle automatically. We just render what it gives us.
- `maxSteps: 10` in `useChat` matches the server's `maxSteps: 10` — this allows multi-step conversations where the agent calls several tools in sequence.
- Tool invocations have two states: `"call"` (pending) and `"result"` (completed). Render different UI for each.
- The `onFinish` callback invalidates TanStack Query caches so the canvas and deployment list refresh after the agent makes changes.
- Use `react-markdown` for rendering markdown in assistant messages (code blocks, lists, bold, etc.).
- The chat panel state (open/closed) should persist across navigation within the dashboard.
