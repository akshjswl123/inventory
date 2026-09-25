-- =============================================================================
-- Seed data — 4–5 sample rows per table
-- =============================================================================
-- Prerequisites: run 01_schema.sql (and optional table scripts) first.
--
-- Run:
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/03_seed_data.sql
--
-- Safe to re-run: reference tables use ON CONFLICT; transactional rows use
-- seed markers (billno / comments) so duplicates are skipped.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Static reference tables
-- ---------------------------------------------------------------------------

INSERT INTO public.vendors (vendor_name) VALUES
    ('KiranaShreeGanesh'),
    ('RS Sales'),
    ('Royal Food'),
    ('MilkAndCurd'),
    ('HNS')
ON CONFLICT (vendor_name) DO NOTHING;

INSERT INTO public.categories (category_name) VALUES
    ('INDIAN'),
    ('CHINESE'),
    ('CONTINENTAL'),
    ('TANDOOR'),
    ('HOUSEKEEPING')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO public.dishes (dish_name, dish_code) VALUES
    ('Paneer Butter Masala', 'D001'),
    ('Dal Makhani', 'D002'),
    ('Veg Biryani', 'D003'),
    ('Fried Rice', 'D004'),
    ('Garlic Naan', 'D005')
ON CONFLICT (dish_name) DO NOTHING;

INSERT INTO public.raw_materials ("pgNo", itemname, comments)
SELECT v."pgNo", v.itemname, v.comments
FROM (VALUES
    ('1',   'aata',         'Seed: flour'),
    ('2',   'maida',        'Seed: refined flour'),
    ('3',   'rice',         'Seed: basmati'),
    ('4',   'staff rice',   'Seed: staff ration'),
    ('6B',  'tea powder',   'Seed: chai')
) AS v("pgNo", itemname, comments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.raw_materials rm WHERE rm.itemname = v.itemname
);

-- sabji3.csv — vegetables (pgNo V1–V22)
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

INSERT INTO public.scoop_config
    (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
     qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain,
       v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    ('aata',       '1',  'gm',  'aata_gm_in',       1000::numeric, 'BAG:25:kg|kg:1000:gm', 1000::numeric, NULL::numeric, NULL::numeric, false),
    ('aata',       '1',  'gm',  'aata_gm_out',      500::numeric,  'BAG:25:kg|kg:1000:gm', 500::numeric,  NULL::numeric, NULL::numeric, false),
    ('aata',       '1',  'gm',  'aata_gm_reciepe',  250::numeric,  'BAG:25:kg|kg:1000:gm', 250::numeric,  NULL::numeric, NULL::numeric, false),
    ('rice',       '3',  'kg',  'rice_kg_in',       25::numeric,   'BAG:25:kg',            NULL::numeric, NULL::numeric, NULL::numeric, false),
    ('tea powder', '6B', 'gm',  'tea powder_gm_in', 500::numeric,  'pkt:500:gm',           500::numeric,  NULL::numeric, NULL::numeric, false)
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
       qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config iuc
    WHERE iuc.scoop_name = v.scoop_name
);

-- ---------------------------------------------------------------------------
-- 2. Normalized orders + order_items
-- ---------------------------------------------------------------------------

INSERT INTO public.orders (vendor, dt, billno, customer, billtotal, billcomments)
SELECT v.vendor, v.dt::date, v.billno, v.customer, v.billtotal, v.billcomments
FROM (VALUES
    ('KiranaShreeGanesh', '2025-09-01', 'SEED-B001', 'Main Kitchen', 2450.0000, 'Seed order 1'),
    ('RS Sales',          '2025-09-02', 'SEED-B002', 'Main Kitchen', 1875.5000, 'Seed order 2'),
    ('Royal Food',        '2025-09-03', 'SEED-B003', 'Banquet',      3200.0000, 'Seed order 3'),
    ('MilkAndCurd',       '2025-09-04', 'SEED-B004', 'Main Kitchen',  980.0000, 'Seed order 4'),
    ('HNS',               '2025-09-05', 'SEED-B005', 'Staff Canteen', 650.0000, 'Seed order 5')
) AS v(vendor, dt, billno, customer, billtotal, billcomments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.billno = v.billno
);

