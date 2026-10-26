-- Recipe + published dish-cost versions per dish_code (item_versions rows).
-- Prerequisite: scripts/20_item_versions_dish_cost.sql

CREATE OR REPLACE VIEW public.v_dish_recipe_and_cost_versions AS
WITH dish_codes AS (
    SELECT DISTINCT UPPER(TRIM(dishcode)) AS dish_code
    FROM public.recipe_entries
    WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
    UNION
    SELECT iv.item_code AS dish_code
    FROM public.item_versions iv
    WHERE iv.item_type IN ('dishes', 'dish_cost_staging')
)
SELECT
    dc.dish_code,
    COALESCE(rv.version, 1) AS recipe_version,
    rv.last_updated_at AS recipe_version_updated_at,
    COALESCE(cv.version, 1) AS dish_cost_version,
    cv.last_updated_at AS dish_cost_version_updated_at
FROM dish_codes dc
LEFT JOIN public.item_versions rv
    ON rv.item_code = dc.dish_code AND rv.item_type = 'dishes'
LEFT JOIN public.item_versions cv
    ON cv.item_code = dc.dish_code AND cv.item_type = 'dish_cost_staging'
ORDER BY dc.dish_code;

ALTER VIEW public.v_dish_recipe_and_cost_versions OWNER TO poc;
GRANT SELECT ON public.v_dish_recipe_and_cost_versions TO poc;
