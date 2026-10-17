-- Compare dish_cost_staging (baseline cleaned) vs dish_cost_after_ersion (after-version cleaned)
WITH before AS (
    SELECT upper(trim(dish_code)) AS k,
           trim(dish_code) AS dish_code,
           trim(dishname) AS dishname,
           nullif(trim(dish_cost), '')::numeric AS dish_cost
    FROM public.dish_cost_staging
    WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total'
      AND trim(coalesce(dish_code, '')) <> ''
),
after AS (
    SELECT upper(trim(dish_code)) AS k,
           trim(dish_code) AS dish_code,
           trim(dishname) AS dishname,
           nullif(trim(dish_cost), '')::numeric AS dish_cost
    FROM public.dish_cost_after_ersion
    WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total'
      AND trim(coalesce(dish_code, '')) <> ''
),
joined AS (
    SELECT
        coalesce(b.dish_code, a.dish_code) AS dish_code,
        coalesce(b.dishname, a.dishname) AS dishname,
        b.dish_cost AS staging_cost,
        a.dish_cost AS after_cost,
        round(coalesce(a.dish_cost, 0) - coalesce(b.dish_cost, 0), 4) AS delta,
        CASE
            WHEN b.k IS NULL THEN 'only_in_after'
            WHEN a.k IS NULL THEN 'only_in_staging'
            WHEN abs(coalesce(b.dish_cost, 0) - coalesce(a.dish_cost, 0)) > 0.01 THEN 'mismatch'
            ELSE 'match'
        END AS status
    FROM before b
    FULL OUTER JOIN after a ON b.k = a.k
)
SELECT status, count(*) FROM joined GROUP BY status ORDER BY 1;

-- Uncomment for full diff list:
-- SELECT * FROM joined WHERE status <> 'match' ORDER BY abs(delta) DESC NULLS LAST, status, dish_code;
