-- =============================================================================
-- Raw export in dish_cost_staging → cleaned rows in dish_cost_staging_after_version
-- Keeps last CSV block per dish_code (drops repeated P8/P7/CN1 sections).
-- Prerequisite: load full Query CSV into dish_cost_staging first.
-- =============================================================================

BEGIN;

TRUNCATE public.dish_cost_staging_after_version;

WITH ordered AS (
    SELECT
        s.*,
        row_number() OVER (ORDER BY ctid) AS seq
    FROM public.dish_cost_staging s
),
with_seg AS (
    SELECT
        o.*,
        sum(
            CASE
                WHEN trim(coalesce(o.dish_code, '')) = ''
                 AND trim(coalesce(o.row_kind, '')) = ''
                 AND trim(coalesce(o.dishname, '')) = ''
                 AND trim(coalesce(o.itemname, '')) = ''
                THEN 1
                ELSE 0
            END
        ) OVER (ORDER BY o.seq ROWS UNBOUNDED PRECEDING) AS seg
    FROM ordered o
),
segments AS (
    SELECT
        upper(trim(dish_code)) AS dish_code_key,
        seg,
        max(seq) AS seg_end
    FROM with_seg
    WHERE trim(coalesce(dish_code, '')) <> ''
    GROUP BY upper(trim(dish_code)), seg
),
last_seg AS (
    SELECT DISTINCT ON (dish_code_key)
        dish_code_key,
        seg,
        seg_end
    FROM segments
    ORDER BY dish_code_key, seg_end DESC
),
last_block AS (
    SELECT w.*
    FROM with_seg w
    INNER JOIN last_seg l
        ON upper(trim(w.dish_code)) = l.dish_code_key
       AND w.seg = l.seg
)
INSERT INTO public.dish_cost_staging_after_version (
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
    f.row_kind,
    f.dish_code,
    f.dishname,
    f.dish_case,
    f.line_kind,
    f.itemname,
    f."pgNo_or_dishCode",
    f.receipescoop,
    f.qty,
    f.destination_unit,
    f.scoop_factor,
    f.rate,
    f.line_cost,
    f.is_usable_in_other_dish,
    f.out_scoop,
    f.qty_of_scoops,
    f.out_unit,
    f.out_factor,
    f.dish_cost,
    f.cost_of_one_scoop,
    f.rate_per_destination_unit,
    f.incomplete,
    f.cost_calculation
FROM last_block f
ORDER BY f.seq;

COMMIT;

SELECT
    count(*) AS rows,
    count(*) FILTER (WHERE lower(trim(coalesce(row_kind, ''))) = 'line') AS lines,
    count(*) FILTER (WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total') AS dish_totals
FROM public.dish_cost_staging_after_version;
