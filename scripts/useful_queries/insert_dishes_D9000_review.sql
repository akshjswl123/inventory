-- REVIEW: add catalog rows for the 34 menu items missing dishcode (no recipe required).
-- Codes align with insert_dishcodepetpoojaId_D9000_review.sql.
--
-- Skip INSERT for 2 codes already in dishes:
--   D104  ICE CREAM Scoop  (shared with Ice Cream Mango POS item)
--   D067  MASALA PAPAD     (shared with Roasted Masala Papad POS item)
--
-- After INSERT, run backfill only (step B matches dish_name):
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/backfill_dinein_menu_dishcode.sql
--
-- Mango / Roasted Masala Papad still need mapping OR dish_name alignment for step B.

-- Preview: planned vs existing
SELECT
    p.dish_code,
    p.dish_name,
    d.dish_code IS NOT NULL AS already_in_dishes,
    d.dish_name AS existing_name
FROM (VALUES
    ('D9000', 'Child.'),
    ('D9001', 'Chola Mashal Salad'),
    ('D9002', 'Chole Kulche + Tawa Pulao'),
    ('D9003', 'Classic Lassi'),
    ('D9004', 'Coco Cola Zero Sugar'),
    ('D9005', 'Container 1'),
    ('D9006', 'Container 2'),
    ('D9007', 'Corn Palak'),
    ('D9008', 'Diet Coke'),
    ('D9009', 'Diet Coke 300 Ml'),
    ('D9010', 'Extra Cheese'),
    ('D9011', 'Extra Veggie'),
    ('D9012', 'Half Dal Jeera'),
    ('D9013', 'Half Dal Tadka'),
    ('D104', 'Ice Cream Mango'),
    ('D9015', 'Ice Cream Sunde'),
    ('D9016', 'Jeera Rice Half'),
    ('D9017', 'Lehsuni Palak Corn'),
    ('D9018', 'Mushroom'),
    ('D9019', 'Palak Paneer'),
    ('D9020', 'Paneer'),
    ('D9021', 'Paneer Cheese Masala'),
    ('D9022', 'Paneer Do Pyaza'),
    ('D9023', 'Paneer Kofta'),
    ('D9024', 'Paneer Takatak'),
    ('D9025', 'Red Bull'),
    ('D067', 'Roasted Masala Papad'),
    ('D9027', 'Small Water'),
    ('D9028', 'Starter Box ( For 3 )'),
    ('D9029', 'Steam Rice Half'),
    ('D9030', 'Thumbs Up Can'),
    ('D9031', 'Veg Dum Biryani + Raita + Gulab Jamun'),
    ('D9032', 'Veg Handi'),
    ('D9033', 'Water Bottle')
) AS p(dish_code, dish_name)
LEFT JOIN public.dishes d ON UPPER(TRIM(d.dish_code)) = UPPER(TRIM(p.dish_code))
ORDER BY p.dish_code;

-- ---------------------------------------------------------------------------
-- Apply when approved (32 rows; uncomment)
-- ---------------------------------------------------------------------------
/*
INSERT INTO public.dishes (dish_name, dish_code)
VALUES
    ('Child.', 'D9000'),
    ('Chola Mashal Salad', 'D9001'),
    ('Chole Kulche + Tawa Pulao', 'D9002'),
    ('Classic Lassi', 'D9003'),
    ('Coco Cola Zero Sugar', 'D9004'),
    ('Container 1', 'D9005'),
    ('Container 2', 'D9006'),
    ('Corn Palak', 'D9007'),
    ('Diet Coke', 'D9008'),
    ('Diet Coke 300 Ml', 'D9009'),
    ('Extra Cheese', 'D9010'),
    ('Extra Veggie', 'D9011'),
    ('Half Dal Jeera', 'D9012'),
    ('Half Dal Tadka', 'D9013'),
    ('Ice Cream Sunde', 'D9015'),
    ('Jeera Rice Half', 'D9016'),
    ('Lehsuni Palak Corn', 'D9017'),
    ('Mushroom', 'D9018'),
    ('Palak Paneer', 'D9019'),
    ('Paneer', 'D9020'),
    ('Paneer Cheese Masala', 'D9021'),
    ('Paneer Do Pyaza', 'D9022'),
    ('Paneer Kofta', 'D9023'),
    ('Paneer Takatak', 'D9024'),
    ('Red Bull', 'D9025'),
    ('Small Water', 'D9027'),
    ('Starter Box ( For 3 )', 'D9028'),
    ('Steam Rice Half', 'D9029'),
    ('Thumbs Up Can', 'D9030'),
    ('Veg Dum Biryani + Raita + Gulab Jamun', 'D9031'),
    ('Veg Handi', 'D9032'),
    ('Water Bottle', 'D9033');
*/
