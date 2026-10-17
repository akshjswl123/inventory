SELECT menu_name, CONCAT(menu_name, '_1_portion') FROM public.menuexcel;

-- Current stock in grams
-- scoopin / scoop_out name contains gm  -> qty already in grams
-- scoopin / scoop_out name contains kg  -> qty * 1000
-- stock = scoopin grams - scoopout grams
WITH qty_in AS (
  SELECT
    TRIM(itemname) AS itemname,
    SUM(
      CASE
        WHEN scoopin ILIKE '%kg%' THEN COALESCE(qty, 0) * 1000
        WHEN scoopin ILIKE '%gm%' THEN COALESCE(qty, 0)
        ELSE 0
      END
    ) AS scoopin_gm
  FROM public.order_items
  WHERE itemname IS NOT NULL AND TRIM(itemname) <> ''
  GROUP BY TRIM(itemname)
),
qty_out AS (
  SELECT
    TRIM(itemname) AS itemname,
    SUM(
      CASE
        WHEN scoop_out ILIKE '%kg%' THEN COALESCE(qty, 0) * 1000
        WHEN scoop_out ILIKE '%gm%' THEN COALESCE(qty, 0)
        ELSE 0
      END
    ) AS scoopout_gm
  FROM public.inventory_out_items
  WHERE itemname IS NOT NULL AND TRIM(itemname) <> ''
  GROUP BY TRIM(itemname)
)
SELECT
  COALESCE(i.itemname, o.itemname) AS itemname,
  COALESCE(i.scoopin_gm, 0) AS scoopin_gm,
  COALESCE(o.scoopout_gm, 0) AS scoopout_gm,
  COALESCE(i.scoopin_gm, 0) - COALESCE(o.scoopout_gm, 0) AS current_stock_gm
FROM qty_in i
FULL OUTER JOIN qty_out o ON i.itemname = o.itemname
ORDER BY itemname;


SELECT
    sc.scoop_item_name,
    sc.scoop_item_id,
    sc.destination_unit,
    sc.scoop_name,
    sc.factor,
    sc.conversion_chain,
    sc.qty_in_grams,
    sc.qty_in_ml,
    sc.qty_in_piece,
    sc.unused
FROM public.scoop_config sc
INNER JOIN public.raw_materials rm
    ON TRIM(sc.scoop_item_id) = TRIM(rm."pgNo")
   AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(rm.itemname))
ORDER BY
    sc.scoop_item_id,
    sc.scoop_item_name,
    sc.scoop_name;

-- Each dish should have gm/ml/piece/portion _reciepe (+ menu piece in/out or P* gm in/out, and _1_portion)
WITH required AS (
    SELECT d.dish_code, d.dish_name, suffix.suffix
    FROM public.dishes d
    CROSS JOIN (
        VALUES
            ('_gm_reciepe'),
            ('_ml_reciepe'),
            ('_piece_reciepe'),
            ('_portion_reciepe'),
            ('_1_portion')
    ) AS suffix(suffix)
),
have AS (
    SELECT
        TRIM(sc.scoop_item_id) AS dish_code,
        sc.scoop_name
    FROM public.scoop_config sc
    WHERE EXISTS (
        SELECT 1 FROM public.dishes d
        WHERE TRIM(d.dish_code) = TRIM(sc.scoop_item_id)
    )
)
SELECT r.dish_code, r.dish_name, r.suffix AS missing_scoop_suffix
FROM required r
WHERE NOT EXISTS (
    SELECT 1 FROM have h
    WHERE h.dish_code = TRIM(r.dish_code)
      AND h.scoop_name = r.dish_name || r.suffix
)
ORDER BY r.dish_code, r.suffix;

-- Each raw material should have gm/ml/piece/kg/ltr/pkt _reciepe
WITH required AS (
    SELECT rm."pgNo", rm.itemname, suffix.suffix
    FROM public.raw_materials rm
    CROSS JOIN (
        VALUES
            ('_gm_reciepe'),
            ('_ml_reciepe'),
            ('_piece_reciepe'),
            ('_kg_reciepe'),
            ('_ltr_reciepe'),
            ('_pkt_reciepe')
    ) AS suffix(suffix)
)
SELECT req."pgNo", req.itemname, req.suffix AS missing_scoop_suffix
FROM required req
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config sc
    WHERE TRIM(sc.scoop_item_id) = TRIM(req."pgNo")
      AND TRIM(sc.scoop_item_name) = TRIM(req.itemname)
      AND sc.scoop_name = req.itemname || req.suffix
)
ORDER BY req.itemname, req.suffix;



