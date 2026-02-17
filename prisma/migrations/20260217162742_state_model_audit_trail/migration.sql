/*
  Warnings:

  - You are about to drop the column `chart_version` on the `deployments` table. All the data in the column will be lost.
  - You are about to drop the column `helm_release` on the `deployments` table. All the data in the column will be lost.
  - You are about to drop the column `revision` on the `deployments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "deployments" DROP COLUMN "chart_version",
DROP COLUMN "helm_release",
DROP COLUMN "revision";

-- CreateTable
CREATE TABLE "deployment_events" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous_state" JSONB,
    "new_state" JSONB NOT NULL,
    "reason" TEXT,
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deployment_events_deployment_id_created_at_idx" ON "deployment_events"("deployment_id", "created_at");

-- AddForeignKey
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
