-- =============================================================================
-- Recipe cost per portion — raw ingredients only (no processed sub-dishes)
-- =============================================================================
-- Same rates / scoop / dish_out logic as receipe_portion.sql, but:
--   • Includes only dishes with NO processed recipe lines (no child dish codes).
--   • batch_total_cost = SUM(raw ingredient line_cost) for the dish.
--   • cost_per_portion = batch_total_cost ÷ portions_per_batch (from dish_out).
--   • cost_calculation — human-readable formula (line: rate × qty; portion row: sum ÷ portions).
--
-- Use receipe_portion.sql when recipes reference other dishes as ingredients.
--
-- FILTERS — edit dish_filter (use dishcode OR dishname; NULL/'' on both = all dishes):
--   SELECT 'D039'::text AS dishcode, NULL::text AS dishname
--   SELECT NULL::text, 'Your Dish Name'::text AS dishname
--
-- Run: psql -f scripts/useful_queries/recipe_cost_no_processed.sql
--   Result 1 — portion rows only (one row per dish, with cost_calculation).
--   Result 2 — full breakdown (portion row + raw line_detail per dish).
-- =============================================================================

DROP VIEW IF EXISTS recipe_cost_no_processed_report;

CREATE TEMP VIEW recipe_cost_no_processed_report AS
WITH

dish_filter AS (
    SELECT
        NULL::text AS dishcode,
        NULL::text AS dishname
),

-- ===========================================================================
-- A. Latest saved recipe rows per dish
-- ===========================================================================

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

dishes_in_report AS (
    SELECT DISTINCT
        UPPER(TRIM(re.dishcode)) AS dish_code
    FROM recipe_scope re
    CROSS JOIN dish_filter f
    WHERE (
            COALESCE(TRIM(f.dishcode), '') = ''
        AND COALESCE(TRIM(f.dishname), '') = ''
    )
    OR (
            COALESCE(TRIM(f.dishcode), '') <> ''
        AND UPPER(TRIM(re.dishcode)) = UPPER(TRIM(f.dishcode))
    )
    OR (
            COALESCE(TRIM(f.dishname), '') <> ''
        AND LOWER(TRIM(re.dishname)) = LOWER(TRIM(f.dishname))
    )
),

all_recipe_dishes AS (
    SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re.dishname) AS dishname
    FROM recipe_scope re
    WHERE re.dishcode IS NOT NULL
      AND TRIM(re.dishcode) <> ''
    ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
),

-- ===========================================================================
-- B. Dish output / batch yield
-- ===========================================================================

dish_out_row AS (
    SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re.dishname) AS dishname,
        COALESCE(re.is_usable_in_other_dish, false) AS is_usable_in_other_dish,
        NULLIF(TRIM(re.receipescoop), '') AS dish_out_scoop,
        NULLIF(TRIM(re.usable_processed_scoop), '') AS usable_processed_scoop,
        COALESCE(re.qty_of_scoops, re.qty)::numeric AS qty_of_scoops,
        re."inGm"::numeric AS in_gm,
        re."inML"::numeric AS in_ml,
        re."inPiece"::numeric AS in_piece
    FROM recipe_scope re
    WHERE LOWER(TRIM(re.reciepeitemname)) = 'dish_out'
    ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
),

dish_out_cfg AS (
    SELECT
        d.*,
        CASE
            WHEN d.is_usable_in_other_dish
                THEN COALESCE(d.usable_processed_scoop, d.dish_out_scoop)
            ELSE d.dish_out_scoop
        END AS effective_scoop
    FROM dish_out_row d
),

