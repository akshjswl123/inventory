-- =============================================================================
-- raw_materials_v2_delta_seed.sql — generated from data/raw_materialv2.csv
-- =============================================================================
-- Items in v2 CSV that are not in data/raw_materials30sept11am.csv (+ full scoops).
--
-- Regenerate:
--   node scripts/generateRawMaterialsV2DeltaSeed.js
--
-- Run after raw_materials_seed.sql and raw_materials_custom_scoops_seed.sql:
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/raw_materials_v2_delta_seed.sql
-- =============================================================================

BEGIN;

-- raw_materials delta (16 rows)
INSERT INTO public.raw_materials ("pgNo", itemname, comments)
SELECT v."pgNo", v.itemname, v.comments
FROM (VALUES
    ('OT1', 'ALL SPICES', 'From raw_materialv2.csv delta'),
    ('33A', 'BADI ELAICHI', 'From raw_materialv2.csv delta'),
    ('BL1', 'Bay leaves', 'From raw_materialv2.csv delta'),
    ('B4', 'BROWNIE', 'From raw_materialv2.csv delta'),
    ('B2', 'BURGER BUN', 'From raw_materialv2.csv delta'),
    ('CH3', 'CHINESE VEGETABLES', 'From raw_materialv2.csv delta'),
    ('CN4', 'CONTI MASALA', 'From raw_materialv2.csv delta'),
    ('D2', 'CURD', 'From raw_materialv2.csv delta'),
    ('33B', 'HARI ELAICHI', 'From raw_materialv2.csv delta'),
    ('B5', 'MACE (JAVITRI)', 'From raw_materialv2.csv delta'),
    ('D1', 'MILK', 'From raw_materialv2.csv delta'),
    ('35', 'Oreo biscuit', 'From raw_materialv2.csv delta'),
    ('D3', 'PANEER', 'From raw_materialv2.csv delta'),
    ('B3', 'PIZZA BASE', 'From raw_materialv2.csv delta'),
    ('103', 'SAUNF', 'From raw_materialv2.csv delta'),
    ('B1', 'WHITE BREAD', 'From raw_materialv2.csv delta')
) AS v("pgNo", itemname, comments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.raw_materials rm WHERE rm.itemname = v.itemname
);

