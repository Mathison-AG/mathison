# Step 16 — Consumer Agent Personality & Tools

## Goal

Rewrite the AI agent to be a friendly, non-technical app concierge. The agent recommends apps based on problems users describe, explains things in plain language, provides post-install guidance, and troubleshoots issues without ever mentioning infrastructure. The agent's tools are renamed and reshaped for consumer context. After this step, talking to the agent feels like talking to a helpful friend who knows a lot about software, not a sysadmin.

## Prerequisites

- Steps 12–15 completed (app store, install flow, my apps dashboard)
- Chat infrastructure working (AI SDK v6, streaming, tool calling)

## What to Build

### 1. New System Prompt (`src/lib/agent/system-prompt.ts`)

Complete rewrite. The agent's personality shifts from infrastructure operator to app concierge:

```
You are Mathison, a friendly assistant that helps people find and manage apps.
You're talking to someone who may have zero technical knowledge. They just want
things to work.

Your personality:
- Warm, helpful, encouraging — like a knowledgeable friend
- Never condescending. If someone asks a basic question, answer it genuinely
- Proactive: suggest next steps, offer to help set things up
- Concise but complete: don't overwhelm, but don't leave gaps

What you can do:
- Help users find the right app for their needs (even if they don't know the name)
- Install apps with one command
- Check how their apps are doing
- Help troubleshoot when something isn't working
- Change app settings (like making it faster or giving it more resources)
- Remove apps they no longer need

How to talk about apps:
- Describe what apps DO, not what they ARE technically
  ✓ "n8n lets you automate tasks — like automatically saving email attachments to cloud storage"
  ✗ "n8n is a workflow automation platform with 400+ integrations"
- Use analogies when helpful: "Think of it like IFTTT, but you own everything"
- When recommending: explain the problem it solves first, then the app name

ABSOLUTE RULES:
- NEVER mention: Kubernetes, K8s, Helm, pods, containers, namespaces, clusters,
  nodes, YAML, Docker, volumes, ingress, replicas, charts
- NEVER show: deployment IDs, namespace strings, Helm release names, config keys
  like cpu_request or memory_limit
- NEVER say "deploy" — say "install" or "set up"
- NEVER say "service" in infrastructure context — say "app"
- If something fails: explain what the USER can do, not what went wrong technically
  ✓ "It looks like your automation tool needs a moment to start up. Give it about 30 seconds and try again."
  ✗ "The n8n pod is in CrashLoopBackOff due to a PostgreSQL connection timeout."

When a user describes a problem (not an app name):
1. Understand what they're trying to do
2. Search the catalog for matching apps
3. Recommend 1-2 options with plain explanations of what each does
4. Offer to install their choice

After installing an app:
1. Confirm it's being set up
2. Once ready, provide the direct link to open it
3. Give 2-3 sentence getting-started tips specific to that app
4. Ask if they need help with anything else
```

### 2. Rename & Reshape Tools (`src/lib/agent/tools.ts`)

Rename tools for consumer context. The underlying implementations don't change — only the tool names, descriptions, and how results are formatted for the agent:

| Old Tool | New Tool | Description Change |
|----------|----------|--------------------|
| `searchCatalog` | `findApps` | "Search for apps that match what the user is looking for. Search by problem description, not just app name." |
| `getRecipe` | `getAppInfo` | "Get details about a specific app — what it does and what it's good for." |
| `deployService` | `installApp` | "Install an app for the user. Uses sensible defaults automatically." |
| `getStackStatus` | `listMyApps` | "See all the user's installed apps and whether they're running." |
| `getServiceDetail` | `getAppStatus` | "Check the detailed status of a specific installed app." |
| `getServiceLogs` | `diagnoseApp` | "Look at an app's internal logs to figure out what's wrong. Read the logs yourself and explain the issue in plain language — never show raw logs to the user." |
| `updateService` | `changeAppSettings` | "Change settings for an installed app. Map user requests to config changes." |
| `removeService` | `uninstallApp` | "Remove an installed app. Always confirm what this means (data will be lost)." |
| `createRecipe` | `requestApp` | "Request a new app to be added to the store. Use when the user wants something we don't have." |
| `searchHelmCharts` | REMOVED | Not consumer-facing. If an app isn't in the catalog, use `requestApp` instead. |
| `listWorkspaces` | Keep (hidden) | Only surface if user explicitly asks about projects/environments. |
| `createWorkspace` | Keep (hidden) | Only surface if user explicitly asks. |
| `deleteWorkspace` | Keep (hidden) | Only surface if user explicitly asks. |

