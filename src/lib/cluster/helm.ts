/**
 * Helm CLI Wrapper
 *
 * Executes Helm commands via subprocess (child_process).
 * Always uses --output json for parseable results.
 * Values are written to temp files and cleaned up after.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as yaml from "yaml";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────

export interface HelmInstallOptions {
  releaseName: string;
  chart: string;
  namespace: string;
  values?: Record<string, unknown>;
  valuesYaml?: string;
  version?: string;
  wait?: boolean;
  timeout?: string;
  createNamespace?: boolean;
}

export interface HelmReleaseStatus {
  name: string;
  namespace: string;
  revision: string;
  status: string;
  chart: string;
  appVersion: string;
  description?: string;
}

export interface HelmListEntry {
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
}

// ─── Configuration ────────────────────────────────────────

const HELM_BIN = process.env.HELM_BIN || "helm";
const DEFAULT_TIMEOUT = "5m";

function getHelmEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Pass KUBECONFIG if set
  if (process.env.KUBECONFIG) {
    env.KUBECONFIG = process.env.KUBECONFIG;
  }

  return env;
}

// ─── Temp file management ─────────────────────────────────

async function writeTempValues(
  values: Record<string, unknown> | string
): Promise<string> {
  const tmpDir = os.tmpdir();
  const filename = `mathison-helm-${crypto.randomUUID()}.yaml`;
  const filepath = path.join(tmpDir, filename);

  const content =
    typeof values === "string" ? values : yaml.stringify(values);
  await fs.writeFile(filepath, content, "utf-8");

  return filepath;
}

async function cleanupTempFile(filepath: string): Promise<void> {
  try {
    await fs.unlink(filepath);
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Helm operations ──────────────────────────────────────

/**
 * Install a Helm chart.
 */
