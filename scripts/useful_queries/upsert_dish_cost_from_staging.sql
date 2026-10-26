-- Latest dish_total per dish_code (highest dish_cost_version) from dish_cost_staging → upsert into dish_cost.
-- Requires UNIQUE (dish_code) on public.dish_cost (see scripts/25_dish_cost_dish_code_unique.sql).

WITH latest AS (
    SELECT DISTINCT ON (UPPER(TRIM(s.dish_code)))
        'dish_total'::text AS row_kind,
        NULLIF(TRIM(s.dish_code), '') AS dish_code,
        NULLIF(TRIM(s.dishname), '') AS dishname,
        NULLIF(TRIM(s.dish_case), '') AS dish_case,
        NULLIF(TRIM(s.line_kind), '') AS line_kind,
        NULLIF(TRIM(s.itemname), '') AS itemname,
        NULLIF(TRIM(s."pgNo_or_dishCode"), '') AS "pgNo_or_dishCode",
        NULLIF(TRIM(s.receipescoop), '') AS receipescoop,
        NULLIF(TRIM(s.qty), '')::numeric AS qty,
        NULLIF(TRIM(s.destination_unit), '') AS destination_unit,
        NULLIF(TRIM(s.scoop_factor), '')::numeric AS scoop_factor,
        NULLIF(TRIM(s.rate), '')::numeric AS rate,
        NULLIF(TRIM(s.line_cost), '')::numeric AS line_cost,
        CASE
            WHEN s.is_usable_in_other_dish IS NULL OR TRIM(s.is_usable_in_other_dish) = '' THEN NULL
            WHEN UPPER(TRIM(s.is_usable_in_other_dish)) IN ('TRUE', 'T', '1', 'YES') THEN true
            ELSE false
        END AS is_usable_in_other_dish,
        NULLIF(TRIM(s.out_scoop), '') AS out_scoop,
        NULLIF(TRIM(s.qty_of_scoops), '')::numeric AS qty_of_scoops,
        NULLIF(TRIM(s.out_unit), '') AS out_unit,
        NULLIF(TRIM(s.out_factor), '')::numeric AS out_factor,
        NULLIF(TRIM(s.dish_cost), '')::numeric AS dish_cost,
        NULLIF(TRIM(s.cost_of_one_scoop), '')::numeric AS cost_of_one_scoop,
        NULLIF(TRIM(s.rate_per_destination_unit), '')::numeric AS rate_per_destination_unit,
        CASE
            WHEN s.incomplete IS NULL OR TRIM(s.incomplete) = '' THEN NULL
            WHEN UPPER(TRIM(s.incomplete)) IN ('TRUE', 'T', '1', 'YES') THEN true
            ELSE false
        END AS incomplete,
        NULLIF(TRIM(s.cost_calculation), '') AS cost_calculation
    FROM public.dish_cost_staging s
    WHERE LOWER(TRIM(COALESCE(s.row_kind, ''))) = 'dish_total'
      AND TRIM(COALESCE(s.dish_code, '')) <> ''
    ORDER BY
        UPPER(TRIM(s.dish_code)),
        NULLIF(TRIM(s.dish_cost_version), '')::integer DESC NULLS LAST,
        s.ctid DESC
)
INSERT INTO public.dish_cost (
    row_kind,
    dish_code,
    dishname,
    dish_case,
    line_kind,
    itemname,
    "pgNo_or_dishCode",
    receipescoop,
    qty,
    destination_unit,
    scoop_factor,
    rate,
    line_cost,
    is_usable_in_other_dish,
    out_scoop,
    qty_of_scoops,
    out_unit,
    out_factor,
    dish_cost,
    cost_of_one_scoop,
    rate_per_destination_unit,
    incomplete,
    cost_calculation
)
SELECT
    row_kind,
    dish_code,
    dishname,
    dish_case,
    line_kind,
    itemname,
    "pgNo_or_dishCode",
    receipescoop,
    qty,
    destination_unit,
    scoop_factor,
    rate,
    line_cost,
    is_usable_in_other_dish,
    out_scoop,
    qty_of_scoops,
    out_unit,
    out_factor,
    dish_cost,
    cost_of_one_scoop,
    rate_per_destination_unit,
    incomplete,
    cost_calculation
FROM latest
ON CONFLICT (dish_code) DO UPDATE SET
    row_kind = EXCLUDED.row_kind,
    dishname = EXCLUDED.dishname,
    dish_case = EXCLUDED.dish_case,
    line_kind = EXCLUDED.line_kind,
    itemname = EXCLUDED.itemname,
    "pgNo_or_dishCode" = EXCLUDED."pgNo_or_dishCode",
    receipescoop = EXCLUDED.receipescoop,
    qty = EXCLUDED.qty,
    destination_unit = EXCLUDED.destination_unit,
    scoop_factor = EXCLUDED.scoop_factor,
    rate = EXCLUDED.rate,
    line_cost = EXCLUDED.line_cost,
    is_usable_in_other_dish = EXCLUDED.is_usable_in_other_dish,
    out_scoop = EXCLUDED.out_scoop,
    qty_of_scoops = EXCLUDED.qty_of_scoops,
    out_unit = EXCLUDED.out_unit,
    out_factor = EXCLUDED.out_factor,
    dish_cost = EXCLUDED.dish_cost,
    cost_of_one_scoop = EXCLUDED.cost_of_one_scoop,
    rate_per_destination_unit = EXCLUDED.rate_per_destination_unit,
    incomplete = EXCLUDED.incomplete,
    cost_calculation = EXCLUDED.cost_calculation;