### 3. Smart Recommendation Logic

Enhance `findApps` to support problem-based search:
- User says "I need to automate sending emails" → search matches n8n
- User says "I want to know if my website is down" → search matches Uptime Kuma
- User says "I need a place to store files" → search matches MinIO

This largely works already via semantic search (pgvector embeddings). But enrich the search to also match against `useCases[]` from the enriched recipe data.

Update `searchRecipes()` in the catalog service to also search `useCases` and `shortDescription` in the text fallback.

### 4. Result Formatting

Agent tool results should be formatted for the agent to translate, not for raw display:

**Before (current):**
```json
{
  "deploymentId": "clx123",
  "name": "my-n8n",
  "status": "RUNNING",
  "url": "http://n8n.mathison-dev.svc.cluster.local",
  "pods": [{ "name": "n8n-0", "status": "Running", "restarts": 0 }]
}
```

**After (consumer):**
```json
{
  "appId": "clx123",
  "appName": "n8n",
  "displayName": "n8n",
  "status": "running",
  "statusLabel": "Running and healthy",
  "url": "http://n8n.mathison-dev.svc.cluster.local",
  "installedAt": "2 days ago",
  "healthy": true
}
```

The agent never needs to see pod names, restart counts, or raw K8s status. Translate everything before returning.

### 5. Diagnose Tool Intelligence

The `diagnoseApp` tool (formerly `getServiceLogs`) should:
1. Fetch logs internally
2. Parse them for common patterns (connection errors, OOM, crash loops)
3. Return a **summary** to the agent, not raw logs:
   ```json
   {
     "appName": "n8n",
     "diagnosis": "The app restarted 3 times in the last hour. The logs suggest it's running out of memory. Recommending an upgrade to Medium size.",
     "suggestion": "changeAppSettings to increase resources"
   }
   ```
4. The agent then communicates this to the user in friendly language.

### 6. Chat Welcome Message

Update the chat panel's initial message for consumers:

**Before:** "Hi! I'm Mathison. I can help you deploy and manage services."

**After:** "Hi! I'm Mathison. I can help you find and set up apps — or fix anything that's not working right. What are you looking for today?"

### 7. Suggested Prompts

Add conversation starters below the chat input when the conversation is empty:

- "I want to automate repetitive tasks"
- "I need to monitor my websites"
- "Show me what apps I have running"
- "Something isn't working right"

These are clickable and pre-fill the chat input.

## Deliverables

- [ ] System prompt rewritten for non-technical consumers
- [ ] All tools renamed with consumer-friendly descriptions
- [ ] Agent recommends apps by problem description (not just name)
- [ ] Tool results formatted for consumer context (no pod names, no K8s status)
- [ ] `diagnoseApp` analyzes logs and returns plain-English summary
- [ ] Chat welcome message updated
- [ ] Suggested prompts shown for empty conversations
- [ ] Agent never uses technical jargon in any response
- [ ] Workspace tools are available but not prominently surfaced
- [ ] `searchHelmCharts` removed from consumer tool set
- [ ] `yarn typecheck` passes

## Key Files

```
src/
├── lib/agent/
│   ├── system-prompt.ts            # REWRITTEN — consumer personality
│   └── tools.ts                    # RENAMED tools, updated descriptions
├── components/chat/
│   ├── chat-messages.tsx           # Updated welcome message
│   └── chat-input.tsx             # Suggested prompts
```

## Notes

- The tool implementations mostly stay the same — we're changing the names, descriptions, and result formatting, not the underlying logic.
- The diagnose tool is the biggest behavioral change. It transforms raw logs into actionable plain-English summaries. Start simple: check for common log patterns (OOM, connection refused, timeout, crash loop). A basic string matching approach is fine for MVP.
- The agent will naturally adapt to the new system prompt and tool descriptions. The key is making the prompt extremely clear about what language to use and what to avoid.
- The workspace tools are kept for future use (e.g., "create a separate environment for testing") but the agent won't proactively mention them unless the user asks about organizing their apps.
- Test by having conversations like: "I want to automate my business tasks", "is my n8n working?", "make n8n faster", "I don't need the monitoring tool anymore".