dish_out_yield AS (
    SELECT
        d.*,

        LOWER(TRIM(sc.destination_unit)) AS scoop_destination_unit,

        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(sc.qty_in_ml,    sc.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE NULL
        END AS scoop_units_per_scoop,

        CASE
            WHEN d.is_usable_in_other_dish THEN
                CASE LOWER(TRIM(sc.destination_unit))
                    WHEN 'gm' THEN 'gm'
                    WHEN 'ml' THEN 'ml'
                    WHEN 'piece' THEN 'piece'
                    ELSE NULL
                END
            WHEN NULLIF(d.in_piece, 0) IS NOT NULL THEN 'piece'
            WHEN NULLIF(d.in_gm, 0) IS NOT NULL THEN 'gm'
            WHEN NULLIF(d.in_ml, 0) IS NOT NULL THEN 'ml'
            ELSE NULL
        END AS yield_unit,

        CASE
            WHEN d.is_usable_in_other_dish
                 AND COALESCE(d.qty_of_scoops, 0) > 0 THEN
                COALESCE(d.qty_of_scoops, 0)
                * CASE LOWER(TRIM(sc.destination_unit))
                    WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
                    WHEN 'ml' THEN COALESCE(sc.qty_in_ml,    sc.factor, 1::numeric)
                    WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
                    ELSE NULL
                  END

            WHEN NOT d.is_usable_in_other_dish
                 AND NULLIF(d.in_piece, 0) IS NOT NULL THEN d.in_piece
            WHEN NOT d.is_usable_in_other_dish
                 AND NULLIF(d.in_gm, 0) IS NOT NULL THEN d.in_gm
            WHEN NOT d.is_usable_in_other_dish
                 AND NULLIF(d.in_ml, 0) IS NOT NULL THEN d.in_ml
            ELSE NULL
        END AS batch_output_qty,

        CASE
            WHEN d.is_usable_in_other_dish THEN
                CASE LOWER(TRIM(sc.destination_unit))
                    WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
                    WHEN 'ml' THEN COALESCE(sc.qty_in_ml,    sc.factor, 1::numeric)
                    WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
                    ELSE NULL
                END

            WHEN NULLIF(d.in_piece, 0) IS NOT NULL THEN
                COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            WHEN NULLIF(d.in_gm, 0) IS NOT NULL THEN
                COALESCE(sc.qty_in_grams, sc.factor)
            WHEN NULLIF(d.in_ml, 0) IS NOT NULL THEN
                COALESCE(sc.qty_in_ml, sc.factor)
            ELSE NULL
        END AS portion_size

    FROM dish_out_cfg d

    LEFT JOIN LATERAL (
        SELECT sc.*
        FROM public.scoop_config sc
        WHERE sc.scoop_name = d.effective_scoop
          AND COALESCE(sc.unused, false) = false
          AND (
                sc.scoop_item_id IS NULL
                OR TRIM(sc.scoop_item_id) = ''
                OR TRIM(sc.scoop_item_id) = d.dish_code
              )
          AND (
                sc.scoop_item_name IS NULL
                OR TRIM(sc.scoop_item_name) = ''
                OR LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(d.dishname))
              )
        ORDER BY
            CASE
                WHEN TRIM(COALESCE(sc.scoop_item_id, '')) = d.dish_code THEN 0
                ELSE 1
            END,
            CASE
                WHEN LOWER(TRIM(COALESCE(sc.scoop_item_name, '')))
                     = LOWER(TRIM(d.dishname)) THEN 0
                ELSE 1
            END,
            sc.id DESC
        LIMIT 1
    ) sc ON true
),

dish_yield AS (
    SELECT
        y.*,

        CASE
            WHEN y.batch_output_qty IS NOT NULL
                 AND y.batch_output_qty > 0
                 AND y.portion_size IS NOT NULL
                 AND y.portion_size > 0
            THEN GREATEST(y.batch_output_qty / y.portion_size, 1::numeric)
            ELSE 1::numeric
        END AS portions_per_batch

    FROM dish_out_yield y
),

-- ===========================================================================
-- C. Recipe ingredient lines
-- ===========================================================================

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
        TRIM(re.dishname) AS dishname,
        TRIM(re.reciepeitemname) AS itemname,
        TRIM(re."pgNo") AS item_id,
        NULLIF(TRIM(re.receipescoop), '') AS recipe_scoop,
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

