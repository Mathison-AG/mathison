/**
 * Mathison BullMQ Worker — Main Logic (V2)
 *
 * Separate process that consumes deployment jobs from the queue.
 * Uses Server-Side Apply to manage K8s resources instead of Helm.
 * Monitors pod readiness and manages port-forwarding for local access.
 *
 * Imported dynamically by index.ts AFTER env vars are loaded.
 */

import http from "http";
import net from "net";

import { Worker, Job } from "bullmq";
import { connection } from "../src/lib/queue/connection";
import { JOB_NAMES } from "../src/lib/queue/jobs";
import { applyResources, deleteResources } from "../src/recipes/_base/apply";
import { deleteStatefulSetPVCs } from "../src/lib/cluster/kubernetes";
import { waitForReady } from "../src/lib/cluster/kubernetes";
import { assignPort } from "../src/lib/cluster/port-manager";
import {
  startPortForward,
  stopPortForward,
  stopAllPortForwards,
  isPortForwardActive,
} from "../src/lib/cluster/port-forward";
import { prisma } from "../src/lib/db";
import {
  recordStatusChanged,
  recordHealthChanged,
  recordFailed,
} from "../src/lib/deployer/events";

import type {
  DeployJobData,
  UndeployJobData,
  UpgradeJobData,
  HealthCheckJobData,
} from "../src/lib/queue/jobs";
import type { KubernetesResource } from "../src/recipes/_base/types";

// ─── Resource helpers ─────────────────────────────────────

/**
 * Deserialize K8s resources from JSON string.
 */
function parseResources(json: string): KubernetesResource[] {
  return JSON.parse(json) as KubernetesResource[];
}

/**
 * Extract the pod label selector from the first Deployment or StatefulSet.
 * Returns a comma-separated label selector string for K8s API.
 */
function extractPodSelector(resources: KubernetesResource[]): string | null {
  for (const resource of resources) {
    if (resource.kind === "Deployment" || resource.kind === "StatefulSet") {
      const spec = resource as {
        spec?: {
          selector?: {
            matchLabels?: Record<string, string>;
          };
        };
      };

      const labels = spec.spec?.selector?.matchLabels;
      if (labels) {
        return Object.entries(labels)
          .map(([k, v]) => `${k}=${v}`)
          .join(",");
      }
    }
  }
  return null;
}

/**
 * Extract StatefulSet names and their volumeClaimTemplate names.
 * Used during undeploy to clean up PVCs that K8s doesn't auto-delete.
 */
function extractStatefulSetPVCInfo(
  resources: KubernetesResource[]
): Array<{ name: string; namespace: string; vctNames: string[] }> {
  const results: Array<{ name: string; namespace: string; vctNames: string[] }> = [];

  for (const resource of resources) {
    if (resource.kind === "StatefulSet") {
      const name = resource.metadata?.name;
      const ns = resource.metadata?.namespace ?? "";
      const spec = resource as {
        spec?: {
          volumeClaimTemplates?: Array<{
            metadata?: { name?: string };
          }>;
        };
      };

      const vctNames = (spec.spec?.volumeClaimTemplates ?? [])
        .map((vct) => vct.metadata?.name)
        .filter((n): n is string => !!n);

      if (name) {
        results.push({
          name,
          namespace: ns,
          vctNames: vctNames.length > 0 ? vctNames : ["data"],
        });
      }
    }
  }

  return results;
}

/**
 * Extract the primary service info (name + port) from the resource list.
 * Skips headless services (clusterIP: None).
 */
function extractServiceInfo(
  resources: KubernetesResource[]
): { serviceName: string; servicePort: number } | null {
  for (const resource of resources) {
    if (resource.kind === "Service") {
      const name = resource.metadata?.name;
      const spec = (resource as {
        spec?: {
          clusterIP?: string;
          ports?: Array<{ port?: number }>;
        };
      }).spec;

      // Skip headless services
      if (spec?.clusterIP === "None") continue;

      const port = spec?.ports?.[0]?.port;
      if (name && port) {
        return { serviceName: name, servicePort: port };
      }
    }
  }
  return null;
}

