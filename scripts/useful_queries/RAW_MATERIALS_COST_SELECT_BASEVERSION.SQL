-- =============================================================================
-- raw_materials_cost — SELECT queries
-- =============================================================================
-- Run in psql or the app Query tab (http://localhost:3050).
--
-- Query A — rows already stored in public.raw_materials_cost
-- Query B — preview rates from order_items (same logic as
--   raw_materials_cost_insert_from_orders.sql, no INSERT)
--
-- Unique key: ("pgNo", based_on_billno)
-- Filters (both queries): billno, pgno, itemname — NULL or '' = all
-- Docs: scripts/useful_queries/README.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Stored table (edit filter_params: NULL or '' = no filter)
-- Example one item: SELECT NULL::text, '5'::text, 'dal'::text
-- ---------------------------------------------------------------------------
WITH filter_params AS (
    SELECT
        NULL::text AS billno,
        '5'::text AS pgno,
        'dal'::text AS itemname
)
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
    r.last_updated_at
FROM public.raw_materials_cost r
         LEFT JOIN public.raw_materials rm ON TRIM(rm."pgNo") = TRIM(r."pgNo")
         CROSS JOIN filter_params f
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
-- B) Preview from order_items + orders (before running INSERT)
-- ---------------------------------------------------------------------------
WITH filter_params AS (
    SELECT
        NULL::text AS billno,
        NULL::text AS pgno,
        NULL::text AS itemname
),
     purchases AS (
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
                  CROSS JOIN filter_params f
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
                        )) AS comments
FROM bill_pg bp
         INNER JOIN name_agg na ON na.pgno = bp.pgno AND na.billno = bp.billno
         LEFT JOIN latest_gm g ON g.pgno = bp.pgno AND g.billno = bp.billno
         LEFT JOIN latest_ml m ON m.pgno = bp.pgno AND m.billno = bp.billno
         LEFT JOIN latest_piece pc ON pc.pgno = bp.pgno AND pc.billno = bp.billno
ORDER BY bp.purchase_dt DESC NULLS LAST, bp.billno, bp.pgno;
