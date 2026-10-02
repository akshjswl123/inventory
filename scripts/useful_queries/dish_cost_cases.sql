-- =============================================================================
-- Dish cost — CASE 1, CASE 2, CASE 3
-- =============================================================================
-- One statement (safe for the Query tab). Edit params at the top.
-- NULL or '' = no filter. Costs for every dish are solved first; the result
-- shows the filter dish plus the processed dishes it uses.
--
-- Sample rows (poc_db): scripts/useful_queries/dish_cost_cases_sample.sql
--   SS-GJ case 1
--   SS-BASE case 2 (raw only, usable)
--   SS-AATA case 3 that is itself usable, and contains SS-BASE
--   SS-ROTI case 3 that contains SS-AATA (two levels)
--
-- Rates: latest stored public.raw_materials_cost row per "pgNo"
--   (same table as RAW_MATERIALS_COST_SELECT_BASEVERSION.SQL query A).
--   Set based_on_billno (for example 'recipe') to pin one bill.
--
-- Scoop size ("factor" in the worked examples) is the destination quantity
-- on scoop_config, not the factor column when they differ:
--   gm    -> COALESCE(qty_in_grams, factor, 1)     kg scoop: 1000
--   ml    -> COALESCE(qty_in_ml, factor, 1)
--   piece -> COALESCE(qty_in_piece, factor, 1)
-- sugar_gm_reciepe is 1 either way. AATA PROCESSED_kg_reciepe uses 1000
-- from qty_in_grams (conversion_chain kg:1000:gm).
--
-- CASE 1 — raw materials only, not used by other dishes
--   line_cost = rateper(gm|ml|piece) * scoop_factor * qty
--   dish_cost = sum(line_cost)
--   Example: sugar 0.0600 * 1 * 5000 = 300
--
-- CASE 2 — raw materials only, usable in other dishes
--   dish_cost = same sum
--   cost_of_one_scoop = dish_cost / qty_of_scoops
--   rate per destination unit = cost_of_one_scoop / dish-out scoop_factor
--   Example: 2000 / 2 / 1000 = 1 per gm
--
-- CASE 3 — raw lines plus other dishes
--   processed line = child rate per unit * this line's scoop_factor * qty
--   Example: 1 * 1 * 1 = 1
--   A dish is not costed from itself. Cycles stay unsolved.
--   A child rate is published whenever qty_of_scoops and a gm/ml/piece
--   dish-out scoop exist, including when the usable flag is false, so a
--   raw-only batch can still feed another dish the way the AATA example does.
-- =============================================================================

WITH RECURSIVE

params AS (
    SELECT
        NULL::text AS dishcode,          -- e.g. 'P8'
        NULL::text AS dishname,          -- e.g. 'PROCESSED GULAB JAMUN'
        NULL::text AS based_on_billno     -- e.g. 'recipe'; NULL = latest row per pgNo
),

rm_cost AS (
    SELECT DISTINCT ON (TRIM(r."pgNo"))
        TRIM(r."pgNo") AS pgno,
        r.ratepergram,
        r.rateperml,
        r.rateperpiece,
        r.based_on_billno
    FROM public.raw_materials_cost r
    CROSS JOIN params p
    WHERE (
            p.based_on_billno IS NULL
         OR TRIM(p.based_on_billno) = ''
         OR TRIM(r.based_on_billno) = TRIM(p.based_on_billno)
    )
    ORDER BY TRIM(r."pgNo"), r.last_updated_at DESC NULLS LAST, r.id DESC
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

dish_header AS (
    SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re.dishname) AS dishname
    FROM recipe_scope re
    WHERE re.dishcode IS NOT NULL
      AND TRIM(re.dishcode) <> ''
    ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
),

