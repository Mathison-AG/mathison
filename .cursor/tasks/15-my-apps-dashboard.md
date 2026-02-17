# Step 15 — My Apps Dashboard

## Goal

Replace the technical deployments list and React Flow canvas with a clean, consumer-friendly "My Apps" dashboard. Users see their installed apps as visual cards with status indicators, one-click open buttons, and simple management actions. No deployment IDs, no Helm releases, no namespaces — just "your apps, running or not." After this step, users have a clear home for managing everything they've installed.

## Prerequisites

- Step 14 completed (one-click install works)
- At least one app installable for testing

## What to Build

### 1. My Apps Page (`src/app/(dashboard)/apps/page.tsx`)

New route that replaces `/deployments`:

```
┌──────────────────────────────────────────────────────────┐
│  My Apps                                    [+ Add App]  │
│                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │  [n8n icon] │ │ [PG icon]   │ │ [Kuma icon] │       │
│  │             │ │             │ │             │       │
│  │  n8n        │ │ PostgreSQL  │ │ Uptime Kuma │       │
│  │  ● Running  │ │ ● Running   │ │ ● Running   │       │
│  │             │ │             │ │             │       │
│  │ [Open]      │ │ [Details]   │ │ [Open]      │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Grid of installed app cards
- "Add App" button links to the App Store (homepage)
- Empty state: "No apps installed yet. Browse the App Store to get started."

### 2. My App Card (`src/components/my-apps/app-card.tsx`)

Visual card for each installed app:

```
┌───────────────────────┐
│      [App Icon]       │
│                       │
│   n8n                 │
│   Workflow Automation │
│                       │
│   ● Running           │
│                       │
│  ┌──────┐  ┌──────┐  │
│  │ Open │  │  ⋯   │  │
│  └──────┘  └──────┘  │
└───────────────────────┘
```

**Status indicators** (simple, color-coded):
- 🟢 Running — green dot + "Running"
- 🟡 Starting — yellow dot + "Starting..." (with subtle pulse animation)
- 🔴 Needs attention — red dot + "Needs attention"
- ⚪ Stopped — gray dot + "Stopped"

**Status mapping** from DeploymentStatus:
- PENDING, DEPLOYING → "Starting..."
- RUNNING → "Running"
- FAILED → "Needs attention"
- STOPPED → "Stopped"
- DELETING → "Removing..."

**Actions menu (⋯ button):**
- "Open" (if URL available)
- "Settings" → app settings page
- "Restart" → triggers upgrade with same config
- "Remove" → confirmation dialog then removal

### 3. App Detail / Settings Page (`src/app/(dashboard)/apps/[id]/page.tsx`)

Consumer-friendly detail page for an installed app:

```
┌──────────────────────────────────────────────────────────┐
│  ← My Apps                                               │
│                                                          │
│  [Icon]  n8n                              ┌──────────┐   │
│          Workflow Automation              │   Open   │   │
│          ● Running                        └──────────┘   │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  Size: Medium (Small team)                               │
│  Installed: 2 days ago                                   │
│  Last updated: 1 hour ago                                │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  Getting Started                                         │
│  1. Open n8n using the button above                      │
│  2. Create your first workflow                           │
│  3. Pick a trigger and start automating                  │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  Settings                                                │
│  Size: [Small] [Medium ✓] [Large]   [Apply]             │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  Danger Zone                                             │
│  [Remove App]  This will delete the app and all its data │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Sections:
- **Header**: icon, name, category, status, open button
- **Info**: size tier label, install date, last update (relative time)
- **Getting started**: rendered from `recipe.gettingStarted` (Markdown)
- **Settings**: size tier changer (triggers upgrade), any user-facing config
- **Danger zone**: remove button with confirmation dialog

### 4. Remove Confirmation Dialog

