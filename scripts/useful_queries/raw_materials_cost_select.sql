-- =============================================================================
-- raw_materials_cost — SELECT queries (A: stored table, B: preview from bills)
-- =============================================================================
-- Run the ENTIRE script from the top in the Query tab.
-- The app runs all statements; the result grid shows the LAST query (B).
--
-- >>> EDIT FILTERS ONCE — INSERT below (NULL = no filter on that field) <<<
--
-- Preview-only (one statement, no temp table): use filter_params in query B only
-- and do not paste query A — or run raw_materials_cost_table_select.sql for A.
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS rmc_cost_filter (
    billno text,
    pgno text,
    itemname text
);

DELETE FROM rmc_cost_filter;

INSERT INTO rmc_cost_filter (billno, pgno, itemname)
VALUES (
    NULL,       -- billno e.g. 'recipe'
    '5',        -- pgno   e.g. '5'
    'dal'       -- itemname e.g. 'dal'
);

-- ---------------------------------------------------------------------------
-- A) Stored table
-- ---------------------------------------------------------------------------
SELECT
    r.id,
    r."pgNo",
    rm.itemname AS catalog_itemname,
    r.item_names,
    r.ratepergram,
    r.rateperml,
    r.rateperpiece,
    r.based_on_billno,
    r.comments,
    r.created_at,
    r.last_updated_at,
    NULLIF(TRIM(f.pgno), '') AS filter_pgno,
    NULLIF(TRIM(f.itemname), '') AS filter_itemname,
    NULLIF(TRIM(f.billno), '') AS filter_billno
FROM public.raw_materials_cost r
LEFT JOIN public.raw_materials rm ON TRIM(rm."pgNo") = TRIM(r."pgNo")
CROSS JOIN rmc_cost_filter f
WHERE (f.billno IS NULL OR TRIM(f.billno) = '' OR TRIM(r.based_on_billno) = TRIM(f.billno))
  AND (f.pgno IS NULL OR TRIM(f.pgno) = '' OR TRIM(r."pgNo") = TRIM(f.pgno))
  AND (
      f.itemname IS NULL OR TRIM(f.itemname) = ''
      OR LOWER(TRIM(rm.itemname)) = LOWER(TRIM(f.itemname))
      OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(r.item_names, ARRAY[]::text[])) AS n(name)
          WHERE LOWER(TRIM(name)) = LOWER(TRIM(f.itemname))
      )
  )
ORDER BY r.based_on_billno NULLS LAST, r."pgNo";


-- ---------------------------------------------------------------------------
-- B) Preview from order_items + orders
-- ---------------------------------------------------------------------------
WITH purchases AS (
    SELECT
        TRIM(oi.pgno) AS pgno,
        TRIM(oi.itemname) AS itemname,
        TRIM(oi.scoopin) AS scoopin,
        TRIM(o.billno) AS billno,
        o.dt AS purchase_dt,
        o.vendor,
        oi.qty::numeric AS qty,
        oi.itemtotal::numeric AS itemtotal,
        oi.rate::numeric AS line_rate,
        oi.created_at AS line_ts,
        oi.id AS line_id
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    CROSS JOIN rmc_cost_filter f
    WHERE oi.itemtotal IS NOT NULL
      AND oi.itemtotal <> 0
      AND oi.qty IS NOT NULL
      AND oi.qty > 0
      AND oi.itemname IS NOT NULL
      AND TRIM(oi.itemname) <> ''
      AND (f.billno IS NULL OR TRIM(f.billno) = '' OR TRIM(o.billno) = TRIM(f.billno))
      AND (f.pgno IS NULL OR TRIM(f.pgno) = '' OR TRIM(oi.pgno) = TRIM(f.pgno))
      AND (
          f.itemname IS NULL OR TRIM(f.itemname) = ''
          OR LOWER(TRIM(oi.itemname)) = LOWER(TRIM(f.itemname))
      )
),
line_rates AS (
    SELECT
        p.*,
        LOWER(TRIM(p.scoopin)) AS scoopin_norm,
        sc.factor,
        LOWER(TRIM(sc.destination_unit)) AS destination_unit,
        ROUND((p.itemtotal / NULLIF(p.qty, 0))::numeric, 4) AS unit_price,
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
        lr.vendor,
        lr.purchase_dt,
        lr.line_ts,
        lr.line_id,
        lr.qty,
        lr.itemtotal,
        lr.line_rate,
        lr.scoopin,
        lr.destination_unit,
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
    SELECT pgno, billno, MAX(purchase_dt) AS purchase_dt, MAX(vendor) AS vendor
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
    bp.vendor,
    bp.purchase_dt AS bill_dt,
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
    )) AS comments,
    NULLIF(TRIM(f.pgno), '') AS filter_pgno,
    NULLIF(TRIM(f.itemname), '') AS filter_itemname,
    NULLIF(TRIM(f.billno), '') AS filter_billno
FROM bill_pg bp
INNER JOIN name_agg na ON na.pgno = bp.pgno AND na.billno = bp.billno
LEFT JOIN latest_gm g ON g.pgno = bp.pgno AND g.billno = bp.billno
LEFT JOIN latest_ml m ON m.pgno = bp.pgno AND m.billno = bp.billno
LEFT JOIN latest_piece pc ON pc.pgno = bp.pgno AND pc.billno = bp.billno
CROSS JOIN rmc_cost_filter f
WHERE (f.billno IS NULL OR TRIM(f.billno) = '' OR TRIM(bp.billno) = TRIM(f.billno))
  AND (f.pgno IS NULL OR TRIM(f.pgno) = '' OR TRIM(bp.pgno) = TRIM(f.pgno))
  AND (
      f.itemname IS NULL OR TRIM(f.itemname) = ''
      OR EXISTS (
          SELECT 1
          FROM unnest(na.item_names) AS n(name)
          WHERE LOWER(TRIM(name)) = LOWER(TRIM(f.itemname))
      )
  )
ORDER BY bp.purchase_dt DESC NULLS LAST, bp.billno, bp.pgno;
