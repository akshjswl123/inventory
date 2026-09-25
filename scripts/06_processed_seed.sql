-- =============================================================================
-- processed.csv — dishes + scoop_config (in / out / recipe + portion)
-- =============================================================================
-- Source: processed.csv (dishcode P1–P11, 11 processed items)
--
-- Scoop naming:
--   {dishname}_gm_in, {dishname}_gm_out, {dishname}_gm_reciepe  (Item Unit Config)
--   {dishname}_1_portion                                         (Recipe Processed Items)
--
-- Run:
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/06_processed_seed.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. dishes (11 rows)
-- ---------------------------------------------------------------------------
INSERT INTO public.dishes (dish_name, dish_code)
SELECT v.dish_name, v.dish_code
FROM (VALUES
    ('PROCESSED RICE',            'P1'),
    ('PROCESSED DAL',             'P2'),
    ('PROCESSED NOODLES',         'P3'),
    ('TOMATO GREAVY',             'P4'),
    ('ONION GREAVY',              'P5'),
    ('KAJU MAGAJ GREAVY',         'P6'),
    ('PASTA PROCESSED',           'P7'),
    ('AATA PROCESSED',            'P8'),
    ('MAIDA PROCESSED',           'P9'),
    ('PROCESSED MASALA OF TIKKA', 'P10'),
    ('PROCESSED GULAB JAMUN',     'P11')
) AS v(dish_name, dish_code)
WHERE NOT EXISTS (
    SELECT 1 FROM public.dishes d WHERE d.dish_name = v.dish_name
);

-- ---------------------------------------------------------------------------
-- 2. scoop_config — scoop_in, scoop_out, recipe, portion (44 rows = 11 × 4)
-- ---------------------------------------------------------------------------
INSERT INTO public.scoop_config
    (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
     qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain,
       v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('PROCESSED RICE', 'P1', 'gm', 'PROCESSED RICE_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED RICE', 'P1', 'gm', 'PROCESSED RICE_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED RICE', 'P1', 'gm', 'PROCESSED RICE_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED RICE', 'P1', 'portion', 'PROCESSED RICE_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED DAL', 'P2', 'gm', 'PROCESSED DAL_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED DAL', 'P2', 'gm', 'PROCESSED DAL_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED DAL', 'P2', 'gm', 'PROCESSED DAL_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED DAL', 'P2', 'portion', 'PROCESSED DAL_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED NOODLES', 'P3', 'gm', 'PROCESSED NOODLES_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED NOODLES', 'P3', 'gm', 'PROCESSED NOODLES_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED NOODLES', 'P3', 'gm', 'PROCESSED NOODLES_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED NOODLES', 'P3', 'portion', 'PROCESSED NOODLES_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('TOMATO GREAVY', 'P4', 'gm', 'TOMATO GREAVY_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('TOMATO GREAVY', 'P4', 'gm', 'TOMATO GREAVY_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('TOMATO GREAVY', 'P4', 'gm', 'TOMATO GREAVY_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('TOMATO GREAVY', 'P4', 'portion', 'TOMATO GREAVY_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('ONION GREAVY', 'P5', 'gm', 'ONION GREAVY_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('ONION GREAVY', 'P5', 'gm', 'ONION GREAVY_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('ONION GREAVY', 'P5', 'gm', 'ONION GREAVY_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('ONION GREAVY', 'P5', 'portion', 'ONION GREAVY_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('KAJU MAGAJ GREAVY', 'P6', 'gm', 'KAJU MAGAJ GREAVY_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('KAJU MAGAJ GREAVY', 'P6', 'gm', 'KAJU MAGAJ GREAVY_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('KAJU MAGAJ GREAVY', 'P6', 'gm', 'KAJU MAGAJ GREAVY_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('KAJU MAGAJ GREAVY', 'P6', 'portion', 'KAJU MAGAJ GREAVY_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PASTA PROCESSED', 'P7', 'gm', 'PASTA PROCESSED_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PASTA PROCESSED', 'P7', 'gm', 'PASTA PROCESSED_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PASTA PROCESSED', 'P7', 'gm', 'PASTA PROCESSED_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PASTA PROCESSED', 'P7', 'portion', 'PASTA PROCESSED_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('AATA PROCESSED', 'P8', 'gm', 'AATA PROCESSED_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('AATA PROCESSED', 'P8', 'gm', 'AATA PROCESSED_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('AATA PROCESSED', 'P8', 'gm', 'AATA PROCESSED_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('AATA PROCESSED', 'P8', 'portion', 'AATA PROCESSED_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('MAIDA PROCESSED', 'P9', 'gm', 'MAIDA PROCESSED_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('MAIDA PROCESSED', 'P9', 'gm', 'MAIDA PROCESSED_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('MAIDA PROCESSED', 'P9', 'gm', 'MAIDA PROCESSED_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('MAIDA PROCESSED', 'P9', 'portion', 'MAIDA PROCESSED_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED MASALA OF TIKKA', 'P10', 'gm', 'PROCESSED MASALA OF TIKKA_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED MASALA OF TIKKA', 'P10', 'gm', 'PROCESSED MASALA OF TIKKA_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED MASALA OF TIKKA', 'P10', 'gm', 'PROCESSED MASALA OF TIKKA_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED MASALA OF TIKKA', 'P10', 'portion', 'PROCESSED MASALA OF TIKKA_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED GULAB JAMUN', 'P11', 'gm', 'PROCESSED GULAB JAMUN_gm_in', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED GULAB JAMUN', 'P11', 'gm', 'PROCESSED GULAB JAMUN_gm_out', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED GULAB JAMUN', 'P11', 'gm', 'PROCESSED GULAB JAMUN_gm_reciepe', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('PROCESSED GULAB JAMUN', 'P11', 'portion', 'PROCESSED GULAB JAMUN_1_portion', NULL::numeric, NULL, NULL::numeric, NULL::numeric, NULL::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
       qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config sc WHERE sc.scoop_name = v.scoop_name
);

COMMIT;

-- Verify
SELECT 'dishes (processed)' AS tbl, COUNT(*) AS rows
FROM public.dishes WHERE dish_code LIKE 'P%'
UNION ALL
SELECT 'scoop_config (processed)', COUNT(*)
FROM public.scoop_config WHERE scoop_item_id LIKE 'P%'
ORDER BY tbl;
