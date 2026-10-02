-- =============================================================================
-- Recipe cost per portion (SELECT only) — Recipe Maker tab
-- =============================================================================
-- Catalog rates: same purchase + scoop_config pipeline as
--   scripts/useful_queries/raw_materials_cost_latest.sql
--
-- Recipe lines (latest save per dishcode):
--   Raw materials     → qty × units_per_scoop × ratepergram/ml/piece
--   Processed dishes  → child cost_per_portion (recursive solve, max 20 steps)
--
-- dish_out — two modes (recipe_entries on row reciepeitemname = dish_out):
--
--   A) Standard (is_usable_in_other_dish = false)
--      receipescoop = dish-out scoop; inGm / inML / inPiece = total BATCH output.
--      portions_per_batch = batch_output ÷ portion_size from dish_out scoop_config
--        (qty_in_grams / qty_in_ml / qty_in_piece or factor).
--      If output empty or portion_size missing → 1 portion = whole batch.
--
--   B) Usable processed (is_usable_in_other_dish = true)
--      usable_processed_scoop (or receipescoop) + qty_of_scoops (or qty).
--      scoop_config.destination_unit is gm | ml | piece only (same rules as
--      raw_materials_cost_latest.sql — not destination_unit = portion).
--      units_per_scoop = COALESCE(qty_in_grams | qty_in_ml | qty_in_piece, factor, 1)
--      batch_output_qty = qty_of_scoops × units_per_scoop  (total gm / ml / pieces)
--      portions_per_batch = batch_output_qty ÷ portion_size on that scoop
--        (qty_in_grams / qty_in_ml / qty_in_piece or factor); if invalid → 1 portion
--
-- FILTERS — edit dish_filter: NULL or '' = all dishes with recipes
-- Example: SELECT 'D039'::text, NULL::text
--
-- Run: psql -f scripts/useful_queries/recipe_cost_per_portion.sql
-- Docs: scripts/useful_queries/README.md
-- =============================================================================

WITH RECURSIVE

dish_filter AS (
    SELECT
        NULL::text AS dishcode,
        NULL::text AS dishname
),

-- ===========================================================================
-- STEP A — catalog_rates (aligned with raw_materials_cost_latest.sql)
-- ===========================================================================
filter_params AS (
    SELECT NULL::text AS billno, NULL::text AS pgno, NULL::text AS itemname
),

purchases_all AS (
    SELECT
        TRIM(oi.itemname) AS itemname,
        TRIM(oi.pgno) AS pgno,
        TRIM(oi.scoopin) AS scoopin,
        TRIM(o.billno) AS billno,
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
        TRIM(oe.billno),
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

purchases AS (
    SELECT p.*
    FROM purchases_all p
    CROSS JOIN filter_params f
    WHERE (f.billno IS NULL OR TRIM(f.billno) = '' OR TRIM(p.billno) = TRIM(f.billno))
      AND (f.pgno IS NULL OR TRIM(f.pgno) = '' OR TRIM(p.pgno) = TRIM(f.pgno))
      AND (
          f.itemname IS NULL OR TRIM(f.itemname) = ''
          OR LOWER(TRIM(p.itemname)) = LOWER(TRIM(f.itemname))
      )
),

rate_lines AS (
    SELECT
        TRIM(rm."pgNo") AS pgno,
        p.qty,
        p.itemtotal,
        p.purchase_dt,
        p.line_ts,
        p.line_id,
        LOWER(TRIM(sc.destination_unit)) AS destination_unit,
        sc.factor,
        sc.qty_in_grams,
        sc.qty_in_ml,
        sc.qty_in_piece
    FROM public.raw_materials rm
    INNER JOIN purchases p
        ON TRIM(rm."pgNo") = p.pgno
       AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(p.itemname))
    INNER JOIN public.scoop_config sc
        ON sc.scoop_name = p.scoopin
       AND TRIM(sc.scoop_item_id) = p.pgno
       AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(p.itemname))
       AND sc.destination_unit IS NOT NULL AND TRIM(sc.destination_unit) <> ''
),

