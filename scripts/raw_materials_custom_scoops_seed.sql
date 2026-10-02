-- =============================================================================
-- raw_materials_custom_scoops_seed.sql — generated from data/raw_materialsscoop.csv
-- =============================================================================
-- Non-standard purchase/recipe units (not gm/ml/piece/kg/ltr/pkt × in/out/inventory/reciepe).
-- Examples: *_other_in, *_bag_in, *_1_portion
--
-- Regenerate:
--   node scripts/generateCustomScoopsSeed.js
--
-- Run (after raw_materials_seed.sql):
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/raw_materials_custom_scoops_seed.sql
-- =============================================================================

BEGIN;

-- scoop_config (custom units) (171 rows)
INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('aaata', '1', 'other', 'aaata_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('aata', '1', 'gm', 'aata_bag_in', 25000::numeric, 'BAG:25:kg|kg:1000:gm', 25000::numeric, NULL::numeric, NULL::numeric, false),
    ('aata', '1', 'other', 'aata_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ajinomoto', '40', 'other', 'ajinomoto_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('AJWAIN', '112B', 'other', 'AJWAIN_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('aloo tikki', '77A', 'other', 'aloo tikki_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('AMUL BUTTER', '72', 'portion', 'AMUL BUTTER_1_portion', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('amul butter', '72', 'other', 'amul butter_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('AMUL CREAM', '76', 'other', 'AMUL CREAM_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BLACK MUNG DAL', '17B', 'other', 'BLACK MUNG DAL_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('black pepper', '39B', 'other', 'black pepper_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BLUBERRY CRUSH', '58B', 'other', 'BLUBERRY CRUSH_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('blue coroco', '57B', 'other', 'blue coroco_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('boondi', '28B', 'other', 'boondi_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('bread crum', '29A', 'other', 'bread crum_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('bread crums', '29A', 'other', 'bread crums_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('butter', '73', 'other', 'butter_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chaat masala', '21B', 'other', 'chaat masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chana dal', '17A', 'other', 'chana dal_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chat amsala', '21B', 'other', 'chat amsala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chat masala', '21B', 'other', 'chat masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('cheese 1pc', '82A', 'other', 'cheese 1pc_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHEESE BLEND', '53', 'other', 'CHEESE BLEND _other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('cheese processed', '81', 'other', 'cheese processed_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chhola', '16B', 'other', 'chhola_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chilli flake', '61', 'other', 'chilli flake_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chilli oregano', '61 62', 'other', 'chilli oregano_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chillly flakes', '61', 'other', 'chillly flakes_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chilly + oregano', '61 62', 'other', 'chilly + oregano_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHILLY FLAKES SACHET', '70A', 'other', 'CHILLY FLAKES SACHET_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chilly flakes+oregano', '61  62', 'other', 'chilly flakes+oregano_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chilly powder', '10', 'other', 'chilly powder_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('chilly+oregano', '61 62', 'other', 'chilly+oregano_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHOCO CHIPS', '82B', 'other', 'CHOCO CHIPS_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHOCOLATE SYRUP', '55', 'other', 'CHOCOLATE SYRUP_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('coke', '98', 'other', 'coke_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('corn floor', '36A', 'other', 'corn floor_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('corn flor', '36A', 'other', 'corn flor_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('corn', '80', 'other', 'corn_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('cream 30', '75', 'other', 'cream 30_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('cream', '75', 'other', 'cream_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('cregano', '62', 'other', 'cregano_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('dal', '5', 'other', 'dal_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('DALCHINI', '32A', 'other', 'DALCHINI_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('degi ,mirch', '12', 'other', 'degi ,mirch_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('degi miorch', '12', 'other', 'degi miorch_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('degi mirch', '12', 'other', 'degi mirch_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('dhaniiya masala', '9', 'other', 'dhaniiya masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('dhaniya', '9', 'other', 'dhaniya_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('fries', '78', 'other', 'fries_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('garam masala', '14', 'other', 'garam masala _other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('GHEE', '21A', 'other', 'GHEE_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('GREEN CHILLY SAUCE', '43B', 'other', 'GREEN CHILLY SAUCE_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('green peas', '79', 'other', 'green peas_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('green sauce', '42', 'other', 'green sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('GULAB JAMUN', '28A', 'portion', 'GULAB JAMUN_1_portion', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('GULAB JAMUN', '28A', 'other', 'GULAB JAMUN_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('haldi powder', '11', 'other', 'haldi powder_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('HAZELNUT SYRUP', '59B', 'other', 'HAZELNUT SYRUP_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('HING', '23B', 'other', 'HING_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ICE CREAM CHOCOLATE', '100', 'other', 'ICE CREAM CHOCOLATE_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ice cream vanilla', '99', 'other', 'ice cream vanilla_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ice cream', '99', 'other', 'ice cream_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('imli chatni', '56', 'other', 'imli chatni_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('imli chutney', '56', 'other', 'imli chutney_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('IRISH SYRUP', '59A', 'other', 'IRISH SYRUP_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('jalapeno', '60B', 'other', 'jalapeno_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('jeeera', '15', 'other', 'jeeera_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('jeera masala', '16 A', 'other', 'jeera masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('jeera', '15', 'other', 'jeera_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('jelipino', '60B', 'other', 'jelipino_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('KAJU TUKDA', '30A', 'other', 'KAJU TUKDA _other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('kaju', '22A', 'other', 'kaju_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('KAJUN KANKI', '30B', 'other', 'KAJUN KANKI _other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('KALA NAMAK', '27B', 'other', 'KALA NAMAK_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('KALAUNJI', '112A', 'other', 'KALAUNJI_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('kasturi methi', '8', 'other', 'kasturi methi_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('KEVDA JAL', '25B', 'other', 'KEVDA JAL _other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('KISMIS', '22B', 'other', 'KISMIS_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('KIT KAT CHOCOLATE', '29B', 'other', 'KIT KAT CHOCOLATE_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('kitchen king', '13', 'other', 'kitchen king_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('lal mirch', '110', 'other', 'lal mirch_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('LEMON ICE TEA', '46B', 'other', 'LEMON ICE TEA_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('lemon mojito', '57A', 'other', 'lemon mojito_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('LOUNG', '31B', 'other', 'LOUNG_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MAGAJ', '20', 'other', 'MAGAJ_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('maggi masala', '66', 'other', 'maggi masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('maggi', '67', 'other', 'maggi_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('maida', '2', 'other', 'maida_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('makhani sauce', '51A', 'other', 'makhani sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MANGO ICE CREAM', '101', 'other', 'MANGO ICE CREAM_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MANGO PULP', '68', 'other', 'MANGO PULP_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MASALA TEA', '46A', 'other', 'MASALA TEA_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('masala', '13', 'other', 'masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('masla fries', '77B', 'other', 'masla fries_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MASUR DAL', '19A', 'other', 'MASUR DAL_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('matar', '79', 'other', 'matar_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('metonese', '50', 'other', 'metonese_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('meyo nese', '50', 'other', 'meyo nese_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('meyo', '50', 'other', 'meyo_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MEYONESE SACHET', '71A', 'other', 'MEYONESE SACHET_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('meyonese', '50', 'other', 'meyonese_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('meyonesse', '50', 'other', 'meyonesse_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('meyonse', '50', 'other', 'meyonse_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MILK POWDER', '45', 'other', 'MILK POWDER_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('mozerella', '74', 'other', 'mozerella_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('mozrella', '74', 'other', 'mozrella_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('mushroom', '24', 'other', 'mushroom_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('myonese', '50', 'other', 'myonese_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('NACHOS', '65', 'other', 'NACHOS_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('noodles', '38', 'other', 'noodles_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('oil tin', '7', 'other', 'oil tin_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('olive', '35A', 'other', 'olive_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('OREGANO SACHET', '70B', 'other', 'OREGANO SACHET_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('oregano', '62', 'other', 'oregano_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('origano+chilly flakes', '61 62', 'other', 'origano+chilly flakes_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('other1', 'other1', 'other', 'other1_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('other2', 'other2', 'other', 'other2_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('other3', 'other3', 'other', 'other3_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PAPAD', '34A', 'other', 'PAPAD_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('pasta pizza sauce', '48', 'other', 'pasta pizza sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('pasta sauce', '48', 'other', 'pasta sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('pasta', '63', 'other', 'pasta_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('peri peri masala', '64', 'other', 'peri peri masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('peri peri sauce', '49', 'other', 'peri peri sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('periperi msala', '64', 'other', 'periperi msala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('periperi sauce', '49', 'other', 'periperi sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('perperi masala', '64', 'other', 'perperi masala_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('pizza pasta sauce', '48', 'other', 'pizza pasta sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('pizza sauce', '48', 'other', 'pizza sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('proccess chese', '81', 'other', 'proccess chese_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('process cheese', '81', 'other', 'process cheese_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('process cheesse', '81', 'other', 'process cheesse_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('processed cheese', '81', 'other', 'processed cheese_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('RAJMA', '18B', 'other', 'RAJMA _other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('red peperica', '60A', 'other', 'red peperica_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('red peprica', '60A', 'other', 'red peprica_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('rice', '3', 'other', 'rice_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('RICH COOKING CREAM', '75', 'other', 'RICH COOKING CREAM_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ROSE WATER', '25A', 'other', 'ROSE WATER_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('salt', '27A', 'other', 'salt_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('sarso tel', '23A', 'other', 'sarso tel_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('schezwan sauce', '41', 'other', 'schezwan sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('schezwan', '41', 'other', 'schezwan_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('sev', '111A', 'other', 'sev_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('soda', '97', 'other', 'soda_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('SOFT DRINK', '98', 'portion', 'SOFT DRINK_1_portion', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('soft drink', '98', 'other', 'soft drink_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('soya sauce', '43A', 'other', 'soya sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('SOYABEAN WADI', '19B', 'other', 'SOYABEAN WADI_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('staff rice', '4', 'other', 'staff rice_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('STARFOOL', '31A', 'other', 'STARFOOL_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('STRAWBERRY CRUSH', '58A', 'other', 'STRAWBERRY CRUSH_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('SUGAR SACHET', '69A', 'other', 'SUGAR SACHET_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('sugar', '6', 'other', 'sugar_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tea powder', '6B', 'other', 'tea powder_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('thai chilly sauce', '42B', 'other', 'thai chilly sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('thai chilly', '42B', 'other', 'thai chilly_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('thousand sauce', '54', 'other', 'thousand sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tika sauce', '52', 'other', 'tika sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('TOM MAKHAN SAUCE', '51B', 'other', 'TOM MAKHAN SAUCE_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tomato kechup', '37', 'other', 'tomato kechup_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tomato ketchup', '37', 'other', 'tomato ketchup_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tomato sauce', '37', 'other', 'tomato sauce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tomato suce', '37', 'other', 'tomato suce_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tomato', '37', 'other', 'tomato_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('tur dal', '5', 'other', 'tur dal_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('UDAD SAL', '18A', 'other', 'UDAD SAL_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('VINAGER', '44', 'other', 'VINAGER_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('vinegar', '44', 'other', 'vinegar_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('white pepper', '39A', 'other', 'white pepper_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

COMMIT;

SELECT COUNT(*) AS custom_scoop_config_rows
FROM public.scoop_config sc
WHERE sc.scoop_name !~* '_(gm|ml|piece|kg|ltr|pkt)_(in|out|inventory|reciepe)$';
