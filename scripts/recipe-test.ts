#!/usr/bin/env tsx
/**
 * Recipe Smoke Test — Autonomous recipe verification
 *
 * Deploys a recipe, waits for readiness, verifies health,
 * and reports structured diagnostics on failure.
 *
 * Usage (local/Docker):
 *   yarn recipe:test <slug> [--fresh] [--cleanup] [--timeout 300] [--verbose]
 *   docker compose -f docker-compose.local.yml exec web yarn recipe:test <slug>
 *
 * Usage (remote cluster):
 *   yarn recipe:test:remote <slug> [--fresh] [--cleanup]
 *   (wrapper handles port-forwards + env vars)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";

// Docker-to-host K8s connectivity: use the rewritten kubeconfig if available
if (fs.existsSync("/tmp/kube/config")) {
  process.env.KUBECONFIG = "/tmp/kube/config";
}

// ─── ANSI Colors ─────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

// ─── CLI Args ────────────────────────────────────────────

interface CliOptions {
  slug: string;
  fresh: boolean;
  cleanup: boolean;
  timeout: number;
  verbose: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));

  const slug = positional[0];
  if (!slug) {
    console.error(`${RED}Usage: yarn recipe:test <slug> [--fresh] [--cleanup] [--timeout <s>] [--verbose]${RESET}`);
    console.error(`${DIM}  --fresh     Remove existing deployment before testing`);
    console.error(`  --cleanup   Remove deployment after successful test`);
    console.error(`  --timeout   Readiness timeout in seconds (default: 300)`);
    console.error(`  --verbose   Show pod logs even on success${RESET}`);
    process.exit(1);
  }

  let timeout = 300;
  const timeoutIdx = args.indexOf("--timeout");
  if (timeoutIdx !== -1 && args[timeoutIdx + 1]) {
    timeout = parseInt(args[timeoutIdx + 1]!, 10) || 300;
  }

  return {
    slug,
    fresh: flags.has("--fresh"),
    cleanup: flags.has("--cleanup"),
    timeout,
    verbose: flags.has("--verbose"),
  };
}

// ─── Output Helpers ──────────────────────────────────────

function step(num: number, total: number, label: string): void {
  process.stdout.write(`[${num}/${total}] ${label}`);
}

function stepOk(detail?: string): void {
  console.log(` ${GREEN}OK${RESET}${detail ? ` ${DIM}(${detail})${RESET}` : ""}`);
}

function stepFail(detail?: string): void {
  console.log(` ${RED}FAILED${RESET}${detail ? ` ${DIM}(${detail})${RESET}` : ""}`);
}

function stepSkip(detail?: string): void {
  console.log(` ${YELLOW}SKIP${RESET}${detail ? ` ${DIM}(${detail})${RESET}` : ""}`);
}

function heading(text: string): void {
  console.log(`\n${BOLD}${text}${RESET}`);
  console.log("─".repeat(50));
}

function indent(text: string, prefix = "  "): void {
  for (const line of text.split("\n")) {
    console.log(`${prefix}${line}`);
  }
}

// ─── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs();
  const startTime = Date.now();
  const isRemote = process.env.MATHISON_REMOTE === "1";

  // Dynamic imports — these depend on env vars being loaded
  const { prisma } = await import("@/lib/db");
  const { initiateDeployment, initiateRemoval } = await import("@/lib/deployer/engine");
  const {
    getReleasePodStatus,
    getReleaseLogs,
    getReleasePreviousLogs,
    getReleaseEvents,
    getDetailedPodDiagnostics,
    listPods,
  } = await import("@/lib/cluster/kubernetes");
  const k8s = await import("@kubernetes/client-node");
  const { hasRecipe, requireRecipeDefinition } = await import("@/recipes/registry");
  const { deploymentQueue } = await import("@/lib/queue/queues");

  async function shutdown(code: number): Promise<never> {
    try {
      await deploymentQueue.close();
    } catch { /* ignore */ }
    try {
      await prisma.$disconnect();
    } catch { /* ignore */ }
    process.exit(code);
  }

  heading(`Recipe Test: ${opts.slug}`);

  const TOTAL_STEPS = 5;

  // ── Step 1: Load recipe ──────────────────────────────

  step(1, TOTAL_STEPS, "Loading recipe...");

  if (!hasRecipe(opts.slug)) {
    stepFail(`recipe '${opts.slug}' not found in registry`);
    console.log(`\n${DIM}Available recipes:`);
    const { listRecipeSlugs } = await import("@/recipes/registry");
    console.log(`  ${listRecipeSlugs().join(", ")}${RESET}`);
    return shutdown(1);
  }

  const recipe = requireRecipeDefinition(opts.slug);
  stepOk(`${recipe.displayName}`);

  // ── Look up test user & workspace ────────────────────

  let user = await prisma.user.findFirst({
    where: { email: "admin@mathison.dev" },
    select: { id: true, email: true, tenantId: true, activeWorkspaceId: true },
  });

  // Fall back to any user with a tenant
  if (!user?.tenantId) {
    user = await prisma.user.findFirst({
      where: { tenantId: { not: undefined } },
      select: { id: true, email: true, tenantId: true, activeWorkspaceId: true },
    });
  }

  if (!user?.tenantId) {
    console.error(`\n${RED}No user with a tenant found. Run: npx prisma db seed${RESET}`);
    return shutdown(1);
  }

  console.log(`${DIM}  User: ${user.email}${RESET}`);

  const workspace = await prisma.workspace.findFirst({
    where: {
      tenantId: user.tenantId,
      ...(user.activeWorkspaceId ? { id: user.activeWorkspaceId } : {}),
      status: "ACTIVE",
    },
    select: { id: true, slug: true, namespace: true },
  });

  if (!workspace) {
    console.error(`\n${RED}No active workspace found for test user.${RESET}`);
    return shutdown(1);
  }

  const tenantId = user.tenantId;
  const workspaceId = workspace.id;

  console.log(`${DIM}  Workspace: ${workspace.slug} (ns: ${workspace.namespace})${RESET}`);

  // ── Ensure recipe exists in DB ───────────────────────

  const dbRecipe = await prisma.recipe.findUnique({ where: { slug: opts.slug } });
  if (!dbRecipe) {
    console.log(`${DIM}  Recipe not in DB — creating stub record...${RESET}`);
    await prisma.recipe.create({ data: { slug: opts.slug } });
  }

  // ── Step 2: Deploy ───────────────────────────────────

  step(2, TOTAL_STEPS, "Deploying...");

  // Handle --fresh: remove existing deployment first
  if (opts.fresh) {
    const existing = await prisma.deployment.findUnique({
      where: { workspaceId_name: { workspaceId, name: opts.slug } },
      select: { id: true, dependsOn: true, status: true },
    });

    if (existing) {
      process.stdout.write(` ${YELLOW}removing existing...${RESET}`);

      // Remove main deployment
      if (existing.status !== "DELETING" && existing.status !== "STOPPED") {
        try {
          await initiateRemoval({ tenantId, deploymentId: existing.id });
        } catch (err) {
          // If removal fails (e.g., dependents), force-delete the DB record
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("depend on it")) {
            // Remove dependents first, then main
            const dependents = await prisma.deployment.findMany({
              where: { workspaceId, dependsOn: { has: existing.id } },
              select: { id: true, name: true },
            });
            for (const dep of dependents) {
              try {
                await initiateRemoval({ tenantId, deploymentId: dep.id });
              } catch { /* force-clean below */ }
            }
            // Wait briefly for worker to pick up removal jobs
            await sleep(3000);
            try {
              await initiateRemoval({ tenantId, deploymentId: existing.id });
            } catch { /* force-clean below */ }
          }
        }
      }

      // Wait for removal to complete (DB record deleted by worker)
      const removalDeadline = Date.now() + 60_000;
      while (Date.now() < removalDeadline) {
        const check = await prisma.deployment.findUnique({
          where: { id: existing.id },
          select: { id: true },
        });
        if (!check) break;
        await sleep(2000);
      }

      // Wait for PVCs to be fully deleted (K8s finalizers can delay this)
      await waitForPvcDeletion(workspace.namespace, opts.slug, k8s);

      // Force-clean any remaining dependency deployments
      if (existing.dependsOn.length > 0) {
        for (const depId of existing.dependsOn) {
          const dep = await prisma.deployment.findUnique({
            where: { id: depId },
            select: { id: true, status: true },
          });
          if (dep && dep.status !== "DELETING") {
            try {
              await initiateRemoval({ tenantId, deploymentId: depId });
            } catch { /* best effort */ }
          }
        }
        // Wait for dependency removal
        const depDeadline = Date.now() + 60_000;
        while (Date.now() < depDeadline) {
          const remaining = await prisma.deployment.count({
            where: { id: { in: existing.dependsOn } },
          });
          if (remaining === 0) break;
          await sleep(2000);
        }
      }

      process.stdout.write(`\r[2/${TOTAL_STEPS}] Deploying...`);
    }
  }

  // Check for existing (non-fresh) deployment
  const alreadyExists = await prisma.deployment.findUnique({
    where: { workspaceId_name: { workspaceId, name: opts.slug } },
    select: { id: true, status: true },
  });

  if (alreadyExists) {
    stepFail(`deployment '${opts.slug}' already exists (status: ${alreadyExists.status}). Use --fresh to replace.`);
    return shutdown(1);
  }

  let deploymentId: string;
  let dependencyIds: string[] = [];
  try {
    const result = await initiateDeployment({
      tenantId,
      workspaceId,
      recipeSlug: opts.slug,
    });
    deploymentId = result.deploymentId;
    dependencyIds = result.dependencyIds ?? [];

    const depInfo = dependencyIds.length > 0
      ? `+ ${dependencyIds.length} deps`
      : "no deps";
    stepOk(`ns: ${workspace.namespace}, ${depInfo}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stepFail(msg);
    return shutdown(1);
  }

  // Show dependency names
  if (dependencyIds.length > 0) {
    const deps = await prisma.deployment.findMany({
      where: { id: { in: dependencyIds } },
      select: { name: true, id: true },
    });
    console.log(`${DIM}  Dependencies: ${deps.map((d) => d.name).join(", ")}${RESET}`);
  }

  // ── Step 3: Wait for pods ────────────────────────────

  step(3, TOTAL_STEPS, "Waiting for pods...");

  const allDeploymentIds = [deploymentId!, ...dependencyIds];
  const deadline = Date.now() + opts.timeout * 1000;
  let lastStatus = "";
  let workerStallCount = 0;
  let allRunning = false;
  let failedDeployment: { id: string; name: string; status: string } | null = null;

  while (Date.now() < deadline) {
    const deployments = await prisma.deployment.findMany({
      where: { id: { in: allDeploymentIds } },
      select: { id: true, name: true, status: true, errorMessage: true },
    });

    const statuses = deployments.map((d) => `${d.name}:${d.status}`).join(", ");

    if (statuses !== lastStatus) {
      if (lastStatus) {
        // Clear previous status line and reprint step
        process.stdout.write(`\r[3/${TOTAL_STEPS}] Waiting for pods...`);
      }
      process.stdout.write(` ${DIM}[${statuses}]${RESET}`);
      lastStatus = statuses;
      workerStallCount = 0;
    } else {
      workerStallCount++;
    }

    // Check if all are RUNNING
    if (deployments.every((d) => d.status === "RUNNING")) {
      allRunning = true;
      break;
    }

    // Check if any FAILED
    const failed = deployments.find((d) => d.status === "FAILED");
    if (failed) {
      failedDeployment = failed;
      break;
    }

    // Detect stalled worker (PENDING for too long)
    const pendingOnly = deployments.every((d) => d.status === "PENDING");
    if (pendingOnly && workerStallCount > 10) {
      console.log();
      console.error(`\n${RED}Worker appears stalled — deployments stuck in PENDING for >30s.`);
      if (isRemote) {
        console.error(`Check the remote worker: kubectl -n ${process.env.MATHISON_NAMESPACE ?? "mathison"} logs deployment/${process.env.MATHISON_RELEASE ?? "mathison"}-worker --tail=20${RESET}`);
      } else {
        console.error(`Check the worker is running: docker compose -f docker-compose.local.yml logs worker --tail=10${RESET}`);
      }
      return shutdown(1);
    }

    await sleep(3000);
  }

  if (allRunning) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r[3/${TOTAL_STEPS}] Waiting for pods...`);

    // Get pod info for display
    const { pods } = await getReleasePodStatus(workspace.namespace, opts.slug);
    const depPods = [];
    for (const depId of dependencyIds) {
      const dep = await prisma.deployment.findUnique({
        where: { id: depId },
        select: { name: true },
      });
      if (dep) {
        const { pods: dp } = await getReleasePodStatus(workspace.namespace, dep.name);
        depPods.push(...dp);
      }
    }
    const allPods = [...pods, ...depPods];

    stepOk(`${allPods.length} pods running, ${elapsed}s`);

    for (const pod of allPods) {
      const readyStr = pod.ready ? `${GREEN}1/1${RESET}` : `${RED}0/1${RESET}`;
      console.log(`${DIM}  ${pod.name.padEnd(45)} ${readyStr} ${pod.status.padEnd(12)} ${pod.restarts} restarts${RESET}`);
    }
  } else if (failedDeployment) {
    stepFail(`${failedDeployment.name} → ${failedDeployment.status}`);
  } else {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    stepFail(`timeout after ${elapsed}s`);
  }

  // ── Diagnostics on failure ───────────────────────────

  if (!allRunning) {
    heading("Diagnostic Report");
    await printDiagnostics(workspace.namespace, opts.slug, {
      getDetailedPodDiagnostics,
      getReleaseEvents,
      getReleaseLogs,
      getReleasePreviousLogs,
    });

    // Also show dependency diagnostics if they failed
    for (const depId of dependencyIds) {
      const dep = await prisma.deployment.findUnique({
        where: { id: depId },
        select: { name: true, status: true },
      });
      if (dep && dep.status !== "RUNNING") {
        heading(`Dependency: ${dep.name}`);
        await printDiagnostics(workspace.namespace, dep.name, {
          getDetailedPodDiagnostics,
          getReleaseEvents,
          getReleaseLogs,
          getReleasePreviousLogs,
        });
      }
    }

    console.log("\n" + "─".repeat(50));
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`${RED}${BOLD}FAILED${RESET} ${DIM}(${elapsed}s)${RESET}\n`);
    return shutdown(1);
  }

  // ── Step 4: Health check ─────────────────────────────

  step(4, TOTAL_STEPS, "Health check...");

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId! },
    select: { url: true, localPort: true },
  });

  const healthSpec = recipe.healthCheck({ config: recipe.configSchema.parse({}), name: opts.slug, namespace: workspace.namespace });
  let healthPassed = false;
  const hasIngressUrl = deployment?.url && !deployment.url.includes("localhost");

  if (healthSpec.type === "http") {
    let checkUrl: string;
    let displayHost: string;

    if (hasIngressUrl) {
      checkUrl = `${deployment.url}${healthSpec.path || "/"}`;
      displayHost = deployment.url!;
    } else {
      const port = deployment?.localPort ?? healthSpec.port;
      checkUrl = `http://localhost:${port}${healthSpec.path || "/"}`;
      displayHost = `localhost:${port}`;
    }

    try {
      const res = await fetch(checkUrl, { signal: AbortSignal.timeout(15_000) });
      healthPassed = res.status < 400;
      if (healthPassed) {
        stepOk(`HTTP ${res.status} on ${displayHost}`);
      } else {
        stepFail(`HTTP ${res.status} on ${displayHost}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (hasIngressUrl) {
        stepFail(`ingress unreachable: ${msg.slice(0, 80)}`);
        healthPassed = false;
      } else {
        stepSkip(`HTTP check unreachable: ${msg.slice(0, 80)}`);
        healthPassed = true;
      }
    }
  } else if (healthSpec.type === "tcp") {
    stepSkip("TCP health check (pods already verified running)");
    healthPassed = true;
  } else {
    stepSkip(`${healthSpec.type} health check not automated`);
    healthPassed = true;
  }

  // ── Step 5: Web UI check ─────────────────────────────

  step(5, TOTAL_STEPS, "Web UI check...");

  if (recipe.hasWebUI) {
    if (hasIngressUrl) {
      try {
        const res = await fetch(deployment!.url!, {
          signal: AbortSignal.timeout(15_000),
          redirect: "follow",
        });
        if (res.status < 400) {
          stepOk(`HTTP ${res.status} on ${deployment!.url}`);
        } else {
          stepFail(`HTTP ${res.status} on ${deployment!.url}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stepFail(`ingress unreachable: ${msg.slice(0, 60)}`);
      }
    } else {
      const port = deployment?.localPort;
      if (port) {
        try {
          const res = await fetch(`http://localhost:${port}/`, {
            signal: AbortSignal.timeout(10_000),
            redirect: "follow",
          });
          if (res.status < 400) {
            stepOk(`HTTP ${res.status} on localhost:${port}`);
          } else {
            stepFail(`HTTP ${res.status} on localhost:${port}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stepSkip(`port-forward unreachable from this container: ${msg.slice(0, 60)}`);
        }
      } else {
        stepSkip("no port-forward or ingress URL");
      }
    }
  } else {
    stepSkip("no web UI");
  }

  // ── Verbose: show logs even on success ───────────────

  if (opts.verbose) {
    heading("Logs (verbose mode)");
    const logs = await getReleaseLogs(workspace.namespace, opts.slug, 40);
    indent(logs);
  }

  // ── Result ───────────────────────────────────────────

  console.log("\n" + "─".repeat(50));
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`${GREEN}${BOLD}PASSED${RESET} ${DIM}(${elapsed}s)${RESET}\n`);

  // ── Cleanup ──────────────────────────────────────────

  if (opts.cleanup) {
    console.log(`${DIM}Cleaning up...${RESET}`);
    try {
      await initiateRemoval({ tenantId, deploymentId: deploymentId! });
      // Wait for removal
      const cleanupDeadline = Date.now() + 60_000;
      while (Date.now() < cleanupDeadline) {
        const check = await prisma.deployment.findUnique({
          where: { id: deploymentId! },
          select: { id: true },
        });
        if (!check) break;
        await sleep(2000);
      }
      // Remove dependencies
      for (const depId of dependencyIds) {
        try {
          await initiateRemoval({ tenantId, deploymentId: depId });
        } catch { /* deps may already be gone */ }
      }
      console.log(`${GREEN}Cleanup complete.${RESET}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${YELLOW}Cleanup warning: ${msg}${RESET}`);
    }
  }

  await shutdown(0);
}

// ─── Diagnostics Printer ─────────────────────────────────

interface DiagFunctions {
  getDetailedPodDiagnostics: typeof import("@/lib/cluster/kubernetes").getDetailedPodDiagnostics;
  getReleaseEvents: typeof import("@/lib/cluster/kubernetes").getReleaseEvents;
  getReleaseLogs: typeof import("@/lib/cluster/kubernetes").getReleaseLogs;
  getReleasePreviousLogs: typeof import("@/lib/cluster/kubernetes").getReleasePreviousLogs;
}

async function printDiagnostics(
  namespace: string,
  instanceName: string,
  fns: DiagFunctions
): Promise<void> {
  const [pods, events, logs, prevLogs] = await Promise.all([
    fns.getDetailedPodDiagnostics(namespace, instanceName),
    fns.getReleaseEvents(namespace, instanceName),
    fns.getReleaseLogs(namespace, instanceName, 40),
    fns.getReleasePreviousLogs(namespace, instanceName, 40),
  ]);

  if (pods.length === 0) {
    console.log(`${YELLOW}  No pods found for '${instanceName}'${RESET}`);
    return;
  }

  // Pod status
  for (const pod of pods) {
    console.log(`\n${CYAN}Pod: ${pod.name}${RESET}`);
    console.log(`  Phase: ${pod.phase} | Ready: ${pod.ready} | Restarts: ${pod.restarts} | Age: ${pod.age}`);

    for (const c of pod.containers) {
      let line = `  Container ${c.name}: ${c.state}`;
      if (c.stateReason) line += ` (${c.stateReason})`;
      if (c.stateMessage) line += ` — ${c.stateMessage}`;
      if (c.exitCode !== undefined) line += ` [exit: ${c.exitCode}]`;
      if (c.restartCount > 0) line += ` [${c.restartCount} restarts]`;
      console.log(line);

      if (c.lastState) {
        let lastLine = `    Last: ${c.lastState.state}`;
        if (c.lastState.reason) lastLine += ` (${c.lastState.reason})`;
        if (c.lastState.exitCode !== undefined) lastLine += ` [exit: ${c.lastState.exitCode}]`;
        console.log(`${DIM}${lastLine}${RESET}`);
      }
    }

    for (const c of pod.initContainers) {
      let line = `  Init ${c.name}: ${c.state}`;
      if (c.stateReason) line += ` (${c.stateReason})`;
      console.log(line);
    }
  }

  // K8s events
  if (events.length > 0) {
    console.log(`\n${CYAN}K8s Events (last ${Math.min(events.length, 10)}):${RESET}`);
    for (const e of events.slice(0, 10)) {
      const prefix = e.type === "Warning" ? RED : DIM;
      console.log(`${prefix}  [${e.type}] ${e.reason}: ${e.message} (x${e.count})${RESET}`);
    }
  }

  // Current logs
  if (logs && !logs.startsWith("(no") && !logs.startsWith("No pods")) {
    console.log(`\n${CYAN}Logs (last 40 lines):${RESET}`);
    indent(logs);
  }

  // Previous container logs
  if (prevLogs && !prevLogs.startsWith("(no")) {
    console.log(`\n${CYAN}Previous Container Logs:${RESET}`);
    indent(prevLogs);
  }
}

// ─── PVC Cleanup ─────────────────────────────────────────

async function waitForPvcDeletion(
  namespace: string,
  instanceName: string,
  k8sModule: typeof import("@kubernetes/client-node"),
  timeoutMs = 30_000,
): Promise<void> {
  const kc = new k8sModule.KubeConfig();
  try { kc.loadFromDefault(); } catch { kc.loadFromCluster(); }
  const api = kc.makeApiClient(k8sModule.CoreV1Api);

  const pvcNames = [`${instanceName}-data`];
  const deadline = Date.now() + timeoutMs;

  for (const pvcName of pvcNames) {
    while (Date.now() < deadline) {
      try {
        await api.readNamespacedPersistentVolumeClaim({ name: pvcName, namespace });
        // PVC still exists — try to force delete it
        try {
          await api.deleteNamespacedPersistentVolumeClaim({ name: pvcName, namespace });
        } catch { /* may already be deleting */ }
        await sleep(2000);
      } catch {
        break; // PVC gone (404)
      }
    }
  }
}

// ─── Utilities ───────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Entry Point ─────────────────────────────────────────

main().catch((err: Error) => {
  console.error(`\n${RED}Fatal error: ${err.message}${RESET}`);
  if (err.stack) {
    console.error(`${DIM}${err.stack}${RESET}`);
  }
  process.exit(1);
});
