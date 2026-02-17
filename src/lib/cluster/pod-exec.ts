/**
 * Pod Exec — Run commands inside K8s pods
 *
 * Uses kubectl exec (matches existing port-forward pattern).
 * Supports both text output capture and binary streaming.
 */

import { spawn } from "child_process";

import type { Readable } from "stream";

// ─── Types ────────────────────────────────────────────────

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecStreamResult {
  stdout: Readable;
  stderr: Readable;
  exitCode: Promise<number>;
}

// ─── Text exec (captures output) ─────────────────────────

/**
 * Execute a command in a pod and capture stdout/stderr as strings.
 * Suitable for small outputs (dumps, status checks, etc.).
 */
export async function execInPod(
  namespace: string,
  podName: string,
  command: string[],
  containerName?: string
): Promise<ExecResult> {
  const args = ["exec", podName, "-n", namespace];

  if (containerName) {
    args.push("-c", containerName);
  }

  args.push("--", ...command);

  return new Promise((resolve, reject) => {
    const child = spawn("kubectl", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (data: Buffer) => {
      chunks.push(data);
    });

    child.stderr.on("data", (data: Buffer) => {
      errChunks.push(data);
    });

    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(chunks).toString("utf-8"),
        stderr: Buffer.concat(errChunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });

    child.on("error", (err) => {
      reject(new Error(`kubectl exec failed: ${err.message}`));
    });
  });
}

// ─── Streaming exec (for large data) ────────────────────

/**
 * Execute a command in a pod and return stdout as a readable stream.
 * Use for large exports (database dumps, file archives).
 */
export function execInPodStream(
  namespace: string,
  podName: string,
  command: string[],
  containerName?: string
): ExecStreamResult {
  const args = ["exec", podName, "-n", namespace];

  if (containerName) {
    args.push("-c", containerName);
  }

  args.push("--", ...command);

  const child = spawn("kubectl", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exitCode = new Promise<number>((resolve, reject) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) =>
      reject(new Error(`kubectl exec stream failed: ${err.message}`))
    );
  });

  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exitCode,
  };
}

// ─── Stdin-based exec (for imports) ──────────────────────

/**
 * Execute a command in a pod, piping data to stdin.
 * Use for imports (e.g., psql < dump.sql, tar -xzf from stdin).
 */
export async function execInPodWithStdin(
  namespace: string,
  podName: string,
  command: string[],
  input: Buffer | string,
  containerName?: string
): Promise<ExecResult> {
  const args = ["exec", "-i", podName, "-n", namespace];

  if (containerName) {
    args.push("-c", containerName);
  }

  args.push("--", ...command);

  return new Promise((resolve, reject) => {
    const child = spawn("kubectl", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (data: Buffer) => {
      chunks.push(data);
    });

    child.stderr.on("data", (data: Buffer) => {
      errChunks.push(data);
    });

    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(chunks).toString("utf-8"),
        stderr: Buffer.concat(errChunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });

    child.on("error", (err) => {
      reject(new Error(`kubectl exec with stdin failed: ${err.message}`));
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
