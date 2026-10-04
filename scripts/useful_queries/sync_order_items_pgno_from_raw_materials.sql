-- =============================================================================
-- Sync order_items.pgno from raw_materials (match on item name)
-- =============================================================================
-- When several raw_materials rows share the same itemname, uses the newest row (max id).
--
-- Preview one item:
--   SELECT * FROM raw_materials WHERE LOWER(TRIM(itemname)) = LOWER(TRIM('CHEESE BLEND'));
--
-- Run preview (all lines that would change), then UPDATE.
-- =============================================================================

-- A) Preview changes
SELECT
    oi.id,
    oi.order_id,
    oi.itemname,
    oi.pgno AS old_pgno,
    rm.pgno AS new_pgno,
    oi.scoopin,
    oi.qty,
    oi.rate,
    oi.itemtotal
FROM public.order_items oi
INNER JOIN (
    SELECT DISTINCT ON (LOWER(TRIM(itemname)))
        LOWER(TRIM(itemname)) AS itemname_key,
        TRIM("pgNo") AS pgno
    FROM public.raw_materials
    WHERE itemname IS NOT NULL
      AND TRIM(itemname) <> ''
      AND "pgNo" IS NOT NULL
      AND TRIM("pgNo") <> ''
    ORDER BY LOWER(TRIM(itemname)), id DESC
) rm ON LOWER(TRIM(oi.itemname)) = rm.itemname_key
WHERE TRIM(COALESCE(oi.pgno, '')) IS DISTINCT FROM TRIM(rm.pgno)
ORDER BY oi.itemname, oi.id;

-- B) Apply update (all matching order_items)
UPDATE public.order_items oi
SET pgno = rm.pgno
FROM (
    SELECT DISTINCT ON (LOWER(TRIM(itemname)))
        LOWER(TRIM(itemname)) AS itemname_key,
        TRIM("pgNo") AS pgno
    FROM public.raw_materials
    WHERE itemname IS NOT NULL
      AND TRIM(itemname) <> ''
      AND "pgNo" IS NOT NULL
      AND TRIM("pgNo") <> ''
    ORDER BY LOWER(TRIM(itemname)), id DESC
) rm
WHERE LOWER(TRIM(oi.itemname)) = rm.itemname_key
  AND TRIM(COALESCE(oi.pgno, '')) IS DISTINCT FROM TRIM(rm.pgno);

-- C) Optional: single item only (example)
-- UPDATE public.order_items oi
-- SET pgno = rm."pgNo"
-- FROM public.raw_materials rm
-- WHERE LOWER(TRIM(oi.itemname)) = LOWER(TRIM(rm.itemname))
--   AND LOWER(TRIM(oi.itemname)) = LOWER(TRIM('CHEESE BLEND'))
--   AND rm.id = (
--       SELECT id FROM public.raw_materials
--       WHERE LOWER(TRIM(itemname)) = LOWER(TRIM('CHEESE BLEND'))
--       ORDER BY id DESC
--       LIMIT 1
--   );
