-- Menu categories and dish ↔ menu category links (numeric menu_category_id).
-- Prerequisites: dishes seeded (scripts/seed_data.sql or data/dishes.csv).
--
-- Run on existing DB:
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/24_menu_categories.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- DDL (idempotent for DBs created before 01_schema included menu tables)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.menu_categories
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    menu_category_id integer NOT NULL,
    menu_category_name text NOT NULL,
    display_order integer,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT menu_categories_pkey PRIMARY KEY (id),
    CONSTRAINT menu_categories_menu_category_id_key UNIQUE (menu_category_id),
    CONSTRAINT menu_categories_menu_category_name_key UNIQUE (menu_category_name)
);

ALTER TABLE public.menu_categories OWNER TO poc;
GRANT ALL ON TABLE public.menu_categories TO poc;

DROP TRIGGER IF EXISTS menu_categories_touch_last_updated_at ON public.menu_categories;
CREATE TRIGGER menu_categories_touch_last_updated_at
    BEFORE UPDATE ON public.menu_categories
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

CREATE TABLE IF NOT EXISTS public.dish_menu_category
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    dish_code text NOT NULL,
    menu_category_id integer NOT NULL,
    sort_order integer,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dish_menu_category_pkey PRIMARY KEY (id),
    CONSTRAINT dish_menu_category_dish_category_key UNIQUE (dish_code, menu_category_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'dish_menu_category_dish_code_fkey'
    ) THEN
        ALTER TABLE public.dish_menu_category
            ADD CONSTRAINT dish_menu_category_dish_code_fkey
            FOREIGN KEY (dish_code) REFERENCES public.dishes (dish_code)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'dish_menu_category_menu_category_id_fkey'
    ) THEN
        ALTER TABLE public.dish_menu_category
            ADD CONSTRAINT dish_menu_category_menu_category_id_fkey
            FOREIGN KEY (menu_category_id) REFERENCES public.menu_categories (menu_category_id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

ALTER TABLE public.dish_menu_category OWNER TO poc;
GRANT ALL ON TABLE public.dish_menu_category TO poc;

DROP TRIGGER IF EXISTS dish_menu_category_touch_last_updated_at ON public.dish_menu_category;
CREATE TRIGGER dish_menu_category_touch_last_updated_at
    BEFORE UPDATE ON public.dish_menu_category
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

CREATE OR REPLACE VIEW public.v_menu_categories_and_dishes AS
SELECT
    mc.menu_category_id,
    mc.menu_category_name,
    mc.display_order AS menu_category_display_order,
    dmc.sort_order AS dish_sort_order,
    d.dish_code,
    d.dish_name
FROM public.menu_categories mc
LEFT JOIN public.dish_menu_category dmc
    ON dmc.menu_category_id = mc.menu_category_id
LEFT JOIN public.dishes d
    ON d.dish_code = dmc.dish_code;

ALTER VIEW public.v_menu_categories_and_dishes OWNER TO poc;
GRANT SELECT ON public.v_menu_categories_and_dishes TO poc;

CREATE OR REPLACE VIEW public.v_dishes_with_menu_categories AS
SELECT
    d.dish_code,
    d.dish_name,
    COALESCE(
        array_agg(mc.menu_category_id ORDER BY mc.menu_category_id)
            FILTER (WHERE mc.menu_category_id IS NOT NULL),
        '{}'::integer[]
    ) AS menu_category_ids,
    COALESCE(
        array_agg(mc.menu_category_name ORDER BY mc.menu_category_name)
            FILTER (WHERE mc.menu_category_name IS NOT NULL),
        '{}'::text[]
    ) AS menu_category_names
FROM public.dishes d
LEFT JOIN public.dish_menu_category dmc ON dmc.dish_code = d.dish_code
LEFT JOIN public.menu_categories mc ON mc.menu_category_id = dmc.menu_category_id
GROUP BY d.dish_code, d.dish_name;

ALTER VIEW public.v_dishes_with_menu_categories OWNER TO poc;
GRANT SELECT ON public.v_dishes_with_menu_categories TO poc;

-- ---------------------------------------------------------------------------
-- Seed categories (numeric id + display name)
-- ---------------------------------------------------------------------------

INSERT INTO public.menu_categories (menu_category_id, menu_category_name, display_order)
VALUES
    (1, 'pasta', 1),
    (2, 'pizza', 2),
    (3, 'sandwich', 3),
    (4, 'burger', 4),
    (5, 'fries', 5),
    (6, 'drinks', 6),
    (7, 'cold beverage', 7)
ON CONFLICT (menu_category_id) DO UPDATE SET
    menu_category_name = EXCLUDED.menu_category_name,
    display_order = EXCLUDED.display_order,
    last_updated_at = CURRENT_TIMESTAMP;

-- Sample dish links (skipped if dish_code not in dishes)
INSERT INTO public.dish_menu_category (dish_code, menu_category_id)
SELECT v.dish_code, v.menu_category_id
FROM (VALUES
    ('D139', 2), ('D142', 2), ('D158', 2),
    ('D159', 1), ('D160', 1),
    ('D151', 3), ('D157', 3), ('D158', 3),
    ('D147', 4), ('D149', 4),
    ('D112', 5), ('D114', 5),
    ('D117', 6), ('D123', 6), ('D127', 6), ('D128', 6), ('D131', 6),
    ('D127', 7), ('D128', 7)
) AS v(dish_code, menu_category_id)
WHERE EXISTS (SELECT 1 FROM public.dishes d WHERE d.dish_code = v.dish_code)
ON CONFLICT (dish_code, menu_category_id) DO NOTHING;

COMMIT;
