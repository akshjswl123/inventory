-- Menu rows / online_display_name for item_report_lines (all areas).

CREATE OR REPLACE FUNCTION public.normalize_pos_item_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT LOWER(TRIM(REPLACE(REPLACE(COALESCE(p, ''), '[', '('), ']', ')')));
$$;

-- Run after imports: aligns aggregator display names and adds dinein_menu rows from dishes catalog.
--
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/sync_dinein_menu_from_item_report_lines.sql

-- 1) Aggregator POS names: set online_display_name when dishname already matches
UPDATE public.dinein_menu m
SET
    online_display_name = src.pos_item_name,
    last_updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (LOWER(TRIM(ir.item_name)))
        LOWER(TRIM(ir.item_name)) AS name_k,
        TRIM(ir.item_name) AS pos_item_name
    FROM public.item_report_lines ir
    WHERE UPPER(TRIM(ir.area)) IN ('ZOMATO', 'SWIGGY')
      AND TRIM(COALESCE(ir.item_name, '')) <> ''
    ORDER BY LOWER(TRIM(ir.item_name)), ir.report_date DESC, ir.id DESC
) src
WHERE LOWER(TRIM(m.dishname)) = src.name_k
  AND TRIM(COALESCE(m.online_display_name, '')) IS DISTINCT FROM TRIM(src.pos_item_name);

-- 2) Bracket-normalized online_display_name ( [ ] vs ( ) ) for aggregator lines
UPDATE public.dinein_menu m
SET
    online_display_name = src.pos_item_name,
    last_updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (m2.id)
        m2.id AS menu_id,
        TRIM(ir.item_name) AS pos_item_name
    FROM public.item_report_lines ir
    INNER JOIN public.dinein_menu m2
        ON LOWER(TRIM(REPLACE(REPLACE(m2.online_display_name, '[', '('), ']', ')')))
            = LOWER(TRIM(ir.item_name))
    WHERE UPPER(TRIM(ir.area)) IN ('ZOMATO', 'SWIGGY')
      AND TRIM(COALESCE(m2.online_display_name, '')) <> ''
    ORDER BY m2.id, ir.report_date DESC, ir.id DESC
) src
WHERE m.id = src.menu_id
  AND TRIM(COALESCE(m.online_display_name, '')) IS DISTINCT FROM TRIM(src.pos_item_name);

-- 3) dishcode only — see scripts/backfill_dinein_menu_dishcode.sql
