-- Multi-workspace support
-- Adds Workspace model, updates Deployment and User models
-- Preserves all existing data by creating default workspaces for each tenant

-- 1. Create WorkspaceStatus enum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'DELETING', 'DELETED');

-- 2. Create workspaces table
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "quota" JSONB NOT NULL DEFAULT '{}',
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- 3. Unique indexes
CREATE UNIQUE INDEX "workspaces_namespace_key" ON "workspaces"("namespace");
CREATE UNIQUE INDEX "workspaces_tenant_id_slug_key" ON "workspaces"("tenant_id", "slug");

-- 4. FK: workspaces -> tenants
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. DATA MIGRATION: Create a default workspace for each existing tenant
-- Uses gen_random_uuid() (available in PG 13+) for CUID-style IDs
INSERT INTO "workspaces" ("id", "tenant_id", "slug", "name", "namespace", "quota", "updated_at")
SELECT
    'ws_' || replace(gen_random_uuid()::text, '-', ''),
    t."id",
    'default',
    'Default',
    t."namespace",
    t."quota",
    NOW()
FROM "tenants" t
WHERE t."status" != 'DELETED';

-- 6. Add workspace_id to deployments (nullable first)
ALTER TABLE "deployments" ADD COLUMN "workspace_id" TEXT;

-- 7. DATA MIGRATION: Set workspace_id from tenant's default workspace
UPDATE "deployments" d
SET "workspace_id" = w."id"
FROM "workspaces" w
WHERE w."tenant_id" = d."tenant_id" AND w."slug" = 'default';

-- 8. Make workspace_id NOT NULL
ALTER TABLE "deployments" ALTER COLUMN "workspace_id" SET NOT NULL;

-- 9. Drop old unique constraint, add new one
DROP INDEX IF EXISTS "deployments_tenant_id_name_key";
CREATE UNIQUE INDEX "deployments_workspace_id_name_key" ON "deployments"("workspace_id", "name");

-- 10. FK: deployments -> workspaces
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 11. Add active_workspace_id to users
ALTER TABLE "users" ADD COLUMN "active_workspace_id" TEXT;

-- 12. DATA MIGRATION: Set each user's active workspace to their tenant's default
UPDATE "users" u
SET "active_workspace_id" = w."id"
FROM "workspaces" w
WHERE w."tenant_id" = u."tenant_id" AND w."slug" = 'default';

-- 13. FK: users -> workspaces (active workspace)
ALTER TABLE "users" ADD CONSTRAINT "users_active_workspace_id_fkey"
    FOREIGN KEY ("active_workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 14. Remove namespace and quota from tenants (now on workspace)
ALTER TABLE "tenants" DROP COLUMN "namespace";
ALTER TABLE "tenants" DROP COLUMN "quota";
