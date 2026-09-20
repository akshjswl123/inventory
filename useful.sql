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
