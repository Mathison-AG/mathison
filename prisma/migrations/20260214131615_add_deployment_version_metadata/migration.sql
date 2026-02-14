-- AlterTable
ALTER TABLE "deployments" ADD COLUMN     "app_version" TEXT,
ADD COLUMN     "chart_version" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workspaces" ALTER COLUMN "updated_at" DROP DEFAULT;
