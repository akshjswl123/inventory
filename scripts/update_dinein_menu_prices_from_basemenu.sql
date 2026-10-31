-- Insert new dinein_menu version rows with price from petpooja_basemenu (keeps prior versions).
-- Match: petpooja_item_id::bigint = basemenu.item_id
-- Uses latest dinein_menu row per (dishcode, dishname); skips unchanged price, ₹0 basemenu, and
-- rows where version+1 already exists.
--
-- Preview (no writes):
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 -c "
--   WITH latest AS (
--       SELECT DISTINCT ON (d.dishcode, d.dishname)
--           d.dishcode, d.dishname, d.petpooja_item_id, d.version, d.price
--       FROM public.dinein_menu d
--       ORDER BY d.dishcode, d.dishname, d.version DESC, d.id DESC
--   )
--   SELECT l.dishcode, l.dishname, l.version AS old_version, l.version + 1 AS new_version,
--          l.price AS old_price, b.price AS new_price
--   FROM latest l
--   JOIN public.petpooja_basemenu b ON b.item_id = l.petpooja_item_id::bigint
--   WHERE l.petpooja_item_id IS NOT NULL AND trim(l.petpooja_item_id) <> ''
--     AND b.price IS NOT NULL AND b.price > 0
--     AND l.price IS DISTINCT FROM b.price
--     AND NOT EXISTS (
--         SELECT 1 FROM public.dinein_menu n
--         WHERE n.dishcode = l.dishcode AND n.dishname = l.dishname AND n.version = l.version + 1
--     )
--   ORDER BY l.dishcode, l.dishname;"
--
-- Apply:
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/update_dinein_menu_prices_from_basemenu.sql

WITH latest AS (
    SELECT DISTINCT ON (d.dishcode, d.dishname)
        d.dishcode,
        d.dishname,
        d.petpooja_item_id,
        d.online_display_name,
        d.version,
        d.price
    FROM public.dinein_menu d
    ORDER BY d.dishcode, d.dishname, d.version DESC, d.id DESC
),
candidates AS (
    SELECT
        l.dishcode,
        l.dishname,
        l.petpooja_item_id,
        l.online_display_name,
        l.version + 1 AS new_version,
        b.price AS new_price
    FROM latest l
    INNER JOIN public.petpooja_basemenu b
        ON b.item_id = l.petpooja_item_id::bigint
    WHERE l.petpooja_item_id IS NOT NULL
      AND trim(l.petpooja_item_id) <> ''
      AND b.price IS NOT NULL
      AND b.price > 0
      AND l.price IS DISTINCT FROM b.price
      AND NOT EXISTS (
          SELECT 1
          FROM public.dinein_menu n
          WHERE n.dishcode = l.dishcode
            AND n.dishname = l.dishname
            AND n.version = l.version + 1
      )
)
INSERT INTO public.dinein_menu (
    dishcode,
    dishname,
    petpooja_item_id,
    online_display_name,
    price,
    version
)
SELECT
    c.dishcode,
    c.dishname,
    c.petpooja_item_id,
    c.online_display_name,
    c.new_price,
    c.new_version
FROM candidates c
RETURNING id, dishcode, dishname, version, price;
