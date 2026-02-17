/**
 * Port Forward Manager — kubectl port-forward Child Process Management
 *
 * Manages kubectl port-forward child processes for local access to
 * apps running in the kind cluster. Each port-forward is tracked by
 * deployment ID and automatically restarted if it dies.
 *
 * Only active for local/self-hosted mode (kind clusters).
 */

import { spawn } from "node:child_process";

import type { ChildProcess } from "node:child_process";

// ─── Types ────────────────────────────────────────────────

interface PortForwardProcess {
  deploymentId: string;
  process: ChildProcess;
  namespace: string;
  serviceName: string;
  servicePort: number;
  localPort: number;
  startedAt: Date;
}

// ─── State ────────────────────────────────────────────────

/** Map of deploymentId → port-forward child process */
const activeForwards = new Map<string, PortForwardProcess>();

// ─── Public API ───────────────────────────────────────────

/**
 * Start a port-forward for a deployment.
 * Spawns `kubectl port-forward` as a detached child process.
 */
export async function startPortForward(params: {
  deploymentId: string;
  namespace: string;
  serviceName: string;
  servicePort: number;
  localPort: number;
}): Promise<{ pid: number; url: string }> {
  const { deploymentId, namespace, serviceName, servicePort, localPort } = params;

  // Stop existing forward if any
  if (activeForwards.has(deploymentId)) {
    await stopPortForward(deploymentId);
  }

  const args = [
    "port-forward",
    `svc/${serviceName}`,
    `${localPort}:${servicePort}`,
    "-n",
    namespace,
    "--address",
    "0.0.0.0",
  ];

  const child = spawn("kubectl", args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  const entry: PortForwardProcess = {
    deploymentId,
    process: child,
    namespace,
    serviceName,
    servicePort,
    localPort,
    startedAt: new Date(),
  };

  activeForwards.set(deploymentId, entry);

  // Log stdout (connection info)
  child.stdout?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) {
      console.log(`[port-forward] ${serviceName}:${localPort} — ${msg}`);
    }
  });

  // Log stderr (errors)
  child.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) {
      console.warn(`[port-forward] ${serviceName}:${localPort} stderr — ${msg}`);
    }
  });

  // Handle process exit
  child.on("exit", (code, signal) => {
    activeForwards.delete(deploymentId);
    if (code !== 0 && code !== null) {
      console.warn(
        `[port-forward] ${serviceName}:${localPort} exited with code ${code} (signal: ${signal})`
      );
    }
  });

  child.on("error", (err) => {
    activeForwards.delete(deploymentId);
    console.error(`[port-forward] ${serviceName}:${localPort} error:`, err.message);
  });

  // Brief delay to let kubectl connect before declaring success
  await sleep(1000);

  // Verify the process is still running
  if (child.exitCode !== null) {
    activeForwards.delete(deploymentId);
    throw new Error(
      `[port-forward] kubectl port-forward exited immediately (code: ${child.exitCode})`
    );
  }

  const url = `http://localhost:${localPort}`;
  const pid = child.pid ?? 0;
  console.log(
    `[port-forward] Started: ${serviceName} → localhost:${localPort} (pid: ${pid})`
  );

  return { pid, url };
}

/**
 * Stop a port-forward for a deployment.
 */
export async function stopPortForward(deploymentId: string): Promise<void> {
  const entry = activeForwards.get(deploymentId);
  if (!entry) return;

  try {
    entry.process.kill("SIGTERM");
  } catch {
    // Process may have already exited
  }

  activeForwards.delete(deploymentId);
  console.log(
    `[port-forward] Stopped: ${entry.serviceName} (port ${entry.localPort})`
  );
}

/**
 * Check if a port-forward is active for a deployment.
 */
export function isPortForwardActive(deploymentId: string): boolean {
  const entry = activeForwards.get(deploymentId);
  if (!entry) return false;

  // Check if the process is still alive
  return entry.process.exitCode === null;
}

/**
 * Stop all active port-forwards (used during shutdown).
 */
export async function stopAllPortForwards(): Promise<void> {
  const ids = Array.from(activeForwards.keys());
  for (const id of ids) {
    await stopPortForward(id);
  }
  console.log(`[port-forward] Stopped all ${ids.length} port-forwards`);
}

/**
 * Get info about all active port-forwards.
 */
export function getActivePortForwards(): Array<{
  deploymentId: string;
  localPort: number;
  servicePort: number;
  serviceName: string;
  namespace: string;
  startedAt: Date;
}> {
  return Array.from(activeForwards.values())
    .filter((entry) => entry.process.exitCode === null)
    .map((entry) => ({
      deploymentId: entry.deploymentId,
      localPort: entry.localPort,
      servicePort: entry.servicePort,
      serviceName: entry.serviceName,
      namespace: entry.namespace,
      startedAt: entry.startedAt,
    }));
}

/**
 * Restart dead port-forwards for all tracked deployments.
 * Returns the number of port-forwards that were restarted.
 */
export async function restartDeadPortForwards(
  getDeploymentInfo: (deploymentId: string) => Promise<{
    namespace: string;
    serviceName: string;
    servicePort: number;
    localPort: number;
  } | null>
): Promise<number> {
  let restarted = 0;

  for (const [deploymentId, entry] of activeForwards) {
    if (entry.process.exitCode !== null) {
      // Process died — try to restart
      console.log(
        `[port-forward] Detected dead forward for ${entry.serviceName}:${entry.localPort}, restarting...`
      );

      const info = await getDeploymentInfo(deploymentId);
      if (info) {
        try {
          await startPortForward({
            deploymentId,
            ...info,
          });
          restarted++;
        } catch (err) {
          console.error(
            `[port-forward] Failed to restart forward for ${deploymentId}:`,
            err
          );
        }
      } else {
        // Deployment no longer exists — clean up
        activeForwards.delete(deploymentId);
      }
    }
  }

  return restarted;
}

// ─── Helpers ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
