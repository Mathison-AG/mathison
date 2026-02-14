#!/usr/bin/env tsx
/**
 * Mathison CLI Chat — Dev/testing tool
 *
 * Sends a message to the Mathison AI agent via the /api/chat endpoint,
 * parses the streaming SSE response, and auto-approves tool calls.
 *
 * Usage:
 *   yarn chat "deploy postgresql"
 *   yarn chat "what services are running?"
 *   yarn chat "remove the postgresql service"
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// ─── Config ──────────────────────────────────────────────

const BASE_URL = process.env.CLI_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.CLI_EMAIL || "admin@mathison.dev";
const PASSWORD = process.env.CLI_PASSWORD || "admin1234";

// ─── ANSI Colors ─────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

// ─── CLI Args ────────────────────────────────────────────

const DEBUG = process.argv.includes("--debug");
const args = process.argv.slice(2).filter((a) => a !== "--debug");
const message = args.join(" ");
if (!message) {
  console.error(`${RED}Usage: yarn chat "your message here"${RESET}`);
  console.error(`${DIM}  --debug  Show raw SSE events${RESET}`);
  process.exit(1);
}

// ─── Types ───────────────────────────────────────────────

interface ToolCall {
  id: string;
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: unknown;
  result?: unknown;
  hasResult: boolean;
}

interface StreamResult {
  messageId: string;
  text: string;
  toolCalls: Map<string, ToolCall>;
  error?: string;
}

interface UIMessagePart {
  type: string;
  [key: string]: unknown;
}

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  parts: UIMessagePart[];
}

// ─── Authentication ──────────────────────────────────────

async function login(): Promise<string> {
  // Step 1: Get CSRF token and initial cookies
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok) {
    throw new Error(`Failed to get CSRF token: ${csrfRes.status}`);
  }

  const csrfData = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];

  // Step 2: Login with credentials
  const loginRes = await fetch(
    `${BASE_URL}/api/auth/callback/credentials`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookies.map((c) => c.split(";")[0]).join("; "),
      },
      body: new URLSearchParams({
        csrfToken: csrfData.csrfToken,
        email: EMAIL,
        password: PASSWORD,
      }),
      redirect: "manual", // Don't follow redirect — capture cookies
    }
  );

  const loginCookies = loginRes.headers.getSetCookie?.() ?? [];
  const allCookies = [...csrfCookies, ...loginCookies];

  // Extract session cookie (Auth.js v5 uses "authjs.session-token")
  const hasSession = allCookies.some(
    (c) =>
      c.includes("authjs.session-token") ||
      c.includes("next-auth.session-token")
  );
  if (!hasSession) {
    throw new Error(
      `Login failed — no session cookie received (status: ${loginRes.status})`
    );
  }

  // Return all cookies as a single header value (key=value pairs only)
  return allCookies.map((c) => c.split(";")[0]).join("; ");
}

// ─── SSE Stream Parser ──────────────────────────────────

function handleEvent(
  event: Record<string, unknown>,
  state: StreamResult
): void {
  const type = event.type as string;

  switch (type) {
    case "start":
      state.messageId = event.messageId as string;
      break;

    case "text-delta":
      state.text += event.delta as string;
      process.stdout.write(event.delta as string);
      break;

    // AI SDK v6 UI Message Stream tool events
    case "tool-input-start": {
      const tc: ToolCall = {
        id: (event.toolCallId as string) ?? "",
        toolCallId: event.toolCallId as string,
        toolName: event.toolName as string,
        argsText: "",
        args: {},
        hasResult: false,
      };
      state.toolCalls.set(tc.toolCallId, tc);
      process.stdout.write(
        `\n${CYAN}  [tool] ${tc.toolName}${RESET}`
      );
      break;
    }

    case "tool-input-delta": {
      const toolCallId = event.toolCallId as string;
      const tc = state.toolCalls.get(toolCallId);
      if (tc) {
        tc.argsText += event.argsTextDelta as string;
      }
      break;
    }

    case "tool-input-available": {
      const toolCallId = event.toolCallId as string;
      const tc = state.toolCalls.get(toolCallId);
      if (tc) {
        tc.args = event.input;
        const preview = JSON.stringify(tc.args);
        process.stdout.write(` ${DIM}${truncate(preview, 120)}${RESET}\n`);
      } else {
        // Tool call came as a single event (no start)
        const newTc: ToolCall = {
          id: toolCallId,
          toolCallId,
          toolName: event.toolName as string,
          argsText: "",
          args: event.input,
          hasResult: false,
        };
        state.toolCalls.set(toolCallId, newTc);
        process.stdout.write(
          `\n${CYAN}  [tool] ${newTc.toolName}${RESET} ${DIM}${truncate(JSON.stringify(newTc.args), 120)}${RESET}\n`
        );
      }
      break;
    }

    case "tool-output-available": {
      const toolCallId = event.toolCallId as string;
      const tc = state.toolCalls.get(toolCallId);
      if (tc) {
        tc.result = event.output;
        tc.hasResult = true;
        const preview = JSON.stringify(tc.result);
        process.stdout.write(
          `${GREEN}  [result] ${truncate(preview, 160)}${RESET}\n`
        );
      }
      break;
    }

    // Approval-required tool calls: input is available but tool is not executed
    case "tool-approval-requested": {
      const toolCallId = event.toolCallId as string;
      const tc = state.toolCalls.get(toolCallId);
      if (tc) {
        process.stdout.write(
          `${YELLOW}  [approval needed] ${tc.toolName}${RESET}\n`
        );
      }
      break;
    }

    case "error":
      state.error = event.errorText as string;
      process.stdout.write(`\n${RED}  [error] ${state.error}${RESET}\n`);
      break;

    case "finish":
      // Stream complete
      break;

    // Ignore: text-start, text-end, reasoning-start, reasoning-delta, reasoning-end, etc.
    default:
      if (DEBUG) {
        process.stdout.write(
          `\n${DIM}  [event:${type}] ${truncate(JSON.stringify(event), 200)}${RESET}\n`
        );
      }
      break;
  }
}

async function parseSSEStream(response: Response): Promise<StreamResult> {
  const state: StreamResult = {
    messageId: "",
    text: "",
    toolCalls: new Map(),
  };

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;

      try {
        const event = JSON.parse(jsonStr) as Record<string, unknown>;
        handleEvent(event, state);
      } catch {
        // Skip unparseable lines
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim().startsWith("data:")) {
    const jsonStr = buffer.trim().slice(5).trim();
    if (jsonStr) {
      try {
        const event = JSON.parse(jsonStr) as Record<string, unknown>;
        handleEvent(event, state);
      } catch {
        // Skip
      }
    }
  }

  return state;
}

// ─── Chat ────────────────────────────────────────────────

async function sendChat(
  cookie: string,
  messages: UIMessage[]
): Promise<StreamResult> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat API error ${res.status}: ${body}`);
  }

  return parseSSEStream(res);
}

// ─── Approval Handling ───────────────────────────────────

function getPendingApprovals(state: StreamResult): ToolCall[] {
  return [...state.toolCalls.values()].filter((tc) => !tc.hasResult);
}

function buildAssistantMessage(state: StreamResult): UIMessage {
  const parts: UIMessagePart[] = [];

  // Add text part if present
  if (state.text) {
    parts.push({ type: "text", text: state.text });
  }

  // Add all tool call/result parts in the format useChat expects
  for (const tc of state.toolCalls.values()) {
    if (tc.hasResult) {
      // Tool was executed — include both call and result
      parts.push({
        type: `tool-invocation`,
        toolInvocation: {
          state: "result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
          result: tc.result,
        },
      });
    } else {
      // Tool needs approval — mark as approved so server executes it on resend
      parts.push({
        type: `tool-invocation`,
        toolInvocation: {
          state: "result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
          result: "approved",
        },
      });
    }
  }

  return {
    id: state.messageId || `assistant-${Date.now()}`,
    role: "assistant",
    parts,
  };
}

// ─── Utilities ───────────────────────────────────────────

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

// ─── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${BOLD}Mathison CLI${RESET}`);
  console.log(`${DIM}> ${message}${RESET}\n`);

  // 1. Login
  process.stdout.write(`${DIM}Authenticating...${RESET}`);
  const cookie = await login();
  process.stdout.write(` ${GREEN}done${RESET}\n\n`);

  // 2. Build initial conversation
  const messages: UIMessage[] = [
    {
      id: `cli-user-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: message }],
    },
  ];

  // 3. Send and parse stream
  let state = await sendChat(cookie, messages);

  // 4. Handle tool approvals (auto-approve and resend)
  const MAX_APPROVAL_ROUNDS = 3;
  let round = 0;

  while (round < MAX_APPROVAL_ROUNDS) {
    const pending = getPendingApprovals(state);
    if (pending.length === 0) break;

    round++;
    const toolNames = pending.map((tc) => tc.toolName).join(", ");
    console.log(
      `\n${YELLOW}  [auto-approving: ${toolNames}]${RESET}\n`
    );

    // Build the conversation so far (user + assistant with tool calls)
    const assistantMsg = buildAssistantMessage(state);
    const updatedMessages: UIMessage[] = [...messages, assistantMsg];

    // Resend — the server sees the approved tool calls and executes them
    state = await sendChat(cookie, updatedMessages);
  }

  // 5. Done
  console.log(`\n\n${DIM}---${RESET}\n`);
}

main().catch((err: Error) => {
  console.error(`\n${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