SELECT id
FROM your_table_name
ORDER BY
    -- 1. Extract and sort by the leading numeric part (cast to integer)
    NULLIF(regexp_replace(id, '\D.*', '', 'g'), '')::int NULLS LAST,
    -- 2. Sort by the full string to handle the alphabetical suffixes
    id;


---items not present in raw_material cost table but present in reciepe
WITH recipe_latest_batch AS (
    SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
    UPPER(TRIM(dishcode)) AS dish_code,
    created_at AS saved_at
FROM public.recipe_entries
WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
ORDER BY UPPER(TRIM(dishcode)), created_at DESC, id DESC
    ),
    recipe_scope AS (
SELECT re.*
FROM public.recipe_entries re
    INNER JOIN recipe_latest_batch lb
ON UPPER(TRIM(re.dishcode)) = lb.dish_code
    AND re.created_at >= lb.saved_at - interval '30 seconds'
    ),
    ingredient_lines AS (
SELECT DISTINCT
    UPPER(TRIM(re.\"pgNo\")) AS pgno,
        TRIM(re.reciepeitemname) AS itemname
    FROM recipe_scope re
    WHERE re.\"pgNo\" IS NOT NULL
      AND TRIM(re.\"pgNo\") <> ''
      AND re.qty IS NOT NULL AND re.qty > 0
      AND LOWER(TRIM(re.reciepeitemname)) NOT IN (
          'dish_out', 'totalingredientsqty', 'totalprocessedqty'
      )
),
dish_codes AS (
    SELECT DISTINCT UPPER(TRIM(dishcode)) AS dish_code
    FROM public.recipe_entries
    WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
)
SELECT il.pgno,
       il.itemname,
       rm.itemname AS catalog_name,
       COUNT(DISTINCT rs.dish_code) AS used_in_dish_count
FROM ingredient_lines il
INNER JOIN public.raw_materials rm
    ON UPPER(TRIM(rm.\"pgNo\")) = il.pgno
   AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(il.itemname))
LEFT JOIN public.raw_materials_cost rmc
    ON UPPER(TRIM(rmc.\"pgNo\")) = il.pgno
LEFT JOIN recipe_scope rs
    ON UPPER(TRIM(rs.\"pgNo\")) = il.pgno
   AND LOWER(TRIM(rs.reciepeitemname)) = LOWER(TRIM(il.itemname))
WHERE rmc.\"pgNo\" IS NULL
  AND il.pgno NOT IN (SELECT dish_code FROM dish_codes)
ORDER BY used_in_dish_count DESC, il.pgno, il.itemname;
--


SELECT DISTINCT
    rm."pgNo",
    rm.itemname,
    rm.comments,
    NULLIF(regexp_replace(rm."pgNo", '\D.*', '', 'g'), '')::int AS pg_no_sort
FROM public.raw_materials AS rm
WHERE NOT EXISTS (
    SELECT 1
    FROM public.raw_materials_cost AS rmc
    WHERE TRIM(rmc."pgNo") = TRIM(rm."pgNo")
)
ORDER BY
    pg_no_sort NULLS LAST,
    rm."pgNo",
    rm.itemname;

-- Sync order_items.pgno from raw_materials (by item name, case-insensitive).
-- See: scripts/useful_queries/sync_order_items_pgno_from_raw_materials.sql
--
-- Preview one item:
-- SELECT oi.id, oi.itemname, oi.pgno AS old_pgno, rm."pgNo" AS new_pgno
-- FROM public.order_items oi
-- INNER JOIN public.raw_materials rm
--   ON LOWER(TRIM(oi.itemname)) = LOWER(TRIM(rm.itemname))
-- WHERE LOWER(TRIM(oi.itemname)) = LOWER(TRIM('CHEESE BLEND'));



---billin import sql from other db
SELECT
    o.vendor,
    o.dt::date AS dt,
    o.billno,
    oi.itemname,
    oi.pgno,
    oi.scoopin,
    oi.qty,
    oi.rate,
    oi.itemtotal,
    COALESCE(oi.comments, '') AS comments
FROM public.order_items oi
INNER JOIN public.orders o ON o.id = oi.order_id
-- optional: one bill only
-- WHERE TRIM(o.billno) = 'YOUR_BILL_NO'
--   AND o.dt = '2025-09-30'::date
ORDER BY o.dt, o.billno, oi.id;


--Connect to server (host localhost, port 5433, user poc, DB poc).
-- Right-click dish_cost_staging → Import/Export → import CSV, header on, null string NULL.
-- Or: ./scripts/dish_cost_import_and_clean.sh data/dishCostFromQueryTabCounterDb.csv
--     → dish_cost_cleaned_up table + data/*_cleaned.csv
--     Docs: scripts/useful_queries/dish_cost_staging_clean.md
-- Seed v1 from cleaned CSV: ./scripts/dish_cost_seed_v1.sh data/dishCostFromQueryTabCounterDb_cleaned.csv
-- Run the INSERT + DROP staging in the Query Tool.


--latest dish cost from staging
BEGIN;

TRUNCATE public.dish_cost;

INSERT INTO public.dish_cost (
    row_kind,
    dish_code,
    dishname,
    dish_case,
    line_kind,
    itemname,
    "pgNo_or_dishCode",
    receipescoop,
    qty,
    destination_unit,
    scoop_factor,
    rate,
    line_cost,
    is_usable_in_other_dish,
    out_scoop,
    qty_of_scoops,
    out_unit,
    out_factor,
    dish_cost,
    cost_of_one_scoop,
    rate_per_destination_unit,
    incomplete,
    cost_calculation
)
SELECT DISTINCT ON (UPPER(TRIM(s.dish_code)))
    'dish_total',
    NULLIF(TRIM(s.dish_code), ''),
    NULLIF(TRIM(s.dishname), ''),
    NULLIF(TRIM(s.dish_case), ''),
    NULLIF(TRIM(s.line_kind), ''),
    NULLIF(TRIM(s.itemname), ''),
    NULLIF(TRIM(s."pgNo_or_dishCode"), ''),
    NULLIF(TRIM(s.receipescoop), ''),
    NULLIF(TRIM(s.qty), '')::numeric,
    NULLIF(TRIM(s.destination_unit), ''),
    NULLIF(TRIM(s.scoop_factor), '')::numeric,
    NULLIF(TRIM(s.rate), '')::numeric,
    NULLIF(TRIM(s.line_cost), '')::numeric,
    CASE
        WHEN s.is_usable_in_other_dish IS NULL OR TRIM(s.is_usable_in_other_dish) = '' THEN NULL
        WHEN UPPER(TRIM(s.is_usable_in_other_dish)) IN ('TRUE', 'T', '1', 'YES') THEN true
        ELSE false
    END,
    NULLIF(TRIM(s.out_scoop), ''),
    NULLIF(TRIM(s.qty_of_scoops), '')::numeric,
    NULLIF(TRIM(s.out_unit), ''),
    NULLIF(TRIM(s.out_factor), '')::numeric,
    NULLIF(TRIM(s.dish_cost), '')::numeric,
    NULLIF(TRIM(s.cost_of_one_scoop), '')::numeric,
    NULLIF(TRIM(s.rate_per_destination_unit), '')::numeric,
    CASE
        WHEN s.incomplete IS NULL OR TRIM(s.incomplete) = '' THEN NULL
        WHEN UPPER(TRIM(s.incomplete)) IN ('TRUE', 'T', '1', 'YES') THEN true
        ELSE false
    END,
    NULLIF(TRIM(s.cost_calculation), '')
FROM public.dish_cost_staging s
WHERE LOWER(TRIM(s.row_kind)) = 'dish_total'
  AND TRIM(COALESCE(s.dish_code, '')) <> ''
ORDER BY
    UPPER(TRIM(s.dish_code)),
    s.ctid DESC;   -- if you import twice into staging, keeps last row per dish

COMMIT;


----create backup table
CREATE TABLE dish_cost_staging_after_version AS
SELECT * FROM dish_cost_staging;