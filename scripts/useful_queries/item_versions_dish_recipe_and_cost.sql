-- Per dish: recipe version (item_versions.item_type = dishes) and
-- published cost version (item_type = dish_cost_staging).
--
-- Same data as: SELECT * FROM public.v_dish_recipe_and_cost_versions;
-- Filter one dish: AND dish_code = 'D074'

SELECT *
FROM public.v_dish_recipe_and_cost_versions
ORDER BY dish_code;

-- Raw item_versions rows for one dish (both types):
-- SELECT item_code, item_type, version, last_updated_at
-- FROM public.item_versions
-- WHERE item_code = 'D074' AND item_type IN ('dishes', 'dish_cost_staging')
-- ORDER BY item_type;