-- scoop_config (standard units, v2 delta) (272 rows)
INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'ml', 'ALL SPICES_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'ml', 'ALL SPICES_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'ml', 'ALL SPICES_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'ml', 'ALL SPICES_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'piece', 'ALL SPICES_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ALL SPICES', 'OT1', 'piece', 'ALL SPICES_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ALL SPICES', 'OT1', 'piece', 'ALL SPICES_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('ALL SPICES', 'OT1', 'gm', 'ALL SPICES_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'ml', 'BADI ELAICHI_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'ml', 'BADI ELAICHI_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'ml', 'BADI ELAICHI_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'ml', 'BADI ELAICHI_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'piece', 'BADI ELAICHI_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BADI ELAICHI', '33A', 'piece', 'BADI ELAICHI_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BADI ELAICHI', '33A', 'piece', 'BADI ELAICHI_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BADI ELAICHI', '33A', 'gm', 'BADI ELAICHI_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'ml', 'Bay leaves_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'ml', 'Bay leaves_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'ml', 'Bay leaves_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'ml', 'Bay leaves_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'piece', 'Bay leaves_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Bay leaves', 'BL1', 'piece', 'Bay leaves_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Bay leaves', 'BL1', 'piece', 'Bay leaves_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('Bay leaves', 'BL1', 'gm', 'Bay leaves_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'ml', 'BROWNIE_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'ml', 'BROWNIE_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'ml', 'BROWNIE_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'ml', 'BROWNIE_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'piece', 'BROWNIE_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BROWNIE', 'B4', 'piece', 'BROWNIE_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BROWNIE', 'B4', 'piece', 'BROWNIE_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BROWNIE', 'B4', 'gm', 'BROWNIE_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'ml', 'BURGER BUN_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'ml', 'BURGER BUN_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'ml', 'BURGER BUN_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'ml', 'BURGER BUN_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'piece', 'BURGER BUN_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('BURGER BUN', 'B2', 'piece', 'BURGER BUN_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BURGER BUN', 'B2', 'piece', 'BURGER BUN_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('BURGER BUN', 'B2', 'gm', 'BURGER BUN_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'ml', 'CHINESE VEGETABLES_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'ml', 'CHINESE VEGETABLES_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'ml', 'CHINESE VEGETABLES_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'ml', 'CHINESE VEGETABLES_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'piece', 'CHINESE VEGETABLES_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'piece', 'CHINESE VEGETABLES_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'piece', 'CHINESE VEGETABLES_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'gm', 'CHINESE VEGETABLES_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'ml', 'CONTI MASALA_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'ml', 'CONTI MASALA_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'ml', 'CONTI MASALA_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'ml', 'CONTI MASALA_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'piece', 'CONTI MASALA_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CONTI MASALA', 'CN4', 'piece', 'CONTI MASALA_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CONTI MASALA', 'CN4', 'piece', 'CONTI MASALA_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CONTI MASALA', 'CN4', 'gm', 'CONTI MASALA_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'ml', 'CURD_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'ml', 'CURD_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'ml', 'CURD_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'ml', 'CURD_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'piece', 'CURD_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CURD', 'D2', 'piece', 'CURD_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CURD', 'D2', 'piece', 'CURD_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('CURD', 'D2', 'gm', 'CURD_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'ml', 'HARI ELAICHI_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'ml', 'HARI ELAICHI_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'ml', 'HARI ELAICHI_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'ml', 'HARI ELAICHI_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'piece', 'HARI ELAICHI_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('HARI ELAICHI', '33B', 'piece', 'HARI ELAICHI_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('HARI ELAICHI', '33B', 'piece', 'HARI ELAICHI_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('HARI ELAICHI', '33B', 'gm', 'HARI ELAICHI_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('MACE (JAVITRI)', 'B5', 'ml', 'MACE (JAVITRI)_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'ml', 'MACE (JAVITRI)_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'ml', 'MACE (JAVITRI)_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'ml', 'MACE (JAVITRI)_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'piece', 'MACE (JAVITRI)_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'piece', 'MACE (JAVITRI)_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'piece', 'MACE (JAVITRI)_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'gm', 'MACE (JAVITRI)_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'ml', 'MILK_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'ml', 'MILK_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'ml', 'MILK_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'ml', 'MILK_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'piece', 'MILK_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MILK', 'D1', 'piece', 'MILK_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MILK', 'D1', 'piece', 'MILK_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('MILK', 'D1', 'gm', 'MILK_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'ml', 'Oreo biscuit_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'ml', 'Oreo biscuit_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'ml', 'Oreo biscuit_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'ml', 'Oreo biscuit_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'piece', 'Oreo biscuit_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Oreo biscuit', '35', 'piece', 'Oreo biscuit_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Oreo biscuit', '35', 'piece', 'Oreo biscuit_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('Oreo biscuit', '35', 'gm', 'Oreo biscuit_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'ml', 'PANEER_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'ml', 'PANEER_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'ml', 'PANEER_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'ml', 'PANEER_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'piece', 'PANEER_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PANEER', 'D3', 'piece', 'PANEER_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PANEER', 'D3', 'piece', 'PANEER_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('PANEER', 'D3', 'gm', 'PANEER_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'ml', 'PIZZA BASE_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'ml', 'PIZZA BASE_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'ml', 'PIZZA BASE_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'ml', 'PIZZA BASE_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'piece', 'PIZZA BASE_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PIZZA BASE', 'B3', 'piece', 'PIZZA BASE_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PIZZA BASE', 'B3', 'piece', 'PIZZA BASE_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('PIZZA BASE', 'B3', 'gm', 'PIZZA BASE_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('SAUNF', '103', 'gm', 'SAUNF_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'ml', 'SAUNF_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'ml', 'SAUNF_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'ml', 'SAUNF_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'ml', 'SAUNF_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'piece', 'SAUNF_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('SAUNF', '103', 'piece', 'SAUNF_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('SAUNF', '103', 'piece', 'SAUNF_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('SAUNF', '103', 'gm', 'SAUNF_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_gm_in', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_gm_inventory', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_gm_out', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_gm_reciepe', 1::numeric, 'gm:1:gm', 1::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_kg_in', 1000::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_kg_out', 500::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_kg_reciepe', 1::numeric, 'kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'ml', 'WHITE BREAD_ltr_reciepe', 1::numeric, 'ltr:1000:ml', NULL::numeric, 1000::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'ml', 'WHITE BREAD_ml_in', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'ml', 'WHITE BREAD_ml_out', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'ml', 'WHITE BREAD_ml_reciepe', 1::numeric, 'ml:1:ml', NULL::numeric, 1::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'piece', 'WHITE BREAD_piece_in', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('WHITE BREAD', 'B1', 'piece', 'WHITE BREAD_piece_out', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('WHITE BREAD', 'B1', 'piece', 'WHITE BREAD_piece_reciepe', 1::numeric, 'piece:1:piece', NULL::numeric, NULL::numeric, 1::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_pkt_in', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_pkt_out', 500::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false),
    ('WHITE BREAD', 'B1', 'gm', 'WHITE BREAD_pkt_reciepe', 1::numeric, 'pkt:500:gm', 500::numeric, NULL::numeric, NULL::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

-- scoop_config (custom other_in, v2 delta) (16 rows)
INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('ALL SPICES', 'OT1', 'other', 'ALL SPICES_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BADI ELAICHI', '33A', 'other', 'BADI ELAICHI_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Bay leaves', 'BL1', 'other', 'Bay leaves_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BROWNIE', 'B4', 'other', 'BROWNIE_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('BURGER BUN', 'B2', 'other', 'BURGER BUN_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CHINESE VEGETABLES', 'CH3', 'other', 'CHINESE VEGETABLES_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CONTI MASALA', 'CN4', 'other', 'CONTI MASALA_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('CURD', 'D2', 'other', 'CURD_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('HARI ELAICHI', '33B', 'other', 'HARI ELAICHI_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MACE (JAVITRI)', 'B5', 'other', 'MACE (JAVITRI)_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('MILK', 'D1', 'other', 'MILK_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('Oreo biscuit', '35', 'other', 'Oreo biscuit_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PANEER', 'D3', 'other', 'PANEER_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('PIZZA BASE', 'B3', 'other', 'PIZZA BASE_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('SAUNF', '103', 'other', 'SAUNF_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false),
    ('WHITE BREAD', 'B1', 'other', 'WHITE BREAD_other_in', 1::numeric, NULL, NULL::numeric, NULL::numeric, 1::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

COMMIT;

SELECT 'raw_materials_v2_delta_materials' AS tbl, 16::bigint AS expected_rows;
