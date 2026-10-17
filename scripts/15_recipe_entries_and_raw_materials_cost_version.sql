-- =============================================================================
-- recipe_entries.version + raw_materials_cost.version (initial backfill = 1)
-- Prerequisite: scripts/14_item_versions.sql (item_versions table)
-- Run: psql ... -f scripts/15_recipe_entries_and_raw_materials_cost_version.sql
-- =============================================================================


-- 1. recipe_entries.version
ALTER TABLE public.recipe_entries
    ADD COLUMN IF NOT EXISTS version integer;

UPDATE public.recipe_entries
SET version = 1
WHERE version IS NULL;

ALTER TABLE public.recipe_entries
    ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE public.recipe_entries
    ALTER COLUMN version SET NOT NULL;

-- 2. item_versions: one row per dish code at version 1 (existing recipes)
INSERT INTO public.item_versions (item_code, item_type, version)
SELECT DISTINCT UPPER(TRIM(dishcode)), 'dishes', 1
FROM public.recipe_entries
WHERE dishcode IS NOT NULL
  AND TRIM(dishcode) <> ''
ON CONFLICT (item_code, item_type) DO NOTHING;

-- 3. raw_materials_cost.version
ALTER TABLE public.raw_materials_cost
    ADD COLUMN IF NOT EXISTS version integer;

UPDATE public.raw_materials_cost
SET version = 1
WHERE version IS NULL;

ALTER TABLE public.raw_materials_cost
    ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE public.raw_materials_cost
    ALTER COLUMN version SET NOT NULL;

-- 4. item_versions: one row per pgNo at version 1 (existing cost rows)
INSERT INTO public.item_versions (item_code, item_type, version)
SELECT DISTINCT UPPER(TRIM("pgNo")), 'raw_materials_cost', 1
FROM public.raw_materials_cost
WHERE "pgNo" IS NOT NULL
  AND TRIM("pgNo") <> ''
ON CONFLICT (item_code, item_type) DO NOTHING;

-- 5. scoop_config.version
ALTER TABLE public.scoop_config
    ADD COLUMN IF NOT EXISTS version integer;

UPDATE public.scoop_config
SET version = 1
WHERE version IS NULL;

ALTER TABLE public.scoop_config
    ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE public.scoop_config
    ALTER COLUMN version SET NOT NULL;

-- 6. item_versions: one row per scoop_name at version 1 (existing scoop_config)
INSERT INTO public.item_versions (item_code, item_type, version)
SELECT DISTINCT LOWER(TRIM(scoop_name)), 'scoop_config', 1
FROM public.scoop_config
WHERE scoop_name IS NOT NULL
  AND TRIM(scoop_name) <> ''
ON CONFLICT (item_code, item_type) DO NOTHING;
