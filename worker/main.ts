/**
 * Mathison BullMQ Worker — Main Logic
 *
 * Separate process that consumes deployment jobs from the queue.
 * Executes Helm operations, monitors pod readiness, and updates DB status.
 * Manages port-forwarding for local/kind clusters.
 *
 * Imported dynamically by index.ts AFTER env vars are loaded.
 */

import { Worker, Job } from "bullmq";
import { connection } from "../src/lib/queue/connection";
import { JOB_NAMES } from "../src/lib/queue/jobs";
import {
  helmInstall,
  helmUpgrade,
  helmUninstall,
  helmRecoverStuckRelease,
  addRepo
} from "../src/lib/cluster/helm";
import { waitForReady, listPods, getIngressUrl } from "../src/lib/cluster/kubernetes";
import { deleteK8sSecret } from "../src/lib/deployer/secrets";
import { assignPort } from "../src/lib/cluster/port-manager";
import {
  startPortForward,
  stopPortForward,
  stopAllPortForwards,
  isPortForwardActive,
} from "../src/lib/cluster/port-forward";
import { prisma } from "../src/lib/db";

import type {
  DeployJobData,
  UndeployJobData,
  UpgradeJobData,
  HealthCheckJobData
} from "../src/lib/queue/jobs";

// ─── Helm repo cache ──────────────────────────────────────

/** Track which repos we've already added this session */
const addedRepos = new Set<string>();

/**
 * Ensure the Helm repo for a chart URL is configured.
 * OCI registries (oci://) don't need repo add.
 */
async function ensureHelmRepo(chartUrl: string): Promise<void> {
  // OCI charts don't need repo setup
  if (chartUrl.startsWith("oci://")) {
    return;
  }

  // Extract repo name from chart reference (e.g., "bitnami/postgresql" → "bitnami")
  const parts = chartUrl.split("/");
  if (parts.length < 2) return;

  const repoName = parts[0] ?? "";
  if (!repoName || addedRepos.has(repoName)) return;

  // Known repos
  const KNOWN_REPOS: Record<string, string> = {
    bitnami: "https://charts.bitnami.com/bitnami",
    minio: "https://charts.min.io/",
    ingress_nginx: "https://kubernetes.github.io/ingress-nginx",
    "cert-manager": "https://charts.jetstack.io",
    grafana: "https://grafana.github.io/helm-charts",
    prometheus: "https://prometheus-community.github.io/helm-charts"
  };

  if (repoName in KNOWN_REPOS) {
    const repoUrl = KNOWN_REPOS[repoName] as string;
    try {
      await addRepo(repoName, repoUrl);
      addedRepos.add(repoName);
    } catch (err) {
      console.warn(`[worker] Failed to add repo '${repoName}':`, err);
    }
  }
}

/**
 * Wait for pods to be ready using the best available label selector.
 * Bitnami charts use `app.kubernetes.io/instance`, while other charts
 * (e.g. official MinIO) use the Helm `release` label.
 */
async function waitForReleasePods(
  namespace: string,
  helmRelease: string,
  timeoutSeconds: number
) {
  // Try standard Kubernetes label first
  const standardLabel = `app.kubernetes.io/instance=${helmRelease}`;
  const probe = await listPods(namespace, standardLabel);

  if (probe.length > 0) {
    return waitForReady(namespace, standardLabel, timeoutSeconds);
  }

  // Fall back to Helm's `release` label (used by many community charts)
  const helmLabel = `release=${helmRelease}`;
  console.log(
    `[worker] No pods found with '${standardLabel}', trying '${helmLabel}'`
  );
  return waitForReady(namespace, helmLabel, timeoutSeconds);
}

// ─── Service discovery ────────────────────────────────────

/**
 * Discover the primary K8s service for a deployment and set up port-forwarding.
 * Looks up the recipe's ingress config to find the service name suffix and port,
 * then assigns a local port and starts a port-forward.
 */