// ─── Configuration ─────────────────────────────────────────

const ingressEnabled = process.env.INGRESS_ENABLED === "true";

// ─── Service discovery ────────────────────────────────────

/**
 * Discover the primary K8s service from built resources and set up port-forwarding.
 * In production (ingress enabled), skips port-forwarding — URL is set by the engine.
 */
async function setupPortForward(
  deploymentId: string,
  namespace: string,
  resources: KubernetesResource[]
): Promise<string | null> {
  // Production mode: ingress handles routing, no port-forward needed.
  // The access URL is pre-computed by the engine and stored on the Deployment.
  if (ingressEnabled) {
    const svcInfo = extractServiceInfo(resources);
    if (svcInfo) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          serviceName: svcInfo.serviceName,
          servicePort: svcInfo.servicePort,
        },
      });
    }
    const dep = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { url: true },
    });
    return dep?.url ?? null;
  }

  try {
    const svcInfo = extractServiceInfo(resources);
    if (!svcInfo) {
      console.warn(`[worker] No service found in resources for deployment ${deploymentId}`);
      return null;
    }

    // Assign a local port
    const localPort = await assignPort(deploymentId);

    // Store service info on the deployment
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        serviceName: svcInfo.serviceName,
        servicePort: svcInfo.servicePort,
      },
    });

    // Start port-forward
    const { url } = await startPortForward({
      deploymentId,
      namespace,
      serviceName: svcInfo.serviceName,
      servicePort: svcInfo.servicePort,
      localPort,
    });

    return url;
  } catch (err) {
    console.error(
      `[worker] Failed to setup port-forward for ${deploymentId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─── Job handlers ─────────────────────────────────────────

async function handleDeploy(job: Job<DeployJobData>): Promise<void> {
  const { deploymentId, recipeSlug, namespace, resources: resourcesJson } = job.data;

  console.log(`[worker] Deploy: ${recipeSlug} → ${namespace}`);

  // Check if deployment record still exists
  const exists = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true },
  });
  if (!exists) {
    console.warn(`[worker] Deploy skipped: deployment ${deploymentId} no longer exists in DB`);
    return;
  }

  try {
    // 1. Update status → DEPLOYING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DEPLOYING", errorMessage: null },
    });
    await job.updateProgress(10);

    // 2. Parse resources
    const resources = parseResources(resourcesJson);
    await job.updateProgress(20);

    // 3. Apply resources via Server-Side Apply
    const results = await applyResources(resources);
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      const errorMsg = errors.map((e) => `${e.resource}: ${e.error}`).join("; ");
      throw new Error(`Failed to apply resources: ${errorMsg}`);
    }

    console.log(`[worker] SSA applied ${results.length} resources for ${recipeSlug}`);
    await job.updateProgress(60);

    // 4. Wait for pods to be ready
    const podSelector = extractPodSelector(resources);
    let ready = false;
    let pods: Array<{ name: string; status: string }> = [];

    if (podSelector) {
      const result = await waitForReady(namespace, podSelector, 180);
      ready = result.ready;
      pods = result.pods;
    } else {
      console.warn(`[worker] No pod selector found — skipping readiness wait`);
      ready = true;
    }

    await job.updateProgress(90);

    if (ready) {
      // 5. Set up port-forwarding for local access
      const portForwardUrl = await setupPortForward(deploymentId, namespace, resources);

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "RUNNING",
          url: portForwardUrl,
          errorMessage: null,
        },
      });

      recordStatusChanged({
        deploymentId,
        previousStatus: "DEPLOYING",
        newStatus: "RUNNING",
        reason: "Deployment completed successfully",
      });

      console.log(`[worker] Deploy SUCCESS: ${recipeSlug} is RUNNING`);
    } else {
      const podStatuses = pods.map((p) => `${p.name}: ${p.status}`).join(", ");
      const failMsg = `Service deployed but not yet healthy: ${podStatuses}`;
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: failMsg,
        },
      });

      recordFailed({ deploymentId, error: failMsg });

      console.warn(`[worker] Deploy PARTIAL: ${recipeSlug} applied but pods not ready`);
    }

    await job.updateProgress(100);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Deploy FAILED: ${recipeSlug}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000),
      },
    });

    recordFailed({ deploymentId, error: errorMessage.slice(0, 1000) });

    throw err;
  }
}

async function handleUndeploy(job: Job<UndeployJobData>): Promise<void> {
  const { deploymentId, namespace, resources: resourcesJson } = job.data;

  console.log(`[worker] Undeploy: deployment ${deploymentId} from ${namespace}`);

  // Stop port-forward before anything else (no-op in production mode)
  if (!ingressEnabled) {
    await stopPortForward(deploymentId);
  }

  // Check if deployment record still exists
  const exists = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true },
  });
  if (!exists) {
    console.warn(
      `[worker] Undeploy: deployment ${deploymentId} already gone from DB — attempting resource cleanup only`
    );
    try {
      const resources = parseResources(resourcesJson);
      await deleteResources(resources);
      // Also clean up StatefulSet PVCs
      const stsInfo = extractStatefulSetPVCInfo(resources);
      for (const sts of stsInfo) {
        await deleteStatefulSetPVCs(
          sts.namespace || namespace,
          sts.name,
          sts.vctNames
        );
      }
    } catch {
      // Ignore — resources may not exist either
    }
    return;
  }

  try {
    // 1. Update status → DELETING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DELETING" },
    });
    await job.updateProgress(10);

    // 2. Delete K8s resources
    const resources = parseResources(resourcesJson);
    const results = await deleteResources(resources);

    const deleted = results.filter((r) => r.deleted).length;
    console.log(`[worker] Deleted ${deleted}/${results.length} K8s resources`);
    await job.updateProgress(50);

    // 3. Clean up PVCs from StatefulSet volumeClaimTemplates
    //    K8s does NOT auto-delete these when the StatefulSet is removed.
    //    Stale PVCs cause credential mismatches on redeployment.
    const stsInfo = extractStatefulSetPVCInfo(resources);
    for (const sts of stsInfo) {
      const pvcResult = await deleteStatefulSetPVCs(
        sts.namespace || namespace,
        sts.name,
        sts.vctNames
      );
      if (pvcResult.deleted.length > 0) {
        console.log(
          `[worker] Cleaned up ${pvcResult.deleted.length} PVC(s) for StatefulSet ${sts.name}`
        );
      }
    }
    await job.updateProgress(70);

    // 4. Delete the deployment record
    await prisma.deployment.delete({
      where: { id: deploymentId },
    });

    console.log(`[worker] Undeploy SUCCESS: deployment ${deploymentId} removed (record deleted)`);
    await job.updateProgress(100);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Undeploy FAILED: ${deploymentId}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: `Undeploy failed: ${errorMessage.slice(0, 1000)}`,
      },
    });

    throw err;
  }
}

async function handleUpgrade(job: Job<UpgradeJobData>): Promise<void> {
  const { deploymentId, recipeSlug, namespace, resources: resourcesJson } = job.data;

  console.log(`[worker] Upgrade: ${recipeSlug} in ${namespace}`);

  // Check if deployment record still exists
  const exists = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true },
  });
  if (!exists) {
    console.warn(`[worker] Upgrade skipped: deployment ${deploymentId} no longer exists in DB`);
    return;
  }

  // Stop existing port-forward during upgrade (no-op in production mode)
  if (!ingressEnabled) {
    await stopPortForward(deploymentId);
  }

  try {
    // 1. Update status → DEPLOYING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DEPLOYING", errorMessage: null },
    });
    await job.updateProgress(10);

    // 2. Parse and apply resources (SSA handles the diff)
    const resources = parseResources(resourcesJson);
    const results = await applyResources(resources);
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      const errorMsg = errors.map((e) => `${e.resource}: ${e.error}`).join("; ");
      throw new Error(`Failed to apply resources: ${errorMsg}`);
    }

    console.log(`[worker] SSA applied ${results.length} resources for ${recipeSlug} upgrade`);
    await job.updateProgress(60);

    // 3. Wait for pods to be ready
    const podSelector = extractPodSelector(resources);
    let ready = false;
    let pods: Array<{ name: string; status: string }> = [];

    if (podSelector) {
      const result = await waitForReady(namespace, podSelector, 180);
      ready = result.ready;
      pods = result.pods;
    } else {
      ready = true;
    }

    await job.updateProgress(90);

    if (ready) {
      // 4. Re-establish port-forwarding
      const portForwardUrl = await setupPortForward(deploymentId, namespace, resources);

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "RUNNING",
          url: portForwardUrl,
          errorMessage: null,
        },
      });

      recordStatusChanged({
        deploymentId,
        previousStatus: "DEPLOYING",
        newStatus: "RUNNING",
        reason: "Upgrade completed successfully",
      });

      console.log(`[worker] Upgrade SUCCESS: ${recipeSlug} is RUNNING`);
    } else {
      const podStatuses = pods.map((p) => `${p.name}: ${p.status}`).join(", ");
      const failMsg = `Service updated but not yet healthy: ${podStatuses}`;
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: failMsg,
        },
      });

      recordFailed({ deploymentId, error: failMsg });

      console.warn(`[worker] Upgrade PARTIAL: ${recipeSlug} applied but pods not ready`);
    }

    await job.updateProgress(100);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Upgrade FAILED: ${recipeSlug}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000),
      },
    });

    recordFailed({ deploymentId, error: errorMessage.slice(0, 1000) });

    throw err;
  }
}

async function handleHealthCheck(job: Job<HealthCheckJobData>): Promise<void> {
  const { deploymentId } = job.data;

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      namespace: true,
      status: true,
      name: true,
      managedResources: true,
    },
  });

  if (!deployment || deployment.status !== "RUNNING") {
    return;
  }

  try {
    // Get pod selector from managed resources
    let podSelector: string | null = null;
    if (deployment.managedResources) {
      const resources = parseResources(deployment.managedResources as string);
      podSelector = extractPodSelector(resources);
    }

    if (!podSelector) {
      // Fallback: use standard labels
      podSelector = `app.kubernetes.io/instance=${deployment.name},app.kubernetes.io/managed-by=mathison`;
    }

    const { ready } = await waitForReady(
      deployment.namespace,
      podSelector,
      30
    );

    if (!ready) {
      const reason = "Health check failed: service is not responding";
      console.warn(`[worker] Health check: ${deployment.name} is degraded`);
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: reason,
        },
      });

      recordHealthChanged({
        deploymentId,
        healthy: false,
        reason,
      });
    }
  } catch (err) {
    console.error(`[worker] Health check error for ${deployment.name}:`, err);
  }
}

// ─── Port-forward health check ────────────────────────────

/**
 * Periodically check that port-forwards are alive.
 * Restarts any that have died, and starts port-forwards for
 * RUNNING deployments that don't have one yet.
 */
async function checkPortForwards(): Promise<void> {
  try {
    // Find all RUNNING deployments that should have port-forwards
    const runningDeployments = await prisma.deployment.findMany({
      where: {
        status: "RUNNING",
        localPort: { not: null },
        serviceName: { not: null },
        servicePort: { not: null },
      },
      select: {
        id: true,
        localPort: true,
        serviceName: true,
        servicePort: true,
        namespace: true,
        name: true,
      },
    });

    for (const dep of runningDeployments) {
      if (!isPortForwardActive(dep.id) && dep.localPort && dep.serviceName && dep.servicePort) {
        console.log(
          `[worker] Port-forward not active for ${dep.serviceName}, restarting...`
        );
        try {
          await startPortForward({
            deploymentId: dep.id,
            namespace: dep.namespace,
            serviceName: dep.serviceName,
            servicePort: dep.servicePort,
            localPort: dep.localPort,
          });
        } catch (err) {
          console.warn(
            `[worker] Failed to restart port-forward for ${dep.serviceName}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  } catch (err) {
    console.error("[worker] Port-forward health check error:", err);
  }
}

