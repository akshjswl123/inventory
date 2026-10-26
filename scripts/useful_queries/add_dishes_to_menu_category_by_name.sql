-- Link dishes to a menu category when dish_name matches a pattern.
-- Edit the two literals in params, then run the whole file.
--
-- Example: all names containing "pasta" → category "pasta"
--
--   docker exec -i poc_db psql -U poc -d poc -f scripts/useful_queries/add_dishes_to_menu_category_by_name.sql

WITH params AS (
    SELECT
        lower(trim('pasta')) AS category_name,   -- menu_categories.menu_category_name
        '%pasta%'::text AS dish_name_pattern     -- LIKE pattern (already lowercased in filter)
),
to_link AS (
    SELECT d.dish_code, mc.menu_category_id
    FROM public.dishes d
    CROSS JOIN params p
    JOIN public.menu_categories mc
        ON lower(trim(mc.menu_category_name)) = p.category_name
    WHERE d.dish_code IS NOT NULL
      AND trim(d.dish_code) <> ''
      AND lower(trim(d.dish_name)) LIKE p.dish_name_pattern
)
INSERT INTO public.dish_menu_category (dish_code, menu_category_id)
SELECT dish_code, menu_category_id
FROM to_link
ON CONFLICT (dish_code, menu_category_id) DO NOTHING
RETURNING dish_code, menu_category_id;

-- Preview matches without inserting (run alone if you want to check first):
-- WITH params AS (
--     SELECT lower(trim('pasta')) AS category_name, '%pasta%'::text AS dish_name_pattern
-- )
-- SELECT d.dish_code, d.dish_name, mc.menu_category_id, mc.menu_category_name
-- FROM public.dishes d
-- CROSS JOIN params p
-- JOIN public.menu_categories mc ON lower(trim(mc.menu_category_name)) = p.category_name
-- WHERE d.dish_code IS NOT NULL AND trim(d.dish_code) <> ''
--   AND lower(trim(d.dish_name)) LIKE p.dish_name_pattern
-- ORDER BY d.dish_name;
