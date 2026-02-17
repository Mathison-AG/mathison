-- Step 22: Slim Recipe model
-- Remove all static metadata fields from recipes table.
-- Static data now lives in the typed recipe registry (src/recipes/).
-- Only dynamic/DB-specific fields remain: slug, install_count, featured, embedding.

-- Drop the recipe_versions table (no longer needed)
DROP TABLE IF EXISTS "recipe_versions";

-- Remove static fields from recipes
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "display_name";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "description";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "category";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "tags";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "icon_url";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "source_type";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "chart_url";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "chart_version";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "config_schema";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "secrets_schema";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "values_template";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "dependencies";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "ingress_config";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "resource_defaults";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "resource_limits";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "health_check";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "short_description";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "use_cases";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "getting_started";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "screenshots";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "website_url";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "documentation_url";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "has_web_ui";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "ai_hints";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "tier";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "status";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "created_by_id";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "version";
