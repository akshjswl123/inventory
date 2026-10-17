-- =============================================================================
-- dishCostFromDB → version 1 on recipe_entries, raw_materials_cost, scoop_config
-- + item_versions upsert. Source: public.dish_cost_cleaned_up
-- Prerequisite: 14, 15, dish_cost_cleaned_up loaded (see dish_cost_import_and_clean.sh)
-- Run: docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--        < scripts/16_seed_v1_from_dish_cost_db.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Reference sets from dish_cost_cleaned_up
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _dish_cost_dishes ON COMMIT DROP AS
SELECT DISTINCT upper(trim(dish_code)) AS dish_code_key
FROM public.dish_cost_cleaned_up
WHERE trim(coalesce(dish_code, '')) <> '';

CREATE TEMP TABLE _dish_cost_pgno_raw ON COMMIT DROP AS
SELECT DISTINCT upper(trim("pgNo_or_dishCode")) AS pgno_key
FROM public.dish_cost_cleaned_up
WHERE lower(trim(coalesce(row_kind, ''))) = 'line'
  AND lower(trim(coalesce(line_kind, ''))) = 'raw'
  AND trim(coalesce("pgNo_or_dishCode", '')) <> '';

CREATE TEMP TABLE _dish_cost_scoops ON COMMIT DROP AS
SELECT DISTINCT lower(trim(scoop)) AS scoop_key
FROM (
    SELECT receipescoop AS scoop FROM public.dish_cost_cleaned_up
    UNION ALL
    SELECT out_scoop FROM public.dish_cost_cleaned_up
) u
WHERE trim(coalesce(scoop, '')) <> '';

-- ---------------------------------------------------------------------------
-- 1) raw_materials_cost.version = 1 + item_versions
-- ---------------------------------------------------------------------------

UPDATE public.raw_materials_cost r
SET version = 1
WHERE upper(trim(r."pgNo")) IN (SELECT pgno_key FROM _dish_cost_pgno_raw);

INSERT INTO public.item_versions (item_code, item_type, version)
SELECT pgno_key, 'raw_materials_cost', 1
FROM _dish_cost_pgno_raw
ON CONFLICT (item_code, item_type)
DO UPDATE SET
    version = 1,
    last_updated_at = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 2) scoop_config.version = 1 + item_versions
-- ---------------------------------------------------------------------------

UPDATE public.scoop_config sc
SET version = 1
WHERE lower(trim(sc.scoop_name)) IN (SELECT scoop_key FROM _dish_cost_scoops);

INSERT INTO public.item_versions (item_code, item_type, version)
SELECT scoop_key, 'scoop_config', 1
FROM _dish_cost_scoops
ON CONFLICT (item_code, item_type)
DO UPDATE SET
    version = 1,
    last_updated_at = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 3) dishes item_versions
-- ---------------------------------------------------------------------------

INSERT INTO public.item_versions (item_code, item_type, version)
SELECT dish_code_key, 'dishes', 1
FROM _dish_cost_dishes
ON CONFLICT (item_code, item_type)
DO UPDATE SET
    version = 1,
    last_updated_at = CURRENT_TIMESTAMP;

-- ---------------------------------------------------------------------------
-- 4) recipe_entries from dishCostFromDB (version 1)
-- ---------------------------------------------------------------------------

DELETE FROM public.recipe_entries re
WHERE upper(trim(re.dishcode)) IN (SELECT dish_code_key FROM _dish_cost_dishes);

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
FROM public.dish_cost_cleaned_up c
WHERE lower(trim(coalesce(c.row_kind, ''))) = 'line'
  AND trim(coalesce(c.dish_code, '')) <> ''
  AND nullif(trim(c.qty), '') IS NOT NULL;

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
FROM public.dish_cost_cleaned_up c
WHERE lower(trim(coalesce(c.row_kind, ''))) = 'dish_total'
  AND trim(coalesce(c.dish_code, '')) <> ''
ORDER BY
    upper(trim(c.dish_code)),
    c.sort_seq DESC NULLS LAST;

-- Validation (before COMMIT — temp tables still exist)
SELECT 'dishes_in_dishCostFromDB' AS label, count(*)::bigint AS n FROM _dish_cost_dishes
UNION ALL
SELECT 'raw_pgno_keys', count(*)::bigint FROM _dish_cost_pgno_raw
UNION ALL
SELECT 'scoop_keys', count(*)::bigint FROM _dish_cost_scoops
UNION ALL
SELECT 'recipe_entries_v1_seeded', count(*)::bigint
FROM public.recipe_entries re
WHERE upper(trim(re.dishcode)) IN (SELECT dish_code_key FROM _dish_cost_dishes)
  AND re.version = 1;

COMMIT;
