/**
 * Production entry point for the BullMQ worker.
 *
 * In production, environment variables are provided by the container runtime
 * (K8s, Docker, etc.) — no .env.local loading needed. This file uses static
 * imports so esbuild can bundle everything into a single file.
 */

import { startWorker } from "./main.js";

startWorker();