export async function helmInstall(
  options: HelmInstallOptions
): Promise<HelmReleaseStatus> {
  const args = [
    "install",
    options.releaseName,
    options.chart,
    "--namespace",
    options.namespace,
    "--output",
    "json",
  ];

  if (options.version) {
    args.push("--version", options.version);
  }
  if (options.createNamespace) {
    args.push("--create-namespace");
  }
  if (options.wait !== false) {
    args.push("--wait");
  }
  args.push("--timeout", options.timeout ?? DEFAULT_TIMEOUT);

  let valuesFile: string | undefined;

  try {
    // Write values to temp file if provided
    if (options.values) {
      valuesFile = await writeTempValues(options.values);
      args.push("--values", valuesFile);
    } else if (options.valuesYaml) {
      valuesFile = await writeTempValues(options.valuesYaml);
      args.push("--values", valuesFile);
    }

    console.log(`[helm] install ${options.releaseName} (${options.chart}) in ${options.namespace}`);

    const result = await execFileAsync(HELM_BIN, args, {
      env: getHelmEnv(),
      timeout: 600_000, // 10 min hard timeout on the process
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return parseHelmStatusOutput(result.stdout);
  } catch (err: unknown) {
    throw wrapHelmError("install", options.releaseName, err);
  } finally {
    if (valuesFile) await cleanupTempFile(valuesFile);
  }
}

/**
 * Upgrade an existing Helm release.
 */
export async function helmUpgrade(
  options: HelmInstallOptions
): Promise<HelmReleaseStatus> {
  const args = [
    "upgrade",
    options.releaseName,
    options.chart,
    "--namespace",
    options.namespace,
    "--output",
    "json",
  ];

  if (options.version) {
    args.push("--version", options.version);
  }
  if (options.createNamespace) {
    args.push("--create-namespace");
  }
  if (options.wait !== false) {
    args.push("--wait");
  }
  args.push("--timeout", options.timeout ?? DEFAULT_TIMEOUT);

  let valuesFile: string | undefined;

  try {
    if (options.values) {
      valuesFile = await writeTempValues(options.values);
      args.push("--values", valuesFile);
    } else if (options.valuesYaml) {
      valuesFile = await writeTempValues(options.valuesYaml);
      args.push("--values", valuesFile);
    }

    console.log(`[helm] upgrade ${options.releaseName} (${options.chart}) in ${options.namespace}`);

    const result = await execFileAsync(HELM_BIN, args, {
      env: getHelmEnv(),
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return parseHelmStatusOutput(result.stdout);
  } catch (err: unknown) {
    throw wrapHelmError("upgrade", options.releaseName, err);
  } finally {
    if (valuesFile) await cleanupTempFile(valuesFile);
  }
}

/**
 * Uninstall a Helm release.
 */
export async function helmUninstall(
  releaseName: string,
  namespace: string
): Promise<void> {
  try {
    console.log(`[helm] uninstall ${releaseName} from ${namespace}`);

    await execFileAsync(HELM_BIN, [
      "uninstall",
      releaseName,
      "--namespace",
      namespace,
    ], {
      env: getHelmEnv(),
      timeout: 300_000,
    });
  } catch (err: unknown) {
    // "not found" means already uninstalled — treat as success
    if (isHelmNotFound(err)) {
      console.log(`[helm] Release ${releaseName} already uninstalled`);
      return;
    }
    throw wrapHelmError("uninstall", releaseName, err);
  }
}

/**
 * Get the status of a Helm release.
 */
export async function helmStatus(
  releaseName: string,
  namespace: string
): Promise<HelmReleaseStatus> {
  try {
    const result = await execFileAsync(HELM_BIN, [
      "status",
      releaseName,
      "--namespace",
      namespace,
      "--output",
      "json",
    ], {
      env: getHelmEnv(),
      timeout: 30_000,
    });

    return parseHelmStatusOutput(result.stdout);
  } catch (err: unknown) {
    throw wrapHelmError("status", releaseName, err);
  }
}

/**
 * List Helm releases, optionally filtered by namespace.
 */
export async function helmList(
  namespace?: string
): Promise<HelmListEntry[]> {
  const args = ["list", "--output", "json"];

  if (namespace) {
    args.push("--namespace", namespace);
  } else {
    args.push("--all-namespaces");
  }

  try {
    const result = await execFileAsync(HELM_BIN, args, {
      env: getHelmEnv(),
      timeout: 30_000,
    });

    if (!result.stdout || result.stdout.trim() === "") {
      return [];
    }

    const parsed = JSON.parse(result.stdout) as HelmListEntry[];
    return parsed;
  } catch (err: unknown) {
    throw wrapHelmError("list", "", err);
  }
}

/**
 * Add a Helm repository and update.
 */
export async function addRepo(
  name: string,
  url: string
): Promise<void> {
  try {
    console.log(`[helm] Adding repo ${name} → ${url}`);

    await execFileAsync(HELM_BIN, ["repo", "add", name, url], {
      env: getHelmEnv(),
      timeout: 60_000,
    });

    await execFileAsync(HELM_BIN, ["repo", "update", name], {
      env: getHelmEnv(),
      timeout: 60_000,
    });

    console.log(`[helm] Repo ${name} added and updated`);
  } catch (err: unknown) {
    // "already exists" is fine
    const msg = getErrorMessage(err);
    if (msg.includes("already exists")) {
      // Still update
      try {
        await execFileAsync(HELM_BIN, ["repo", "update", name], {
          env: getHelmEnv(),
          timeout: 60_000,
        });
      } catch {
        // Ignore update errors
      }
      return;
    }
    throw wrapHelmError("addRepo", name, err);
  }
}

/**
 * Recover a stuck Helm release (pending-install, pending-upgrade, pending-rollback).
 * If the release is stuck:
 *   - pending-install → uninstall (no good revision to rollback to)
 *   - pending-upgrade/pending-rollback → rollback to last good revision
 * Returns true if recovery was attempted, false if release is healthy or not found.
 */
export async function helmRecoverStuckRelease(
  releaseName: string,
  namespace: string
): Promise<{ recovered: boolean; action: string }> {
  try {
    // Get release history to check state
    const result = await execFileAsync(HELM_BIN, [
      "history",
      releaseName,
      "--namespace",
      namespace,
      "--output",
      "json",
      "--max",
      "5",
    ], {
      env: getHelmEnv(),
      timeout: 30_000,
    });

    if (!result.stdout || result.stdout.trim() === "" || result.stdout.trim() === "[]") {
      return { recovered: false, action: "none" };
    }

    const history = JSON.parse(result.stdout) as Array<{
      revision: number;
      status: string;
      description?: string;
    }>;

    if (history.length === 0) {
      return { recovered: false, action: "none" };
    }

    // Check the latest revision's status
    const latest = history[history.length - 1];
    if (!latest) {
      return { recovered: false, action: "none" };
    }
    const status = latest.status.toLowerCase();

    if (status === "pending-install") {
      // No previous good revision — must uninstall
      console.log(
        `[helm] Release ${releaseName} is stuck in pending-install — uninstalling`
      );
      await helmUninstall(releaseName, namespace);
      return { recovered: true, action: "uninstalled" };
    }

    if (
      status === "pending-upgrade" ||
      status === "pending-rollback"
    ) {
      // Find the last successful revision
      const goodRevision = [...history]
        .reverse()
        .find((h) => h.status.toLowerCase() === "deployed");

      if (goodRevision) {
        console.log(
          `[helm] Release ${releaseName} is stuck in ${status} — rolling back to revision ${goodRevision.revision}`
        );
        await execFileAsync(HELM_BIN, [
          "rollback",
          releaseName,
          String(goodRevision.revision),
          "--namespace",
          namespace,
          "--wait",
          "--timeout",
          "2m",
        ], {
          env: getHelmEnv(),
          timeout: 180_000,
        });
        return { recovered: true, action: `rollback-to-${goodRevision.revision}` };
      } else {
        // No good revision — uninstall
        console.log(
          `[helm] Release ${releaseName} is stuck in ${status} with no good revision — uninstalling`
        );
        await helmUninstall(releaseName, namespace);
        return { recovered: true, action: "uninstalled" };
      }
    }

    // Release is in a healthy state (deployed, failed, etc.)
    return { recovered: false, action: "none" };
  } catch (err: unknown) {
    // Release doesn't exist — nothing to recover
    if (isHelmNotFound(err)) {
      return { recovered: false, action: "none" };
    }
    console.warn(
      `[helm] Failed to check/recover release ${releaseName}:`,
      getErrorMessage(err)
    );
    return { recovered: false, action: "error" };
  }
}

// ─── Parsing ──────────────────────────────────────────────

interface HelmStatusJson {
  name?: string;
  info?: {
    status?: string;
    description?: string;
  };
  namespace?: string;
  version?: number;
  chart?: {
    metadata?: {
      name?: string;
      version?: string;
      appVersion?: string;
    };
  };
}

function parseHelmStatusOutput(stdout: string): HelmReleaseStatus {
  try {
    const data = JSON.parse(stdout) as HelmStatusJson;
    return {
      name: data.name ?? "unknown",
      namespace: data.namespace ?? "unknown",
      revision: String(data.version ?? "1"),
      status: data.info?.status ?? "unknown",
      chart: data.chart?.metadata
        ? `${data.chart.metadata.name}-${data.chart.metadata.version}`
        : "unknown",
      appVersion: data.chart?.metadata?.appVersion ?? "unknown",
      description: data.info?.description,
    };
  } catch {
    console.error("[helm] Failed to parse JSON output:", stdout.slice(0, 200));
    return {
      name: "unknown",
      namespace: "unknown",
      revision: "0",
      status: "unknown",
      chart: "unknown",
      appVersion: "unknown",
    };
  }
}

// ─── Error handling ───────────────────────────────────────

function getErrorMessage(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "stderr" in err &&
    typeof (err as { stderr: string }).stderr === "string"
  ) {
    return (err as { stderr: string }).stderr;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function isHelmNotFound(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  return msg.includes("not found") || msg.includes("release: not found");
}

function wrapHelmError(
  operation: string,
  release: string,
  err: unknown
): Error {
  const msg = getErrorMessage(err);
  const label = release ? `${operation} ${release}` : operation;
  console.error(`[helm] ${label} failed:`, msg);
  return new Error(`[helm:${label}] ${msg}`);
}
