-- AlterTable: Add consumer-facing fields to recipes
ALTER TABLE "recipes" ADD COLUMN "short_description" TEXT;
ALTER TABLE "recipes" ADD COLUMN "use_cases" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "recipes" ADD COLUMN "getting_started" TEXT;
ALTER TABLE "recipes" ADD COLUMN "screenshots" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "recipes" ADD COLUMN "website_url" TEXT;
ALTER TABLE "recipes" ADD COLUMN "documentation_url" TEXT;
ALTER TABLE "recipes" ADD COLUMN "install_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "recipes" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
