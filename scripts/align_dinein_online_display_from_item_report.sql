-- Align dinein_menu.online_display_name to POS Item Report strings (Zomato / Swiggy).
-- Matches when report item_name equals menu online_display_name after normalizing [ ] → ( ).
-- Also links via petpooja_menu.item_id when dinein_menu.petpooja_item_id is set.
--
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f - < scripts/align_dinein_online_display_from_item_report.sql

CREATE OR REPLACE FUNCTION public.normalize_pos_item_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT LOWER(TRIM(REPLACE(REPLACE(COALESCE(p, ''), '[', '('), ']', ')')));
$$;

WITH pos_by_petpooja AS (
    SELECT DISTINCT ON (TRIM(m.petpooja_item_id))
        TRIM(m.petpooja_item_id) AS petpooja_item_id,
        TRIM(ir.item_name) AS pos_item_name
    FROM public.dinein_menu m
    INNER JOIN public.item_report_lines ir
        ON UPPER(TRIM(ir.area)) IN ('ZOMATO', 'SWIGGY')
    INNER JOIN public.petpooja_menu pm
        ON pm.item_id::text = TRIM(m.petpooja_item_id)
    WHERE TRIM(COALESCE(m.petpooja_item_id, '')) <> ''
      AND public.normalize_pos_item_name(ir.item_name)
          = public.normalize_pos_item_name(pm.online_display_name)
    ORDER BY TRIM(m.petpooja_item_id), ir.report_date DESC, ir.id DESC
),
pos_by_display_norm AS (
    SELECT DISTINCT ON (m.id)
        m.id AS menu_id,
        TRIM(ir.item_name) AS pos_item_name
    FROM public.dinein_menu m
    INNER JOIN public.item_report_lines ir
        ON UPPER(TRIM(ir.area)) IN ('ZOMATO', 'SWIGGY')
    WHERE TRIM(COALESCE(m.online_display_name, '')) <> ''
      AND public.normalize_pos_item_name(m.online_display_name)
          = public.normalize_pos_item_name(ir.item_name)
    ORDER BY m.id, ir.report_date DESC, ir.id DESC
),
to_apply AS (
    SELECT m.id AS menu_id, p.pos_item_name
    FROM public.dinein_menu m
    INNER JOIN pos_by_petpooja p
        ON TRIM(m.petpooja_item_id) = p.petpooja_item_id
    UNION
    SELECT menu_id, pos_item_name FROM pos_by_display_norm
)
UPDATE public.dinein_menu m
SET
    online_display_name = a.pos_item_name,
    last_updated_at = CURRENT_TIMESTAMP
FROM to_apply a
WHERE m.id = a.menu_id
  AND TRIM(COALESCE(a.pos_item_name, '')) <> ''
  AND TRIM(COALESCE(m.online_display_name, '')) IS DISTINCT FROM TRIM(a.pos_item_name);

-- Preview rows still mismatched (Zomato/Swiggy sales, no menu online name match)
SELECT COUNT(*) AS remaining_zomato_swiggy_unmatched_lines
FROM public.item_report_lines ir
WHERE UPPER(TRIM(ir.area)) IN ('ZOMATO', 'SWIGGY')
  AND NOT EXISTS (
      SELECT 1
      FROM public.dinein_menu m
      WHERE TRIM(COALESCE(m.online_display_name, '')) <> ''
        AND LOWER(TRIM(m.online_display_name)) = LOWER(TRIM(ir.item_name))
  );
