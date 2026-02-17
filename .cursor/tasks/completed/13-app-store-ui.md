# Step 13 — App Store UI

## Goal

Redesign the catalog into a consumer-friendly App Store that becomes the primary experience after login. Featured apps, category browsing, rich app cards, and a beautiful detail page with screenshots and "what is this good for" sections. The App Store replaces the technical "Service Catalog" both visually and in language. After this step, browsing apps feels like the iOS App Store, not a DevOps dashboard.

## Prerequisites

- Step 12 completed (enriched recipe data model with consumer fields)
- Seed data has shortDescription, useCases, gettingStarted

## What to Build

### 1. Rename & Restructure Routes

The catalog route becomes the App Store — and becomes the **default landing page** after login:

- `src/app/(dashboard)/page.tsx` → Show the App Store (not the canvas)
- `src/app/(dashboard)/apps/page.tsx` → New: "My Apps" page (replaces old deployments list — built in Step 15)
- Keep `/catalog` as a redirect to `/` for backward compatibility
- Move canvas to `/apps/map` or remove from primary nav (optional, power-user feature)

### 2. App Store Homepage (`src/app/(dashboard)/page.tsx`)

The new default dashboard page. Sections:

**Hero / Search:**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│     What do you want to set up today?                    │
│     ┌──────────────────────────────────┐                 │
│     │ 🔍 Search apps...                │                 │
│     └──────────────────────────────────┘                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Featured Apps Row:** (recipes where `featured = true`)
- Larger cards with icon, name, shortDescription
- Horizontal scroll or grid

**Categories:**
- "Automation" → n8n, etc.
- "Monitoring" → Uptime Kuma, etc.
- "Databases" → PostgreSQL, Redis (label them as "Backend Services" or hide from main view)
- "Storage" → MinIO, etc.
- Each category has a header + horizontal row of app cards

**Browse All:**
- Full grid at the bottom with all apps
- Category filter chips (keep the existing filter component, restyle it)

### 3. App Card Component (`src/components/store/app-card.tsx`)

Replace the technical `recipe-card.tsx` with a consumer-friendly card:

```
┌─────────────────────────────┐
│                             │
│     [App Icon - large]      │
│                             │
│     n8n                     │
│     Workflow Automation      │
│                             │
│  "Visual workflow automation │
│   — connect anything to     │
│   everything"               │
│                             │
│  ┌─────────┐  🔢 1.2k      │
│  │ Install  │  installs     │
│  └─────────┘               │
└─────────────────────────────┘
```

- Large app icon (centered or left-aligned)
- App name (bold) + category subtitle
- Short description (from `shortDescription`)
- Install button (primary action — triggers one-click install in Step 14, for now links to detail page)
- Install count badge (small, subtle)
- No technical badges (no OFFICIAL/VERIFIED/COMMUNITY — consumers don't care)
- Hover effect, smooth transition

### 4. App Detail Page (`src/app/(dashboard)/catalog/[slug]/page.tsx`)

Complete redesign of the recipe detail page:

```
┌──────────────────────────────────────────────────────────┐
│  [← Back to Apps]                                        │
│                                                          │
│  [Icon]  n8n                              ┌──────────┐   │
│          Workflow Automation              │ Install   │   │
│          ★ Featured                       │  Free     │   │
│                                          └──────────┘   │
│  Visual workflow automation platform that                │
│  lets you connect anything to everything.                │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  What is this good for?                                  │
│  • Automate repetitive tasks                             │
│  • Connect apps without coding                           │
│  • Build custom workflows                                │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  Screenshots                                             │
│  [img1] [img2] [img3]                                    │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│                                                          │
│  Links                                                   │
│  🌐 Website  📖 Documentation                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Key sections:
- **Header**: icon, name, category, featured badge, install button
- **Description**: full `description` text
- **Use cases**: rendered from `useCases[]` array as a checklist
- **Screenshots**: gallery from `screenshots[]` (placeholder if empty)
- **Links**: website and documentation URLs
- **No config schema visible** — technical config is hidden from consumers

### 5. Update Sidebar Navigation

- Rename "Catalog" → "App Store" (or just "Apps" in the nav)
- Rename "Deployments" → "My Apps"
- Dashboard (home icon) → goes to App Store (the new homepage)
- Consider: move "Settings" into a user menu dropdown to simplify the sidebar

### 6. Update Components Directory Structure

```
src/components/
├── store/                    # NEW — replaces catalog/
│   ├── app-card.tsx          # Consumer app card
│   ├── app-grid.tsx          # Grid layout for apps
│   ├── featured-apps.tsx     # Featured row component
│   ├── category-row.tsx      # Horizontal category section
│   ├── app-detail.tsx        # Full detail view
│   └── store-search.tsx      # Search bar component
├── catalog/                  # Keep for backward compat, can deprecate later
```

### 7. Consumer Language Cleanup

Global find-and-replace in all user-facing strings:
- "Service Catalog" → "App Store" or "Apps"
- "service" → "app" (in UI context, not backend code)
- "Deploy" → "Install"
- "Deployment" → (context-dependent) "installed app" or just "app"
- "Recipe" → never shown to users (internal only)
- "configSchema" → "Settings" (when exposed at all)

Keep backend code terminology unchanged — only user-facing JSX strings change.

## Deliverables

- [ ] App Store is the default page after login (replaces canvas)
- [ ] Featured apps section shows at the top
- [ ] Category-based browsing works with horizontal rows
- [ ] Search filters apps by name and description
- [ ] App cards show icon, name, short description, install count
- [ ] App detail page shows use cases, description, links
- [ ] Sidebar says "Apps" or "App Store" instead of "Catalog"
- [ ] No technical jargon visible anywhere in the UI (no "deploy", "service", "recipe", "Helm")
- [ ] Responsive layout — works on desktop and mobile
- [ ] Dark mode works correctly with new components

## Key Files

```
src/
├── app/(dashboard)/
│   ├── page.tsx                       # App Store homepage (NEW content)
│   ├── catalog/[slug]/page.tsx        # App detail page (REDESIGNED)
│   └── catalog/page.tsx               # Redirect to / (or removed)
├── components/
│   ├── store/
│   │   ├── app-card.tsx               # NEW
│   │   ├── app-grid.tsx               # NEW
│   │   ├── featured-apps.tsx          # NEW
│   │   ├── category-row.tsx           # NEW
│   │   ├── app-detail.tsx             # NEW
│   │   ├── size-picker.tsx            # NEW
│   │   └── store-search.tsx           # NEW
│   └── layout/
│       └── sidebar.tsx                # Updated labels
```

## Notes

- The old `catalog/` components can stay for now — the new `store/` components replace them in the routes. We can clean up later.
- The canvas (React Flow) isn't deleted — just moved off the homepage. Power users can still access it. Consider putting it under `/apps/map` or behind a toggle.
- Install count is real data from the DB. Start all at 0 — it'll grow organically.
- For screenshots, use placeholder gradient images or leave the section hidden when `screenshots` is empty. Real screenshots can be added to seed data later.
- Keep the AI chat panel accessible (floating button). The chat is complementary to the visual App Store, not replaced by it.