line_scoop AS (
    SELECT
        il.*,

        LOWER(TRIM(sc.destination_unit)) AS destination_unit,

        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(sc.qty_in_ml,    sc.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            WHEN 'portion' THEN COALESCE(sc.factor, 1::numeric)
            ELSE NULL
        END AS units_per_scoop

    FROM ingredient_lines il

    LEFT JOIN LATERAL (
        SELECT sc.*
        FROM public.scoop_config sc
        WHERE sc.scoop_name = il.recipe_scoop
          AND COALESCE(sc.unused, false) = false
          AND (
                sc.scoop_item_id IS NULL
                OR TRIM(sc.scoop_item_id) = ''
                OR TRIM(sc.scoop_item_id) = il.item_id
              )
          AND (
                sc.scoop_item_name IS NULL
                OR TRIM(sc.scoop_item_name) = ''
                OR LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(il.itemname))
              )
        ORDER BY
            CASE
                WHEN TRIM(COALESCE(sc.scoop_item_id, '')) = il.item_id THEN 0
                ELSE 1
            END,
            CASE
                WHEN LOWER(TRIM(COALESCE(sc.scoop_item_name, '')))
                     = LOWER(TRIM(il.itemname)) THEN 0
                ELSE 1
            END,
            sc.id DESC
        LIMIT 1
    ) sc ON true
),

line_classified AS (
    SELECT
        ls.*,

        (ls.qty * ls.units_per_scoop) AS qty_in_destination_unit,

        EXISTS (
            SELECT 1
            FROM public.raw_materials rm
            WHERE TRIM(rm."pgNo") = ls.item_id
              AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(ls.itemname))
        ) AS is_raw,

        EXISTS (
            SELECT 1
            FROM all_recipe_dishes d
            WHERE d.dish_code = UPPER(TRIM(ls.item_id))
        ) AS is_known_dish

    FROM line_scoop ls
),

-- ===========================================================================
-- D. DYNAMIC RAW MATERIAL COSTS
--    Computes rates from latest purchases + scoop_config on-the-fly
-- ===========================================================================

purchases_all AS (
    SELECT
        TRIM(oi.itemname) AS itemname,
        TRIM(oi.pgno) AS pgno,
        TRIM(oi.scoopin) AS scoopin,
        oi.qty::numeric AS qty,
        oi.itemtotal::numeric AS itemtotal,
        o.dt AS purchase_dt,
        oi.created_at AS line_ts,
        oi.id AS line_id
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.itemname IS NOT NULL AND TRIM(oi.itemname) <> ''
      AND oi.qty IS NOT NULL AND oi.qty > 0
      AND oi.itemtotal IS NOT NULL
      AND oi.scoopin IS NOT NULL AND TRIM(oi.scoopin) <> ''

    UNION ALL

    SELECT
        TRIM(oe.itemname),
        TRIM(oe.pgno),
        TRIM(oe.scoopin),
        oe.qty::numeric,
        oe.itemtotal::numeric,
        oe.dt,
        oe.created_at,
        oe.id
    FROM public.order_entries oe
    WHERE oe.itemname IS NOT NULL AND TRIM(oe.itemname) <> ''
      AND oe.qty IS NOT NULL AND oe.qty > 0
      AND oe.itemtotal IS NOT NULL
      AND oe.scoopin IS NOT NULL AND TRIM(oe.scoopin) <> ''
),

