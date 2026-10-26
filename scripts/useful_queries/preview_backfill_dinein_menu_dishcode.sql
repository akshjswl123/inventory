-- Preview rows that backfill_dinein_menu_dishcode.sql would change (run before UPDATE).
-- Usage:
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/useful_queries/preview_backfill_dinein_menu_dishcode.sql

-- A) dishcodepetpoojaId → menu (petpooja_item_id)
SELECT
    'A_mapping' AS step,
    m.id,
    m.dishname,
    m.petpooja_item_id,
    m.dishcode AS old_dishcode,
    TRIM(map.dishcode) AS new_dishcode
FROM public.dinein_menu m
JOIN public."dishcodepetpoojaId" map
    ON TRIM(m.petpooja_item_id) = TRIM(map.petpooja_item_id)
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(m.petpooja_item_id, '')) <> ''
  AND TRIM(COALESCE(map.dishcode, '')) <> ''
ORDER BY m.dishname;

-- B) dishes.dish_name = dishname
SELECT
    'B_dishes' AS step,
    m.id,
    m.dishname,
    m.petpooja_item_id,
    m.dishcode AS old_dishcode,
    TRIM(d.dish_code) AS new_dishcode
FROM public.dinein_menu m
JOIN public.dishes d
    ON LOWER(TRIM(d.dish_name)) = LOWER(TRIM(m.dishname))
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(d.dish_code, '')) <> ''
ORDER BY m.dishname;

-- C) recipe_entries (latest per dishname)
SELECT
    'C_recipe' AS step,
    m.id,
    m.dishname,
    m.petpooja_item_id,
    m.dishcode AS old_dishcode,
    TRIM(src.dishcode) AS new_dishcode
FROM public.dinein_menu m
JOIN (
    SELECT DISTINCT ON (LOWER(TRIM(re.dishname)))
        LOWER(TRIM(re.dishname)) AS name_k,
        UPPER(TRIM(re.dishcode)) AS dishcode
    FROM public.recipe_entries re
    WHERE TRIM(COALESCE(re.dishcode, '')) <> ''
      AND TRIM(COALESCE(re.dishname, '')) <> ''
    ORDER BY LOWER(TRIM(re.dishname)), re.version DESC NULLS LAST, re.id DESC
) src ON LOWER(TRIM(m.dishname)) = src.name_k
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
ORDER BY m.dishname;

-- D) dish_cost.dishname
SELECT
    'D_dish_cost' AS step,
    m.id,
    m.dishname,
    m.petpooja_item_id,
    m.dishcode AS old_dishcode,
    TRIM(dc.dish_code) AS new_dishcode
FROM public.dinein_menu m
JOIN public.dish_cost dc
    ON LOWER(TRIM(dc.dishname)) = LOWER(TRIM(m.dishname))
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(dc.dish_code, '')) <> ''
ORDER BY m.dishname;

-- E) normalized dishname → dishes
SELECT
    'E_norm_dishes' AS step,
    m.id,
    m.dishname,
    m.petpooja_item_id,
    m.dishcode AS old_dishcode,
    TRIM(d.dish_code) AS new_dishcode
FROM public.dinein_menu m
JOIN public.dishes d
    ON public.normalize_pos_item_name(d.dish_name) = public.normalize_pos_item_name(m.dishname)
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(d.dish_code, '')) <> ''
ORDER BY m.dishname;

-- F) sibling menu row with same dishname
SELECT
    'F_sibling' AS step,
    m.id,
    m.dishname,
    m.petpooja_item_id,
    m.dishcode AS old_dishcode,
    TRIM(sibling.dishcode) AS new_dishcode
FROM public.dinein_menu m
JOIN (
    SELECT
        LOWER(TRIM(dishname)) AS name_k,
        MAX(TRIM(dishcode)) FILTER (WHERE TRIM(COALESCE(dishcode, '')) <> '') AS dishcode
    FROM public.dinein_menu
    GROUP BY LOWER(TRIM(dishname))
) sibling
    ON LOWER(TRIM(m.dishname)) = sibling.name_k
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
  AND TRIM(COALESCE(sibling.dishcode, '')) <> ''
ORDER BY m.dishname;

-- G) new rows for dishcodepetpoojaId (INSERT only)
SELECT
    'G_new_mapping' AS step,
    TRIM(m.petpooja_item_id) AS petpooja_item_id,
    TRIM(m.dishcode) AS dishcode,
    m.dishname
FROM public.dinein_menu m
WHERE TRIM(COALESCE(m.petpooja_item_id, '')) <> ''
  AND TRIM(COALESCE(m.dishcode, '')) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM public."dishcodepetpoojaId" map
      WHERE TRIM(map.petpooja_item_id) = TRIM(m.petpooja_item_id)
  )
ORDER BY m.dishname;

-- Still unresolvable after all steps (manual dishcodepetpoojaId / dishes)
SELECT
    'manual_needed' AS step,
    m.id,
    m.dishname,
    m.petpooja_item_id,
    m.online_display_name
FROM public.dinein_menu m
WHERE TRIM(COALESCE(m.dishcode, '')) = ''
ORDER BY m.dishname;
