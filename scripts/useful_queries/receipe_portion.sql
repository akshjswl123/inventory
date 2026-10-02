-- =============================================================================
-- Recipe cost per portion — PostgreSQL
-- Raw material rates are calculated dynamically from purchase orders & scoop_config.
-- Each dish starts with result_set = 'dish_summary', line_type = portion,
-- itemname = '1 portion', line_cost = cost for one portion (see cost_per_portion).
-- Raw-only recipes (no sub-dish ingredients): recipe_cost_no_processed.sql
-- =============================================================================

WITH RECURSIVE

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
-- E. PROCESSED-DISH dependency edges
-- ===========================================================================

processed_lines AS (
    SELECT
        lc.line_id,
        lc.dish_code AS parent_code,
        lc.dishname AS parent_dishname,
        UPPER(TRIM(lc.item_id)) AS child_code,
        lc.itemname,
        lc.item_id,
        lc.recipe_scoop,
        lc.qty,
        lc.destination_unit,
        lc.units_per_scoop,
        lc.qty_in_destination_unit
    FROM line_classified lc
    WHERE NOT lc.is_raw
      AND lc.is_known_dish
),

processed_edges AS (
    SELECT
        pl.*,

        CASE pl.destination_unit
            WHEN 'portion' THEN
                pl.qty_in_destination_unit
                / NULLIF(GREATEST(COALESCE(child_y.portions_per_batch, 1), 1), 0)

            WHEN 'gm' THEN
                pl.qty_in_destination_unit
                / NULLIF(child_y.batch_output_qty, 0)

            WHEN 'ml' THEN
                pl.qty_in_destination_unit
                / NULLIF(child_y.batch_output_qty, 0)

            WHEN 'piece' THEN
                pl.qty_in_destination_unit
                / NULLIF(child_y.batch_output_qty, 0)

            ELSE NULL
        END AS edge_multiplier

    FROM processed_lines pl
    LEFT JOIN dish_yield child_y
        ON child_y.dish_code = pl.child_code
),

-- ===========================================================================
-- F. Recursive expansion of processed-dish dependencies
-- ===========================================================================

dependency_paths (
    root_code,
    current_code,
    multiplier,
    depth,
    path_codes
) AS (

    SELECT
        d.dish_code AS root_code,
        d.dish_code AS current_code,
        1::numeric AS multiplier,
        0 AS depth,
        ARRAY[d.dish_code]::text[] AS path_codes
    FROM all_recipe_dishes d

    UNION ALL

    SELECT
        dp.root_code,
        e.child_code AS current_code,
        dp.multiplier * e.edge_multiplier AS multiplier,
        dp.depth + 1 AS depth,
        dp.path_codes || e.child_code
    FROM dependency_paths dp
    INNER JOIN processed_edges e
        ON e.parent_code = dp.current_code
    WHERE dp.depth < 20
      AND e.edge_multiplier IS NOT NULL
      AND e.edge_multiplier >= 0
      AND NOT e.child_code = ANY(dp.path_codes)
),

dish_batch_cost_raw_only AS (
    SELECT
        d.dish_code,
        ROUND(COALESCE(drb.raw_batch_cost, 0::numeric), 4) AS batch_total_cost
    FROM all_recipe_dishes d
    LEFT JOIN dish_raw_batch drb
        ON drb.dish_code = d.dish_code
    WHERE NOT EXISTS (
        SELECT 1
        FROM processed_lines pl
        WHERE pl.parent_code = d.dish_code
    )
),

dish_batch_cost_with_processed AS (
    SELECT
        dp.root_code AS dish_code,
        ROUND(
            COALESCE(
                SUM(
                    COALESCE(drb.raw_batch_cost, 0::numeric)
                    * dp.multiplier
                ),
                0::numeric
            ),
            4
        ) AS batch_total_cost
    FROM dependency_paths dp
    INNER JOIN processed_lines pl
        ON pl.parent_code = dp.root_code
    LEFT JOIN dish_raw_batch drb
        ON drb.dish_code = dp.current_code
    GROUP BY dp.root_code
),

dish_batch_cost AS (
    SELECT dish_code, batch_total_cost FROM dish_batch_cost_raw_only
    UNION ALL
    SELECT dish_code, batch_total_cost FROM dish_batch_cost_with_processed
),

dish_cost_final AS (
    SELECT
        d.dish_code,
        d.dishname,
        COALESCE(dbc.batch_total_cost, 0::numeric) AS batch_total_cost,
        COALESCE(dy.portions_per_batch, 1::numeric) AS portions_per_batch,
        dy.batch_output_qty,
        dy.portion_size,
        dy.yield_unit,
        dy.is_usable_in_other_dish,
        dy.effective_scoop,
        dy.qty_of_scoops,

        ROUND(
            COALESCE(dbc.batch_total_cost, 0::numeric)
            / NULLIF(
                GREATEST(COALESCE(dy.portions_per_batch, 1::numeric), 1),
                0
              ),
            4
        ) AS cost_per_portion

    FROM all_recipe_dishes d
    LEFT JOIN dish_batch_cost dbc
        ON dbc.dish_code = d.dish_code
    LEFT JOIN dish_yield dy
        ON dy.dish_code = d.dish_code
),