dish_out_row AS (
    SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re.dishname) AS dishname,
        COALESCE(re.is_usable_in_other_dish, false) AS is_usable_in_other_dish,
        NULLIF(TRIM(re.receipescoop), '') AS dish_out_scoop,
        NULLIF(TRIM(re.usable_processed_scoop), '') AS usable_processed_scoop,
        COALESCE(re.qty_of_scoops, re.qty)::numeric AS qty_of_scoops
    FROM recipe_scope re
    WHERE LOWER(TRIM(re.reciepeitemname)) = 'dish_out'
    ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
),

dish_out AS (
    SELECT
        d.dish_code,
        d.dishname,
        d.is_usable_in_other_dish,
        d.qty_of_scoops,
        CASE
            WHEN d.is_usable_in_other_dish
                THEN COALESCE(d.usable_processed_scoop, d.dish_out_scoop)
            ELSE COALESCE(d.dish_out_scoop, d.usable_processed_scoop)
        END AS out_scoop
    FROM dish_out_row d
),

dish_out_scoop AS (
    SELECT
        d.*,
        LOWER(TRIM(sc.destination_unit)) AS out_unit,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'gm' THEN COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE COALESCE(sc.factor, 1::numeric)
        END AS out_factor
    FROM dish_out d
    LEFT JOIN LATERAL (
        SELECT sc.*
        FROM public.scoop_config sc
        WHERE LOWER(TRIM(sc.scoop_name)) = LOWER(TRIM(d.out_scoop))
          AND COALESCE(sc.unused, false) = false
          AND (
                sc.scoop_item_id IS NULL
             OR TRIM(sc.scoop_item_id) = ''
             OR UPPER(TRIM(sc.scoop_item_id)) = d.dish_code
          )
          AND (
                sc.scoop_item_name IS NULL
             OR TRIM(sc.scoop_item_name) = ''
             OR LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(d.dishname))
          )
        ORDER BY
            CASE
                WHEN UPPER(TRIM(COALESCE(sc.scoop_item_id, ''))) = d.dish_code THEN 0
                ELSE 1
            END,
            CASE
                WHEN LOWER(TRIM(COALESCE(sc.scoop_item_name, ''))) = LOWER(TRIM(d.dishname)) THEN 0
                ELSE 1
            END,
            sc.id DESC
        LIMIT 1
    ) sc ON true
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
            WHEN 'ml' THEN COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE COALESCE(sc.factor, 1::numeric)
        END AS scoop_factor
    FROM ingredient_lines il
    LEFT JOIN LATERAL (
        SELECT sc.*
        FROM public.scoop_config sc
        WHERE LOWER(TRIM(sc.scoop_name)) = LOWER(TRIM(il.recipe_scoop))
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
                WHEN LOWER(TRIM(COALESCE(sc.scoop_item_name, ''))) = LOWER(TRIM(il.itemname)) THEN 0
                ELSE 1
            END,
            sc.id DESC
        LIMIT 1
    ) sc ON true
),

line_classified AS (
    SELECT
        ls.*,
        EXISTS (
            SELECT 1
            FROM dish_header h
            WHERE h.dish_code = UPPER(TRIM(ls.item_id))
        ) AS code_is_dish,
        EXISTS (
            SELECT 1
            FROM public.raw_materials rm
            WHERE TRIM(rm."pgNo") = ls.item_id
              AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(ls.itemname))
        ) AS is_raw_catalog
    FROM line_scoop ls
),

