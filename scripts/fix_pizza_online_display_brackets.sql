-- Swiggy item report uses [Regular]; Zomato uses (Regular). normalize_pos_item_name maps both.
-- Set dinein_menu.online_display_name to Swiggy strings for exact Swiggy match; Zomato still matches via normalize.
--
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/fix_pizza_online_display_brackets.sql

UPDATE public.dinein_menu
SET
    online_display_name = v.display_name,
    last_updated_at = CURRENT_TIMESTAMP
FROM (VALUES
    ('D139', 'Veg Pizza [Regular]'),
    ('D140', 'Paneer Makhani Pizza [Regular]'),
    ('D141', 'Cheese Corn Pizza [Regular]'),
    ('D142', 'Margherita Pizza [Regular]')
) AS v(dishcode, display_name)
WHERE UPPER(TRIM(dinein_menu.dishcode)) = UPPER(TRIM(v.dishcode))
  AND TRIM(COALESCE(dinein_menu.online_display_name, '')) IS DISTINCT FROM v.display_name;

UPDATE public.swiggy_menu
SET
    dishname = v.display_name,
    last_updated_at = CURRENT_TIMESTAMP
FROM (VALUES
    ('D139', 'Veg Pizza [Regular]'),
    ('D140', 'Paneer Makhani Pizza [Regular]'),
    ('D141', 'Cheese Corn Pizza [Regular]'),
    ('D142', 'Margherita Pizza [Regular]')
) AS v(dishcode, display_name)
WHERE UPPER(TRIM(swiggy_menu.dishcode)) = UPPER(TRIM(v.dishcode))
  AND TRIM(swiggy_menu.dishname) IS DISTINCT FROM v.display_name;

SELECT dishcode, dishname, online_display_name
FROM public.dinein_menu
WHERE dishcode IN ('D139', 'D140', 'D141', 'D142')
ORDER BY dishcode;
