/**
 * Backfill chart_version, app_version, and revision for existing deployments.
 *
 * Queries Helm for each RUNNING deployment and updates the DB.
 *
 * Usage:
 *   yarn tsx scripts/backfill-versions.ts
 */

import { config } from "dotenv";

// Load env FIRST — before any dynamic imports that need DATABASE_URL
config({ path: ".env.local" });

async function main() {
  // Dynamic imports so env vars are loaded before db.ts creates pg.Pool
  const { prisma } = await import("../src/lib/db.js");
  const { helmList } = await import("../src/lib/cluster/helm.js");

  const deployments = await prisma.deployment.findMany({
    where: { status: "RUNNING" },
    select: {
      id: true,
      name: true,
      helmRelease: true,
      namespace: true,
      chartVersion: true,
      appVersion: true,
    },
  });

  console.log(`Found ${deployments.length} running deployments to backfill`);

  // Get all namespaces we need data for
  const namespaces = [...new Set(deployments.map((d) => d.namespace))];

  // Build a lookup map: "namespace/releaseName" → HelmListEntry
  const helmReleases = new Map<string, { chart: string; app_version: string; revision: string }>();
  for (const ns of namespaces) {
    const releases = await helmList(ns);
    for (const r of releases) {
      helmReleases.set(`${r.namespace}/${r.name}`, r);
    }
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const d of deployments) {
    // Skip if already populated
    if (d.chartVersion && d.appVersion) {
      console.log(`  [skip] ${d.name} — already has version info`);
      skipped++;
      continue;
    }

    const key = `${d.namespace}/${d.helmRelease}`;
    const release = helmReleases.get(key);

    if (!release) {
      console.warn(`  [miss] ${d.name} — no Helm release found for ${key}`);
      notFound++;
      continue;
    }

    await prisma.deployment.update({
      where: { id: d.id },
      data: {
        chartVersion: release.chart || null,
        appVersion: release.app_version || null,
        revision: parseInt(release.revision, 10) || 1,
      },
    });

    console.log(
      `  [ok] ${d.name} → chart: ${release.chart}, app: ${release.app_version}, rev: ${release.revision}`
    );
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${notFound} not found`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