line_ready AS (
    SELECT
        lc.line_id,
        lc.dish_code,
        lc.dishname,
        lc.itemname,
        lc.item_id,
        lc.recipe_scoop,
        lc.qty,
        lc.destination_unit,
        lc.scoop_factor,
        CASE
            WHEN lc.code_is_dish
             AND lc.dish_code = UPPER(TRIM(lc.item_id))
                THEN 'self'
            WHEN lc.code_is_dish
             AND (
                    NOT lc.is_raw_catalog
                 OR EXISTS (
                        SELECT 1
                        FROM dish_header h
                        WHERE h.dish_code = UPPER(TRIM(lc.item_id))
                          AND LOWER(TRIM(h.dishname)) = LOWER(TRIM(lc.itemname))
                    )
                )
                THEN 'processed'
            WHEN lc.is_raw_catalog THEN 'raw'
            ELSE 'unknown'
        END AS line_kind,
        CASE lc.destination_unit
            WHEN 'gm' THEN COALESCE(rmc.ratepergram, rmc.rateperml)
            WHEN 'ml' THEN COALESCE(rmc.rateperml, rmc.ratepergram)
            WHEN 'piece' THEN rmc.rateperpiece
            ELSE NULL
        END AS raw_rate,
        rmc.based_on_billno AS raw_billno,
        CASE
            WHEN lc.is_raw_catalog
             AND NOT (
                    lc.code_is_dish
                AND (
                        NOT lc.is_raw_catalog
                     OR EXISTS (
                            SELECT 1
                            FROM dish_header h
                            WHERE h.dish_code = UPPER(TRIM(lc.item_id))
                              AND LOWER(TRIM(h.dishname)) = LOWER(TRIM(lc.itemname))
                        )
                    )
                )
             AND lc.dish_code IS DISTINCT FROM UPPER(TRIM(lc.item_id))
                THEN ROUND(
                    (
                        CASE lc.destination_unit
                            WHEN 'gm' THEN COALESCE(rmc.ratepergram, rmc.rateperml)
                            WHEN 'ml' THEN COALESCE(rmc.rateperml, rmc.ratepergram)
                            WHEN 'piece' THEN rmc.rateperpiece
                            ELSE NULL
                        END
                        * lc.scoop_factor
                        * lc.qty
                    )::numeric,
                    4
                )
            ELSE NULL
        END AS raw_line_cost
    FROM line_classified lc
    LEFT JOIN rm_cost rmc
        ON rmc.pgno = lc.item_id
),

processed_edges AS (
    SELECT
        dish_code AS parent_code,
        UPPER(TRIM(item_id)) AS child_code,
        line_id,
        itemname,
        recipe_scoop,
        qty,
        destination_unit,
        scoop_factor
    FROM line_ready
    WHERE line_kind = 'processed'
),

raw_stats AS (
    SELECT
        h.dish_code,
        COALESCE(SUM(lr.raw_line_cost), 0::numeric) AS priced_raw,
        COUNT(lr.line_id) FILTER (
            WHERE lr.line_kind IN ('raw', 'unknown', 'self')
              AND lr.raw_line_cost IS NULL
        ) AS unpriced_non_processed
    FROM dish_header h
    LEFT JOIN line_ready lr
        ON lr.dish_code = h.dish_code
    GROUP BY h.dish_code
),

