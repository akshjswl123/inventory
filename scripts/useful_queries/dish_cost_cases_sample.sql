-- =============================================================================
-- Sample data for dish_cost_cases.sql  —  poc_db only
-- =============================================================================
-- Isolated dish codes (SS-*) so existing recipes are left as they are.
-- Re-running this script deletes and reinserts only these sample rows.
--
-- CASE 1  SS-GJ    SAMPLE PROCESSED GULAB JAMUN
--   sugar only, not usable in other dishes
--   line = ratepergram 0.0600 × factor 1 × qty 5000 = 300
--   dish_cost = 300, no per-unit rate (no qty of scoops)
--
-- CASE 2  SS-BASE  SAMPLE MAIDA PROCESSED
--   maida only, usable in other dishes
--   line = 0.1000 × 1 × 10000 = 1000
--   qty_of_scoops = 10, dish-out scoop gm → factor 1
--   cost of one scoop = 1000 / 10 = 100
--   rate per gm = 100 / 1 = 100
--
-- CASE 3 (also usable)  SS-AATA  SAMPLE AATA PROCESSED
--   flour 0.0400 × 1 × 45000 = 1800
--   + SAMPLE MAIDA PROCESSED, 2 gm → 100 × 1 × 2 = 200
--   dish_cost = 2000
--   qty_of_scoops = 2, dish-out scoop kg → 1000 gm
--   rate per gm = (2000 / 2) / 1000 = 1
--
-- CASE 3 (two levels)  SS-ROTI  SAMPLE BUTTER ROTI
--   butter 0.0500 × 1 × 100 = 5
--   + SAMPLE AATA PROCESSED via gm scoop, qty 1 → 1 × 1 × 1 = 1
--   dish_cost = 6
--   AATA's 1/gm already includes the maida batch, so roti depends on base.
--
-- Run:
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f - < scripts/useful_queries/dish_cost_cases_sample.sql
-- Then dish_cost_cases.sql with dishcode SS-GJ, SS-AATA, or SS-ROTI.
-- =============================================================================

BEGIN;

DELETE FROM public.recipe_entries
WHERE UPPER(TRIM(dishcode)) IN ('SS-GJ', 'SS-BASE', 'SS-AATA', 'SS-ROTI');

DELETE FROM public.raw_materials_cost
WHERE TRIM("pgNo") IN ('SS6', 'SSF', 'SSB', 'SSM');

DELETE FROM public.scoop_config
WHERE TRIM(scoop_item_id) IN ('SS6', 'SSF', 'SSB', 'SSM', 'SS-BASE', 'SS-AATA')
   OR scoop_name IN (
        'SAMPLE SUGAR_gm_reciepe',
        'SAMPLE FLOUR_gm_reciepe',
        'SAMPLE BUTTER_gm_reciepe',
        'SAMPLE MAIDA_gm_reciepe',
        'SAMPLE MAIDA PROCESSED_gm_reciepe',
        'SAMPLE AATA PROCESSED_kg_reciepe',
        'SAMPLE AATA PROCESSED_gm_reciepe'
   );

DELETE FROM public.raw_materials
WHERE TRIM("pgNo") IN ('SS6', 'SSF', 'SSB', 'SSM');

DELETE FROM public.dishes
WHERE dish_code IN ('SS-GJ', 'SS-BASE', 'SS-AATA', 'SS-ROTI');

INSERT INTO public.dishes (dish_code, dish_name)
VALUES
    ('SS-GJ', 'SAMPLE PROCESSED GULAB JAMUN'),
    ('SS-BASE', 'SAMPLE MAIDA PROCESSED'),
    ('SS-AATA', 'SAMPLE AATA PROCESSED'),
    ('SS-ROTI', 'SAMPLE BUTTER ROTI');

INSERT INTO public.raw_materials ("pgNo", itemname, comments)
VALUES
    ('SS6', 'SAMPLE SUGAR', 'dish cost sample'),
    ('SSF', 'SAMPLE FLOUR', 'dish cost sample'),
    ('SSB', 'SAMPLE BUTTER', 'dish cost sample'),
    ('SSM', 'SAMPLE MAIDA', 'dish cost sample');

INSERT INTO public.raw_materials_cost (
    "pgNo", item_names, ratepergram, rateperml, rateperpiece, based_on_billno, comments
)
VALUES
    ('SS6', ARRAY['SAMPLE SUGAR'],  0.0600, NULL, NULL, 'recipe-sample', 'sample ratepergram'),
    ('SSF', ARRAY['SAMPLE FLOUR'],  0.0400, NULL, NULL, 'recipe-sample', 'sample ratepergram'),
    ('SSB', ARRAY['SAMPLE BUTTER'], 0.0500, NULL, NULL, 'recipe-sample', 'sample ratepergram'),
    ('SSM', ARRAY['SAMPLE MAIDA'],  0.1000, NULL, NULL, 'recipe-sample', 'sample ratepergram');

