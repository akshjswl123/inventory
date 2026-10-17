-- =============================================================================
-- Delete surplus scoop_config rows (case-insensitive duplicate scoop_name).
--
-- Keeps exactly ONE row per LOWER(TRIM(scoop_name)), preferring:
--   1) exact scoop_name used in recipe_entries (receipescoop / usable_processed_scoop)
--   2) exact scoop_name used on a purchase line tied to raw_materials_cost
--   3) unused = false
--   4) highest id
--
-- Run on: psql -h localhost -p 5433 -U poc -d poc -f scripts/useful_queries/scoop_config_delete_duplicate_surplus.sql
-- =============================================================================

-- --- 1) Preview: how many rows would be removed ---
WITH used_recipe_exact AS (
    SELECT DISTINCT TRIM(scoop) AS scoop_name
    FROM (
        SELECT receipescoop AS scoop FROM public.recipe_entries
        UNION ALL
        SELECT usable_processed_scoop FROM public.recipe_entries
    ) s
    WHERE scoop IS NOT NULL AND TRIM(scoop) <> ''
),
used_cost_exact AS (
    SELECT DISTINCT TRIM(oi.scoopin) AS scoop_name
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    INNER JOIN public.raw_materials_cost rmc
        ON TRIM(rmc."pgNo") = TRIM(oi.pgno)
       AND TRIM(rmc.based_on_billno) = TRIM(o.billno)
    WHERE oi.scoopin IS NOT NULL AND TRIM(oi.scoopin) <> ''
),
dup_keys AS (
    SELECT LOWER(TRIM(scoop_name)) AS scoop_key
    FROM public.scoop_config
    WHERE scoop_name IS NOT NULL AND TRIM(scoop_name) <> ''
    GROUP BY LOWER(TRIM(scoop_name))
    HAVING COUNT(*) > 1
),
ranked AS (
    SELECT
        sc.id,
        sc.scoop_name,
        sc.scoop_item_name,
        sc.scoop_item_id,
        sc.unused,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(sc.scoop_name))
            ORDER BY
                CASE WHEN ur.scoop_name IS NOT NULL THEN 0 ELSE 1 END,
                CASE WHEN uc.scoop_name IS NOT NULL THEN 0 ELSE 1 END,
                sc.unused ASC,
                sc.id DESC
        ) AS rn
    FROM public.scoop_config sc
    INNER JOIN dup_keys d ON LOWER(TRIM(sc.scoop_name)) = d.scoop_key
    LEFT JOIN used_recipe_exact ur ON ur.scoop_name = TRIM(sc.scoop_name)
    LEFT JOIN used_cost_exact uc ON uc.scoop_name = TRIM(sc.scoop_name)
)
SELECT COUNT(*) AS rows_to_delete
FROM ranked
WHERE rn > 1;

-- Detail (optional): list ids/names to delete
-- SELECT id, scoop_name, scoop_item_name, scoop_item_id, unused
-- FROM ranked WHERE rn > 1 ORDER BY LOWER(scoop_name), id;

-- --- 2) Delete (wrap in transaction; ROLLBACK first to verify) ---
BEGIN;

WITH used_recipe_exact AS (
    SELECT DISTINCT TRIM(scoop) AS scoop_name
    FROM (
        SELECT receipescoop AS scoop FROM public.recipe_entries
        UNION ALL
        SELECT usable_processed_scoop FROM public.recipe_entries
    ) s
    WHERE scoop IS NOT NULL AND TRIM(scoop) <> ''
),
used_cost_exact AS (
    SELECT DISTINCT TRIM(oi.scoopin) AS scoop_name
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    INNER JOIN public.raw_materials_cost rmc
        ON TRIM(rmc."pgNo") = TRIM(oi.pgno)
       AND TRIM(rmc.based_on_billno) = TRIM(o.billno)
    WHERE oi.scoopin IS NOT NULL AND TRIM(oi.scoopin) <> ''
),
dup_keys AS (
    SELECT LOWER(TRIM(scoop_name)) AS scoop_key
    FROM public.scoop_config
    WHERE scoop_name IS NOT NULL AND TRIM(scoop_name) <> ''
    GROUP BY LOWER(TRIM(scoop_name))
    HAVING COUNT(*) > 1
),
ranked AS (
    SELECT
        sc.id,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(sc.scoop_name))
            ORDER BY
                CASE WHEN ur.scoop_name IS NOT NULL THEN 0 ELSE 1 END,
                CASE WHEN uc.scoop_name IS NOT NULL THEN 0 ELSE 1 END,
                sc.unused ASC,
                sc.id DESC
        ) AS rn
    FROM public.scoop_config sc
    INNER JOIN dup_keys d ON LOWER(TRIM(sc.scoop_name)) = d.scoop_key
    LEFT JOIN used_recipe_exact ur ON ur.scoop_name = TRIM(sc.scoop_name)
    LEFT JOIN used_cost_exact uc ON uc.scoop_name = TRIM(sc.scoop_name)
),
deleted AS (
    DELETE FROM public.scoop_config sc
    USING ranked r
    WHERE sc.id = r.id
      AND r.rn > 1
    RETURNING sc.id
)
SELECT COUNT(*) AS deleted_rows FROM deleted;

-- COMMIT;
ROLLBACK;