// ─── Health server ────────────────────────────────────────

function redisTcpCheck(timeoutMs = 2000): Promise<void> {
  const host = connection.host ?? "localhost";
  const port = connection.port ?? 6379;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve();
    });
    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Redis connection timeout"));
    });
  });
}

function startHealthServer(): http.Server {
  const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || "8080", 10);

  const server = http.createServer(async (_req, res) => {
    if (_req.url !== "/health" && _req.url !== "/health/") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    let redisOk = false;
    try {
      await redisTcpCheck();
      redisOk = true;
    } catch {
      // Redis unreachable
    }

    const status = redisOk ? "ok" : "unhealthy";
    const statusCode = redisOk ? 200 : 503;

    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status,
        queue: redisOk ? "connected" : "disconnected",
        uptime: Math.floor(process.uptime()),
      })
    );
  });

  server.listen(healthPort, "0.0.0.0", () => {
    console.log(` Health server: http://0.0.0.0:${healthPort}/health`);
  });

  return server;
}

// ─── Worker setup ─────────────────────────────────────────

export function startWorker(): void {
  const worker = new Worker(
    "deployments",
    async (job: Job) => {
      console.log(
        `[worker] Processing job ${job.id} (${job.name}) — attempt ${job.attemptsMade + 1}`
      );

      switch (job.name) {
        case JOB_NAMES.DEPLOY:
          await handleDeploy(job as Job<DeployJobData>);
          break;

        case JOB_NAMES.UNDEPLOY:
          await handleUndeploy(job as Job<UndeployJobData>);
          break;

        case JOB_NAMES.UPGRADE:
          await handleUpgrade(job as Job<UpgradeJobData>);
          break;

        case JOB_NAMES.HEALTH_CHECK:
          await handleHealthCheck(job as Job<HealthCheckJobData>);
          break;

        default:
          console.warn(`[worker] Unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60_000,
      },
    }
  );

  // ─── Health HTTP server ──────────────────────────────────

  const healthServer = startHealthServer();

  // ─── Port-forward health check interval (local dev only) ──

  let portForwardCheckInterval: ReturnType<typeof setInterval> | undefined;
  if (!ingressEnabled) {
    portForwardCheckInterval = setInterval(checkPortForwards, 60_000);
    setTimeout(checkPortForwards, 5_000);
  } else {
    console.log(" Ingress mode: port-forwarding disabled");
  }

  // ─── Event handlers ───────────────────────────────────────

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} (${job.name}) completed successfully`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[worker] Job ${job?.id} (${job?.name}) failed (attempt ${job?.attemptsMade}):`,
      error.message
    );
  });

  worker.on("error", (error) => {
    console.error("[worker] Worker error:", error);
  });

  // ─── Graceful shutdown ────────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    console.log(`[worker] Received ${signal}, shutting down gracefully...`);
    if (portForwardCheckInterval) {
      clearInterval(portForwardCheckInterval);
    }
    healthServer.close();
    if (!ingressEnabled) {
      await stopAllPortForwards();
    }
    await worker.close();
    console.log("[worker] Shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ─── Startup ──────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════");
  console.log(" Mathison Worker started (V2 — Server-Side Apply)");
  console.log(` Queue: deployments`);
  console.log(` Concurrency: 2`);
  console.log(` Engine: SSA (no Helm)`);
  console.log(` Port-forward check: every 60s`);
  console.log(
    ` DATABASE_URL: ${process.env.DATABASE_URL ? "✓ set" : "✗ MISSING"}`
  );
  console.log(` REDIS_URL: ${process.env.REDIS_URL ? "✓ set" : "✗ MISSING"}`);
  console.log(" Waiting for jobs...");
  console.log("═══════════════════════════════════════════════");
}
