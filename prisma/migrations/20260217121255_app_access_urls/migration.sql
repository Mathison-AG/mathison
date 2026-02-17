-- AlterTable
ALTER TABLE "deployments" ADD COLUMN     "local_port" INTEGER,
ADD COLUMN     "service_name" TEXT,
ADD COLUMN     "service_port" INTEGER;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "has_web_ui" BOOLEAN NOT NULL DEFAULT false;