rm_purchases_priced AS (
    SELECT
        TRIM(rm."pgNo") AS pgno,
        p.purchase_dt,
        p.line_ts,
        p.line_id,
        LOWER(TRIM(sc.destination_unit)) AS destination_unit,
        (
            p.qty * CASE LOWER(TRIM(sc.destination_unit))
                WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
                WHEN 'ml' THEN COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
                WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
                ELSE NULL
            END
        ) AS base_qty,
        p.itemtotal
    FROM public.raw_materials rm
    INNER JOIN purchases_all p
        ON TRIM(rm."pgNo") = p.pgno
       AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(p.itemname))
    INNER JOIN public.scoop_config sc
        ON sc.scoop_name = p.scoopin
       AND TRIM(sc.scoop_item_id) = p.pgno
       AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(p.itemname))
       AND sc.destination_unit IS NOT NULL
       AND TRIM(sc.destination_unit) <> ''
    WHERE LOWER(TRIM(sc.destination_unit)) IN ('gm', 'ml', 'piece')
),

rm_latest_gm AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS ratepergram
    FROM rm_purchases_priced
    WHERE destination_unit = 'gm' AND base_qty > 0
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),

rm_latest_ml AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperml
    FROM rm_purchases_priced
    WHERE destination_unit = 'ml' AND base_qty > 0
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),

rm_latest_piece AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperpiece
    FROM rm_purchases_priced
    WHERE destination_unit = 'piece' AND base_qty > 0
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),

dynamic_raw_materials_cost AS (
    SELECT
        TRIM(rm."pgNo") AS pgno,
        g.ratepergram,
        m.rateperml,
        p.rateperpiece
    FROM public.raw_materials rm
    LEFT JOIN rm_latest_gm g ON g.pgno = TRIM(rm."pgNo")
    LEFT JOIN rm_latest_ml m ON m.pgno = TRIM(rm."pgNo")
    LEFT JOIN rm_latest_piece p ON p.pgno = TRIM(rm."pgNo")
),

raw_line_costs AS (
    SELECT
        lc.*,

        CASE lc.destination_unit
            WHEN 'gm' THEN COALESCE(rmc.ratepergram, rmc.rateperml)
            WHEN 'ml' THEN COALESCE(rmc.rateperml, rmc.ratepergram)
            WHEN 'piece' THEN rmc.rateperpiece
            ELSE NULL
        END AS rate_per_destination_unit,

        ROUND(
            (
                lc.qty_in_destination_unit
                * CASE lc.destination_unit
                    WHEN 'gm' THEN COALESCE(rmc.ratepergram, rmc.rateperml)
                    WHEN 'ml' THEN COALESCE(rmc.rateperml, rmc.ratepergram)
                    WHEN 'piece' THEN rmc.rateperpiece
                    ELSE NULL
                  END
            )::numeric,
            4
        ) AS line_cost

    FROM line_classified lc
    LEFT JOIN dynamic_raw_materials_cost rmc
        ON rmc.pgno = lc.item_id
    WHERE lc.is_raw
      AND NOT lc.is_known_dish
),

dish_raw_batch AS (
    SELECT
        dish_code,
        COALESCE(SUM(line_cost), 0::numeric) AS raw_batch_cost
    FROM raw_line_costs
    GROUP BY dish_code
),

-- ===========================================================================
-- E. Raw-only dishes (no processed sub-dish lines)
-- ===========================================================================

processed_lines AS (
    SELECT
        lc.dish_code AS parent_code
    FROM line_classified lc
    WHERE NOT lc.is_raw
      AND lc.is_known_dish
),

dishes_raw_only AS (
    SELECT d.dish_code, d.dishname
    FROM all_recipe_dishes d
    WHERE NOT EXISTS (
        SELECT 1
        FROM processed_lines pl
        WHERE pl.parent_code = d.dish_code
    )
),

dish_cost_final AS (
    SELECT
        dro.dish_code,
        dro.dishname,
        ROUND(COALESCE(drb.raw_batch_cost, 0::numeric), 4) AS batch_total_cost,
        GREATEST(COALESCE(dy.portions_per_batch, 1::numeric), 1) AS portions_per_batch,
        dy.batch_output_qty,
        dy.portion_size,
        dy.yield_unit,
        dy.is_usable_in_other_dish,
        dy.effective_scoop,
        dy.qty_of_scoops,
        ROUND(
            COALESCE(drb.raw_batch_cost, 0::numeric)
            / NULLIF(GREATEST(COALESCE(dy.portions_per_batch, 1::numeric), 1), 0),
            4
        ) AS cost_per_portion
    FROM dishes_raw_only dro
    INNER JOIN dishes_in_report dir
        ON dir.dish_code = dro.dish_code
    LEFT JOIN dish_raw_batch drb
        ON drb.dish_code = dro.dish_code
    LEFT JOIN dish_yield dy
        ON dy.dish_code = dro.dish_code
),