async function setupPortForward(
  deploymentId: string,
  helmRelease: string,
  namespace: string
): Promise<string | null> {
  try {
    // Look up the recipe info for service discovery
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        recipe: {
          select: {
            ingressConfig: true,
            healthCheck: true,
          },
        },
      },
    });

    if (!deployment) return null;

    const ingressConfig = deployment.recipe.ingressConfig as {
      port?: number;
      serviceNameSuffix?: string;
    } | null;
    const healthCheck = deployment.recipe.healthCheck as {
      port?: number;
    } | null;

    // Determine the service port (prefer ingressConfig.port, fall back to healthCheck.port)
    const servicePort = ingressConfig?.port || healthCheck?.port;
    if (!servicePort) {
      console.warn(`[worker] No service port found for deployment ${deploymentId}`);
      return null;
    }

    // Determine the service name
    const suffix = ingressConfig?.serviceNameSuffix ?? "";
    const serviceName = `${helmRelease}${suffix}`;

    // Assign a local port
    const localPort = await assignPort(deploymentId);

    // Store service info on the deployment
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        serviceName,
        servicePort,
      },
    });

    // Start port-forward
    const { url } = await startPortForward({
      deploymentId,
      namespace,
      serviceName,
      servicePort,
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
  const {
    deploymentId,
    recipeSlug,
    helmRelease,
    chartUrl,
    chartVersion,
    tenantNamespace,
    renderedValues
  } = job.data;

  console.log(
    `[worker] Deploy: ${helmRelease} (${recipeSlug}) → ${tenantNamespace}`
  );

  // Check if deployment record still exists (may have been deleted by undeploy)
  const exists = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true }
  });
  if (!exists) {
    console.warn(
      `[worker] Deploy skipped: deployment ${deploymentId} no longer exists in DB`
    );
    return;
  }

  try {
    // 1. Update status → DEPLOYING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DEPLOYING", errorMessage: null }
    });
    await job.updateProgress(10);

    // 2. Ensure Helm repo is configured
    await ensureHelmRepo(chartUrl);
    await job.updateProgress(15);

    // 2.5. Recover stuck release if one exists (e.g. from a previously interrupted deploy)
    const recovery = await helmRecoverStuckRelease(helmRelease, tenantNamespace);
    if (recovery.recovered) {
      console.log(
        `[worker] Recovered stuck release ${helmRelease}: ${recovery.action}`
      );
    }
    await job.updateProgress(20);

    // 3. Run helm install
    const result = await helmInstall({
      releaseName: helmRelease,
      chart: chartUrl,
      namespace: tenantNamespace,
      valuesYaml: renderedValues || undefined,
      version: chartVersion,
      wait: true,
      timeout: "5m",
      createNamespace: false // Namespace already created during tenant provisioning
    });

    console.log(
      `[worker] Helm install completed: ${result.name} → ${result.status}`
    );
    await job.updateProgress(70);

    // 4. Wait for pods to be ready
    const { ready, pods } = await waitForReleasePods(
      tenantNamespace,
      helmRelease,
      120 // 2 min timeout (helm --wait already waited)
    );

    await job.updateProgress(90);

    // 5. Get ingress URL if applicable
    let url: string | null = null;
    try {
      url = await getIngressUrl(tenantNamespace, helmRelease);
    } catch {
      // No ingress — fine
    }

    // 6. Update status → RUNNING (or FAILED if pods aren't ready)
    // Include chart/app version and revision from Helm result
    const versionData = {
      chartVersion: result.chart !== "unknown" ? result.chart : null,
      appVersion: result.appVersion !== "unknown" ? result.appVersion : null,
      revision: parseInt(result.revision, 10) || 1,
    };

    if (ready) {
      // 7. Set up port-forwarding for local access
      const portForwardUrl = await setupPortForward(
        deploymentId,
        helmRelease,
        tenantNamespace
      );

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "RUNNING",
          url: portForwardUrl || url,
          errorMessage: null,
          ...versionData,
        }
      });
      console.log(`[worker] Deploy SUCCESS: ${helmRelease} is RUNNING (chart: ${versionData.chartVersion}, app: ${versionData.appVersion})`);
    } else {
      const podStatuses = pods.map((p) => `${p.name}: ${p.status}`).join(", ");
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: `Service deployed but not yet healthy: ${podStatuses}`,
          ...versionData,
        }
      });
      console.warn(
        `[worker] Deploy PARTIAL: ${helmRelease} installed but pods not ready`
      );
    }

    await job.updateProgress(100);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Deploy FAILED: ${helmRelease}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000) // Truncate for DB
      }
    });

    throw err; // Let BullMQ handle retry
  }
}

