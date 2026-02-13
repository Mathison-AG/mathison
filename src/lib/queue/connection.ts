/**
 * Redis/BullMQ Connection Configuration
 *
 * Shared connection options used by all BullMQ queues and workers.
 * Uses a plain options object to avoid ioredis version conflicts
 * between the top-level package and bullmq's bundled copy.
 */

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  db?: number;
} {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port, 10) || 6379,
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(parsed.pathname && parsed.pathname.length > 1
        ? { db: parseInt(parsed.pathname.slice(1), 10) }
        : {}),
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Connection options for BullMQ queues and workers.
 * Using a plain object avoids ioredis type conflicts.
 */
export const connection = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null as null, // Required by BullMQ
};