rate_with_units AS (
    SELECT
        l.*,
        CASE l.destination_unit
            WHEN 'gm' THEN COALESCE(l.qty_in_grams, l.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(l.qty_in_ml, l.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(l.qty_in_piece, l.factor, 1::numeric)
            ELSE NULL
        END AS units_per_scoop
    FROM rate_lines l
    WHERE l.destination_unit IN ('gm', 'ml', 'piece')
),

rate_priced AS (
    SELECT
        w.*,
        (w.qty * w.units_per_scoop) AS base_qty
    FROM rate_with_units w
    WHERE w.units_per_scoop IS NOT NULL AND w.units_per_scoop > 0
      AND w.qty IS NOT NULL AND w.qty > 0
),

latest_gm AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS ratepergram
    FROM rate_priced
    WHERE destination_unit = 'gm'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_ml AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperml
    FROM rate_priced
    WHERE destination_unit = 'ml'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_piece AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperpiece
    FROM rate_priced
    WHERE destination_unit = 'piece'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),

catalog_rates AS (
    SELECT
        TRIM(rm."pgNo") AS pgno,
        g.ratepergram,
        m.rateperml,
        p.rateperpiece
    FROM public.raw_materials rm
    LEFT JOIN latest_gm g ON g.pgno = TRIM(rm."pgNo")
    LEFT JOIN latest_ml m ON m.pgno = TRIM(rm."pgNo")
    LEFT JOIN latest_piece p ON p.pgno = TRIM(rm."pgNo")
),

-- ===========================================================================
-- STEP B — latest recipe save per dish
-- ===========================================================================
recipe_save_ts AS (
    SELECT
        UPPER(TRIM(dishcode)) AS dish_code,
        MAX(created_at) AS saved_at
    FROM public.recipe_entries
    WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
    GROUP BY UPPER(TRIM(dishcode))
),

recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    INNER JOIN recipe_save_ts rs
        ON UPPER(TRIM(re.dishcode)) = rs.dish_code
       AND re.created_at >= rs.saved_at - interval '30 seconds'
),

