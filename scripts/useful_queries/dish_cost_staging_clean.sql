-- =============================================================================
-- Clean dish_cost_staging → dish_cost_cleaned_up
-- 1) Keep only the last CSV block per dish_code (removes repeated P8/P7 sections).
-- 2) Keep line rows that exist on the latest recipe batch (same as Recipe Maker Load from DB).
-- Run: docker exec -i poc_db psql -U poc -d poc -f - < scripts/useful_queries/dish_cost_staging_clean.sql
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.dish_cost_cleaned_up
(
    sort_seq bigint,
    row_kind text,
    dish_code text,
    dishname text,
    dish_case text,
    line_kind text,
    itemname text,
    "pgNo_or_dishCode" text,
    receipescoop text,
    qty text,
    destination_unit text,
    scoop_factor text,
    rate text,
    line_cost text,
    is_usable_in_other_dish text,
    out_scoop text,
    qty_of_scoops text,
    out_unit text,
    out_factor text,
    dish_cost text,
    cost_of_one_scoop text,
    rate_per_destination_unit text,
    incomplete text,
    cost_calculation text
);

TRUNCATE public.dish_cost_cleaned_up;

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
),
recipe_latest_batch AS (
    SELECT DISTINCT ON (upper(trim(dishcode)))
        upper(trim(dishcode)) AS dish_code,
        created_at AS saved_at
    FROM public.recipe_entries
    WHERE dishcode IS NOT NULL
      AND trim(dishcode) <> ''
    ORDER BY upper(trim(dishcode)), created_at DESC, id DESC
),
recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    INNER JOIN recipe_latest_batch lb
        ON upper(trim(re.dishcode)) = lb.dish_code
       AND re.created_at >= lb.saved_at - interval '30 seconds'
),
latest_ingredient_keys AS (
    SELECT DISTINCT ON (
        upper(trim(re.dishcode)),
        trim(re."pgNo"),
        lower(trim(re.reciepeitemname)),
        coalesce(nullif(trim(re.receipescoop), ''), ''),
        re.qty
    )
        upper(trim(re.dishcode)) AS dish_code_key,
        upper(trim(coalesce(re."pgNo", ''))) AS pgno_key,
        lower(trim(re.reciepeitemname)) AS itemname_key,
        lower(coalesce(nullif(trim(re.receipescoop), ''), '')) AS receipescoop_key,
        trim(re.qty::text) AS qty_key
    FROM recipe_scope re
    WHERE lower(trim(re.reciepeitemname)) NOT IN (
              'totalingredientsqty',
              'totalprocessedqty',
              'dish_out'
          )
      AND re.qty IS NOT NULL
      AND re.qty > 0
    ORDER BY
        upper(trim(re.dishcode)),
        trim(re."pgNo"),
        lower(trim(re.reciepeitemname)),
        coalesce(nullif(trim(re.receipescoop), ''), ''),
        re.qty,
        re.id DESC
),
filtered AS (
    SELECT b.*
    FROM last_block b
    LEFT JOIN latest_ingredient_keys k
        ON upper(trim(b.dish_code)) = k.dish_code_key
       AND upper(trim(coalesce(b."pgNo_or_dishCode", ''))) = k.pgno_key
       AND lower(trim(coalesce(b.itemname, ''))) = k.itemname_key
       AND lower(trim(coalesce(b.receipescoop, ''))) = k.receipescoop_key
       AND trim(coalesce(b.qty, '')) = k.qty_key
    WHERE lower(trim(coalesce(b.row_kind, ''))) <> 'line'
       OR k.dish_code_key IS NOT NULL
)
INSERT INTO public.dish_cost_cleaned_up (
    sort_seq,
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
    f.seq,
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
FROM filtered f
ORDER BY f.seq;

COMMIT;

-- Quick stats (run after commit)
SELECT
    (SELECT count(*) FROM public.dish_cost_staging) AS staging_rows,
    (SELECT count(*) FROM public.dish_cost_cleaned_up) AS cleaned_rows,
    (SELECT count(*) FROM public.dish_cost_cleaned_up WHERE lower(trim(coalesce(row_kind, ''))) = 'line') AS cleaned_lines,
    (SELECT count(*) FROM public.dish_cost_cleaned_up WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total') AS cleaned_dish_totals;
