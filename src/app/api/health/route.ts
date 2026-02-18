import { NextResponse } from "next/server";
import net from "net";

import { prisma } from "@/lib/db";

/**
 * Health check endpoint for K8s liveness and readiness probes.
 *
 * GET /api/health         → liveness (always 200 if process is alive)
 * GET /api/health?ready=1 → readiness (checks DB + Redis, returns 503 if degraded)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const checkReady =
    url.searchParams.get("ready") === "true" ||
    url.searchParams.get("ready") === "1";

  if (!checkReady) {
    return NextResponse.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
    });
  }

  const checks: Record<string, "ok" | "error"> = {};

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    await tcpCheck(process.env.REDIS_URL || "redis://localhost:6379");
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }

  const allHealthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    {
      status: allHealthy ? "ok" : "degraded",
      uptime: Math.floor(process.uptime()),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}

function tcpCheck(redisUrl: string, timeoutMs = 2000): Promise<void> {
  let host = "localhost";
  let port = 6379;

  try {
    const parsed = new URL(redisUrl);
    host = parsed.hostname || "localhost";
    port = parseInt(parsed.port, 10) || 6379;
  } catch {
    // use defaults
  }

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
