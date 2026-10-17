-- =============================================================================
-- Truncate ALL recipe_entries and reseed version 1 from dish_cost_staging
-- (cleaned baseline export — last expected recipe only; no history).
-- Prerequisite: dish_cost_staging populated with cleaned dish-cost CSV;
--               scripts/14 + 15 applied.
-- =============================================================================

BEGIN;

TRUNCATE public.recipe_entries RESTART IDENTITY;

-- Ingredient lines
INSERT INTO public.recipe_entries (
    dishname,
    dishcode,
    reciepeitemname,
    "pgNo",
    receipescoop,
    qty,
    "inGm",
    "inML",
    "inPiece",
    is_usable_in_other_dish,
    usable_processed_scoop,
    qty_of_scoops,
    comments,
    version
)
SELECT
    nullif(trim(c.dishname), ''),
    nullif(trim(c.dish_code), ''),
    nullif(trim(c.itemname), ''),
    nullif(trim(c."pgNo_or_dishCode"), ''),
    nullif(trim(c.receipescoop), ''),
    nullif(trim(c.qty), '')::numeric,
    CASE lower(trim(coalesce(c.destination_unit, '')))
        WHEN 'gm' THEN nullif(trim(c.qty), '')::numeric
            * coalesce(nullif(trim(c.scoop_factor), '')::numeric, 1::numeric)
        ELSE NULL
    END,
    CASE lower(trim(coalesce(c.destination_unit, '')))
        WHEN 'ml' THEN nullif(trim(c.qty), '')::numeric
            * coalesce(nullif(trim(c.scoop_factor), '')::numeric, 1::numeric)
        ELSE NULL
    END,
    CASE lower(trim(coalesce(c.destination_unit, '')))
        WHEN 'piece' THEN nullif(trim(c.qty), '')::numeric
            * coalesce(nullif(trim(c.scoop_factor), '')::numeric, 1::numeric)
        ELSE NULL
    END,
    CASE
        WHEN c.is_usable_in_other_dish IS NULL OR trim(c.is_usable_in_other_dish) = '' THEN false
        WHEN upper(trim(c.is_usable_in_other_dish)) IN ('TRUE', 'T', '1', 'YES') THEN true
        ELSE false
    END,
    NULL,
    NULL,
    NULL,
    1
FROM public.dish_cost_staging c
WHERE lower(trim(coalesce(c.row_kind, ''))) = 'line'
  AND trim(coalesce(c.dish_code, '')) <> ''
  AND nullif(trim(c.qty), '') IS NOT NULL;

-- dish_out from dish_total
INSERT INTO public.recipe_entries (
    dishname,
    dishcode,
    reciepeitemname,
    "pgNo",
    receipescoop,
    qty,
    "inGm",
    "inML",
    "inPiece",
    is_usable_in_other_dish,
    usable_processed_scoop,
    qty_of_scoops,
    comments,
    version
)
SELECT DISTINCT ON (upper(trim(c.dish_code)))
    nullif(trim(c.dishname), ''),
    nullif(trim(c.dish_code), ''),
    'dish_out',
    NULL,
    nullif(trim(c.out_scoop), ''),
    nullif(trim(c.qty_of_scoops), '')::numeric,
    NULL,
    NULL,
    NULL,
    CASE
        WHEN c.is_usable_in_other_dish IS NULL OR trim(c.is_usable_in_other_dish) = '' THEN false
        WHEN upper(trim(c.is_usable_in_other_dish)) IN ('TRUE', 'T', '1', 'YES') THEN true
        ELSE false
    END,
    NULL,
    nullif(trim(c.qty_of_scoops), '')::numeric,
    NULL,
    1
FROM public.dish_cost_staging c
WHERE lower(trim(coalesce(c.row_kind, ''))) = 'dish_total'
  AND trim(coalesce(c.dish_code, '')) <> ''
ORDER BY upper(trim(c.dish_code)), ctid DESC;

-- Reset dish pointers to version 1
DELETE FROM public.item_versions WHERE item_type = 'dishes';

INSERT INTO public.item_versions (item_code, item_type, version)
SELECT DISTINCT upper(trim(dishcode)), 'dishes', 1
FROM public.recipe_entries
WHERE dishcode IS NOT NULL AND trim(dishcode) <> ''
ON CONFLICT (item_code, item_type)
DO UPDATE SET version = 1, last_updated_at = CURRENT_TIMESTAMP;

COMMIT;

SELECT 'recipe_rows' AS label, count(*)::text AS n FROM public.recipe_entries
UNION ALL
SELECT 'ingredient_lines', count(*)::text FROM public.recipe_entries
WHERE lower(trim(reciepeitemname)) NOT IN ('dish_out','totalingredientsqty','totalprocessedqty')
UNION ALL
SELECT 'dish_out_rows', count(*)::text FROM public.recipe_entries
WHERE lower(trim(reciepeitemname)) = 'dish_out'
UNION ALL
SELECT 'dishes_in_item_versions', count(*)::text FROM public.item_versions
WHERE item_type = 'dishes'
UNION ALL
SELECT 'd151_rows', count(*)::text FROM public.recipe_entries
WHERE upper(trim(dishcode)) = 'D151';