INSERT INTO public.order_items (order_id, itemname, pgno, scoopin, qty, rate, itemtotal, comments)
SELECT o.id, v.itemname, v.pgno, v.scoopin, v.qty, v.rate, v.itemtotal, v.comments
FROM (VALUES
    ('SEED-B001', 'aata',       '1',  'aata_gm_in',       2,  450.0000,  900.0000, 'Seed line'),
    ('SEED-B001', 'rice',       '3',  'rice_kg_in',       1, 1550.0000, 1550.0000, 'Seed line'),
    ('SEED-B002', 'maida',      '2',  'maida_gm_in',      5,  120.0000,  600.0000, 'Seed line'),
    ('SEED-B002', 'tea powder', '6B', 'tea powder_gm_in', 1, 1275.5000, 1275.5000, 'Seed line'),
    ('SEED-B003', 'staff rice', '4',  'staff rice_gm_in', 3, 1066.6667, 3200.0000, 'Seed line')
) AS v(billno, itemname, pgno, scoopin, qty, rate, itemtotal, comments)
JOIN public.orders o ON o.billno = v.billno
WHERE NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = o.id AND oi.itemname = v.itemname AND oi.scoopin = v.scoopin
);

-- ---------------------------------------------------------------------------
-- 3. Normalized inventory_out + inventory_out_items
-- ---------------------------------------------------------------------------

INSERT INTO public.inventory_out (category, dt, tm, issuedto, commontag, totalqty)
SELECT v.category, v.dt::date, v.tm, v.issuedto, v.commontag, v.totalqty
FROM (VALUES
    ('INDIAN',      '2025-09-01', '10:30', 'Line 1', 'SEED-OUT-1', 750),
    ('CHINESE',     '2025-09-02', '11:00', 'Line 2', 'SEED-OUT-2', 500),
    ('CONTINENTAL', '2025-09-03', '12:15', 'Line 3', 'SEED-OUT-3', 250),
    ('TANDOOR',     '2025-09-04', '13:00', 'Line 4', 'SEED-OUT-4', 400),
    ('HOUSEKEEPING','2025-09-05', '14:30', 'HK Store', 'SEED-OUT-5', 100)
) AS v(category, dt, tm, issuedto, commontag, totalqty)
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_out io WHERE io.commontag = v.commontag
);

INSERT INTO public.inventory_out_items (inventory_out_id, itemname, pgno, scoop_out, qty, comments)
SELECT io.id, v.itemname, v.pgno, v.scoop_out, v.qty, v.comments
FROM (VALUES
    ('SEED-OUT-1', 'aata',       '1',  'aata_gm_out',      500, 'Seed issue'),
    ('SEED-OUT-2', 'rice',       '3',  'rice_kg_out',        5, 'Seed issue'),
    ('SEED-OUT-3', 'maida',      '2',  'maida_gm_out',     250, 'Seed issue'),
    ('SEED-OUT-4', 'tea powder', '6B', 'tea powder_gm_out', 50, 'Seed issue'),
    ('SEED-OUT-5', 'staff rice', '4',  'staff rice_gm_out',100, 'Seed issue')
) AS v(commontag, itemname, pgno, scoop_out, qty, comments)
JOIN public.inventory_out io ON io.commontag = v.commontag
WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_out_items ioi
    WHERE ioi.inventory_out_id = io.id AND ioi.itemname = v.itemname
);

-- ---------------------------------------------------------------------------
-- 4. Flat transactional tables
-- ---------------------------------------------------------------------------

INSERT INTO public.order_entries
    (vendor, dt, billno, itemname, pgno, scoopin, qty, rate, itemtotal, comments)
SELECT v.vendor, v.dt::date, v.billno, v.itemname, v.pgno, v.scoopin, v.qty, v.rate, v.itemtotal, v.comments
FROM (VALUES
    ('KiranaShreeGanesh', '2025-09-10', 'SEED-FLAT-01', 'aata',       '1',  'aata_gm_in',       1,  450.0000,  450.0000, 'Seed flat in'),
    ('RS Sales',          '2025-09-10', 'SEED-FLAT-01', 'rice',       '3',  'rice_kg_in',       2, 1550.0000, 3100.0000, 'Seed flat in'),
    ('Royal Food',        '2025-09-11', 'SEED-FLAT-02', 'maida',      '2',  'maida_gm_in',      3,  120.0000,  360.0000, 'Seed flat in'),
    ('MilkAndCurd',       '2025-09-11', 'SEED-FLAT-02', 'tea powder', '6B', 'tea powder_gm_in', 1, 1275.0000, 1275.0000, 'Seed flat in'),
    ('HNS',               '2025-09-12', 'SEED-FLAT-03', 'staff rice', '4',  'staff rice_gm_in', 4,  200.0000,  800.0000, 'Seed flat in')
) AS v(vendor, dt, billno, itemname, pgno, scoopin, qty, rate, itemtotal, comments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.order_entries oe
    WHERE oe.vendor = v.vendor AND oe.dt = v.dt::date AND oe.billno = v.billno
      AND oe.itemname = v.itemname AND oe.pgno = v.pgno
);

