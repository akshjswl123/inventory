-- Backfill dinein_menu.dishcode only (no new menu rows, no other column changes).
--
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/backfill_dinein_menu_dishcode.sql

CREATE OR REPLACE FUNCTION public.normalize_pos_item_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT LOWER(TRIM(REPLACE(REPLACE(COALESCE(p, ''), '[', '('), ']', ')')));
$$;

-- A) dishcodepetpoojaId → menu (petpooja_item_id)
UPDATE public.dinein_menu m
SET
    dishcode = TRIM(map.dishcode),
    last_updated_at = CURRENT_TIMESTAMP
FROM public."dishcodepetpoojaId" map
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(m.petpooja_item_id, '')) <> ''
  AND TRIM(m.petpooja_item_id) = TRIM(map.petpooja_item_id)
  AND TRIM(COALESCE(map.dishcode, '')) <> '';

-- B) dishes.dish_name = dishname
UPDATE public.dinein_menu m
SET
    dishcode = TRIM(d.dish_code),
    last_updated_at = CURRENT_TIMESTAMP
FROM public.dishes d
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(d.dish_code, '')) <> ''
  AND LOWER(TRIM(d.dish_name)) = LOWER(TRIM(m.dishname));

-- C) recipe_entries.dishname (latest row per name)
UPDATE public.dinein_menu m
SET
    dishcode = TRIM(src.dishcode),
    last_updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (LOWER(TRIM(re.dishname)))
        LOWER(TRIM(re.dishname)) AS name_k,
        UPPER(TRIM(re.dishcode)) AS dishcode
    FROM public.recipe_entries re
    WHERE TRIM(COALESCE(re.dishcode, '')) <> ''
      AND TRIM(COALESCE(re.dishname, '')) <> ''
    ORDER BY LOWER(TRIM(re.dishname)), re.version DESC NULLS LAST, re.id DESC
) src
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND LOWER(TRIM(m.dishname)) = src.name_k;

-- D) dish_cost.dishname (published totals)
UPDATE public.dinein_menu m
SET
    dishcode = TRIM(dc.dish_code),
    last_updated_at = CURRENT_TIMESTAMP
FROM public.dish_cost dc
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(dc.dish_code, '')) <> ''
  AND LOWER(TRIM(dc.dishname)) = LOWER(TRIM(m.dishname));

-- E) normalized dishname → dishes
UPDATE public.dinein_menu m
SET
    dishcode = TRIM(d.dish_code),
    last_updated_at = CURRENT_TIMESTAMP
FROM public.dishes d
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(d.dish_code, '')) <> ''
  AND public.normalize_pos_item_name(d.dish_name) = public.normalize_pos_item_name(m.dishname);

-- F) same dishname, another menu row already has dishcode
UPDATE public.dinein_menu m
SET
    dishcode = TRIM(sibling.dishcode),
    last_updated_at = CURRENT_TIMESTAMP
FROM (
    SELECT
        LOWER(TRIM(dishname)) AS name_k,
        MAX(TRIM(dishcode)) FILTER (WHERE TRIM(COALESCE(dishcode, '')) <> '') AS dishcode
    FROM public.dinein_menu
    GROUP BY LOWER(TRIM(dishname))
) sibling
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND LOWER(TRIM(m.dishname)) = sibling.name_k
  AND TRIM(COALESCE(sibling.dishcode, '')) <> '';

-- G) refresh mapping table from menu rows that already have dishcode + petpooja id
INSERT INTO public."dishcodepetpoojaId" (petpooja_item_id, dishcode)
SELECT DISTINCT
    TRIM(m.petpooja_item_id),
    TRIM(m.dishcode)
FROM public.dinein_menu m
WHERE TRIM(COALESCE(m.petpooja_item_id, '')) <> ''
  AND TRIM(COALESCE(m.dishcode, '')) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM public."dishcodepetpoojaId" map
      WHERE TRIM(map.petpooja_item_id) = TRIM(m.petpooja_item_id)
  );

SELECT
    COUNT(*) FILTER (WHERE TRIM(COALESCE(dishcode, '')) = '') AS menu_rows_still_missing_dishcode,
    COUNT(*) AS menu_rows_total
FROM public.dinein_menu;