-- ===========================================================================
-- G. Detail cost for direct ingredients / processed dishes
-- ===========================================================================

processed_line_costs AS (
    SELECT
        pl.*,

        dcf.cost_per_portion AS child_cost_per_portion,
        dcf.batch_total_cost AS child_batch_total_cost,

        CASE pl.destination_unit
            WHEN 'portion' THEN
                dcf.cost_per_portion

            WHEN 'gm' THEN
                dcf.batch_total_cost / NULLIF(child_y.batch_output_qty, 0)

            WHEN 'ml' THEN
                dcf.batch_total_cost / NULLIF(child_y.batch_output_qty, 0)

            WHEN 'piece' THEN
                dcf.batch_total_cost / NULLIF(child_y.batch_output_qty, 0)

            ELSE NULL
        END AS rate_per_destination_unit,

        ROUND(
            (
                pl.qty_in_destination_unit
                * CASE pl.destination_unit
                    WHEN 'portion' THEN dcf.cost_per_portion
                    WHEN 'gm' THEN
                        dcf.batch_total_cost / NULLIF(child_y.batch_output_qty, 0)
                    WHEN 'ml' THEN
                        dcf.batch_total_cost / NULLIF(child_y.batch_output_qty, 0)
                    WHEN 'piece' THEN
                        dcf.batch_total_cost / NULLIF(child_y.batch_output_qty, 0)
                    ELSE NULL
                  END
            )::numeric,
            4
        ) AS line_cost

    FROM processed_lines pl
    LEFT JOIN dish_cost_final dcf
        ON dcf.dish_code = pl.child_code
    LEFT JOIN dish_yield child_y
        ON child_y.dish_code = pl.child_code
),

line_detail AS (
    SELECT
        r.dish_code,
        r.dishname,
        'raw'::text AS line_type,
        r.itemname,
        r.item_id,
        r.recipe_scoop,
        r.qty,
        r.destination_unit,
        r.units_per_scoop,
        r.qty_in_destination_unit,
        r.rate_per_destination_unit,
        r.line_cost
    FROM raw_line_costs r
    INNER JOIN dishes_in_report dr
        ON dr.dish_code = r.dish_code

    UNION ALL

    SELECT
        p.parent_code AS dish_code,
        p.parent_dishname AS dishname,
        'processed'::text AS line_type,
        p.itemname,
        p.item_id,
        p.recipe_scoop,
        p.qty,
        p.destination_unit,
        p.units_per_scoop,
        p.qty_in_destination_unit,
        p.rate_per_destination_unit,
        p.line_cost
    FROM processed_line_costs p
    INNER JOIN dishes_in_report dr
        ON dr.dish_code = p.parent_code
),

-- ===========================================================================
-- H. Diagnostics: count recipe lines that could not be priced
-- ===========================================================================

dish_diagnostics AS (
    SELECT
        d.dish_code,

        COUNT(lc.line_id) FILTER (
            WHERE
                NOT lc.is_raw
                AND NOT lc.is_known_dish
        ) AS unknown_ingredient_lines,

        COUNT(lc.line_id) FILTER (
            WHERE
                lc.is_raw
                AND rlc.line_cost IS NULL
        ) AS raw_unpriced_lines,

        COUNT(lc.line_id) FILTER (
            WHERE
                NOT lc.is_raw
                AND lc.is_known_dish
                AND (
                    lc.destination_unit IS NULL
                    OR lc.qty_in_destination_unit IS NULL
                )
        ) AS processed_unpriced_lines

    FROM all_recipe_dishes d
    LEFT JOIN line_classified lc
        ON lc.dish_code = d.dish_code
    LEFT JOIN raw_line_costs rlc
        ON rlc.line_id = lc.line_id
    GROUP BY d.dish_code
)

-- ===========================================================================
-- I. Final result
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
    COALESCE(dd.processed_unpriced_lines, 0) AS processed_unpriced_lines

FROM dish_cost_final dcf
INNER JOIN dishes_in_report dir
    ON dir.dish_code = dcf.dish_code
LEFT JOIN dish_diagnostics dd
    ON dd.dish_code = dcf.dish_code

UNION ALL

SELECT
    'line_detail'::text AS result_set,
    ld.dish_code,
    ld.dishname,
    ld.line_type,
    ld.itemname,
    ld.item_id AS "pgNo_or_dishCode",
    ld.recipe_scoop AS receipescoop,
    ld.qty,
    ld.destination_unit,
    ld.units_per_scoop,
    ld.qty_in_destination_unit,
    ld.rate_per_destination_unit,
    ld.line_cost,
    NULL::text AS dish_out_mode,
    NULL::boolean AS is_usable_in_other_dish,
    NULL::text AS effective_scoop,
    NULL::numeric AS qty_of_scoops,
    NULL::numeric AS cost_per_portion,
    NULL::numeric AS batch_total_cost,
    NULL::numeric AS portions_per_batch,
    NULL::bigint AS unknown_ingredient_lines,
    NULL::bigint AS raw_unpriced_lines,
    NULL::bigint AS processed_unpriced_lines

FROM line_detail ld

ORDER BY
    dish_code,
    result_set ASC,
    line_type NULLS LAST,
    itemname NULLS LAST;