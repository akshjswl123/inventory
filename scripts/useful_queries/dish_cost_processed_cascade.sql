-- =============================================================================
-- Processed-dish cascade — FIND affected dishes (recursive parents)
-- =============================================================================
-- When a processed dish (e.g. P8 AATA PROCESSED) is saved, dish cost should be
-- recalculated for that dish and every parent that uses it on a processed line
-- (pgNo = child dish code), transitively.
--
-- App implementation: dishCostWalk.js (FIND_AFFECTED_DISHES_SQL,
-- runDishCostCascadeToStaging). Docs: dish_cost_processed_cascade.md
--
-- Edit saved_dish_code below (or: psql -v saved_dish_code=P8 -f ...).
-- =============================================================================

-- For psql -v saved_dish_code=P8 the variable replaces :'saved_dish_code' when used;
-- in Query tab, change the literal in params CTE only.

WITH params AS (
    SELECT 'P8'::text AS saved_dish_code   -- e.g. P8, D059, SS-BASE
),

-- Same versioned recipe_scope as dish_cost_cases.sql
recipe_current_version AS (
    SELECT
        iv.item_code AS dish_code,
        iv.version AS current_version
    FROM public.item_versions iv
    WHERE iv.item_type = 'dishes'
),

recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    WHERE re.dishcode IS NOT NULL
      AND TRIM(re.dishcode) <> ''
      AND re.version = COALESCE(
          (
              SELECT cv.current_version
              FROM recipe_current_version cv
              WHERE cv.dish_code = UPPER(TRIM(re.dishcode))
              LIMIT 1
          ),
          (
              SELECT MAX(sub.version)
              FROM public.recipe_entries sub
              WHERE UPPER(TRIM(sub.dishcode)) = UPPER(TRIM(re.dishcode))
          ),
          1
      )
),

recipe_dish_codes AS (
    SELECT DISTINCT UPPER(TRIM(dishcode)) AS dish_code
    FROM recipe_scope
),

-- Recursive upward walk: saved dish + all parents using it as processed child
affected AS (
    SELECT UPPER(TRIM(p.saved_dish_code)) AS dish_code
    FROM params p
    WHERE TRIM(p.saved_dish_code) <> ''

    UNION

    SELECT DISTINCT UPPER(TRIM(parent.dishcode)) AS dish_code
    FROM recipe_scope parent
    INNER JOIN affected child
        ON UPPER(TRIM(parent."pgNo")) = child.dish_code
    INNER JOIN recipe_dish_codes rd
        ON rd.dish_code = child.dish_code
    CROSS JOIN params p
    WHERE parent.dishcode IS NOT NULL
      AND TRIM(parent.dishcode) <> ''
      AND UPPER(TRIM(parent.dishcode)) <> child.dish_code
      AND LOWER(TRIM(parent.reciepeitemname)) NOT IN (
          'dish_out', 'totalingredientsqty', 'totalprocessedqty'
      )
      AND parent.qty IS NOT NULL
      AND parent.qty > 0
)

-- ---------------------------------------------------------------------------
-- Result 1: dish codes that would be recalculated + inserted into staging
--           (one new dish_cost_version in the app; one dish_cost_cases run each)
-- ---------------------------------------------------------------------------
SELECT
    a.dish_code,
    (
        SELECT DISTINCT TRIM(rs.dishname)
        FROM recipe_scope rs
        WHERE UPPER(TRIM(rs.dishcode)) = a.dish_code
        LIMIT 1
    ) AS dishname,
    (
        SELECT iv.version
        FROM public.item_versions iv
        WHERE iv.item_type = 'dishes'
          AND iv.item_code = a.dish_code
        LIMIT 1
    ) AS recipe_version_in_item_versions
FROM affected a
ORDER BY a.dish_code;

