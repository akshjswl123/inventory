-- =============================================================================
-- Recipes with no processed sub-dishes (raw ingredients only)
-- =============================================================================
-- Uses the latest saved recipe per dishcode (recipe_entries).
--
-- A line counts as a processed dish ingredient when:
--   • It is not a raw_materials catalog row (pgNo + itemname), and
--   • pgNo matches another recipe's dishcode (same rule as receipe_portion.sql).
--
-- Excluded meta rows: dish_out, totalingredientsqty, totalprocessedqty.
--
-- FILTERS — edit dish_filter: NULL or '' = all dishes with recipes
-- Run: psql -f scripts/useful_queries/recipes_raw_only_list.sql
-- =============================================================================

WITH

dish_filter AS (
    SELECT
        NULL::text AS dishcode,
        NULL::text AS dishname
),

recipe_latest_batch AS (
    SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
        UPPER(TRIM(dishcode)) AS dish_code,
        created_at AS saved_at
    FROM public.recipe_entries
    WHERE dishcode IS NOT NULL
      AND TRIM(dishcode) <> ''
    ORDER BY UPPER(TRIM(dishcode)), created_at DESC, id DESC
),

recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    INNER JOIN recipe_latest_batch lb
        ON UPPER(TRIM(re.dishcode)) = lb.dish_code
       AND re.created_at >= lb.saved_at - interval '30 seconds'
),

all_recipe_dishes AS (
    SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re.dishname) AS dishname,
        re.created_at AS recipe_saved_at
    FROM recipe_scope re
    WHERE re.dishcode IS NOT NULL
      AND TRIM(re.dishcode) <> ''
    ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
),

ingredient_lines AS (
    SELECT DISTINCT ON (
        UPPER(TRIM(re.dishcode)),
        TRIM(re."pgNo"),
        LOWER(TRIM(re.reciepeitemname)),
        COALESCE(NULLIF(TRIM(re.receipescoop), ''), ''),
        re.qty
    )
        re.id AS line_id,
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re.reciepeitemname) AS itemname,
        TRIM(re."pgNo") AS item_id,
        re.qty::numeric AS qty
    FROM recipe_scope re
    WHERE LOWER(TRIM(re.reciepeitemname)) NOT IN (
              'totalingredientsqty',
              'totalprocessedqty',
              'dish_out'
          )
      AND re.qty IS NOT NULL
      AND re.qty > 0
    ORDER BY
        UPPER(TRIM(re.dishcode)),
        TRIM(re."pgNo"),
        LOWER(TRIM(re.reciepeitemname)),
        COALESCE(NULLIF(TRIM(re.receipescoop), ''), ''),
        re.qty,
        re.id DESC
),

line_classified AS (
    SELECT
        il.*,
        EXISTS (
            SELECT 1
            FROM public.raw_materials rm
            WHERE TRIM(rm."pgNo") = il.item_id
              AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(il.itemname))
        ) AS is_raw,
        EXISTS (
            SELECT 1
            FROM all_recipe_dishes d
            WHERE d.dish_code = UPPER(TRIM(il.item_id))
        ) AS is_known_dish,
        EXISTS (
            SELECT 1
            FROM public.dishes d
            WHERE UPPER(TRIM(d.dish_code)) = UPPER(TRIM(il.item_id))
              AND LOWER(TRIM(d.dish_name)) = LOWER(TRIM(il.itemname))
        ) AS is_catalog_dish
    FROM ingredient_lines il
),

processed_lines AS (
    SELECT
        lc.dish_code,
        lc.item_id AS child_dish_code,
        lc.itemname AS child_dishname,
        lc.qty
    FROM line_classified lc
    WHERE NOT lc.is_raw
      AND (lc.is_known_dish OR lc.is_catalog_dish)
),

dish_line_stats AS (
    SELECT
        lc.dish_code,
        COUNT(*)::bigint AS ingredient_line_count,
        COUNT(*) FILTER (WHERE lc.is_raw)::bigint AS raw_line_count,
        COUNT(*) FILTER (
            WHERE NOT lc.is_raw
              AND (lc.is_known_dish OR lc.is_catalog_dish)
        )::bigint AS processed_dish_line_count,
        COUNT(*) FILTER (
            WHERE NOT lc.is_raw
              AND NOT lc.is_known_dish
              AND NOT lc.is_catalog_dish
        )::bigint AS unknown_line_count
    FROM line_classified lc
    GROUP BY lc.dish_code
),

dish_out_row AS (
    SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
        UPPER(TRIM(re.dishcode)) AS dish_code,
        COALESCE(re.is_usable_in_other_dish, false) AS is_usable_in_other_dish
    FROM recipe_scope re
    WHERE LOWER(TRIM(re.reciepeitemname)) = 'dish_out'
    ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
),

dishes_raw_only AS (
    SELECT ard.*
    FROM all_recipe_dishes ard
    CROSS JOIN dish_filter f
    WHERE (
            COALESCE(TRIM(f.dishcode), '') = ''
        AND COALESCE(TRIM(f.dishname), '') = ''
    )
    OR (
            COALESCE(TRIM(f.dishcode), '') <> ''
        AND ard.dish_code = UPPER(TRIM(f.dishcode))
    )
    OR (
            COALESCE(TRIM(f.dishname), '') <> ''
        AND LOWER(TRIM(ard.dishname)) = LOWER(TRIM(f.dishname))
    )
      AND NOT EXISTS (
          SELECT 1
          FROM processed_lines pl
          WHERE pl.dish_code = ard.dish_code
      )
)

SELECT
    dro.dish_code,
    dro.dishname,
    dro.recipe_saved_at,
    COALESCE(st.ingredient_line_count, 0) AS ingredient_line_count,
    COALESCE(st.raw_line_count, 0) AS raw_line_count,
    COALESCE(st.unknown_line_count, 0) AS unknown_line_count,
    COALESCE(dout.is_usable_in_other_dish, false) AS is_usable_in_other_dish,
    'raw_only'::text AS recipe_composition
FROM dishes_raw_only dro
LEFT JOIN dish_line_stats st
    ON st.dish_code = dro.dish_code
LEFT JOIN dish_out_row dout
    ON dout.dish_code = dro.dish_code
ORDER BY dro.dish_code;