dish_diagnostics AS (
    SELECT
        d.dish_code,
        COUNT(lc.line_id) FILTER (
            WHERE NOT lc.is_raw AND NOT lc.is_known_dish
        ) AS unknown_ingredient_lines,
        COUNT(lc.line_id) FILTER (
            WHERE lc.is_raw AND rlc.line_cost IS NULL
        ) AS raw_unpriced_lines
    FROM dishes_raw_only d
    LEFT JOIN line_classified lc
        ON lc.dish_code = d.dish_code
    LEFT JOIN raw_line_costs rlc
        ON rlc.line_id = lc.line_id
    GROUP BY d.dish_code
),

dish_portion_calculation AS (
    SELECT
        r.dish_code,
        string_agg(
            (
                CASE r.destination_unit
                    WHEN 'gm' THEN 'ratepergram'
                    WHEN 'ml' THEN 'rateperml'
                    WHEN 'piece' THEN 'rateperpiece'
                    ELSE 'rate'
                END
                || ' '
                || trim(to_char(r.rate_per_destination_unit, 'FM999999990.0000'))
                || ' × '
                || trim(to_char(r.qty_in_destination_unit, 'FM999999990.0000'))
                || ' '
                || COALESCE(r.destination_unit, '?')
                || ' = '
                || trim(to_char(r.line_cost, 'FM999999990.0000'))
            ),
            ' + '
            ORDER BY r.itemname
        ) AS line_items_formula
    FROM raw_line_costs r
    WHERE r.line_cost IS NOT NULL
    GROUP BY r.dish_code
)

-- ===========================================================================
-- F. Report rows — dish portion cost + raw line breakdown
-- ===========================================================================

SELECT
    'dish_summary'::text AS result_set,
    dcf.dish_code,
    dcf.dishname,
    'portion'::text AS line_type,
    '1 portion'::text AS itemname,
    NULL::text AS "pgNo_or_dishCode",
    dcf.effective_scoop AS receipescoop,
    1::numeric AS qty,
    'portion'::text AS destination_unit,
    dcf.portion_size AS units_per_scoop,
    1::numeric AS qty_in_destination_unit,
    dcf.cost_per_portion AS rate_per_destination_unit,
    dcf.cost_per_portion AS line_cost,
    CASE
        WHEN dcf.is_usable_in_other_dish THEN 'usable_processed'
        ELSE 'standard'
    END AS dish_out_mode,
    dcf.is_usable_in_other_dish,
    dcf.effective_scoop,
    dcf.qty_of_scoops,
    dcf.cost_per_portion,
    dcf.batch_total_cost,
    dcf.portions_per_batch,
    COALESCE(dd.unknown_ingredient_lines, 0) AS unknown_ingredient_lines,
    COALESCE(dd.raw_unpriced_lines, 0) AS raw_unpriced_lines,
    0::bigint AS processed_unpriced_lines,
    CASE
        WHEN dpc.line_items_formula IS NOT NULL THEN
            '('
            || dpc.line_items_formula
            || ') ÷ '
            || trim(to_char(dcf.portions_per_batch, 'FM999999990.####'))
            || ' portions = '
            || trim(to_char(dcf.cost_per_portion, 'FM999999990.0000'))
        ELSE
            trim(to_char(dcf.batch_total_cost, 'FM999999990.0000'))
            || ' batch ÷ '
            || trim(to_char(dcf.portions_per_batch, 'FM999999990.####'))
            || ' portions = '
            || trim(to_char(dcf.cost_per_portion, 'FM999999990.0000'))
    END AS cost_calculation

