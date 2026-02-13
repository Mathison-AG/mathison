import { prisma } from "../src/lib/db";

async function main() {
  console.log("Seeding database...");

  // Recipes will be seeded in Step 04
  // Seed data will include: postgresql, redis, n8n, uptime-kuma, minio

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
