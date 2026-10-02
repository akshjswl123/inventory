-- =============================================================================
-- INSERT raw_materials_cost from order_items (rate per bill line)
-- =============================================================================
-- Source: order_items + orders (same rows as data/order_items30Sept3pm.csv export).
--
-- Per purchase line (itemtotal <> 0, qty > 0):
--   scoopin is exactly gm | ml | piece (case-insensitive):
--     ratepergram / rateperml / rateperpiece = itemtotal / qty
--   else (e.g. dal_kg_in, BURGER BUN_piece_in):
--     JOIN scoop_config ON scoop_name = scoopin, scoop_item_id = pgno, item name
--     rate per destination unit = (itemtotal / qty) / factor
--       destination_unit = gm    → ratepergram
--       destination_unit = ml    → rateperml
--       destination_unit = piece → rateperpiece
--
-- One row per (pgNo, billno): rates from lines on that bill only.
-- based_on_billno = orders.billno for that row (unique with pgNo).
--
-- Examples (from CSV):
--   BURGER BUN  B2  scoopin=BURGER BUN_piece_in  qty=1 itemtotal=11
--     → rateperpiece = (11/1)/1 = 11.0000
--   dal  5  scoopin=dal_kg_in  qty=1 itemtotal=156  factor=1000  dest=gm
--     → ratepergram = (156/1)/1000 = 0.1560
--   KALAUNJI  scoopin=KALAUNJI_gm_in  qty=250 itemtotal=80  factor=1
--     → ratepergram = (80/250)/1 = 0.3200
--
-- Preview (SELECT only): scripts/useful_queries/raw_materials_cost_select.sql (query B)
-- =============================================================================

