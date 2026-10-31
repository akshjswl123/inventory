-- =============================================================================
-- current_stock_by_pgno_as_of(p_as_of) — stock by pgNo through end of p_as_of
-- =============================================================================
-- Same scoop_config logic as view current_stock_by_pgno; filters movements:
--   order_items     → orders.dt <= p_as_of
--   order_entries   → dt <= p_as_of
--   inventory_out   → inventory_out.dt <= p_as_of
--   order_out       → dt <= p_as_of
--
-- View current_stock_by_pgno is unchanged (all dates). API: GET /api/current-stock/by-pgno?asOf=YYYY-MM-DD
--
-- Run: psql -h localhost -p 5433 -U poc -d poc -f scripts/33_current_stock_by_pgno_as_of.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_stock_by_pgno_as_of(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE (
    "pgNo" text,
    itemnames text,
    total_in_gm numeric,
    total_in_ml numeric,
    total_in_piece numeric,
    total_out_gm numeric,
    total_out_ml numeric,
    total_out_piece numeric,
    current_stock_gm numeric,
    current_stock_ml numeric,
    current_stock_piece numeric,
    as_of_date date
)
LANGUAGE sql
STABLE
AS $$
WITH params AS (
    SELECT p_as_of AS as_of_date
),
move_in AS (
    SELECT
        TRIM(oi.pgno) AS pgno,
        TRIM(oi.itemname) AS itemname,
        TRIM(oi.scoopin) AS scoop_name,
        oi.qty::numeric AS qty
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    CROSS JOIN params p
    WHERE o.dt <= p.as_of_date
      AND oi.pgno IS NOT NULL AND TRIM(oi.pgno) <> ''
      AND oi.itemname IS NOT NULL AND TRIM(oi.itemname) <> ''
      AND oi.qty IS NOT NULL AND oi.qty > 0
      AND oi.scoopin IS NOT NULL AND TRIM(oi.scoopin) <> ''

    UNION ALL

    SELECT
        TRIM(oe.pgno),
        TRIM(oe.itemname),
        TRIM(oe.scoopin),
        oe.qty::numeric
    FROM public.order_entries oe
    CROSS JOIN params p
    WHERE oe.dt <= p.as_of_date
      AND oe.pgno IS NOT NULL AND TRIM(oe.pgno) <> ''
      AND oe.itemname IS NOT NULL AND TRIM(oe.itemname) <> ''
      AND oe.qty IS NOT NULL AND oe.qty > 0
      AND oe.scoopin IS NOT NULL AND TRIM(oe.scoopin) <> ''
),
move_out AS (
    SELECT
        TRIM(ioi.pgno) AS pgno,
        TRIM(ioi.itemname) AS itemname,
        TRIM(ioi.scoop_out) AS scoop_name,
        ioi.qty::numeric AS qty
    FROM public.inventory_out_items ioi
    INNER JOIN public.inventory_out io ON io.id = ioi.inventory_out_id
    CROSS JOIN params p
    WHERE io.dt <= p.as_of_date
      AND ioi.pgno IS NOT NULL AND TRIM(ioi.pgno) <> ''
      AND ioi.itemname IS NOT NULL AND TRIM(ioi.itemname) <> ''
      AND ioi.qty IS NOT NULL AND ioi.qty > 0
      AND ioi.scoop_out IS NOT NULL AND TRIM(ioi.scoop_out) <> ''

    UNION ALL

    SELECT
        TRIM(oo."pgNo"),
        TRIM(oo.itemname),
        TRIM(oo.scoop_out),
        oo.qty::numeric
    FROM public.order_out oo
    CROSS JOIN params p
    WHERE oo.dt <= p.as_of_date
      AND oo."pgNo" IS NOT NULL AND TRIM(oo."pgNo") <> ''
      AND oo.itemname IS NOT NULL AND TRIM(oo.itemname) <> ''
      AND oo.qty IS NOT NULL AND oo.qty > 0
      AND oo.scoop_out IS NOT NULL AND TRIM(oo.scoop_out) <> ''
),
in_converted AS (
    SELECT
        m.pgno,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'gm' THEN m.qty * COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
            ELSE 0::numeric END AS add_gm,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'ml' THEN m.qty * COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
            ELSE 0::numeric END AS add_ml,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'piece' THEN m.qty * COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE 0::numeric END AS add_piece
    FROM move_in m
    INNER JOIN public.scoop_config sc
        ON sc.scoop_name = m.scoop_name
       AND TRIM(sc.scoop_item_id) = m.pgno
       AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(m.itemname)
       AND sc.destination_unit IS NOT NULL
       AND TRIM(sc.destination_unit) <> ''
       AND LOWER(TRIM(sc.destination_unit)) IN ('gm', 'ml', 'piece')
),
out_converted AS (
    SELECT
        m.pgno,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'gm' THEN m.qty * COALESCE(sc.qty_in_grams, sc.factor, 1::numeric)
            ELSE 0::numeric END AS sub_gm,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'ml' THEN m.qty * COALESCE(sc.qty_in_ml, sc.factor, 1::numeric)
            ELSE 0::numeric END AS sub_ml,
        CASE LOWER(TRIM(sc.destination_unit))
            WHEN 'piece' THEN m.qty * COALESCE(sc.qty_in_piece, sc.factor, 1::numeric)
            ELSE 0::numeric END AS sub_piece
    FROM move_out m
    INNER JOIN public.scoop_config sc
        ON sc.scoop_name = m.scoop_name
       AND TRIM(sc.scoop_item_id) = m.pgno
       AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(m.itemname)
       AND sc.destination_unit IS NOT NULL
       AND TRIM(sc.destination_unit) <> ''
       AND LOWER(TRIM(sc.destination_unit)) IN ('gm', 'ml', 'piece')
),
tot_in AS (
    SELECT pgno,
           SUM(add_gm) AS total_in_gm,
           SUM(add_ml) AS total_in_ml,
           SUM(add_piece) AS total_in_piece
    FROM in_converted
    GROUP BY pgno
),
tot_out AS (
    SELECT pgno,
           SUM(sub_gm) AS total_out_gm,
           SUM(sub_ml) AS total_out_ml,
           SUM(sub_piece) AS total_out_piece
    FROM out_converted
    GROUP BY pgno
),
catalog_names AS (
    SELECT TRIM(rm."pgNo") AS pgno,
           STRING_AGG(DISTINCT TRIM(rm.itemname), ',' ORDER BY TRIM(rm.itemname)) AS itemnames
    FROM public.raw_materials rm
    WHERE rm."pgNo" IS NOT NULL AND TRIM(rm."pgNo") <> ''
      AND rm.itemname IS NOT NULL AND TRIM(rm.itemname) <> ''
    GROUP BY TRIM(rm."pgNo")
),
movement_names AS (
    SELECT u.pgno,
           STRING_AGG(DISTINCT u.itemname, ',' ORDER BY u.itemname) AS itemnames
    FROM (
        SELECT pgno, itemname FROM move_in
        UNION
        SELECT pgno, itemname FROM move_out
    ) u
    GROUP BY u.pgno
),
all_pg AS (
    SELECT pgno FROM tot_in
    UNION
    SELECT pgno FROM tot_out
    UNION
    SELECT pgno FROM catalog_names
)
SELECT
    a.pgno AS "pgNo",
    COALESCE(cn.itemnames, mn.itemnames) AS itemnames,
    ROUND(COALESCE(i.total_in_gm, 0)::numeric, 4) AS total_in_gm,
    ROUND(COALESCE(i.total_in_ml, 0)::numeric, 4) AS total_in_ml,
    ROUND(COALESCE(i.total_in_piece, 0)::numeric, 4) AS total_in_piece,
    ROUND(COALESCE(o.total_out_gm, 0)::numeric, 4) AS total_out_gm,
    ROUND(COALESCE(o.total_out_ml, 0)::numeric, 4) AS total_out_ml,
    ROUND(COALESCE(o.total_out_piece, 0)::numeric, 4) AS total_out_piece,
    ROUND((COALESCE(i.total_in_gm, 0) - COALESCE(o.total_out_gm, 0))::numeric, 4) AS current_stock_gm,
    ROUND((COALESCE(i.total_in_ml, 0) - COALESCE(o.total_out_ml, 0))::numeric, 4) AS current_stock_ml,
    ROUND((COALESCE(i.total_in_piece, 0) - COALESCE(o.total_out_piece, 0))::numeric, 4) AS current_stock_piece,
    p.as_of_date
FROM all_pg a
CROSS JOIN params p
LEFT JOIN tot_in i ON i.pgno = a.pgno
LEFT JOIN tot_out o ON o.pgno = a.pgno
LEFT JOIN catalog_names cn ON cn.pgno = a.pgno
LEFT JOIN movement_names mn ON mn.pgno = a.pgno;
$$;

ALTER FUNCTION public.current_stock_by_pgno_as_of(date) OWNER TO poc;
GRANT EXECUTE ON FUNCTION public.current_stock_by_pgno_as_of(date) TO poc;