-- ---------------------------------------------------------------------------
-- Result 2: direct parent → child edges for the saved root (one level per row;
--           full cascade is the recursive closure in Result 1)
-- ---------------------------------------------------------------------------
WITH params AS (
    SELECT 'P8'::text AS saved_dish_code
),
recipe_current_version AS (
    SELECT iv.item_code AS dish_code, iv.version AS current_version
    FROM public.item_versions iv
    WHERE iv.item_type = 'dishes'
),
recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    WHERE re.dishcode IS NOT NULL AND TRIM(re.dishcode) <> ''
      AND re.version = COALESCE(
          (SELECT cv.current_version FROM recipe_current_version cv
           WHERE cv.dish_code = UPPER(TRIM(re.dishcode)) LIMIT 1),
          (SELECT MAX(sub.version) FROM recipe_entries sub
           WHERE UPPER(TRIM(sub.dishcode)) = UPPER(TRIM(re.dishcode))), 1)
),
recipe_dish_codes AS (
    SELECT DISTINCT UPPER(TRIM(dishcode)) AS dish_code FROM recipe_scope
)
SELECT
    UPPER(TRIM(parent.dishcode)) AS parent_dish_code,
    TRIM(parent.dishname) AS parent_dishname,
    UPPER(TRIM(parent."pgNo")) AS child_dish_code,
    TRIM(parent.reciepeitemname) AS line_itemname,
    parent.qty
FROM recipe_scope parent
CROSS JOIN params p
INNER JOIN recipe_dish_codes rd
    ON rd.dish_code = UPPER(TRIM(p.saved_dish_code))
WHERE UPPER(TRIM(parent."pgNo")) = UPPER(TRIM(p.saved_dish_code))
  AND UPPER(TRIM(parent.dishcode)) <> UPPER(TRIM(p.saved_dish_code))
  AND LOWER(TRIM(parent.reciepeitemname)) NOT IN (
      'dish_out', 'totalingredientsqty', 'totalprocessedqty'
  )
  AND parent.qty IS NOT NULL AND parent.qty > 0
ORDER BY parent_dish_code;

-- ---------------------------------------------------------------------------
-- Result 3: latest dish_total in staging for affected codes (if any)
-- ---------------------------------------------------------------------------
WITH params AS (
    SELECT 'P8'::text AS saved_dish_code
),
recipe_current_version AS (
    SELECT iv.item_code AS dish_code, iv.version AS current_version
    FROM public.item_versions iv
    WHERE iv.item_type = 'dishes'
),
recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    WHERE re.dishcode IS NOT NULL AND TRIM(re.dishcode) <> ''
      AND re.version = COALESCE(
          (SELECT cv.current_version FROM recipe_current_version cv
           WHERE cv.dish_code = UPPER(TRIM(re.dishcode)) LIMIT 1),
          (SELECT MAX(sub.version) FROM recipe_entries sub
           WHERE UPPER(TRIM(sub.dishcode)) = UPPER(TRIM(re.dishcode))), 1)
),
recipe_dish_codes AS (
    SELECT DISTINCT UPPER(TRIM(dishcode)) AS dish_code FROM recipe_scope
),
affected AS (
    SELECT UPPER(TRIM(p.saved_dish_code)) AS dish_code FROM params p
    UNION
    SELECT DISTINCT UPPER(TRIM(parent.dishcode))
    FROM recipe_scope parent
    INNER JOIN affected child ON UPPER(TRIM(parent."pgNo")) = child.dish_code
    INNER JOIN recipe_dish_codes rd ON rd.dish_code = child.dish_code
    WHERE UPPER(TRIM(parent.dishcode)) <> child.dish_code
      AND LOWER(TRIM(parent.reciepeitemname)) NOT IN (
          'dish_out', 'totalingredientsqty', 'totalprocessedqty'
      )
      AND parent.qty IS NOT NULL AND parent.qty > 0
),
latest_staging AS (
    SELECT DISTINCT ON (UPPER(TRIM(s.dish_code)))
        s.dish_code,
        s.dishname,
        s.dish_cost,
        s.dish_cost_version,
        s.incomplete
    FROM public.dish_cost_staging s
    INNER JOIN affected a ON UPPER(TRIM(s.dish_code)) = a.dish_code
    WHERE LOWER(TRIM(COALESCE(s.row_kind, ''))) = 'dish_total'
      AND TRIM(COALESCE(s.dish_code, '')) <> ''
    ORDER BY
        UPPER(TRIM(s.dish_code)),
        NULLIF(TRIM(s.dish_cost_version), '')::integer DESC NULLS LAST
)
SELECT * FROM latest_staging ORDER BY dish_code;
