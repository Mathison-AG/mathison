# Step 08 — Frontend Shell & Layout

## Goal

Build the application shell: root layout with providers, the dashboard layout with sidebar + header, navigation, and all client-side providers (TanStack Query, ChatProvider, theme). After this step, the app has a complete navigation structure and looks like a real product.

## Prerequisites

- Steps 01–07 completed (full backend is functional)
- Auth is working (login/signup flow)

## What to Build

### 1. Root Layout (`src/app/layout.tsx`)

Set up the root layout with:
- Global font (Inter from `next/font/google`)
- Metadata (title: "Mathison", description)
- Tailwind CSS globals
- Theme provider (dark mode support — default to system preference)
- TanStack Query provider

```typescript
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 2. Providers Component (`src/components/providers.tsx`)

Wraps all client-side providers:

```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

### 3. Dashboard Layout (`src/app/(dashboard)/layout.tsx`)

The main authenticated layout:

```
┌─────────────────────────────────────────────────┐
│ [Sidebar]  │  [Header]                          │
│            │  ─────────────────────────────────  │
│ Dashboard  │                                     │
│ Catalog    │     [Main Content Area]             │
│ Deploys    │                                     │
│ Settings   │                                     │
│            │                                     │
│            │                        [Chat FAB] → │
└─────────────────────────────────────────────────┘
```

- Wraps children with `ChatProvider` (so chat state persists across page nav)
- Includes the sidebar and header
- Floating chat button in bottom-right corner
- Chat panel slides in from the right as an overlay/sheet

### 4. Sidebar (`src/components/layout/sidebar.tsx`)

Collapsible navigation sidebar:
- **Logo/brand** at top ("Mathison" or icon when collapsed)
- **Nav items**: Dashboard (Home icon), Catalog (Grid icon), Deployments (Rocket icon), Settings (Gear icon)
- **Active state** based on current route
- **Collapse toggle** — shrinks to icon-only mode
- **User info** at bottom (avatar, name, logout button)
- Uses shadcn/ui components (Button, Tooltip, Separator)

### 5. Header (`src/components/layout/header.tsx`)

Top bar:
- **Breadcrumb** or page title on the left
- **Workspace name** (tenant name)
- **User menu** dropdown (avatar → profile, settings, logout)

### 6. Chat Panel Trigger

A floating action button (FAB) in the bottom-right corner:
- Click opens the chat panel as a Sheet/drawer from the right
- Badge shows unread indicator when agent has responded
- The actual chat content is built in Step 09 — for now, just the panel shell

### 7. Dashboard Page (`src/app/(dashboard)/page.tsx`)

The main dashboard page — for now, a placeholder that will hold the React Flow canvas (Step 10):
- Welcome message if no deployments
- Empty state with "Start by chatting with Mathison" prompt
- Will contain the StackCanvas component (added in Step 10)

### 8. Placeholder Pages

Create placeholder pages for routes that will be built in Step 11:

- `src/app/(dashboard)/catalog/page.tsx` — "Catalog" heading + placeholder
- `src/app/(dashboard)/deployments/page.tsx` — "Deployments" heading + placeholder
- `src/app/(dashboard)/settings/page.tsx` — "Settings" heading + placeholder

### 9. Landing/Redirect (`src/app/page.tsx`)

Root page redirects:
- If authenticated → redirect to `/(dashboard)`
- If not → redirect to `/login`

### 10. Additional Dependencies

```bash
npm install next-themes lucide-react
```

## Deliverables

- [ ] Authenticated users see the dashboard with sidebar + header
- [ ] Sidebar navigation works — clicking items navigates to the correct page
- [ ] Sidebar collapses to icon-only mode
- [ ] Header shows workspace name and user menu
- [ ] User can log out from the user menu
- [ ] Dark mode toggle works (system/light/dark)
- [ ] Chat FAB is visible in the bottom-right corner
- [ ] Clicking chat FAB opens an empty panel/sheet from the right
- [ ] Dashboard shows a welcoming empty state
- [ ] Unauthenticated access redirects to `/login`
- [ ] Layout looks polished — modern, clean design with proper spacing

## Key Files

```
src/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Redirect
│   └── (dashboard)/
│       ├── layout.tsx                # Dashboard layout
│       ├── page.tsx                  # Dashboard/canvas page
│       ├── catalog/page.tsx          # Placeholder
│       ├── deployments/page.tsx      # Placeholder
│       └── settings/page.tsx         # Placeholder
├── components/
│   ├── providers.tsx                 # Client providers
│   └── layout/
│       ├── sidebar.tsx               # Navigation sidebar
│       ├── header.tsx                # Top header bar
│       └── chat-panel.tsx            # Chat panel shell (sheet/drawer)
```

## Notes

- Use **shadcn/ui Sheet** component for the chat panel (slides from right).
- Use **lucide-react** for all icons (it's shadcn/ui's default icon library).
- The sidebar should be responsive: on mobile, use a hamburger menu that opens a Sheet.
- Use `usePathname()` from `next/navigation` to determine active nav item.
- The chat panel shell just needs the open/close mechanism and a container — content is Step 09.
- Keep the UI dark-mode friendly from the start. Use Tailwind's `dark:` variants.
- Install `next-themes` for dark mode support — it works well with shadcn/ui.