INSERT INTO public.order_out
    (category, dt, "time", itemname, "pgNo", scoop_out, qty, comments)
SELECT v.category, v.dt::date, v."time", v.itemname, v."pgNo", v.scoop_out, v.qty, v.comments
FROM (VALUES
    ('INDIAN',      '2025-09-10', '09:00', 'aata',       '1',  'aata_gm_out',      250, 'Seed flat out'),
    ('CHINESE',     '2025-09-10', '09:30', 'rice',       '3',  'rice_kg_out',        3, 'Seed flat out'),
    ('CONTINENTAL', '2025-09-11', '10:00', 'maida',      '2',  'maida_gm_out',     100, 'Seed flat out'),
    ('TANDOOR',     '2025-09-11', '10:30', 'tea powder', '6B', 'tea powder_gm_out', 25, 'Seed flat out'),
    ('HOUSEKEEPING','2025-09-12', '11:00', 'staff rice', '4',  'staff rice_gm_out', 50, 'Seed flat out')
) AS v(category, dt, "time", itemname, "pgNo", scoop_out, qty, comments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.order_out oo
    WHERE oo.itemname = v.itemname AND oo."pgNo" = v."pgNo"
      AND oo.scoop_out = v.scoop_out AND oo.dt = v.dt::date AND oo."time" = v."time"
);

INSERT INTO public.recipe_entries
    (dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece", comments)
SELECT v.dishname, v.dishcode, v.reciepeitemname, v."pgNo", v.receipescoop, v.qty, v."inGm", v."inML", v."inPiece", v.comments
FROM (VALUES
    ('Paneer Butter Masala', 'D001', 'aata',       '1',  'aata_gm_reciepe',       250::numeric, 250::numeric, NULL::numeric, NULL::numeric, 'Seed recipe 1'),
    ('Paneer Butter Masala', 'D001', 'maida',      '2',  'maida_gm_reciepe',       50::numeric,  50::numeric, NULL::numeric, NULL::numeric, 'Seed recipe 1'),
    ('Dal Makhani',          'D002', 'rice',       '3',  'rice_gm_reciepe',       200::numeric, 200::numeric, NULL::numeric, NULL::numeric, 'Seed recipe 2'),
    ('Fried Rice',           'D004', 'tea powder', '6B', 'tea powder_gm_reciepe',   5::numeric,   5::numeric, NULL::numeric, NULL::numeric, 'Seed recipe 3'),
    ('Garlic Naan',          'D005', 'staff rice', '4',  'staff rice_gm_reciepe', 150::numeric, 150::numeric, NULL::numeric, NULL::numeric, 'Seed recipe 4')
) AS v(dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece", comments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.recipe_entries re
    WHERE re.dishname = v.dishname AND re.reciepeitemname = v.reciepeitemname
      AND re.receipescoop = v.receipescoop AND re.comments = v.comments
);

COMMIT;

-- Quick counts
SELECT 'vendors' AS tbl, COUNT(*) AS rows FROM public.vendors
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'dishes', COUNT(*) FROM public.dishes
UNION ALL SELECT 'raw_materials', COUNT(*) FROM public.raw_materials
UNION ALL SELECT 'scoop_config', COUNT(*) FROM public.scoop_config
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'order_items', COUNT(*) FROM public.order_items
UNION ALL SELECT 'inventory_out', COUNT(*) FROM public.inventory_out
UNION ALL SELECT 'inventory_out_items', COUNT(*) FROM public.inventory_out_items
UNION ALL SELECT 'order_entries', COUNT(*) FROM public.order_entries
UNION ALL SELECT 'order_out', COUNT(*) FROM public.order_out
UNION ALL SELECT 'recipe_entries', COUNT(*) FROM public.recipe_entries
ORDER BY tbl;
