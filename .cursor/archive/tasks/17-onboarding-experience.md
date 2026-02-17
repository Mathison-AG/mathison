# Step 17 — Onboarding & First-Run Experience

## Goal

Create a streamlined signup flow and first-run experience that gets users to their first installed app as fast as possible. New users sign up, see a brief welcome, optionally pick their first app, and land in the App Store ready to go. No configuration, no setup wizards, no technical concepts. After this step, the time from "I found this website" to "I have an app running" is under 2 minutes.

## Prerequisites

- Steps 12–16 completed (app store, install, my apps, consumer agent)
- Auth system working (signup + login)

## What to Build

### 1. Redesign Signup Page (`src/app/(auth)/signup/page.tsx`)

Current signup is functional but basic. Make it consumer-friendly:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│           [Mathison Logo]                                │
│                                                          │
│     Your apps, your way.                                 │
│     Run powerful open-source tools                       │
│     without the technical hassle.                        │
│                                                          │
│     ┌──────────────────────────────┐                     │
│     │ Your name                    │                     │
│     └──────────────────────────────┘                     │
│     ┌──────────────────────────────┐                     │
│     │ Email                        │                     │
│     └──────────────────────────────┘                     │
│     ┌──────────────────────────────┐                     │
│     │ Password                     │                     │
│     └──────────────────────────────┘                     │
│                                                          │
│     ┌──────────────────────────────┐                     │
│     │       Get Started            │                     │
│     └──────────────────────────────┘                     │
│                                                          │
│     Already have an account? Log in                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Clean, centered layout
- Friendly tagline (not "Sign up for Mathison")
- Show 3-4 app icons below the form as social proof ("Trusted apps: n8n, PostgreSQL, ...")
- Password requirements: minimum 8 characters, show strength indicator
- Auto-focus on name field
- Submit → create account → redirect to welcome flow

### 2. Redesign Login Page (`src/app/(auth)/login/page.tsx`)

Match the signup page style:
- Same centered layout and branding
- "Welcome back" heading
- Email + password fields
- "Forgot password?" link (placeholder — just shows toast "Feature coming soon")
- Link to signup for new users

### 3. Welcome Flow (First-Run) (`src/app/(dashboard)/welcome/page.tsx`)

After first signup, redirect to a one-time welcome page instead of the App Store:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│     Welcome to Mathison, {name}! 👋                      │
│                                                          │
│     Let's get you started. What are you                  │
│     most interested in?                                  │
│                                                          │
│     ┌───────────────┐  ┌───────────────┐                │
│     │  🔄           │  │  📊           │                │
│     │  Automation   │  │  Monitoring   │                │
│     │  Automate     │  │  Keep an eye  │                │
│     │  workflows    │  │  on your      │                │
│     │  and tasks    │  │  websites     │                │
│     └───────────────┘  └───────────────┘                │
│                                                          │
│     ┌───────────────┐  ┌───────────────┐                │
│     │  💾           │  │  🗂️           │                │
│     │  Databases    │  │  Storage      │                │
│     │  Store and    │  │  Your own     │                │
│     │  manage data  │  │  cloud storage│                │
│     └───────────────┘  └───────────────┘                │
│                                                          │
│     ┌────────────────────────────────┐                   │
│     │  Skip — take me to the store → │                   │
│     └────────────────────────────────┘                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Behavior:**
- Clicking a category → navigates to App Store filtered by that category
- "Skip" → goes to unfiltered App Store
- This page is shown only once. Track with a `hasCompletedOnboarding` field on User or via localStorage.
- After the first visit, subsequent logins go straight to App Store

### 4. Track Onboarding State

Option A: Add `onboardingCompletedAt DateTime?` to User model (persistent, survives device changes)
Option B: Use `localStorage` key `mathison-onboarding-complete` (simpler, no migration)

Recommend **Option A** for reliability. Add the field to the User model:

```prisma
model User {
  // ... existing fields
  onboardingCompletedAt DateTime? @map("onboarding_completed_at")
}
```

In the dashboard layout, check this field:
- If null → redirect to `/welcome`
- After welcome page interaction → set the timestamp
- If set → normal dashboard flow

### 5. Quick-Start from Welcome

When user clicks a category on the welcome page:
- Navigate to App Store with that category pre-filtered
- Highlight the most popular app in that category
- Show a subtle banner: "Ready to install your first app? Just click Install!"

### 6. First-Install Celebration

When a user installs their very first app, add a special celebration moment:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│           🎉                                             │
│                                                          │
│     Your first app is being set up!                      │
│                                                          │
│     n8n will be ready in about a minute.                 │
│     We'll show you how to get started                    │
│     once it's running.                                   │
│                                                          │
│     [Setting up... ████████░░░░ ]                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Confetti animation (lightweight, CSS-only or a tiny library)
- Slightly more detailed getting-started content for first install
- After success → show getting started guide + "Explore more apps" link

### 7. Empty State Improvements

Update all empty states throughout the app to be welcoming and action-oriented:

**My Apps (empty):**
```
You haven't installed any apps yet.
Browse the App Store to find something useful.
[Browse Apps →]
```

**Chat (first message):**
```
Hi {name}! I'm here to help you find and manage apps.
Try asking me something like:
• "I need to automate my email workflows"
• "What apps do you recommend for a small team?"
• "Help me set up website monitoring"
```

### 8. Auth Page Styling

Both login and signup should share a layout component:
- Left side (or top on mobile): form
- Right side (optional): illustration or animated preview of the app store
- Consistent branding, dark mode support
- Gradient background or subtle pattern

## Deliverables

- [ ] Signup page redesigned with consumer-friendly copy and layout
- [ ] Login page matches the new design language
- [ ] Welcome page shown on first login with category selection
- [ ] Welcome page sets onboarding-completed flag and isn't shown again
- [ ] Clicking a category filters the App Store appropriately
- [ ] First-install celebration moment works
- [ ] All empty states are welcoming and guide users to action
- [ ] Chat has personalized first message with user's name
- [ ] Suggested prompts appear in empty chat
- [ ] Auth pages work on mobile
- [ ] Dark mode works on auth pages
- [ ] `yarn typecheck` passes, migration applied

## Key Files

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx           # REDESIGNED
│   │   ├── signup/page.tsx          # REDESIGNED
│   │   └── layout.tsx              # Shared auth layout (NEW or updated)
│   └── (dashboard)/
│       └── welcome/page.tsx         # NEW — first-run experience
├── components/
│   ├── onboarding/
│   │   ├── welcome-categories.tsx   # NEW — category picker cards
│   │   ├── first-install.tsx        # NEW — celebration component
│   │   └── empty-states.tsx         # NEW — reusable empty states
│   └── chat/
│       └── chat-messages.tsx        # Updated welcome message
├── prisma/
│   └── schema.prisma               # User.onboardingCompletedAt
```

## Notes

- The welcome flow should be light — not a multi-step wizard. One page, one choice, done.
- Confetti can be done with a CSS animation or the `canvas-confetti` library (~3KB). Don't add a heavy dependency for this.
- The onboarding-completed check should happen in the dashboard layout server component, not in client-side JavaScript, to avoid flash of wrong content.
- Don't block signup on email verification for MVP. Add that later.
- The "Forgot password?" link is a placeholder. Real password reset needs email sending infrastructure, which is a future feature.
- Test the full flow: signup → welcome → pick category → browse apps → install → success. Should feel smooth and fast.
