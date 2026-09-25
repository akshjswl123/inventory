-- =============================================================================
-- sabji3.csv — raw materials + scoop_config (in / out / recipe)
-- =============================================================================
-- Source: sabji3.csv (pgNo V1–V22, 22 vegetable items)
--
-- Scoop naming follows Item Unit Config convention:
--   {itemname}_gm_in, {itemname}_gm_out, {itemname}_gm_reciepe
--
-- Run:
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/05_sabji3_seed.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. raw_materials (22 rows)
-- ---------------------------------------------------------------------------
INSERT INTO public.raw_materials ("pgNo", itemname, comments)
SELECT v."pgNo", v.itemname, v.comments
FROM (VALUES
    ('V1',  'Capsicum',            ''),
    ('V2',  'Green Chilli',        ''),
    ('V3',  'Ginger',              ''),
    ('V4',  'Carrot',              ''),
    ('V5',  'Beans',               ''),
    ('V6',  'Cauliflower',         ''),
    ('V7',  'Cabbage',             ''),
    ('V8',  'Spring Onion',        ''),
    ('V9',  'Coriander',           ''),
    ('V10', 'Garlic',              ''),
    ('V11', 'Onion',               ''),
    ('V12', 'Cucumber',            ''),
    ('V13', 'Lemon',               ''),
    ('V14', 'Red Bell Pepper',     ''),
    ('V15', 'Broccoli',            ''),
    ('V16', 'Basil',               ''),
    ('V17', 'Mint Leaves',         ''),
    ('V18', 'Tomato',              ''),
    ('V19', 'Kadi Patta',          ''),
    ('V20', 'SPINACH',             ''),
    ('V21', 'yellow bell pepper',  ''),
    ('V22', 'potato',              '')
) AS v("pgNo", itemname, comments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.raw_materials rm WHERE rm.itemname = v.itemname
);

-- ---------------------------------------------------------------------------
-- 2. scoop_config — scoop_in, scoop_out, recipe (66 rows = 22 × 3)
-- ---------------------------------------------------------------------------
INSERT INTO public.scoop_config
    (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
     qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain,
       v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('Capsicum', 'V1', 'gm', 'Capsicum_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Capsicum', 'V1', 'gm', 'Capsicum_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Capsicum', 'V1', 'gm', 'Capsicum_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Green Chilli', 'V2', 'gm', 'Green Chilli_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Green Chilli', 'V2', 'gm', 'Green Chilli_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Green Chilli', 'V2', 'gm', 'Green Chilli_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Ginger', 'V3', 'gm', 'Ginger_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Ginger', 'V3', 'gm', 'Ginger_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Ginger', 'V3', 'gm', 'Ginger_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Carrot', 'V4', 'gm', 'Carrot_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Carrot', 'V4', 'gm', 'Carrot_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Carrot', 'V4', 'gm', 'Carrot_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Beans', 'V5', 'gm', 'Beans_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Beans', 'V5', 'gm', 'Beans_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Beans', 'V5', 'gm', 'Beans_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cauliflower', 'V6', 'gm', 'Cauliflower_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cauliflower', 'V6', 'gm', 'Cauliflower_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cauliflower', 'V6', 'gm', 'Cauliflower_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cabbage', 'V7', 'gm', 'Cabbage_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cabbage', 'V7', 'gm', 'Cabbage_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cabbage', 'V7', 'gm', 'Cabbage_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Spring Onion', 'V8', 'gm', 'Spring Onion_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Spring Onion', 'V8', 'gm', 'Spring Onion_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Spring Onion', 'V8', 'gm', 'Spring Onion_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Coriander', 'V9', 'gm', 'Coriander_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Coriander', 'V9', 'gm', 'Coriander_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Coriander', 'V9', 'gm', 'Coriander_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Garlic', 'V10', 'gm', 'Garlic_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Garlic', 'V10', 'gm', 'Garlic_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Garlic', 'V10', 'gm', 'Garlic_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Onion', 'V11', 'gm', 'Onion_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Onion', 'V11', 'gm', 'Onion_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Onion', 'V11', 'gm', 'Onion_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cucumber', 'V12', 'gm', 'Cucumber_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cucumber', 'V12', 'gm', 'Cucumber_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Cucumber', 'V12', 'gm', 'Cucumber_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Lemon', 'V13', 'gm', 'Lemon_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Lemon', 'V13', 'gm', 'Lemon_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Lemon', 'V13', 'gm', 'Lemon_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Red Bell Pepper', 'V14', 'gm', 'Red Bell Pepper_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Red Bell Pepper', 'V14', 'gm', 'Red Bell Pepper_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Red Bell Pepper', 'V14', 'gm', 'Red Bell Pepper_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Broccoli', 'V15', 'gm', 'Broccoli_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Broccoli', 'V15', 'gm', 'Broccoli_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Broccoli', 'V15', 'gm', 'Broccoli_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Basil', 'V16', 'gm', 'Basil_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Basil', 'V16', 'gm', 'Basil_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Basil', 'V16', 'gm', 'Basil_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Mint Leaves', 'V17', 'gm', 'Mint Leaves_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Mint Leaves', 'V17', 'gm', 'Mint Leaves_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Mint Leaves', 'V17', 'gm', 'Mint Leaves_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Tomato', 'V18', 'gm', 'Tomato_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Tomato', 'V18', 'gm', 'Tomato_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Tomato', 'V18', 'gm', 'Tomato_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Kadi Patta', 'V19', 'gm', 'Kadi Patta_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Kadi Patta', 'V19', 'gm', 'Kadi Patta_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('Kadi Patta', 'V19', 'gm', 'Kadi Patta_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('SPINACH', 'V20', 'gm', 'SPINACH_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('SPINACH', 'V20', 'gm', 'SPINACH_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('SPINACH', 'V20', 'gm', 'SPINACH_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('yellow bell pepper', 'V21', 'gm', 'yellow bell pepper_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('yellow bell pepper', 'V21', 'gm', 'yellow bell pepper_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('yellow bell pepper', 'V21', 'gm', 'yellow bell pepper_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('potato', 'V22', 'gm', 'potato_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('potato', 'V22', 'gm', 'potato_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('potato', 'V22', 'gm', 'potato_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
       qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config sc WHERE sc.scoop_name = v.scoop_name
);

COMMIT;

-- Verify
SELECT 'raw_materials (sabji3)' AS tbl, COUNT(*) AS rows
FROM public.raw_materials WHERE "pgNo" LIKE 'V%'
UNION ALL
SELECT 'scoop_config (sabji3)', COUNT(*)
FROM public.scoop_config WHERE scoop_item_id LIKE 'V%'
ORDER BY tbl;
