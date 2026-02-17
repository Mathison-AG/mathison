# Step 14 — One-Click Install Flow

## Goal

Build a complete install-an-app flow that works entirely through the UI — no chat required. User clicks "Install" on an app card or detail page, confirms, sees a progress indicator, and lands on a success screen with a link to open the app. The chat agent becomes an optional assistant, not the only way to install. After this step, a non-technical user can install any app in under 30 seconds.

## Prerequisites

- Step 13 completed (App Store UI with app cards and detail pages)
- Step 12 completed (enriched recipe data)
- Deployment engine working (initiateDeployment, worker)

## What to Build

### 1. Install API Route (`src/app/api/apps/install/route.ts`)

New API endpoint that wraps the deployment engine for one-click installs:

```typescript
// POST /api/apps/install
// Body: { recipeSlug: string }
// Returns: { appId: string, name: string, status: string }
```

Logic:
1. Auth check
2. Look up recipe by slug
3. Use the recipe's default resource config
4. Generate a human-friendly name (e.g., "my-n8n", or just the app slug if no conflict)
5. Call `initiateDeployment()` with the default config
6. Increment install count
7. Return the deployment ID and name

### 2. Install Button Component (`src/components/store/install-button.tsx`)

A smart button that handles the full install flow:

**States:**
1. **Ready**: "Install" (primary button)
2. **Installing**: spinner + "Installing..." (disabled)
3. **Success**: checkmark + "Installed! Open →" (links to app)
4. **Error**: red + "Failed — Try Again"

**Behavior:**
- Click "Install" → POST to `/api/apps/install`
- While installing → poll `/api/deployments/[id]` for status updates
- On RUNNING → show success state with URL
- On FAILED → show error with retry option

### 3. Install Confirmation (`src/components/store/install-modal.tsx`)

Optional confirmation step. Shown when user clicks Install from the app card:

```
┌──────────────────────────────────┐
│                                  │
│  Install n8n?                    │
│                                  │
│  This will set up n8n in your    │
│  workspace. It usually takes     │
│  about a minute.                 │
│                                  │
│  ┌────────────┐  ┌────────┐     │
│  │  Install   │  │ Cancel │     │
│  └────────────┘  └────────┘     │
│                                  │
└──────────────────────────────────┘
```

- Simple confirmation dialog — no configuration needed
- Uses shadcn/ui Dialog component

### 4. Install Progress Card (`src/components/store/install-progress.tsx`)

After install starts, show progress inline (replaces the install button area):

```
┌──────────────────────────────────┐
│  ⏳ Setting up n8n...            │
│  ████████░░░░░░░░  50%           │
│                                  │
│  ✓ Preparing environment         │
│  ✓ Installing database          │
│  ⟳ Starting n8n...              │
│  ○ Verifying everything works    │
└──────────────────────────────────┘
```

Progress steps derived from deployment status:
- PENDING → "Preparing environment"
- DEPLOYING (with deps) → "Installing required components"
- DEPLOYING → "Starting {appName}"
- RUNNING → "Ready!"

Poll `/api/deployments/[id]` every 3 seconds until terminal state.

### 5. Success View (`src/components/store/install-success.tsx`)

Shown when the app reaches RUNNING state:

```
┌──────────────────────────────────┐
│                                  │
│  ✅ n8n is ready!                │
│                                  │
│  ┌───────────────────────┐      │
│  │  Open n8n  →          │      │
│  └───────────────────────┘      │
│                                  │
│  Getting started:                │
│  1. Create your first workflow   │
│  2. Pick a trigger (email, ...)  │
│  3. Add actions to automate      │
│                                  │
│  ┌──────────┐                    │
│  │ My Apps → │                   │
│  └──────────┘                    │
└──────────────────────────────────┘
```

- "Open" button links to the app's URL
- Getting started content from `recipe.gettingStarted` (rendered Markdown)
- Link to "My Apps" page

### 6. Quick Install from App Card

Add install capability directly to the app card (Step 13's `app-card.tsx`):
- Click "Install" on card → opens install confirmation dialog
- Or: direct install immediately for apps with no dependencies
- After install → card shows "Installed ✓" state for apps already running in user's workspace

### 7. Detect Already-Installed Apps

On the App Store page, cross-reference recipes with the user's current deployments:
- If an app is already installed → show "Installed" badge on the card instead of "Install"
- "Installed" badge links to My Apps / the running instance
- Fetch active deployments alongside catalog data (parallel requests)

### 8. Error Handling

- **Network error**: "Something went wrong. Please try again."
- **Quota exceeded**: "You've reached your app limit. Remove an app or upgrade your plan."
- **App already installed**: "This app is already running in your workspace. Open it?"
- **Dependency failure**: "We're having trouble setting up a required component. We'll keep trying — check back in a minute."

Never show technical errors to the user. Log them server-side, show friendly messages client-side.

## Deliverables

- [ ] "Install" button on app cards works end-to-end (click → app running)
- [ ] Install confirmation dialog appears when needed
- [ ] Progress indicator shows during installation
- [ ] Success screen shows app URL and getting started guide
- [ ] Already-installed apps show "Installed" badge on cards
- [ ] Error states are handled with friendly messages
- [ ] Install works without ever opening the chat panel
- [ ] Poll-based status updates work (no stale states)
- [ ] `yarn typecheck` passes
- [ ] Installs are workspace-scoped (uses active workspace)

## Key Files

```
src/
├── app/api/apps/
│   └── install/route.ts               # NEW — one-click install endpoint
├── components/store/
│   ├── install-button.tsx             # NEW — smart install button
│   ├── install-modal.tsx              # NEW — install confirmation dialog
│   ├── install-progress.tsx           # NEW — progress card
│   └── install-success.tsx            # NEW — success view
├── hooks/
│   └── use-install.ts                 # NEW — install flow hook (mutation + polling)
```

## Notes

- The install API endpoint is a thin wrapper around `initiateDeployment()`. The real logic doesn't change — we're just providing a simpler entry point.
- The recipe's default resource config is used for all installs. Resource sizing/tiers will be designed later.
- Polling for status is fine for MVP. WebSocket or SSE for real-time updates is a future optimization.
- The chat-based install still works in parallel — `deployService` tool is unchanged. This gives users two paths: visual (click Install) or conversational (ask the agent).
- Auto-naming: use the recipe slug as the deployment name. If a conflict exists (same app installed twice), append a number: "n8n", "n8n-2", etc.
- The install count increment should happen at install-start, not install-success, so the number goes up even if the install takes a while.
