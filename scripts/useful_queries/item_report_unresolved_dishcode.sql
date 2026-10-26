-- Unresolved dishcode for item_report_lines (same join as itemReportSummary.sql).
-- Usage: set dates and channel ($3 = zomato | swiggy | dinein).

CREATE OR REPLACE FUNCTION public.normalize_pos_item_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT LOWER(TRIM(REPLACE(REPLACE(COALESCE(p, ''), '[', '('), ']', ')')));
$$;

WITH lines AS (
    SELECT l.id, l.report_date, l.area, l.item_name, l.qty
    FROM public.item_report_lines l
    WHERE l.report_date >= $1::date
      AND l.report_date <= $2::date
      AND (
          ($3::text = 'zomato' AND UPPER(TRIM(l.area)) = 'ZOMATO')
          OR ($3::text = 'swiggy' AND UPPER(TRIM(l.area)) = 'SWIGGY')
          OR ($3::text = 'dinein' AND UPPER(TRIM(l.area)) NOT IN ('SWIGGY', 'ZOMATO'))
      )
),
lines_enriched AS (
    SELECT l.*, dm.dishcode
    FROM lines l
    LEFT JOIN LATERAL (
        SELECT m.dishcode
        FROM public.dinein_menu m
        WHERE (
            UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
            AND (
                (
                    TRIM(COALESCE(m.online_display_name, '')) <> ''
                    AND LOWER(TRIM(m.online_display_name)) = LOWER(TRIM(l.item_name))
                )
                OR LOWER(TRIM(m.dishname)) = LOWER(TRIM(l.item_name))
                OR public.normalize_pos_item_name(m.online_display_name)
                    = public.normalize_pos_item_name(l.item_name)
                OR public.normalize_pos_item_name(m.dishname)
                    = public.normalize_pos_item_name(l.item_name)
            )
        )
        OR (
            UPPER(TRIM(l.area)) NOT IN ('ZOMATO', 'SWIGGY')
            AND LOWER(TRIM(m.dishname)) = LOWER(TRIM(l.item_name))
        )
        ORDER BY
            CASE
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND TRIM(COALESCE(m.online_display_name, '')) <> ''
                 AND LOWER(TRIM(m.online_display_name)) = LOWER(TRIM(l.item_name))
                THEN 0
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND TRIM(COALESCE(m.online_display_name, '')) <> ''
                 AND public.normalize_pos_item_name(m.online_display_name)
                     = public.normalize_pos_item_name(l.item_name)
                THEN 1
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND LOWER(TRIM(m.dishname)) = LOWER(TRIM(l.item_name))
                THEN 2
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND public.normalize_pos_item_name(m.dishname)
                     = public.normalize_pos_item_name(l.item_name)
                THEN 3
                ELSE 4
            END,
            m.version DESC, m.last_updated_at DESC, m.id DESC
        LIMIT 1
    ) dm ON TRUE
)
SELECT item_name, SUM(qty)::numeric AS sum_qty, COUNT(*)::int AS line_count
FROM lines_enriched
WHERE TRIM(COALESCE(dishcode, '')) = ''
GROUP BY LOWER(TRIM(item_name)), item_name
ORDER BY sum_qty DESC, item_name;