async function handleUndeploy(job: Job<UndeployJobData>): Promise<void> {
  const { deploymentId, helmRelease, tenantNamespace } = job.data;

  console.log(`[worker] Undeploy: ${helmRelease} from ${tenantNamespace}`);

  // Stop port-forward before anything else
  await stopPortForward(deploymentId);

  // Check if deployment record still exists (idempotent — may have been deleted already)
  const exists = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true }
  });
  if (!exists) {
    console.warn(
      `[worker] Undeploy: deployment ${deploymentId} already gone from DB — attempting Helm cleanup only`
    );
    // Still try to uninstall the Helm release in case it's orphaned
    try {
      await helmUninstall(helmRelease, tenantNamespace);
    } catch {
      // Ignore — release may not exist either
    }
    return;
  }

  try {
    // 1. Update status → DELETING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DELETING" }
    });
    await job.updateProgress(10);

    // 2. Run helm uninstall
    await helmUninstall(helmRelease, tenantNamespace);
    await job.updateProgress(60);

    // 3. Clean up K8s secrets
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { secretsRef: true }
    });

    if (deployment?.secretsRef) {
      try {
        await deleteK8sSecret(tenantNamespace, deployment.secretsRef);
      } catch (err) {
        console.warn(
          `[worker] Failed to cleanup secret for ${helmRelease}:`,
          err
        );
      }
    }
    await job.updateProgress(80);

    // 4. Delete the deployment record — resource no longer exists in the cluster
    await prisma.deployment.delete({
      where: { id: deploymentId },
    });

    console.log(`[worker] Undeploy SUCCESS: ${helmRelease} removed (record deleted)`);
    await job.updateProgress(100);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Undeploy FAILED: ${helmRelease}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: `Undeploy failed: ${errorMessage.slice(0, 1000)}`
      }
    });

    throw err;
  }
}

