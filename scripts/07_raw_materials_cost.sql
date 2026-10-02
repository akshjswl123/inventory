-- =============================================================================
-- raw_materials_cost — recreate table + refresh from purchases
-- =============================================================================
-- Computes ratepergram / rateperml / rateperpiece from the **latest** purchase
-- line per pgNo and unit family (order_items + order_entries + scoop_config).
-- based_on_billno = billno from the latest order_entries row per pgNo (flat bills).
--
-- Denominator per line: qty * units from scoop_config by destination_unit
--   (gm → qty_in_grams/factor; ml → qty_in_ml; piece → qty_in_piece)
--
-- Run (after 01_schema.sql):
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/07_raw_materials_cost.sql
--
-- SELECT-only preview (commented, with examples):
--   scripts/useful_queries/raw_materials_cost_latest.sql
-- Docs: scripts/useful_queries/README.md
-- Optional filters: edit filter_params.billno, .pgno, .itemname (NULL = all).
--
-- Example (aata, pgNo 1, aata_bag_in): qty=1, itemtotal=10000, destination_unit=gm,
--   qty_in_grams=25000 → ratepergram = 10000/25000 = 0.4000
-- =============================================================================

DROP TABLE IF EXISTS public.raw_materials_cost;

CREATE TABLE public.raw_materials_cost
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY (
        INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1
    ),
    "pgNo" text COLLATE pg_catalog."default" NOT NULL,
    item_names text[] COLLATE pg_catalog."default",
    ratepergram numeric(12,4),
    rateperml numeric(12,4),
    rateperpiece numeric(12,4),
    based_on_billno text COLLATE pg_catalog."default",
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_cost_pkey PRIMARY KEY (id),
    CONSTRAINT raw_materials_cost_pgno_billno_key UNIQUE ("pgNo", based_on_billno)
) TABLESPACE pg_default;

ALTER TABLE public.raw_materials_cost OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials_cost TO poc;

DROP TRIGGER IF EXISTS raw_materials_cost_touch_last_updated_at ON public.raw_materials_cost;
CREATE TRIGGER raw_materials_cost_touch_last_updated_at
    BEFORE UPDATE ON public.raw_materials_cost
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

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
        NULL::text AS pgno,
        NULL::text AS itemname
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
    WHERE oi.itemname IS NOT NULL
      AND TRIM(oi.itemname) <> ''
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
    WHERE oe.itemname IS NOT NULL
      AND TRIM(oe.itemname) <> ''
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
latest_entry_bill AS (
    SELECT DISTINCT ON (TRIM(rm."pgNo"))
        TRIM(rm."pgNo") AS pgno,
        TRIM(oe.billno) AS based_on_billno
    FROM public.raw_materials rm
    INNER JOIN public.order_entries oe
        ON TRIM(rm."pgNo") = TRIM(oe.pgno)
       AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(oe.itemname))
    CROSS JOIN filter_params f
    WHERE oe.billno IS NOT NULL AND TRIM(oe.billno) <> ''
      AND (f.billno IS NULL OR TRIM(f.billno) = '' OR TRIM(oe.billno) = TRIM(f.billno))
      AND (f.pgno IS NULL OR TRIM(f.pgno) = '' OR TRIM(rm."pgNo") = TRIM(f.pgno))
      AND (
          f.itemname IS NULL OR TRIM(f.itemname) = ''
          OR LOWER(TRIM(rm.itemname)) = LOWER(TRIM(f.itemname))
      )
    ORDER BY TRIM(rm."pgNo"), oe.dt DESC NULLS LAST, oe.created_at DESC NULLS LAST, oe.id DESC
),
lines AS (
    SELECT
        TRIM(rm."pgNo") AS pgno,
        rm.itemname AS catalog_itemname,
        p.itemname AS purchase_itemname,
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
       AND sc.destination_unit IS NOT NULL
       AND TRIM(sc.destination_unit) <> ''
),
with_units AS (
    SELECT
        l.*,
        CASE l.destination_unit
            WHEN 'gm' THEN COALESCE(l.qty_in_grams, l.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(l.qty_in_ml, l.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(l.qty_in_piece, l.factor, 1::numeric)
            ELSE NULL
        END AS units_per_scoop
    FROM lines l
    WHERE l.destination_unit IN ('gm', 'ml', 'piece')
),
priced AS (
    SELECT
        w.*,
        (w.qty * w.units_per_scoop) AS base_qty
    FROM with_units w
    WHERE w.units_per_scoop IS NOT NULL AND w.units_per_scoop > 0
      AND w.qty IS NOT NULL AND w.qty > 0
),
latest_gm AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        purchase_itemname,
        purchase_dt,
        destination_unit,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS ratepergram
    FROM priced
    WHERE destination_unit = 'gm'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_ml AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        purchase_dt,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperml
    FROM priced
    WHERE destination_unit = 'ml'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_piece AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        purchase_dt,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperpiece
    FROM priced
    WHERE destination_unit = 'piece'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
name_agg AS (
    SELECT pgno, ARRAY_AGG(DISTINCT purchase_itemname ORDER BY purchase_itemname) AS item_names
    FROM priced
    GROUP BY pgno
)
SELECT
    TRIM(rm."pgNo") AS "pgNo",
    COALESCE(n.item_names, ARRAY[TRIM(rm.itemname)]::text[]) AS item_names,
    g.ratepergram,
    m.rateperml,
    p.rateperpiece,
    lb.based_on_billno,
    CASE
        WHEN g.pgno IS NULL AND m.pgno IS NULL AND p.pgno IS NULL THEN 'No purchase lines'
        ELSE TRIM(BOTH '; ' FROM CONCAT_WS(
            '; ',
            CASE WHEN g.ratepergram IS NOT NULL
                THEN 'ratepergram from latest gm-dest purchase on ' || g.purchase_dt::text
            END,
            CASE WHEN m.rateperml IS NOT NULL
                THEN 'rateperml from latest ml purchase on ' || m.purchase_dt::text
            END,
            CASE WHEN p.rateperpiece IS NOT NULL
                THEN 'rateperpiece from latest piece purchase on ' || p.purchase_dt::text
            END
        ))
    END AS comments
FROM public.raw_materials rm
CROSS JOIN filter_params f
LEFT JOIN name_agg n ON n.pgno = TRIM(rm."pgNo")
LEFT JOIN latest_entry_bill lb ON lb.pgno = TRIM(rm."pgNo")
LEFT JOIN latest_gm g ON g.pgno = TRIM(rm."pgNo")
LEFT JOIN latest_ml m ON m.pgno = TRIM(rm."pgNo")
LEFT JOIN latest_piece p ON p.pgno = TRIM(rm."pgNo")
WHERE (f.pgno IS NULL OR TRIM(f.pgno) = '' OR TRIM(rm."pgNo") = TRIM(f.pgno))
  AND (
      f.itemname IS NULL OR TRIM(f.itemname) = ''
      OR LOWER(TRIM(rm.itemname)) = LOWER(TRIM(f.itemname))
  );

SELECT COUNT(*) AS raw_materials_cost_rows FROM public.raw_materials_cost;
