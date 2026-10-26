-- Reset dish cost staging history and published-cost counters to version 1.
-- Does NOT change recipe versions (item_versions.item_type = dishes).
-- After this, run Query tab "Calculate cost (all dishes)" to repopulate staging.

BEGIN;

TRUNCATE public.dish_cost_staging;

UPDATE public.item_versions
SET version = 1,
    last_updated_at = CURRENT_TIMESTAMP
WHERE item_type = 'dish_cost_staging';

INSERT INTO public.item_versions (item_code, item_type, version)
SELECT DISTINCT UPPER(TRIM(dishcode)), 'dish_cost_staging', 1
FROM public.recipe_entries
WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
ON CONFLICT (item_code, item_type)
DO UPDATE SET
    version = 1,
    last_updated_at = CURRENT_TIMESTAMP;

COMMIT;

SELECT 'dish_cost_staging_rows' AS label, count(*)::text AS n FROM public.dish_cost_staging
UNION ALL
SELECT 'item_versions_dish_cost_staging', count(*)::text
FROM public.item_versions WHERE item_type = 'dish_cost_staging'
UNION ALL
SELECT 'max_dish_cost_staging_version',
       coalesce(max(version)::text, '0')
FROM public.item_versions WHERE item_type = 'dish_cost_staging';
