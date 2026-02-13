/**
 * Mathison BullMQ Worker
 *
 * Separate process that consumes deployment jobs from the queue.
 * Executes Helm operations, monitors pod readiness, and updates DB status.
 *
 * Start with: npm run worker (tsx watch worker/index.ts)
 */

import { config } from "dotenv";

// Load env before any other imports
config({ path: ".env.local" });

import { Worker, Job } from "bullmq";
import { connection } from "../src/lib/queue/connection";
import { JOB_NAMES } from "../src/lib/queue/jobs";
import {
  helmInstall,
  helmUpgrade,
  helmUninstall,
  addRepo,
} from "../src/lib/cluster/helm";
import { waitForReady, getIngressUrl } from "../src/lib/cluster/kubernetes";
import { deleteK8sSecret } from "../src/lib/deployer/secrets";
import { prisma } from "../src/lib/db";

import type {
  DeployJobData,
  UndeployJobData,
  UpgradeJobData,
  HealthCheckJobData,
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
    ingress_nginx: "https://kubernetes.github.io/ingress-nginx",
    "cert-manager": "https://charts.jetstack.io",
    grafana: "https://grafana.github.io/helm-charts",
    prometheus: "https://prometheus-community.github.io/helm-charts",
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

// ─── Job handlers ─────────────────────────────────────────

async function handleDeploy(job: Job<DeployJobData>): Promise<void> {
  const {
    deploymentId,
    recipeSlug,
    helmRelease,
    chartUrl,
    chartVersion,
    tenantNamespace,
    renderedValues,
  } = job.data;

  console.log(
    `[worker] Deploy: ${helmRelease} (${recipeSlug}) → ${tenantNamespace}`
  );

  try {
    // 1. Update status → DEPLOYING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DEPLOYING", errorMessage: null },
    });
    await job.updateProgress(10);

    // 2. Ensure Helm repo is configured
    await ensureHelmRepo(chartUrl);
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
      createNamespace: false, // Namespace already created during tenant provisioning
    });

    console.log(`[worker] Helm install completed: ${result.name} → ${result.status}`);
    await job.updateProgress(70);

    // 4. Wait for pods to be ready
    const { ready, pods } = await waitForReady(
      tenantNamespace,
      `app.kubernetes.io/instance=${helmRelease}`,
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
    if (ready) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "RUNNING",
          url,
          errorMessage: null,
        },
      });
      console.log(`[worker] Deploy SUCCESS: ${helmRelease} is RUNNING`);
    } else {
      const podStatuses = pods
        .map((p) => `${p.name}: ${p.status}`)
        .join(", ");
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: `Helm install succeeded but pods not ready: ${podStatuses}`,
        },
      });
      console.warn(
        `[worker] Deploy PARTIAL: ${helmRelease} installed but pods not ready`
      );
    }

    await job.updateProgress(100);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    console.error(`[worker] Deploy FAILED: ${helmRelease}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000), // Truncate for DB
      },
    });

    throw err; // Let BullMQ handle retry
  }
}

async function handleUndeploy(job: Job<UndeployJobData>): Promise<void> {
  const { deploymentId, helmRelease, tenantNamespace } = job.data;

  console.log(`[worker] Undeploy: ${helmRelease} from ${tenantNamespace}`);

  try {
    // 1. Update status → DELETING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DELETING" },
    });
    await job.updateProgress(10);

    // 2. Run helm uninstall
    await helmUninstall(helmRelease, tenantNamespace);
    await job.updateProgress(60);

    // 3. Clean up K8s secrets
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { secretsRef: true },
    });

    if (deployment?.secretsRef) {
      try {
        await deleteK8sSecret(tenantNamespace, deployment.secretsRef);
      } catch (err) {
        console.warn(`[worker] Failed to cleanup secret for ${helmRelease}:`, err);
      }
    }
    await job.updateProgress(80);

    // 4. Update status → STOPPED
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "STOPPED",
        url: null,
        errorMessage: null,
      },
    });

    console.log(`[worker] Undeploy SUCCESS: ${helmRelease} removed`);
    await job.updateProgress(100);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    console.error(`[worker] Undeploy FAILED: ${helmRelease}:`, errorMessage);

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
  const {
    deploymentId,
    helmRelease,
    chartUrl,
    chartVersion,
    tenantNamespace,
    renderedValues,
  } = job.data;

  console.log(`[worker] Upgrade: ${helmRelease} in ${tenantNamespace}`);

  try {
    // 1. Update status → DEPLOYING
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "DEPLOYING", errorMessage: null },
    });
    await job.updateProgress(10);

    // 2. Ensure Helm repo
    await ensureHelmRepo(chartUrl);
    await job.updateProgress(20);

    // 3. Run helm upgrade
    const result = await helmUpgrade({
      releaseName: helmRelease,
      chart: chartUrl,
      namespace: tenantNamespace,
      valuesYaml: renderedValues || undefined,
      version: chartVersion,
      wait: true,
      timeout: "5m",
    });

    console.log(`[worker] Helm upgrade completed: ${result.name} → ${result.status}`);
    await job.updateProgress(70);

    // 4. Wait for pods to be ready
    const { ready, pods } = await waitForReady(
      tenantNamespace,
      `app.kubernetes.io/instance=${helmRelease}`,
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

    // 6. Update status
    if (ready) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "RUNNING",
          url,
          errorMessage: null,
        },
      });
      console.log(`[worker] Upgrade SUCCESS: ${helmRelease} is RUNNING`);
    } else {
      const podStatuses = pods
        .map((p) => `${p.name}: ${p.status}`)
        .join(", ");
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          errorMessage: `Upgrade succeeded but pods not ready: ${podStatuses}`,
        },
      });
      console.warn(`[worker] Upgrade PARTIAL: ${helmRelease} upgraded but pods not ready`);
    }

    await job.updateProgress(100);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    console.error(`[worker] Upgrade FAILED: ${helmRelease}:`, errorMessage);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage.slice(0, 1000),
      },
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
      name: true,
    },
  });

  if (!deployment || deployment.status !== "RUNNING") {
    return; // Skip health check for non-running deployments
  }

  try {
    const { ready } = await waitForReady(
      deployment.namespace,
      `app.kubernetes.io/instance=${deployment.helmRelease}`,
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
          errorMessage: "Health check failed: pods not ready",
        },
      });
    }
  } catch (err) {
    console.error(
      `[worker] Health check error for ${deployment.helmRelease}:`,
      err
    );
  }
}

// ─── Worker setup ─────────────────────────────────────────

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
      duration: 60_000, // Max 5 jobs per minute
    },
  }
);

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
  await worker.close();
  console.log("[worker] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Startup ──────────────────────────────────────────────

console.log("═══════════════════════════════════════════════");
console.log(" Mathison Worker started");
console.log(" Queue: deployments");
console.log(" Concurrency: 2");
console.log(" Waiting for jobs...");
console.log("═══════════════════════════════════════════════");