-- scoop_factor in the cost query is qty_in_grams when destination_unit = gm.
-- The factor column stays 1; the kg scoop carries 1000 in qty_in_grams.
INSERT INTO public.scoop_config (
    scoop_item_name, scoop_item_id, destination_unit, scoop_name,
    factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused
)
VALUES
    ('SAMPLE SUGAR', 'SS6', 'gm', 'SAMPLE SUGAR_gm_reciepe',
        1, 'gm:1:gm', 1, NULL, NULL, false),
    ('SAMPLE FLOUR', 'SSF', 'gm', 'SAMPLE FLOUR_gm_reciepe',
        1, 'gm:1:gm', 1, NULL, NULL, false),
    ('SAMPLE BUTTER', 'SSB', 'gm', 'SAMPLE BUTTER_gm_reciepe',
        1, 'gm:1:gm', 1, NULL, NULL, false),
    ('SAMPLE MAIDA', 'SSM', 'gm', 'SAMPLE MAIDA_gm_reciepe',
        1, 'gm:1:gm', 1, NULL, NULL, false),
    ('SAMPLE MAIDA PROCESSED', 'SS-BASE', 'gm', 'SAMPLE MAIDA PROCESSED_gm_reciepe',
        1, 'gm:1:gm', 1, NULL, NULL, false),
    ('SAMPLE AATA PROCESSED', 'SS-AATA', 'gm', 'SAMPLE AATA PROCESSED_kg_reciepe',
        1, 'kg:1000:gm', 1000, NULL, NULL, false),
    ('SAMPLE AATA PROCESSED', 'SS-AATA', 'gm', 'SAMPLE AATA PROCESSED_gm_reciepe',
        1, 'gm:1:gm', 1, NULL, NULL, false);

-- One transaction so every row of a dish shares created_at (latest-recipe window).
INSERT INTO public.recipe_entries (
    dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty,
    is_usable_in_other_dish, usable_processed_scoop, qty_of_scoops, comments
)
VALUES
    -- CASE 1
    ('SAMPLE PROCESSED GULAB JAMUN', 'SS-GJ', 'SAMPLE SUGAR', 'SS6',
        'SAMPLE SUGAR_gm_reciepe', 5000,
        false, NULL, NULL, 'sample case 1'),
    ('SAMPLE PROCESSED GULAB JAMUN', 'SS-GJ', 'dish_out', NULL,
        NULL, NULL,
        false, NULL, NULL, 'sample case 1 — not usable in other dishes'),

    -- CASE 2 — leaf processed item used inside AATA
    ('SAMPLE MAIDA PROCESSED', 'SS-BASE', 'SAMPLE MAIDA', 'SSM',
        'SAMPLE MAIDA_gm_reciepe', 10000,
        true, 'SAMPLE MAIDA PROCESSED_gm_reciepe', 10, 'sample case 2'),
    ('SAMPLE MAIDA PROCESSED', 'SS-BASE', 'dish_out', 'SS-BASE',
        'SAMPLE MAIDA PROCESSED_gm_reciepe', 10,
        true, 'SAMPLE MAIDA PROCESSED_gm_reciepe', 10, 'sample case 2 — usable in other dishes'),

    -- CASE 3 — AATA is usable and itself contains a processed dish
    ('SAMPLE AATA PROCESSED', 'SS-AATA', 'SAMPLE FLOUR', 'SSF',
        'SAMPLE FLOUR_gm_reciepe', 45000,
        true, 'SAMPLE AATA PROCESSED_kg_reciepe', 2, 'sample case 3 raw line inside aata'),
    ('SAMPLE AATA PROCESSED', 'SS-AATA', 'SAMPLE MAIDA PROCESSED', 'SS-BASE',
        'SAMPLE MAIDA PROCESSED_gm_reciepe', 2,
        true, 'SAMPLE AATA PROCESSED_kg_reciepe', 2, 'sample case 3 processed line inside aata'),
    ('SAMPLE AATA PROCESSED', 'SS-AATA', 'dish_out', 'SS-AATA',
        'SAMPLE AATA PROCESSED_kg_reciepe', 2,
        true, 'SAMPLE AATA PROCESSED_kg_reciepe', 2, 'sample case 3 — usable in other dishes'),

    -- CASE 3
    ('SAMPLE BUTTER ROTI', 'SS-ROTI', 'SAMPLE BUTTER', 'SSB',
        'SAMPLE BUTTER_gm_reciepe', 100,
        false, NULL, NULL, 'sample case 3 raw line'),
    ('SAMPLE BUTTER ROTI', 'SS-ROTI', 'SAMPLE AATA PROCESSED', 'SS-AATA',
        'SAMPLE AATA PROCESSED_gm_reciepe', 1,
        false, NULL, NULL, 'sample case 3 processed line'),
    ('SAMPLE BUTTER ROTI', 'SS-ROTI', 'dish_out', NULL,
        NULL, NULL,
        false, NULL, NULL, 'sample case 3');

COMMIT;
