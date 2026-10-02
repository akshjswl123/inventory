-- =============================================================================
-- raw_materials_cost — SELECT stored rows only
-- =============================================================================
-- Filters: edit INSERT values (NULL = no filter). Run whole file from top.
-- Or use combined A+B: raw_materials_cost_select.sql
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS rmc_cost_filter (
    billno text,
    pgno text,
    itemname text
);

DELETE FROM rmc_cost_filter;

INSERT INTO rmc_cost_filter (billno, pgno, itemname)
VALUES (NULL, NULL, NULL);

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
