# Step 43 — Ops Agent: Version Management

## Goal

Enable the ops agent to check for new versions of deployed apps, assess update safety using semver, and apply updates according to configurable per-deployment policies. Includes automatic rollback if an update causes failures.

## Prerequisites

- Step 42 complete (health monitoring working — needed to verify post-update health)

## What to Build

### 1. Version Checker

`src/lib/ops-agent/version-checker.ts`:

- `checkImageVersion(image, currentTag)` — queries Docker Hub Registry API v2 for available tags
  - Endpoint: `https://registry.hub.docker.com/v2/repositories/{namespace}/{image}/tags?page_size=100&ordering=last_updated`
  - For official images: `https://registry.hub.docker.com/v2/repositories/library/{image}/tags`
  - Handle rate limiting (Docker Hub allows ~100 requests/6 hours for anonymous)
- `parseSemver(tag)` — lightweight semver parser (no heavy deps), handles common formats:
  - Standard: `1.2.3`, `v1.2.3`
  - Partial: `1.2`, `1`
  - With pre-release: `1.2.3-beta.1`
  - Non-semver tags (e.g., `latest`, `alpine`) — skip these
- `classifyUpdate(currentVersion, latestVersion)` — returns `"patch"`, `"minor"`, `"major"`, or `"unknown"`
- `findLatestStableVersion(tags, currentTag)` — filters out pre-release, RC, nightly tags. Finds the highest stable semver tag in the same major line (for safety).
- Rate limiting: check each deployment at most once per hour (tracked via `lastVersionCheckAt` on Deployment)

### 2. Update Policy

Per-deployment `updatePolicy` field (added in Step 40):

- `auto_patch` — auto-apply patch updates (1.2.3 → 1.2.4), notify after
- `auto_minor` — auto-apply patch + minor updates (1.2.3 → 1.3.0), notify after
- `notify_only` — never auto-update, just send notification about available updates
- `disabled` — don't check versions at all

### 3. Version Management Tools

Add to `src/lib/ops-agent/tools.ts`:

**`checkForUpdates(deploymentId)`**
- Looks up the recipe's Docker image + current tag
- Calls version checker
- Updates `latestAvailableVersion` + `lastVersionCheckAt` on deployment
- Returns: current version, latest version, update type, policy

**`applyUpdate(deploymentId, newVersion, reason)`**
- Stores current image tag as `previousImageTag` on deployment (for rollback)
- Triggers `initiateUpgrade()` with new image tag in config
- Records the action
- The next cycle's health check will verify the update succeeded

**`rollbackUpdate(deploymentId, reason)`**
- Reads `previousImageTag` from deployment
- Triggers `initiateUpgrade()` with the previous tag
- Clears `previousImageTag`
- Records the action and sends alert

### 4. Safe Update Flow

The agent follows this logic each cycle:

1. For each RUNNING deployment where `updatePolicy != "disabled"`:
   a. If `lastVersionCheckAt` is older than 1 hour (or null): call `checkForUpdates`
   b. If a newer version is available:
      - If deployment was just updated (has `previousImageTag` set) and is now FAILED → auto-rollback
      - If policy allows auto-update for this update type → `applyUpdate`
      - If policy is `notify_only` → `sendAlert` with update details
2. After applying an update, the deployment goes through DEPLOYING → RUNNING/FAILED
3. Next cycle: if FAILED with `previousImageTag` set → rollback

### 5. Recipe Image Metadata

Add to recipe types (`src/recipes/_base/types.ts`):

- `imageRegistry?: string` — defaults to Docker Hub. Future: support ghcr.io, quay.io
- `imageNamespace?: string` — e.g., `"louislam"` for `louislam/uptime-kuma`
- `imageRepository?: string` — e.g., `"uptime-kuma"`

Or simpler: extract these from the existing `image` field (e.g., `"louislam/uptime-kuma"` → namespace=`louislam`, repo=`uptime-kuma`).

### 6. System Prompt Update

Add version management guidance:
- Check for updates during each cycle (respect rate limits)
- Follow the deployment's update policy strictly
- When an update is available but policy is notify_only, always alert
- After applying an update, note it for next-cycle health verification
- If a recently updated app fails, rollback immediately

## Key Decisions

- Docker Hub API (anonymous, no auth needed for public images) — sufficient for MVP
- Semver parsing is custom/lightweight — avoid adding the `semver` npm package (it's large)
- `previousImageTag` on the Deployment model is the rollback mechanism — simple and effective
- Rate limit version checks to 1/hour per deployment to avoid Docker Hub throttling
- Non-semver tags (e.g., `latest`) are skipped — the checker only works with versioned tags

## Testing

1. Deploy an app with a known older version tag
2. Wait for ops cycle — verify it detects the available update
3. With `notify_only` policy: verify notification sent, no update applied
4. Change policy to `auto_patch`: verify the agent applies the update on next cycle
5. Simulate update failure: verify auto-rollback on next cycle
6. Verify rate limiting: version check not repeated within 1 hour

## Files Changed

- `src/lib/ops-agent/version-checker.ts` — Docker Hub API, semver parser
- `src/lib/ops-agent/tools.ts` — version management tools
- `src/lib/ops-agent/loop.ts` — include version state in gathered context
- `src/lib/ops-agent/system-prompt.ts` — version management guidance
- `src/recipes/_base/types.ts` — optional image metadata fields