dishes_in_report AS (
    SELECT DISTINCT UPPER(TRIM(re.dishcode)) AS dish_code
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

dish_out_row AS (
    SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
        UPPER(TRIM(dishcode)) AS dish_code,
        TRIM(dishname) AS dishname,
        COALESCE(re.is_usable_in_other_dish, false) AS is_usable_in_other_dish,
        TRIM(receipescoop) AS dish_out_scoop,
        TRIM(re.usable_processed_scoop) AS usable_processed_scoop,
        COALESCE(re.qty_of_scoops, re.qty)::numeric AS qty_of_scoops,
        re."inGm",
        re."inML",
        re."inPiece"
    FROM recipe_scope
    WHERE LOWER(TRIM(reciepeitemname)) = 'dish_out'
    ORDER BY UPPER(TRIM(dishcode)), id DESC
),

dish_out_scoop_cfg AS (
    SELECT
        d.*,
        CASE
            WHEN d.is_usable_in_other_dish THEN
                TRIM(COALESCE(NULLIF(d.usable_processed_scoop, ''), d.dish_out_scoop))
            ELSE d.dish_out_scoop
        END AS effective_scoop,
        CASE
            WHEN d.is_usable_in_other_dish THEN 'usable_processed'
            ELSE 'standard'
        END AS dish_out_mode
    FROM dish_out_row d
),

batch_yield AS (
    SELECT
        d.dish_code,
        d.dishname,
        d.is_usable_in_other_dish,
        d.dish_out_mode,
        d.effective_scoop,
        d.qty_of_scoops,
        d."inGm",
        d."inML",
        d."inPiece",
        LOWER(TRIM(sc.destination_unit)) AS scoop_destination_unit,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE NULL
        END AS scoop_units_per_scoop,
        CASE
            WHEN NOT d.is_usable_in_other_dish THEN
                CASE
                    WHEN NULLIF(d."inPiece", 0) IS NOT NULL THEN 'piece'
                    WHEN NULLIF(d."inGm", 0) IS NOT NULL THEN 'gm'
                    WHEN NULLIF(d."inML", 0) IS NOT NULL THEN 'ml'
                    ELSE NULL
                END
            WHEN LOWER(TRIM(sc.destination_unit)) IN ('gm', 'ml', 'piece')
                THEN LOWER(TRIM(sc.destination_unit))
            ELSE NULL
        END AS yield_unit,
        CASE
            WHEN NOT d.is_usable_in_other_dish THEN
                COALESCE(NULLIF(d."inPiece", 0), NULLIF(d."inGm", 0), NULLIF(d."inML", 0))
            WHEN d.is_usable_in_other_dish
                 AND LOWER(TRIM(sc.destination_unit)) IN ('gm', 'ml', 'piece') THEN
                NULLIF(
                    GREATEST(COALESCE(d.qty_of_scoops, 0), 0)
                    * CASE LOWER(TRIM(sc.destination_unit))
                        WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
                        WHEN 'ml' THEN COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
                        WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
                        ELSE NULL
                    END,
                    0
                )
            ELSE NULL
        END AS batch_output_qty,
        CASE
            WHEN NOT d.is_usable_in_other_dish THEN
                CASE
                    WHEN NULLIF(d."inPiece", 0) IS NOT NULL
                        THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
                    WHEN NULLIF(d."inGm", 0) IS NOT NULL
                        THEN COALESCE(sc.qty_in_grams, sc.factor)
                    WHEN NULLIF(d."inML", 0) IS NOT NULL
                        THEN COALESCE(sc.qty_in_ml, sc.factor)
                    ELSE NULL
                END
            WHEN d.is_usable_in_other_dish
                 AND LOWER(TRIM(sc.destination_unit)) = 'gm' THEN
                COALESCE(sc.qty_in_grams, sc.factor)
            WHEN d.is_usable_in_other_dish
                 AND LOWER(TRIM(sc.destination_unit)) = 'ml' THEN
                COALESCE(sc.qty_in_ml, sc.factor)
            WHEN d.is_usable_in_other_dish
                 AND LOWER(TRIM(sc.destination_unit)) = 'piece' THEN
                COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE NULL
        END AS portion_size,
        CASE
            WHEN NOT d.is_usable_in_other_dish THEN
                CASE
                    WHEN NULLIF(d."inPiece", 0) IS NOT NULL THEN
                        NULLIF(d."inPiece", 0)
                        / NULLIF(COALESCE(sc.qty_in_piece, sc.factor, 1::numeric), 0)
                    WHEN NULLIF(d."inGm", 0) IS NOT NULL
                         AND COALESCE(sc.qty_in_grams, sc.factor) IS NOT NULL
                         AND COALESCE(sc.qty_in_grams, sc.factor) > 0 THEN
                        NULLIF(d."inGm", 0) / COALESCE(sc.qty_in_grams, sc.factor)
                    WHEN NULLIF(d."inML", 0) IS NOT NULL
                         AND COALESCE(sc.qty_in_ml, sc.factor) IS NOT NULL
                         AND COALESCE(sc.qty_in_ml, sc.factor) > 0 THEN
                        NULLIF(d."inML", 0) / COALESCE(sc.qty_in_ml, sc.factor)
                    ELSE 1::numeric
                END
            WHEN d.is_usable_in_other_dish
                 AND GREATEST(COALESCE(d.qty_of_scoops, 0), 0) > 0
                 AND LOWER(TRIM(sc.destination_unit)) = 'gm'
                 AND COALESCE(sc.qty_in_grams, sc.factor) IS NOT NULL
                 AND COALESCE(sc.qty_in_grams, sc.factor) > 0 THEN
                (
                    GREATEST(COALESCE(d.qty_of_scoops, 0), 0)
                    * COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
                ) / COALESCE(sc.qty_in_grams, sc.factor)
            WHEN d.is_usable_in_other_dish
                 AND GREATEST(COALESCE(d.qty_of_scoops, 0), 0) > 0
                 AND LOWER(TRIM(sc.destination_unit)) = 'ml'
                 AND COALESCE(sc.qty_in_ml, sc.factor) IS NOT NULL
                 AND COALESCE(sc.qty_in_ml, sc.factor) > 0 THEN
                (
                    GREATEST(COALESCE(d.qty_of_scoops, 0), 0)
                    * COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
                ) / COALESCE(sc.qty_in_ml, sc.factor)
            WHEN d.is_usable_in_other_dish
                 AND GREATEST(COALESCE(d.qty_of_scoops, 0), 0) > 0
                 AND LOWER(TRIM(sc.destination_unit)) = 'piece'
                 AND COALESCE(sc.qty_in_piece, sc.factor, 1::numeric) > 0 THEN
                (
                    GREATEST(COALESCE(d.qty_of_scoops, 0), 0)
                    * COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
                ) / COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE 1::numeric
        END AS portions_per_batch
    FROM dish_out_scoop_cfg d
    LEFT JOIN public.scoop_config sc
        ON sc.scoop_name = d.effective_scoop
       AND (
            sc.scoop_item_name IS NULL OR TRIM(sc.scoop_item_name) = ''
            OR LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(d.dishname))
       )
),

ingredient_lines AS (
    SELECT
        re.id AS line_id,
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re.dishname) AS dishname,
        TRIM(re.reciepeitemname) AS itemname,
        TRIM(re."pgNo") AS item_id,
        TRIM(re.receipescoop) AS recipe_scoop,
        re.qty::numeric AS qty
    FROM recipe_scope re
    WHERE LOWER(TRIM(re.reciepeitemname)) NOT IN (
        'totalingredientsqty', 'totalprocessedqty', 'dish_out'
    )
      AND re.qty IS NOT NULL AND re.qty > 0
),