INSERT INTO public.raw_materials_cost (
    "pgNo",
    item_names,
    ratepergram,
    rateperml,
    rateperpiece,
    based_on_billno,
    comments
)
WITH filter_params AS (
    SELECT
        NULL::text AS billno,
        NULL::text AS pgno
),
purchases AS (
    SELECT
        TRIM(oi.pgno) AS pgno,
        TRIM(oi.itemname) AS itemname,
        TRIM(oi.scoopin) AS scoopin,
        TRIM(o.billno) AS billno,
        o.dt AS purchase_dt,
        oi.qty::numeric AS qty,
        oi.itemtotal::numeric AS itemtotal,
        oi.created_at AS line_ts,
        oi.id AS line_id
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    CROSS JOIN filter_params f
    WHERE oi.itemtotal IS NOT NULL
      AND oi.itemtotal <> 0
      AND oi.qty IS NOT NULL
      AND oi.qty > 0
      AND oi.itemname IS NOT NULL
      AND TRIM(oi.itemname) <> ''
      AND (f.billno IS NULL OR TRIM(f.billno) = '' OR TRIM(o.billno) = TRIM(f.billno))
      AND (f.pgno IS NULL OR TRIM(f.pgno) = '' OR TRIM(oi.pgno) = TRIM(f.pgno))
),
line_rates AS (
    SELECT
        p.*,
        LOWER(TRIM(p.scoopin)) AS scoopin_norm,
        sc.factor,
        LOWER(TRIM(sc.destination_unit)) AS destination_unit,
        ROUND(
            (p.itemtotal / NULLIF(p.qty, 0))::numeric,
            4
        ) AS unit_price,
        ROUND(
            (
                (p.itemtotal / NULLIF(p.qty, 0))
                / NULLIF(COALESCE(sc.factor, 1), 0)
            )::numeric,
            4
        ) AS unit_price_per_dest_factor
    FROM purchases p
    LEFT JOIN public.scoop_config sc
        ON sc.scoop_name = p.scoopin
       AND TRIM(sc.scoop_item_id) = p.pgno
       AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(p.itemname)
),
priced_lines AS (
    SELECT
        lr.pgno,
        lr.itemname,
        lr.billno,
        lr.purchase_dt,
        lr.line_ts,
        lr.line_id,
        CASE
            WHEN lr.scoopin_norm = 'gm' THEN lr.unit_price
            WHEN lr.scoopin_norm NOT IN ('gm', 'ml', 'piece')
                 AND lr.destination_unit = 'gm'
                THEN lr.unit_price_per_dest_factor
        END AS ratepergram,
        CASE
            WHEN lr.scoopin_norm = 'ml' THEN lr.unit_price
            WHEN lr.scoopin_norm NOT IN ('gm', 'ml', 'piece')
                 AND lr.destination_unit = 'ml'
                THEN lr.unit_price_per_dest_factor
        END AS rateperml,
        CASE
            WHEN lr.scoopin_norm = 'piece' THEN lr.unit_price
            WHEN lr.scoopin_norm NOT IN ('gm', 'ml', 'piece')
                 AND lr.destination_unit = 'piece'
                THEN lr.unit_price_per_dest_factor
        END AS rateperpiece
    FROM line_rates lr
    WHERE lr.scoopin_norm IN ('gm', 'ml', 'piece')
       OR lr.destination_unit IN ('gm', 'ml', 'piece')
),
latest_gm AS (
    SELECT DISTINCT ON (pgno, billno)
        pgno,
        billno,
        ratepergram,
        purchase_dt
    FROM priced_lines
    WHERE ratepergram IS NOT NULL
    ORDER BY pgno, billno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_ml AS (
    SELECT DISTINCT ON (pgno, billno)
        pgno,
        billno,
        rateperml,
        purchase_dt
    FROM priced_lines
    WHERE rateperml IS NOT NULL
    ORDER BY pgno, billno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_piece AS (
    SELECT DISTINCT ON (pgno, billno)
        pgno,
        billno,
        rateperpiece,
        purchase_dt
    FROM priced_lines
    WHERE rateperpiece IS NOT NULL
    ORDER BY pgno, billno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
name_agg AS (
    SELECT pgno, billno, ARRAY_AGG(DISTINCT itemname ORDER BY itemname) AS item_names
    FROM priced_lines
    GROUP BY pgno, billno
),
bill_pg AS (
    SELECT pgno, billno, MAX(purchase_dt) AS purchase_dt
    FROM priced_lines
    GROUP BY pgno, billno
)
SELECT
    bp.pgno AS "pgNo",
    na.item_names,
    g.ratepergram,
    m.rateperml,
    pc.rateperpiece,
    bp.billno AS based_on_billno,
    TRIM(BOTH '; ' FROM CONCAT_WS(
        '; ',
        CASE WHEN g.ratepergram IS NOT NULL
            THEN 'ratepergram from bill ' || g.billno || ' on ' || g.purchase_dt::text
        END,
        CASE WHEN m.rateperml IS NOT NULL
            THEN 'rateperml from bill ' || m.billno || ' on ' || m.purchase_dt::text
        END,
        CASE WHEN pc.rateperpiece IS NOT NULL
            THEN 'rateperpiece from bill ' || pc.billno || ' on ' || pc.purchase_dt::text
        END
    )) AS comments
FROM bill_pg bp
INNER JOIN name_agg na ON na.pgno = bp.pgno AND na.billno = bp.billno
LEFT JOIN latest_gm g ON g.pgno = bp.pgno AND g.billno = bp.billno
LEFT JOIN latest_ml m ON m.pgno = bp.pgno AND m.billno = bp.billno
LEFT JOIN latest_piece pc ON pc.pgno = bp.pgno AND pc.billno = bp.billno
ON CONFLICT ("pgNo", based_on_billno) DO UPDATE SET
    item_names = EXCLUDED.item_names,
    ratepergram = EXCLUDED.ratepergram,
    rateperml = EXCLUDED.rateperml,
    rateperpiece = EXCLUDED.rateperpiece,
    based_on_billno = EXCLUDED.based_on_billno,
    comments = EXCLUDED.comments,
    last_updated_at = CURRENT_TIMESTAMP;
