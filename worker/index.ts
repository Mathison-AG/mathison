/**
 * Mathison BullMQ Worker — Bootstrap
 *
 * Loads environment variables BEFORE any other module imports.
 * This is critical because db.ts creates a pg.Pool at import time
 * using DATABASE_URL, which must be available.
 *
 * Start with: yarn worker (tsx watch worker/index.ts)
 */

import { config } from "dotenv";

// Load env FIRST — before any dynamic imports
config({ path: ".env.local" });

// Now dynamically import everything that depends on env vars
async function bootstrap() {
  const { startWorker } = await import("./main.js");
  startWorker();
}

bootstrap().catch((err) => {
  console.error("[worker] Fatal bootstrap error:", err);
  process.exit(1);
});