-- Leaves (no other dish on the recipe) are known immediately.
-- Each later step prices dishes whose processed lines all have a child rate.
solve AS (
    SELECT
        0 AS step,
        (
            SELECT COALESCE(jsonb_object_agg(h.dish_code, v.obj), '{}'::jsonb)
            FROM dish_header h
            LEFT JOIN raw_stats rs ON rs.dish_code = h.dish_code
            LEFT JOIN dish_out_scoop o ON o.dish_code = h.dish_code
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN EXISTS (
                            SELECT 1
                            FROM processed_edges e
                            WHERE e.parent_code = h.dish_code
                        ) THEN NULL::numeric
                        ELSE ROUND(COALESCE(rs.priced_raw, 0), 4)
                    END AS dish_cost,
                    COALESCE(rs.unpriced_non_processed, 0) > 0 AS incomplete
            ) leaf ON true
            LEFT JOIN LATERAL (
                SELECT jsonb_build_object(
                    'dish_cost', leaf.dish_cost,
                    'rate',
                    CASE
                        WHEN leaf.dish_cost IS NOT NULL
                         AND NOT leaf.incomplete
                         AND COALESCE(o.qty_of_scoops, 0) > 0
                         AND COALESCE(o.out_factor, 0) > 0
                         AND o.out_unit IN ('gm', 'ml', 'piece')
                            THEN ROUND((leaf.dish_cost / o.qty_of_scoops) / o.out_factor, 6)
                        ELSE NULL
                    END,
                    'unit', o.out_unit,
                    'incomplete',
                    CASE
                        WHEN leaf.dish_cost IS NULL THEN NULL
                        ELSE leaf.incomplete
                    END
                ) AS obj
            ) v ON true
        ) AS state

    UNION ALL

    SELECT
        prev.step + 1,
        (
            SELECT COALESCE(jsonb_object_agg(h.dish_code, v.obj), '{}'::jsonb)
            FROM dish_header h
            LEFT JOIN raw_stats rs ON rs.dish_code = h.dish_code
            LEFT JOIN dish_out_scoop o ON o.dish_code = h.dish_code
            LEFT JOIN LATERAL (
                SELECT
                    (prev.state -> h.dish_code ->> 'dish_cost') IS NOT NULL AS already,
                    NOT EXISTS (
                        SELECT 1
                        FROM processed_edges e
                        WHERE e.parent_code = h.dish_code
                          AND (
                                (prev.state -> e.child_code ->> 'rate') IS NULL
                             OR LOWER(COALESCE(prev.state -> e.child_code ->> 'unit', ''))
                                IS DISTINCT FROM LOWER(COALESCE(e.destination_unit, ''))
                          )
                    ) AS children_ready
            ) gate ON true
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN gate.already THEN (prev.state -> h.dish_code ->> 'dish_cost')::numeric
                        WHEN NOT gate.children_ready THEN NULL::numeric
                        ELSE ROUND(
                            COALESCE(rs.priced_raw, 0)
                            + COALESCE((
                                SELECT SUM(
                                    (prev.state -> e.child_code ->> 'rate')::numeric
                                    * e.scoop_factor
                                    * e.qty
                                )
                                FROM processed_edges e
                                WHERE e.parent_code = h.dish_code
                            ), 0),
                            4
                        )
                    END AS dish_cost
            ) calc ON true
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN gate.already THEN COALESCE((prev.state -> h.dish_code ->> 'incomplete')::boolean, false)
                        WHEN calc.dish_cost IS NULL THEN NULL::boolean
                        ELSE COALESCE(rs.unpriced_non_processed, 0) > 0
                    END AS incomplete
            ) flag ON true
            LEFT JOIN LATERAL (
                SELECT
                    CASE
                        WHEN gate.already THEN prev.state -> h.dish_code
                        ELSE jsonb_build_object(
                            'dish_cost', calc.dish_cost,
                            'rate',
                            CASE
                                WHEN calc.dish_cost IS NOT NULL
                                 AND NOT COALESCE(flag.incomplete, true)
                                 AND COALESCE(o.qty_of_scoops, 0) > 0
                                 AND COALESCE(o.out_factor, 0) > 0
                                 AND o.out_unit IN ('gm', 'ml', 'piece')
                                    THEN ROUND((calc.dish_cost / o.qty_of_scoops) / o.out_factor, 6)
                                ELSE NULL
                            END,
                            'unit', o.out_unit,
                            'incomplete', flag.incomplete
                        )
                    END AS obj
            ) v ON true
        ) AS state
    FROM solve prev
    WHERE prev.step < 25
      AND EXISTS (
            SELECT 1
            FROM dish_header h
            WHERE (prev.state -> h.dish_code ->> 'dish_cost') IS NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM processed_edges e
                    WHERE e.parent_code = h.dish_code
                      AND (
                            (prev.state -> e.child_code ->> 'rate') IS NULL
                         OR LOWER(COALESCE(prev.state -> e.child_code ->> 'unit', ''))
                            IS DISTINCT FROM LOWER(COALESCE(e.destination_unit, ''))
                      )
              )
      )
),

final_state AS (
    SELECT state
    FROM solve
    ORDER BY step DESC
    LIMIT 1
),

