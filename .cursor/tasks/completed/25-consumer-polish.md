# Step 25 — Consumer Polish & Quality Pass

## Goal

Final polish pass across the entire consumer experience. Fix visual inconsistencies, improve error handling, add loading/transition animations, ensure mobile responsiveness, accessibility, and performance. Remove any remaining technical language. After this step, the platform feels production-ready for non-technical users.

## Prerequisites

- Steps 19–24 completed (full typed recipe system with 20+ apps)
- All major features working end-to-end

## What to Build

### 1. Visual Consistency Audit

Go through every page and component. Fix:
- Inconsistent spacing/padding
- Typography hierarchy (headings, body, captions should be consistent)
- Color usage (primary, secondary, muted, destructive — follow shadcn/ui theme)
- Icon sizes and styles (all lucide-react, consistent sizing)
- Card styles (same border-radius, shadow, hover effect everywhere)
- Dark mode: every component should look good in both light and dark

### 2. Loading States

Every data-dependent view should have a proper loading skeleton:
- **App Store homepage**: skeleton cards in grid layout
- **App detail page**: skeleton for header, description, use cases
- **My Apps**: skeleton app cards
- **App settings**: skeleton for detail sections
- **Chat**: loading indicator while agent is thinking

Use shadcn/ui Skeleton component consistently. No blank screens, no jumpy layouts.

### 3. Transitions & Animations

Add subtle polish:
- **Card hover**: scale(1.02) + shadow lift on app cards
- **Install button**: smooth state transitions (idle → installing → success)
- **Status dots**: gentle pulse animation for "Starting..." state
- **Toast notifications**: slide-in from bottom-right
- **Modal/dialog**: fade + scale-in (shadcn/ui default)

Keep it subtle. Consumers notice polish but shouldn't notice animations.

### 4. Error Handling Audit

Go through every API call and user action. Ensure:
- **Network errors**: "Unable to connect. Check your internet and try again."
- **Server errors**: "Something went wrong on our end. Please try again in a moment."
- **Not found**: "This app doesn't exist or was removed."
- **Auth expired**: Redirect to login with "Your session expired. Please log in again."
- **Install failure**: "We couldn't set up this app. Would you like to try again or ask for help?"
- **Validation errors**: Clear, field-specific messages from Zod schemas

No error should ever show: stack traces, HTTP status codes, JSON blobs, or technical identifiers.

### 5. Mobile Responsiveness

Test and fix all pages for mobile (375px–768px):
- **App Store**: single-column grid, full-width search
- **App detail**: single column, install button sticky at bottom
- **My Apps**: single-column grid
- **Chat panel**: full-screen sheet on mobile
- **Sidebar**: hamburger menu → sheet overlay
- **Auth pages**: centered, responsive widths

### 6. Accessibility

- All interactive elements have proper `aria-label` attributes
- Focus management: modals trap focus, return focus on close
- Keyboard navigation: Tab through app cards, Enter to install
- Screen reader: status indicators have text alternatives
- Color contrast: meet WCAG AA minimum (4.5:1 for text)
- Form inputs: proper labels, error messages associated with fields

### 7. Language Audit

Final sweep for any remaining technical language:
- Search all user-facing strings for: deploy, service, recipe, namespace, cluster, pod, container, helm, chart, node, instance, config, schema, manifest
- Replace with consumer equivalents or remove
- Check the AI agent's responses: test 10+ conversations and verify no technical terms slip through

### 8. Performance

- Lazy load images with `next/image`
- Query deduplication via TanStack Query
- Minimize re-renders from polling
- Font loading with `display: swap`

## Deliverables

- [ ] Every page has loading skeletons
- [ ] Every error shows a friendly message
- [ ] All pages are responsive (tested at 375px, 768px, 1024px, 1440px)
- [ ] Dark mode is consistent across all components
- [ ] No technical jargon visible anywhere in the UI
- [ ] Accessibility: keyboard navigation works, screen reader basics work
- [ ] Animations are subtle and consistent
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
- [ ] Full E2E flow works: signup → welcome → browse → install → open → manage → remove

## Notes

- This step is broad but each change is small. It's a QA pass, not a feature build.
- Don't over-animate. Subtle is better.
- The accessibility work is "baseline acceptable", not "fully WCAG AAA compliant".
- This can be split across two sessions if needed: visual/responsive + errors/a11y/performance.
