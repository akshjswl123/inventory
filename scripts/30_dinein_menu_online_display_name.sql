-- online_display_name on dinein_menu (from petpooja_menu by item id)
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/30_dinein_menu_online_display_name.sql

ALTER TABLE public.dinein_menu
    ADD COLUMN IF NOT EXISTS online_display_name text;

UPDATE public.dinein_menu AS m
SET
    online_display_name = p.online_display_name,
    last_updated_at = CURRENT_TIMESTAMP
FROM public.petpooja_menu AS p
WHERE m.petpooja_item_id IS NOT NULL
  AND TRIM(m.petpooja_item_id) <> ''
  AND p.item_id = TRIM(m.petpooja_item_id)::bigint;