FROM dish_cost_final dcf
LEFT JOIN dish_diagnostics dd
    ON dd.dish_code = dcf.dish_code
LEFT JOIN dish_portion_calculation dpc
    ON dpc.dish_code = dcf.dish_code

UNION ALL

SELECT
    'line_detail'::text AS result_set,
    r.dish_code,
    r.dishname,
    'raw'::text AS line_type,
    r.itemname,
    r.item_id AS "pgNo_or_dishCode",
    r.recipe_scoop AS receipescoop,
    r.qty,
    r.destination_unit,
    r.units_per_scoop,
    r.qty_in_destination_unit,
    r.rate_per_destination_unit,
    r.line_cost,
    NULL::text AS dish_out_mode,
    NULL::boolean AS is_usable_in_other_dish,
    NULL::text AS effective_scoop,
    NULL::numeric AS qty_of_scoops,
    NULL::numeric AS cost_per_portion,
    NULL::numeric AS batch_total_cost,
    NULL::numeric AS portions_per_batch,
    NULL::bigint AS unknown_ingredient_lines,
    NULL::bigint AS raw_unpriced_lines,
    NULL::bigint AS processed_unpriced_lines,
    CASE
        WHEN r.rate_per_destination_unit IS NOT NULL
             AND r.line_cost IS NOT NULL THEN
            (
                CASE r.destination_unit
                    WHEN 'gm' THEN 'ratepergram'
                    WHEN 'ml' THEN 'rateperml'
                    WHEN 'piece' THEN 'rateperpiece'
                    ELSE 'rate'
                END
                || ' '
                || trim(to_char(r.rate_per_destination_unit, 'FM999999990.0000'))
                || ' × '
                || trim(to_char(r.qty_in_destination_unit, 'FM999999990.0000'))
                || ' '
                || COALESCE(r.destination_unit, '?')
                || ' ('
                || trim(to_char(r.qty, 'FM999999990.####'))
                || ' qty × '
                || trim(to_char(r.units_per_scoop, 'FM999999990.0000'))
                || '/scoop) = '
                || trim(to_char(r.line_cost, 'FM999999990.0000'))
            )
        ELSE
            trim(to_char(r.qty_in_destination_unit, 'FM999999990.0000'))
            || ' '
            || COALESCE(r.destination_unit, '?')
            || ' ('
            || trim(to_char(r.qty, 'FM999999990.####'))
            || ' qty × '
            || trim(to_char(r.units_per_scoop, 'FM999999990.0000'))
            || '/scoop) — unpriced'
    END AS cost_calculation

FROM raw_line_costs r
INNER JOIN dish_cost_final dcf
    ON dcf.dish_code = r.dish_code;

-- ===========================================================================
-- G. Portion only (filtered)
-- ===========================================================================

SELECT
    result_set,
    dish_code,
    dishname,
    line_type,
    itemname,
    "pgNo_or_dishCode",
    receipescoop,
    qty,
    destination_unit,
    units_per_scoop,
    qty_in_destination_unit,
    rate_per_destination_unit,
    line_cost,
    dish_out_mode,
    is_usable_in_other_dish,
    effective_scoop,
    qty_of_scoops,
    cost_per_portion,
    batch_total_cost,
    portions_per_batch,
    unknown_ingredient_lines,
    raw_unpriced_lines,
    processed_unpriced_lines,
    cost_calculation
FROM recipe_cost_no_processed_report
WHERE result_set = 'dish_summary'
  AND line_type = 'portion'
ORDER BY dish_code;

-- ===========================================================================
-- H. Full report (portion row + raw line_detail per dish)
-- ===========================================================================

SELECT *
FROM recipe_cost_no_processed_report
ORDER BY
    dish_code,
    result_set ASC,
    line_type NULLS LAST,
    itemname NULLS LAST;