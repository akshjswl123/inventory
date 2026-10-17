-- =============================================================================
-- Keep only the latest recipe save batch per dishcode as version 1.
-- Older saves (outside max(created_at) ± 30 seconds) are deleted.
-- Fixes cost explosions after script 15 stamped ALL history as version = 1.
-- Prerequisite: 14_item_versions, 15_..._version.sql
-- Run: docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--        < scripts/18_recipe_entries_keep_latest_batch_v1.sql
-- =============================================================================

BEGIN;

-- Preview counts before (shown after commit via final SELECT; capture in DO)
CREATE TEMP TABLE _recipe_cleanup_stats (
    label text,
    n bigint
);

INSERT INTO _recipe_cleanup_stats
SELECT 'rows_before', count(*) FROM public.recipe_entries;

INSERT INTO _recipe_cleanup_stats
SELECT 'dishes_before', count(DISTINCT upper(trim(dishcode)))
FROM public.recipe_entries
WHERE dishcode IS NOT NULL AND trim(dishcode) <> '';

-- Latest save timestamp per dish
CREATE TEMP TABLE _latest_batch AS
SELECT
    upper(trim(dishcode)) AS dish_code_key,
    max(created_at) AS saved_at
FROM public.recipe_entries
WHERE dishcode IS NOT NULL
  AND trim(dishcode) <> ''
GROUP BY upper(trim(dishcode));

-- Delete older batches (same rule as former RECIPE_LATEST_BATCH_SQL)
DELETE FROM public.recipe_entries re
USING _latest_batch lb
WHERE upper(trim(re.dishcode)) = lb.dish_code_key
  AND re.created_at < lb.saved_at - interval '30 seconds';

-- Rows with empty dishcode: keep only latest batch by dishname if present
CREATE TEMP TABLE _latest_by_name AS
SELECT
    lower(trim(dishname)) AS dish_name_key,
    max(created_at) AS saved_at
FROM public.recipe_entries
WHERE (dishcode IS NULL OR trim(dishcode) = '')
  AND dishname IS NOT NULL
  AND trim(dishname) <> ''
GROUP BY lower(trim(dishname));

DELETE FROM public.recipe_entries re
USING _latest_by_name ln
WHERE (re.dishcode IS NULL OR trim(re.dishcode) = '')
  AND lower(trim(re.dishname)) = ln.dish_name_key
  AND re.created_at < ln.saved_at - interval '30 seconds';

-- Stamp remaining as version 1
UPDATE public.recipe_entries
SET version = 1
WHERE version IS DISTINCT FROM 1;

-- item_versions: current dish version = 1 for every dish that still has recipes
INSERT INTO public.item_versions (item_code, item_type, version)
SELECT DISTINCT upper(trim(dishcode)), 'dishes', 1
FROM public.recipe_entries
WHERE dishcode IS NOT NULL AND trim(dishcode) <> ''
ON CONFLICT (item_code, item_type)
DO UPDATE SET
    version = 1,
    last_updated_at = CURRENT_TIMESTAMP;

INSERT INTO _recipe_cleanup_stats
SELECT 'rows_after', count(*) FROM public.recipe_entries;

INSERT INTO _recipe_cleanup_stats
SELECT 'dishes_after', count(DISTINCT upper(trim(dishcode)))
FROM public.recipe_entries
WHERE dishcode IS NOT NULL AND trim(dishcode) <> '';

INSERT INTO _recipe_cleanup_stats
SELECT 'd151_rows_after', count(*)
FROM public.recipe_entries
WHERE upper(trim(dishcode)) = 'D151';

COMMIT;

SELECT * FROM _recipe_cleanup_stats ORDER BY label;
