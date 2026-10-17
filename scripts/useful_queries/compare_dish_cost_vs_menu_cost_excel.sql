-- Compare calculated dish totals vs menuCostExcel (menu + cost).
-- Join key: upper(trim(dishname)) = upper(trim(menu)).
--
-- Default calc source: dish_cost_after_ersion (latest versioned SQL run).
-- To use staging baseline instead, replace dish_cost_after_ersion with dish_cost_staging.
--
-- Run whole file (both result sets):
--   docker exec -i poc_db psql -U poc -d poc -f scripts/useful_queries/compare_dish_cost_vs_menu_cost_excel.sql

DROP TABLE IF EXISTS _menu_cost_compare;

CREATE TEMP TABLE _menu_cost_compare AS
WITH calc AS (
    SELECT
        upper(trim(dishname)) AS name_k,
        trim(dish_code) AS dish_code,
        trim(dishname) AS dishname,
        nullif(trim(dish_cost), '')::numeric AS dish_cost
    FROM public.dish_cost_after_ersion
    WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total'
      AND trim(coalesce(dishname, '')) <> ''
),
excel AS (
    SELECT
        upper(trim(menu)) AS name_k,
        trim(menu) AS menu,
        cost AS excel_cost
    FROM public."menuCostExcel"
    WHERE trim(coalesce(menu, '')) <> ''
)
SELECT
    coalesce(c.dish_code, '') AS dish_code,
    coalesce(c.dishname, e.menu) AS menu,
    c.dish_cost AS calc_cost,
    e.excel_cost,
    round(coalesce(c.dish_cost, 0) - coalesce(e.excel_cost, 0), 4) AS delta,
    CASE
        WHEN c.name_k IS NULL THEN 'only_in_excel'
        WHEN e.name_k IS NULL THEN 'only_in_calc'
        WHEN e.excel_cost IS NULL THEN 'excel_cost_null'
        WHEN abs(coalesce(c.dish_cost, 0) - coalesce(e.excel_cost, 0)) > 1 THEN 'mismatch'
        ELSE 'match'
    END AS status
FROM calc c
FULL OUTER JOIN excel e ON c.name_k = e.name_k;

-- 1) Summary
SELECT status, count(*) AS cnt
FROM _menu_cost_compare
GROUP BY status
ORDER BY status;

-- 2) Full diff (not match)
SELECT status, dish_code, menu, calc_cost, excel_cost, delta
FROM _menu_cost_compare
WHERE status <> 'match'
ORDER BY abs(delta) DESC NULLS LAST, status, menu;