line_scoop AS (
    SELECT
        il.*,
        LOWER(TRIM(sc.destination_unit)) AS destination_unit,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            WHEN 'portion' THEN COALESCE(sc.factor, 1::numeric)
            ELSE NULL
        END AS units_per_scoop
    FROM ingredient_lines il
    LEFT JOIN public.scoop_config sc
        ON sc.scoop_name = il.recipe_scoop
       AND TRIM(sc.scoop_item_id) = il.item_id
       AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(il.itemname))
),

line_classified AS (
    SELECT
        ls.*,
        (ls.qty * ls.units_per_scoop) AS qty_in_destination_unit,
        EXISTS (
            SELECT 1 FROM public.dishes d
            WHERE UPPER(TRIM(d.dish_code)) = UPPER(TRIM(ls.item_id))
              AND LOWER(TRIM(d.dish_name)) = LOWER(TRIM(ls.itemname))
        ) AS is_processed,
        EXISTS (
            SELECT 1 FROM public.raw_materials rm
            WHERE TRIM(rm."pgNo") = ls.item_id
              AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(ls.itemname))
        ) AS is_raw
    FROM line_scoop ls
),

raw_line_costs AS (
    SELECT
        lc.*,
        CASE lc.destination_unit
            WHEN 'gm' THEN COALESCE(cr.ratepergram, cr.rateperml)
            WHEN 'ml' THEN COALESCE(cr.rateperml, cr.ratepergram)
            WHEN 'piece' THEN cr.rateperpiece
            ELSE NULL
        END AS rate_per_destination_unit,
        ROUND(
            (lc.qty_in_destination_unit * CASE lc.destination_unit
                WHEN 'gm' THEN COALESCE(cr.ratepergram, cr.rateperml)
                WHEN 'ml' THEN COALESCE(cr.rateperml, cr.ratepergram)
                WHEN 'piece' THEN cr.rateperpiece
                ELSE NULL
            END)::numeric,
            4
        ) AS line_cost
    FROM line_classified lc
    LEFT JOIN catalog_rates cr ON cr.pgno = lc.item_id
    WHERE lc.is_raw
),

dish_raw_batch AS (
    SELECT dish_code, COALESCE(SUM(line_cost), 0) AS raw_batch_cost
    FROM raw_line_costs
    GROUP BY dish_code
),

processed_lines AS (
    SELECT
        lc.dish_code AS parent_code,
        UPPER(TRIM(lc.item_id)) AS child_code,
        lc.line_id,
        lc.qty_in_destination_unit,
        lc.destination_unit
    FROM line_classified lc
    WHERE lc.is_processed
),

all_recipe_dish_codes AS (
    SELECT DISTINCT dish_code FROM ingredient_lines
    UNION
    SELECT DISTINCT dish_code FROM dish_out_row
    UNION
    SELECT DISTINCT child_code FROM processed_lines
),

-- ===========================================================================
-- STEP E — iterative cost per portion (processed children)
-- ===========================================================================
cost_solve(step, dish_code, cost_per_portion) AS (
    SELECT
        0 AS step,
        ad.dish_code,
        COALESCE(rb.raw_batch_cost, 0)
            / NULLIF(GREATEST(COALESCE(by.portions_per_batch, 1), 1), 0) AS cost_per_portion
    FROM all_recipe_dish_codes ad
    LEFT JOIN dish_raw_batch rb ON rb.dish_code = ad.dish_code
    LEFT JOIN batch_yield by ON by.dish_code = ad.dish_code

    UNION ALL

    SELECT
        prev.step + 1,
        prev.dish_code,
        ROUND(
            (
                COALESCE(rb.raw_batch_cost, 0)
                + COALESCE(SUM(
                    CASE
                        WHEN pl.destination_unit = 'portion' THEN
                            pl.qty_in_destination_unit * child.cost_per_portion
                        WHEN pl.destination_unit IN ('gm', 'ml', 'piece') THEN
                            pl.qty_in_destination_unit
                            * (
                                child.cost_per_portion
                                * GREATEST(COALESCE(by_c.portions_per_batch, 1), 1)
                                / NULLIF(by_c.batch_output_qty, 0)
                            )
                        ELSE 0::numeric
                    END
                ), 0)
            ) / NULLIF(GREATEST(COALESCE(by.portions_per_batch, 1), 1), 0),
            4
        ) AS cost_per_portion
    FROM cost_solve prev
    LEFT JOIN dish_raw_batch rb ON rb.dish_code = prev.dish_code
    LEFT JOIN batch_yield by ON by.dish_code = prev.dish_code
    LEFT JOIN processed_lines pl ON pl.parent_code = prev.dish_code
    LEFT JOIN cost_solve child
        ON child.dish_code = pl.child_code
       AND child.step = prev.step
    LEFT JOIN batch_yield by_c ON by_c.dish_code = pl.child_code
    WHERE prev.step < 20
    GROUP BY
        prev.step,
        prev.dish_code,
        rb.raw_batch_cost,
        by.portions_per_batch
),