report_dishes AS (
    SELECT h.dish_code
    FROM dish_header h
    CROSS JOIN params p
    WHERE (
            COALESCE(TRIM(p.dishcode), '') = ''
        AND COALESCE(TRIM(p.dishname), '') = ''
    )
    OR (
            COALESCE(TRIM(p.dishcode), '') <> ''
        AND h.dish_code = UPPER(TRIM(p.dishcode))
    )
    OR (
            COALESCE(TRIM(p.dishname), '') <> ''
        AND LOWER(TRIM(h.dishname)) = LOWER(TRIM(p.dishname))
    )

    UNION

    SELECT e.child_code
    FROM processed_edges e
    INNER JOIN report_dishes r
        ON r.dish_code = e.parent_code
    INNER JOIN dish_header h
        ON h.dish_code = e.child_code
),

line_priced AS (
    SELECT
        lr.*,
        CASE lr.line_kind
            WHEN 'raw' THEN lr.raw_line_cost
            WHEN 'processed' THEN
                CASE
                    WHEN (fs.state -> UPPER(TRIM(lr.item_id)) ->> 'rate') IS NOT NULL
                     AND LOWER(COALESCE(fs.state -> UPPER(TRIM(lr.item_id)) ->> 'unit', ''))
                         = LOWER(COALESCE(lr.destination_unit, ''))
                        THEN ROUND(
                            (
                                (fs.state -> UPPER(TRIM(lr.item_id)) ->> 'rate')::numeric
                                * lr.scoop_factor
                                * lr.qty
                            )::numeric,
                            4
                        )
                    ELSE NULL
                END
            ELSE NULL
        END AS line_cost,
        (fs.state -> UPPER(TRIM(lr.item_id)) ->> 'rate')::numeric AS child_rate,
        fs.state -> UPPER(TRIM(lr.item_id)) ->> 'unit' AS child_unit,
        (fs.state -> UPPER(TRIM(lr.item_id)) ->> 'dish_cost')::numeric AS child_dish_cost
    FROM line_ready lr
    CROSS JOIN final_state fs
)

