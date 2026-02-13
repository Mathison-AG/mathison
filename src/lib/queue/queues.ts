/**
 * BullMQ Queue Instances
 *
 * Queue definitions for deployment, embedding, and monitoring jobs.
 * Shared connection from connection.ts ensures a single Redis connection.
 */

import { Queue } from "bullmq";
import { connection } from "./connection";

export const deploymentQueue = new Queue("deployments", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export const embeddingQueue = new Queue("embeddings", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 3000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

export const monitorQueue = new Queue("monitoring", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});