dish_cost_final AS (
    SELECT DISTINCT ON (dish_code)
        dish_code,
        cost_per_portion
    FROM cost_solve
    ORDER BY dish_code, step DESC
),

dish_economics AS (
    SELECT
        dcf.dish_code,
        dcf.cost_per_portion,
        COALESCE(by.portions_per_batch, 1) AS portions_per_batch,
        by.batch_output_qty,
        by.portion_size,
        by.yield_unit,
        by.dish_out_mode,
        by.is_usable_in_other_dish,
        by.effective_scoop,
        by.qty_of_scoops,
        ROUND((dcf.cost_per_portion * COALESCE(by.portions_per_batch, 1))::numeric, 4) AS batch_total_cost,
        by."inGm",
        by."inML",
        by."inPiece"
    FROM dish_cost_final dcf
    LEFT JOIN batch_yield by ON by.dish_code = dcf.dish_code
),

processed_line_costs AS (
    SELECT
        lc.*,
        dcf.cost_per_portion AS child_cost_per_portion,
        CASE lc.destination_unit
            WHEN 'portion' THEN dcf.cost_per_portion
            WHEN 'gm' THEN ROUND(
                (dcf.cost_per_portion * GREATEST(COALESCE(by_c.portions_per_batch, 1), 1))
                / NULLIF(by_c.batch_output_qty, 0),
                4
            )
            WHEN 'ml' THEN ROUND(
                (dcf.cost_per_portion * GREATEST(COALESCE(by_c.portions_per_batch, 1), 1))
                / NULLIF(by_c.batch_output_qty, 0),
                4
            )
            WHEN 'piece' THEN ROUND(
                (dcf.cost_per_portion * GREATEST(COALESCE(by_c.portions_per_batch, 1), 1))
                / NULLIF(by_c.batch_output_qty, 0),
                4
            )
            ELSE NULL
        END AS rate_per_destination_unit,
        ROUND(
            (lc.qty_in_destination_unit * CASE lc.destination_unit
                WHEN 'portion' THEN dcf.cost_per_portion
                WHEN 'gm' THEN (dcf.cost_per_portion * GREATEST(COALESCE(by_c.portions_per_batch, 1), 1))
                    / NULLIF(by_c.batch_output_qty, 0)
                WHEN 'ml' THEN (dcf.cost_per_portion * GREATEST(COALESCE(by_c.portions_per_batch, 1), 1))
                    / NULLIF(by_c.batch_output_qty, 0)
                WHEN 'piece' THEN (dcf.cost_per_portion * GREATEST(COALESCE(by_c.portions_per_batch, 1), 1))
                    / NULLIF(by_c.batch_output_qty, 0)
                ELSE NULL
            END)::numeric,
            4
        ) AS line_cost
    FROM line_classified lc
    INNER JOIN dish_cost_final dcf ON dcf.dish_code = UPPER(TRIM(lc.item_id))
    LEFT JOIN batch_yield by_c ON by_c.dish_code = UPPER(TRIM(lc.item_id))
    WHERE lc.is_processed
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
    INNER JOIN dishes_in_report dir ON dir.dish_code = r.dish_code

    UNION ALL

    SELECT
        p.dish_code,
        p.dishname,
        'processed'::text,
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
    INNER JOIN dishes_in_report dir ON dir.dish_code = p.dish_code
)

SELECT
    'line_detail' AS result_set,
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
    NULL::numeric AS portions_per_batch
FROM line_detail ld

UNION ALL

SELECT
    'dish_summary' AS result_set,
    de.dish_code,
    by.dishname,
    NULL::text,
    NULL::text,
    NULL::text,
    by.effective_scoop,
    de.batch_output_qty,
    by.yield_unit,
    de.portion_size,
    NULL::numeric,
    NULL::numeric,
    de.dish_out_mode,
    de.is_usable_in_other_dish,
    de.effective_scoop,
    de.qty_of_scoops,
    de.cost_per_portion,
    de.batch_total_cost,
    de.portions_per_batch
FROM dish_economics de
INNER JOIN dishes_in_report dir ON dir.dish_code = de.dish_code
LEFT JOIN batch_yield by ON by.dish_code = de.dish_code

ORDER BY result_set DESC, dish_code, line_type NULLS LAST, itemname NULLS LAST;