SELECT
    'line'::text AS row_kind,
    lr.dish_code,
    lr.dishname,
    CASE
        WHEN EXISTS (SELECT 1 FROM processed_edges e WHERE e.parent_code = lr.dish_code)
            THEN 'case3'
        WHEN COALESCE(o.is_usable_in_other_dish, false) THEN 'case2'
        ELSE 'case1'
    END AS dish_case,
    lr.line_kind,
    lr.itemname,
    lr.item_id AS "pgNo_or_dishCode",
    lr.recipe_scoop AS receipescoop,
    lr.qty,
    lr.destination_unit,
    lr.scoop_factor,
    CASE
        WHEN lr.line_kind = 'raw' THEN lr.raw_rate
        WHEN lr.line_kind = 'processed' THEN lr.child_rate
        ELSE NULL
    END AS rate,
    lr.line_cost,
    o.is_usable_in_other_dish,
    o.out_scoop,
    o.qty_of_scoops,
    o.out_unit,
    o.out_factor,
    (fs.state -> lr.dish_code ->> 'dish_cost')::numeric AS dish_cost,
    CASE
        WHEN (fs.state -> lr.dish_code ->> 'dish_cost') IS NOT NULL
         AND COALESCE(o.qty_of_scoops, 0) > 0
            THEN ROUND(
                ((fs.state -> lr.dish_code ->> 'dish_cost')::numeric / o.qty_of_scoops)::numeric,
                4
            )
        ELSE NULL
    END AS cost_of_one_scoop,
    (fs.state -> lr.dish_code ->> 'rate')::numeric AS rate_per_destination_unit,
    COALESCE((fs.state -> lr.dish_code ->> 'incomplete')::boolean, false) AS incomplete,
    CASE
        WHEN lr.line_kind = 'raw' AND lr.line_cost IS NOT NULL THEN
            'rateper' || lr.destination_unit || ' '
            || trim(to_char(lr.raw_rate, 'FM999999990.0000'))
            || ' × factor '
            || trim(to_char(lr.scoop_factor, 'FM999999990.####'))
            || ' × qty '
            || trim(to_char(lr.qty, 'FM999999990.####'))
            || ' = '
            || trim(to_char(lr.line_cost, 'FM999999990.0000'))
            || COALESCE(' (bill ' || lr.raw_billno || ')', '')
        WHEN lr.line_kind = 'raw' THEN
            'raw line unpriced (no '
            || COALESCE(lr.destination_unit, 'scoop')
            || ' rate on raw_materials_cost for pgNo ' || COALESCE(lr.item_id, '?') || ')'
        WHEN lr.line_kind = 'processed' AND lr.line_cost IS NOT NULL THEN
            'child rateper' || COALESCE(lr.child_unit, '?') || ' '
            || trim(to_char(lr.child_rate, 'FM999999990.000000'))
            || ' × factor '
            || trim(to_char(lr.scoop_factor, 'FM999999990.####'))
            || ' × qty '
            || trim(to_char(lr.qty, 'FM999999990.####'))
            || ' = '
            || trim(to_char(lr.line_cost, 'FM999999990.0000'))
            || ' | child dish_cost '
            || trim(to_char(lr.child_dish_cost, 'FM999999990.0000'))
            || ' ÷ qtyOfScoop '
            || trim(to_char(child_out.qty_of_scoops, 'FM999999990.####'))
            || ' ÷ out factor '
            || trim(to_char(child_out.out_factor, 'FM999999990.####'))
        WHEN lr.line_kind = 'processed'
         AND lr.child_dish_cost IS NULL THEN
            'processed child ' || lr.itemname || ' (' || COALESCE(lr.item_id, '?')
            || ') is not solved yet (missing rate, cycle, or unit mismatch)'
        WHEN lr.line_kind = 'processed'
         AND lr.child_rate IS NULL THEN
            'processed child ' || lr.itemname
            || ' has dish_cost but no rate per unit — set qty of scoops and a gm/ml/piece dish-out scoop'
        WHEN lr.line_kind = 'processed' THEN
            'processed child unit ' || COALESCE(lr.child_unit, '?')
            || ' does not match recipe scoop unit ' || COALESCE(lr.destination_unit, '?')
        WHEN lr.line_kind = 'self' THEN
            'dish cannot contain itself'
        ELSE
            'not a raw material and not a dish recipe'
    END AS cost_calculation
FROM line_priced lr
INNER JOIN report_dishes rd
    ON rd.dish_code = lr.dish_code
LEFT JOIN dish_out_scoop o
    ON o.dish_code = lr.dish_code
LEFT JOIN dish_out_scoop child_out
    ON child_out.dish_code = UPPER(TRIM(lr.item_id))
CROSS JOIN final_state fs

UNION ALL