async function handleUpgrade(job: Job<UpgradeJobData>): Promise<void> {
  const {
    deploymentId,
    helmRelease,
    chartUrl,
    chartVersion,
    tenantNamespace,
    renderedValues
  } = job.data;

  console.log(`[worker] Upgrade: ${helmRelease} in ${tenantNamespace}`);

  // Check if deployment record still exists (may have been deleted by undeploy)
  const exists = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true }
  });
  if (!exists) {
    console.warn(
      `[worker] Upgrade skipped: deployment ${deploymentId} no longer exists in DB`
    );
    return;
  }

  // Stop existing port-forward during upgrade
  await stopPortForward(deploymentId);

  try {
    // 1. Update status → DEPLOYING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DEPLOYING", errorMessage: null }
    });
    await job.updateProgress(10);

    // 2. Ensure Helm repo
    await ensureHelmRepo(chartUrl);
    await job.updateProgress(15);

    // 2.5. Recover stuck release if one exists (e.g. from a previously interrupted upgrade)
    const recovery = await helmRecoverStuckRelease(helmRelease, tenantNamespace);
    if (recovery.recovered) {
      console.log(
        `[worker] Recovered stuck release ${helmRelease}: ${recovery.action}`
      );
    }
    await job.updateProgress(20);

    // 3. Run helm upgrade (or install if recovery uninstalled the release)
    const useInstall = recovery.action === "uninstalled";
    const helmOp = useInstall ? helmInstall : helmUpgrade;
    const result = await helmOp({
      releaseName: helmRelease,
      chart: chartUrl,
      namespace: tenantNamespace,
      valuesYaml: renderedValues || undefined,
      version: chartVersion,
      wait: true,
      timeout: "5m",
      createNamespace: false,
    });

    const opLabel = useInstall ? "install (after recovery)" : "upgrade";
    console.log(
      `[worker] Helm ${opLabel} completed: ${result.name} → ${result.status}`
    );
    await job.updateProgress(70);

    // 4. Wait for pods to be ready
    const { ready, pods } = await waitForReleasePods(
      tenantNamespace,
      helmRelease,
      120
    );

    await job.updateProgress(90);

    // 5. Get ingress URL
    let url: string | null = null;
    try {
      url = await getIngressUrl(tenantNamespace, helmRelease);
    } catch {
      // No ingress
    }

    // 6. Update status + version info from Helm result
    const versionData = {
      chartVersion: result.chart !== "unknown" ? result.chart : null,
      appVersion: result.appVersion !== "unknown" ? result.appVersion : null,
      revision: parseInt(result.revision, 10) || 1,
    };

    if (ready) {
      // 7. Re-establish port-forwarding
      const portForwardUrl = await setupPortForward(
        deploymentId,
        helmRelease,
        tenantNamespace
      );

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "RUNNING",
          url: portForwardUrl || url,
          errorMessage: null,
          ...versionData,
        }
      });
      console.log(`[worker] Upgrade SUCCESS: ${helmRelease} is RUNNING (chart: ${versionData.chartVersion}, app: ${versionData.appVersion})`);
    } else {
      const podStatuses = pods.map((p) => `${p.name}: ${p.status}`).join(", ");
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: `Service updated but not yet healthy: ${podStatuses}`,
          ...versionData,
        }
      });
      console.warn(
        `[worker] Upgrade PARTIAL: ${helmRelease} upgraded but pods not ready`
      );
    }

    await job.updateProgress(100);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Upgrade FAILED: ${helmRelease}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000)
      }
    });

    throw err;
  }
}

async function handleHealthCheck(job: Job<HealthCheckJobData>): Promise<void> {
  const { deploymentId } = job.data;

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      helmRelease: true,
      namespace: true,
      status: true,
      name: true
    }
  });

  if (!deployment || deployment.status !== "RUNNING") {
    return; // Skip health check for non-running deployments
  }

  try {
    const { ready } = await waitForReleasePods(
      deployment.namespace,
      deployment.helmRelease,
      30 // Short timeout for health checks
    );

    if (!ready) {
      console.warn(
        `[worker] Health check: ${deployment.helmRelease} is degraded`
      );
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: "Health check failed: service is not responding"
        }
      });
    }
  } catch (err) {
    console.error(
      `[worker] Health check error for ${deployment.helmRelease}:`,
      err
    );
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
        helmRelease: true,
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
      concurrency: 2, // Process up to 2 jobs in parallel
      limiter: {
        max: 5,
        duration: 60_000 // Max 5 jobs per minute
      }
    }
  );

  // ─── Port-forward health check interval ─────────────────

  const portForwardCheckInterval = setInterval(checkPortForwards, 60_000);

  // Run an initial port-forward check after a short delay (restore on worker restart)
  setTimeout(checkPortForwards, 5_000);

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
    clearInterval(portForwardCheckInterval);
    await stopAllPortForwards();
    await worker.close();
    console.log("[worker] Shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ─── Startup ──────────────────────────────────────────────

  console.log("═══════════════════════════════════════════════");
  console.log(" Mathison Worker started");
  console.log(` Queue: deployments`);
  console.log(` Concurrency: 2`);
  console.log(` Port-forward check: every 60s`);
  console.log(
    ` DATABASE_URL: ${process.env.DATABASE_URL ? "✓ set" : "✗ MISSING"}`
  );
  console.log(` REDIS_URL: ${process.env.REDIS_URL ? "✓ set" : "✗ MISSING"}`);
  console.log(" Waiting for jobs...");
  console.log("═══════════════════════════════════════════════");
}
