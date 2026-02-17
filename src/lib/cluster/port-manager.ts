/**
 * Port Manager — Local Port Assignment for Port-Forwarding
 *
 * Manages local port assignments for kind/development clusters.
 * Ports are persisted on the Deployment record (localPort field).
 * Range: 10000–10999
 */

import { prisma } from "@/lib/db";

// ─── Configuration ──────────────────────────────────────

const PORT_RANGE_START = 10000;
const PORT_RANGE_END = 10999;

// ─── Port assignment ────────────────────────────────────

/**
 * Assign the next available port to a deployment.
 * Scans existing deployment records to find a free port.
 */
export async function assignPort(deploymentId: string): Promise<number> {
  // Get all currently assigned ports
  const usedPorts = await prisma.deployment.findMany({
    where: {
      localPort: { not: null },
      status: { notIn: ["STOPPED"] },
    },
    select: { localPort: true },
  });

  const usedSet = new Set(usedPorts.map((d) => d.localPort).filter(Boolean));

  // Find the first available port in range
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedSet.has(port)) {
      // Assign the port to the deployment
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { localPort: port },
      });

      console.log(`[port-manager] Assigned port ${port} to deployment ${deploymentId}`);
      return port;
    }
  }

  throw new Error(
    `[port-manager] No available ports in range ${PORT_RANGE_START}–${PORT_RANGE_END}`
  );
}

/**
 * Release the port assigned to a deployment.
 * Sets localPort to null on the deployment record.
 */
export async function releasePort(deploymentId: string): Promise<void> {
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { localPort: true },
    });

    if (deployment?.localPort) {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { localPort: null },
      });
      console.log(
        `[port-manager] Released port ${deployment.localPort} from deployment ${deploymentId}`
      );
    }
  } catch (err) {
    // Deployment may have been deleted already
    console.warn(`[port-manager] Could not release port for ${deploymentId}:`, err);
  }
}

/**
 * Get port assignment info for a deployment.
 */
export async function getPortAssignment(deploymentId: string): Promise<{
  localPort: number;
  servicePort: number;
  serviceName: string;
  namespace: string;
} | null> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      localPort: true,
      servicePort: true,
      serviceName: true,
      namespace: true,
    },
  });

  if (!deployment?.localPort || !deployment.servicePort || !deployment.serviceName) {
    return null;
  }

  return {
    localPort: deployment.localPort,
    servicePort: deployment.servicePort,
    serviceName: deployment.serviceName,
    namespace: deployment.namespace,
  };
}