```
┌──────────────────────────────────┐
│  Remove n8n?                     │
│                                  │
│  This will permanently delete    │
│  this app and all its data.      │
│  This cannot be undone.          │
│                                  │
│  ┌────────────┐  ┌────────┐     │
│  │   Remove   │  │ Cancel │     │
│  └────────────┘  └────────┘     │
└──────────────────────────────────┘
```

- Red-styled destructive action
- Calls `initiateRemoval()` via API
- On success, redirect to My Apps with toast notification

### 5. Update Routing & Navigation

- `/apps` → My Apps dashboard
- `/apps/[id]` → App detail/settings
- `/deployments` → redirect to `/apps` (backward compat)
- `/deployments/[id]` → redirect to `/apps/[id]`
- Sidebar: "My Apps" replaces "Deployments"
- "My Apps" shows a count badge with number of running apps

### 6. My Apps Data Hook (`src/hooks/use-my-apps.ts`)

```typescript
export function useMyApps() {
  return useQuery({
    queryKey: ["my-apps"],
    queryFn: () => fetch("/api/deployments").then(r => r.json()),
    refetchInterval: (query) => {
      // Poll while any app is in transitional state
      const apps = query.state.data;
      if (!apps?.length) return false;
      const hasTransitional = apps.some(a =>
        ["PENDING", "DEPLOYING", "DELETING"].includes(a.status)
      );
      return hasTransitional ? 5000 : false;
    },
  });
}
```

### 7. Toast Notifications

Add a toast system (shadcn/ui Sonner or Toast) for:
- "n8n installed successfully!"
- "n8n removed."
- "Settings updated — n8n is restarting..."
- "Something went wrong. Please try again."

### 8. Auto-Refresh After Install

When returning to My Apps from an install flow:
- Invalidate the `["my-apps"]` query
- Newly installed app appears immediately (even if still starting)
- Status auto-updates via polling

## Deliverables

- [ ] `/apps` shows grid of installed apps with status indicators
- [ ] App cards have "Open" button that opens the app in a new tab
- [ ] Actions menu works (settings, restart, remove)
- [ ] App detail page shows consumer-friendly info (no technical data)
- [ ] Size changing works (triggers upgrade via deployment engine)
- [ ] Remove flow works with confirmation dialog
- [ ] Getting started guide rendered on detail page
- [ ] Empty state guides users to App Store
- [ ] Toast notifications for key actions
- [ ] Sidebar updated with "My Apps" label
- [ ] Status auto-updates via polling
- [ ] Redirects from old `/deployments` routes work

## Key Files

```
src/
├── app/(dashboard)/
│   ├── apps/
│   │   ├── page.tsx                   # My Apps dashboard (NEW)
│   │   └── [id]/page.tsx             # App detail/settings (NEW)
│   └── deployments/                   # Redirect to /apps
├── components/
│   ├── my-apps/
│   │   ├── app-card.tsx              # NEW — installed app card
│   │   ├── app-grid.tsx              # NEW — grid layout
│   │   ├── app-detail.tsx            # NEW — detail view
│   │   ├── remove-dialog.tsx         # NEW — removal confirmation
│   │   └── status-indicator.tsx      # NEW — visual status dot
│   └── layout/
│       └── sidebar.tsx               # Updated navigation
├── hooks/
│   └── use-my-apps.ts               # NEW — data hook
```

## Notes

- This page reuses the existing `/api/deployments` endpoints — no new API routes needed for the list and detail views.
- The "Restart" action is an upgrade with the same config. Call `initiateUpgrade()` with the current config.
- The detail page should fetch the recipe data alongside the deployment to get `gettingStarted` and `sizeTiers`.
- Don't show internal services (auto-deployed dependencies like PostgreSQL for n8n) unless the user explicitly installed them. Filter by checking if the deployment was user-initiated vs. auto-deployed as a dependency. You may need to add a `isDependency` boolean to the Deployment model, or check `dependsOn`.
- The old canvas component isn't deleted — it's just not the default view anymore. It can be linked from a "Power tools" section or kept at a dedicated route for users who want it.