SELECT
    'dish_total'::text AS row_kind,
    h.dish_code,
    h.dishname,
    CASE
        WHEN EXISTS (SELECT 1 FROM processed_edges e WHERE e.parent_code = h.dish_code)
            THEN 'case3'
        WHEN COALESCE(o.is_usable_in_other_dish, false) THEN 'case2'
        ELSE 'case1'
    END AS dish_case,
    'total'::text AS line_kind,
    NULL::text AS itemname,
    NULL::text AS "pgNo_or_dishCode",
    o.out_scoop AS receipescoop,
    o.qty_of_scoops AS qty,
    o.out_unit AS destination_unit,
    o.out_factor AS scoop_factor,
    (fs.state -> h.dish_code ->> 'rate')::numeric AS rate,
    (fs.state -> h.dish_code ->> 'dish_cost')::numeric AS line_cost,
    o.is_usable_in_other_dish,
    o.out_scoop,
    o.qty_of_scoops,
    o.out_unit,
    o.out_factor,
    (fs.state -> h.dish_code ->> 'dish_cost')::numeric AS dish_cost,
    CASE
        WHEN (fs.state -> h.dish_code ->> 'dish_cost') IS NOT NULL
         AND COALESCE(o.qty_of_scoops, 0) > 0
            THEN ROUND(
                ((fs.state -> h.dish_code ->> 'dish_cost')::numeric / o.qty_of_scoops)::numeric,
                4
            )
        ELSE NULL
    END AS cost_of_one_scoop,
    (fs.state -> h.dish_code ->> 'rate')::numeric AS rate_per_destination_unit,
    COALESCE((fs.state -> h.dish_code ->> 'incomplete')::boolean, (fs.state -> h.dish_code ->> 'dish_cost') IS NULL) AS incomplete,
    CASE
        WHEN (fs.state -> h.dish_code ->> 'dish_cost') IS NULL THEN
            COALESCE(
                (
                    SELECT string_agg(
                        e.itemname || ' (' || e.child_code || '): ' ||
                        CASE
                            WHEN (fs.state -> e.child_code) IS NULL
                                THEN 'no recipe'
                            WHEN (fs.state -> e.child_code ->> 'rate') IS NULL
                                THEN 'child has no per-unit rate'
                            WHEN LOWER(COALESCE(fs.state -> e.child_code ->> 'unit', ''))
                                 IS DISTINCT FROM LOWER(COALESCE(e.destination_unit, ''))
                                THEN 'scoop unit ' || COALESCE(e.destination_unit, '?')
                                     || ' ≠ child unit ' || COALESCE(fs.state -> e.child_code ->> 'unit', '?')
                            ELSE 'waiting'
                        END,
                        '; ' ORDER BY e.itemname
                    )
                    FROM processed_edges e
                    WHERE e.parent_code = h.dish_code
                      AND (
                            (fs.state -> e.child_code ->> 'rate') IS NULL
                         OR LOWER(COALESCE(fs.state -> e.child_code ->> 'unit', ''))
                            IS DISTINCT FROM LOWER(COALESCE(e.destination_unit, ''))
                      )
                ),
                'unsolved'
            )
        WHEN COALESCE(o.qty_of_scoops, 0) > 0
         AND COALESCE(o.out_factor, 0) > 0
         AND (fs.state -> h.dish_code ->> 'rate') IS NOT NULL THEN
            'dish_cost '
            || trim(to_char((fs.state -> h.dish_code ->> 'dish_cost')::numeric, 'FM999999990.0000'))
            || ' | cost of one scoop = dish_cost ÷ '
            || trim(to_char(o.qty_of_scoops, 'FM999999990.####'))
            || ' = '
            || trim(to_char(
                (fs.state -> h.dish_code ->> 'dish_cost')::numeric / o.qty_of_scoops,
                'FM999999990.0000'
            ))
            || ' | rate per ' || o.out_unit || ' = that ÷ '
            || trim(to_char(o.out_factor, 'FM999999990.####'))
            || ' = '
            || trim(to_char((fs.state -> h.dish_code ->> 'rate')::numeric, 'FM999999990.000000'))
        ELSE
            'dish_cost '
            || trim(to_char((fs.state -> h.dish_code ->> 'dish_cost')::numeric, 'FM999999990.0000'))
            || CASE
                WHEN COALESCE((fs.state -> h.dish_code ->> 'incomplete')::boolean, false)
                    THEN ' (incomplete — a line has no price, so no per-unit rate)'
                ELSE ''
               END
    END AS cost_calculation
FROM dish_header h
INNER JOIN report_dishes rd
    ON rd.dish_code = h.dish_code
LEFT JOIN dish_out_scoop o
    ON o.dish_code = h.dish_code
CROSS JOIN final_state fs

ORDER BY dishname, dish_code, row_kind DESC, itemname NULLS LAST;
