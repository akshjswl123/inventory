-- REVIEW ONLY — new Petpooja → dish codes starting at D9000 (34 rows).
-- Does NOT update dinein_menu; run backfill after you approve:
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/backfill_dinein_menu_dishcode.sql
--
-- Preview assignment:
--   docker exec -i poc_db psql -U poc -d poc -f scripts/useful_queries/insert_dishcodepetpoojaId_D9000_review.sql
-- (comment out the INSERT block below to preview only.)

-- ---------------------------------------------------------------------------
-- Preview (run with INSERT block commented out)
-- ---------------------------------------------------------------------------
/*
SELECT
    v.dishcode,
    v.petpooja_item_id,
    m.dishname,
    pm.category_name,
    pm.item_short_code
FROM (VALUES
    ('D9000', '165853899'),
    ('D9001', '165853880'),
    ('D9002', '1319642842'),
    ('D9003', '165853901'),
    ('D9004', '165853902'),
    ('D9005', '165853859'),
    ('D9006', '165853848'),
    ('D9007', '165853741'),
    ('D9008', '165853910'),
    ('D9009', '165853912'),
    ('D9010', '165853908'),
    ('D9011', '165853907'),
    ('D9012', '165853852'),
    ('D9013', '165853851'),
    ('D104', '165853857'),   -- Ice Cream Mango (same code as Vanilla/Chocolate scoop)
    ('D9015', '165853878'),
    ('D9016', '165853829'),
    ('D9017', '165853837'),
    ('D9018', '165853909'),
    ('D9019', '165853745'),
    ('D9020', '165853906'),
    ('D9021', '165853846'),
    ('D9022', '165853742'),
    ('D9023', '165853818'),
    ('D9024', '165853872'),
    ('D9025', '165853832'),
    ('D067', '165853913'),   -- Roasted Masala Papad (same code as Fried Masala Papad)
    ('D9027', '165853879'),
    ('D9028', '1317253079'),
    ('D9029', '165853917'),
    ('D9030', '165853849'),
    ('D9031', '1319642841'),
    ('D9032', '165853876'),
    ('D9033', '165853702')
) AS v(dishcode, petpooja_item_id)
LEFT JOIN public.dinein_menu m ON TRIM(m.petpooja_item_id) = v.petpooja_item_id
LEFT JOIN public.petpooja_menu pm ON pm.item_id::text = v.petpooja_item_id
ORDER BY v.dishcode;
*/

-- ---------------------------------------------------------------------------
-- Apply (uncomment when approved)
-- ---------------------------------------------------------------------------
/*
INSERT INTO public."dishcodepetpoojaId" (petpooja_item_id, dishcode)
VALUES
    ('165853899', 'D9000'),  -- Child.
    ('165853880', 'D9001'),  -- Chola Mashal Salad
    ('1319642842', 'D9002'), -- Chole Kulche + Tawa Pulao
    ('165853901', 'D9003'),  -- Classic Lassi
    ('165853902', 'D9004'),  -- Coco Cola Zero Sugar
    ('165853859', 'D9005'),  -- Container 1
    ('165853848', 'D9006'),  -- Container 2
    ('165853741', 'D9007'),  -- Corn Palak
    ('165853910', 'D9008'),  -- Diet Coke
    ('165853912', 'D9009'),  -- Diet Coke 300 Ml
    ('165853908', 'D9010'),  -- Extra Cheese
    ('165853907', 'D9011'),  -- Extra Veggie
    ('165853852', 'D9012'),  -- Half Dal Jeera
    ('165853851', 'D9013'),  -- Half Dal Tadka
    ('165853857', 'D104'),   -- Ice Cream Mango
    ('165853878', 'D9015'),  -- Ice Cream Sunde
    ('165853829', 'D9016'),  -- Jeera Rice Half
    ('165853837', 'D9017'),  -- Lehsuni Palak Corn
    ('165853909', 'D9018'),  -- Mushroom
    ('165853745', 'D9019'),  -- Palak Paneer
    ('165853906', 'D9020'),  -- Paneer
    ('165853846', 'D9021'),  -- Paneer Cheese Masala
    ('165853742', 'D9022'),  -- Paneer Do Pyaza
    ('165853818', 'D9023'),  -- Paneer Kofta
    ('165853872', 'D9024'),  -- Paneer Takatak
    ('165853832', 'D9025'),  -- Red Bull
    ('165853913', 'D067'),   -- Roasted Masala Papad
    ('165853879', 'D9027'),  -- Small Water
    ('1317253079', 'D9028'), -- Starter Box ( For 3 )
    ('165853917', 'D9029'),  -- Steam Rice Half
    ('165853849', 'D9030'),  -- Thumbs Up Can
    ('1319642841', 'D9031'), -- Veg Dum Biryani + Raita + Gulab Jamun
    ('165853876', 'D9032'),  -- Veg Handi
    ('165853702', 'D9033');  -- Water Bottle
*/

-- Default: preview only (INSERT is commented). Run this SELECT as-is:
SELECT
    v.dishcode,
    v.petpooja_item_id,
    m.dishname,
    pm.category_name,
    pm.item_short_code AS pp_short_code
FROM (VALUES
    ('D9000', '165853899'),
    ('D9001', '165853880'),
    ('D9002', '1319642842'),
    ('D9003', '165853901'),
    ('D9004', '165853902'),
    ('D9005', '165853859'),
    ('D9006', '165853848'),
    ('D9007', '165853741'),
    ('D9008', '165853910'),
    ('D9009', '165853912'),
    ('D9010', '165853908'),
    ('D9011', '165853907'),
    ('D9012', '165853852'),
    ('D9013', '165853851'),
    ('D104', '165853857'),   -- Ice Cream Mango (same code as Vanilla/Chocolate scoop)
    ('D9015', '165853878'),
    ('D9016', '165853829'),
    ('D9017', '165853837'),
    ('D9018', '165853909'),
    ('D9019', '165853745'),
    ('D9020', '165853906'),
    ('D9021', '165853846'),
    ('D9022', '165853742'),
    ('D9023', '165853818'),
    ('D9024', '165853872'),
    ('D9025', '165853832'),
    ('D067', '165853913'),   -- Roasted Masala Papad (same code as Fried Masala Papad)
    ('D9027', '165853879'),
    ('D9028', '1317253079'),
    ('D9029', '165853917'),
    ('D9030', '165853849'),
    ('D9031', '1319642841'),
    ('D9032', '165853876'),
    ('D9033', '165853702')
) AS v(dishcode, petpooja_item_id)
LEFT JOIN public.dinein_menu m ON TRIM(m.petpooja_item_id) = v.petpooja_item_id
LEFT JOIN public.petpooja_menu pm ON pm.item_id::text = v.petpooja_item_id
ORDER BY v.dishcode;
