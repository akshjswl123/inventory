-- 01_schema.sql

-- ==========================================
-- Housekeeping: created_at / last_updated_at on every table (defaults on INSERT;
-- touch_last_updated_at trigger on UPDATE). Omitted from app CSV formats — DB fills them.
-- ==========================================

CREATE OR REPLACE FUNCTION public.touch_last_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- ==========================================
-- 1. NORMALIZED SCHEMA (Used by dbqueries.js & STOCK_QUERY)
-- ==========================================

-- Parent Table: orders
CREATE TABLE IF NOT EXISTS public.orders (
                                             id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    vendor text,
    dt date,
    billno text,
    customer text,
    billtotal numeric(12,4),
    billcomments text,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                             CONSTRAINT orders_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.orders OWNER TO poc;

DROP TRIGGER IF EXISTS orders_touch_last_updated_at ON public.orders;
CREATE TRIGGER orders_touch_last_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- Child Table: order_items
CREATE TABLE IF NOT EXISTS public.order_items (
                                                  id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    order_id bigint REFERENCES public.orders(id) ON DELETE CASCADE,
    itemname text,
    pgno text,
    scoopin text,
    qty numeric,
    rate numeric(12,4),
    itemtotal numeric(12,4),
    comments text,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_items_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.order_items OWNER TO poc;

DROP TRIGGER IF EXISTS order_items_touch_last_updated_at ON public.order_items;
CREATE TRIGGER order_items_touch_last_updated_at
    BEFORE UPDATE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- Parent Table: inventory_out
CREATE TABLE IF NOT EXISTS public.inventory_out (
                                                    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    category text,
    dt date,
    tm text,
    issuedto text,
    commontag text,
    totalqty numeric,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                             CONSTRAINT inventory_out_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.inventory_out OWNER TO poc;

DROP TRIGGER IF EXISTS inventory_out_touch_last_updated_at ON public.inventory_out;
CREATE TRIGGER inventory_out_touch_last_updated_at
    BEFORE UPDATE ON public.inventory_out
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- Child Table: inventory_out_items
CREATE TABLE IF NOT EXISTS public.inventory_out_items (
                                                          id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    inventory_out_id bigint REFERENCES public.inventory_out(id) ON DELETE CASCADE,
    itemname text,
    pgno text,
    scoop_out text,
    qty numeric,
    comments text,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_out_items_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.inventory_out_items OWNER TO poc;

DROP TRIGGER IF EXISTS inventory_out_items_touch_last_updated_at ON public.inventory_out_items;
CREATE TRIGGER inventory_out_items_touch_last_updated_at
    BEFORE UPDATE ON public.inventory_out_items
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();


-- ==========================================
-- 2. FLAT SCHEMA (order_entries & order_out)
-- ==========================================

-- Table: public.order_entries
CREATE TABLE IF NOT EXISTS public.order_entries
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    vendor text COLLATE pg_catalog."default",
    dt date,
    billno text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    pgno text COLLATE pg_catalog."default",
    scoopin text COLLATE pg_catalog."default",
    qty numeric,
    rate numeric(12,4),
    itemtotal numeric(12,4),
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_entries_pkey PRIMARY KEY (id),
    CONSTRAINT unique_order_row UNIQUE (vendor, dt, billno, itemname, pgno)
    ) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.order_entries OWNER TO poc;
GRANT ALL ON TABLE public.order_entries TO poc;

DROP TRIGGER IF EXISTS order_entries_touch_last_updated_at ON public.order_entries;
CREATE TRIGGER order_entries_touch_last_updated_at
    BEFORE UPDATE ON public.order_entries
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- Table: public.order_out
CREATE TABLE IF NOT EXISTS public.order_out
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    category text COLLATE pg_catalog."default",
    dt date,
    "time" text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    "pgNo" text COLLATE pg_catalog."default",
    scoop_out text COLLATE pg_catalog."default",
    qty numeric,
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_out_pkey PRIMARY KEY (id),
    CONSTRAINT unique_order_out UNIQUE (itemname, "pgNo", scoop_out, dt, "time")
    ) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.order_out OWNER TO poc;
GRANT ALL ON TABLE public.order_out TO poc;

DROP TRIGGER IF EXISTS order_out_touch_last_updated_at ON public.order_out;
CREATE TRIGGER order_out_touch_last_updated_at
    BEFORE UPDATE ON public.order_out
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- Table: public.recipe_entries (Recipe Maker CSV rows)
CREATE TABLE IF NOT EXISTS public.recipe_entries
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    dishname text COLLATE pg_catalog."default",
    dishcode text COLLATE pg_catalog."default",
    reciepeitemname text COLLATE pg_catalog."default",
    "pgNo" text COLLATE pg_catalog."default",
    receipescoop text COLLATE pg_catalog."default",
    qty numeric,
    "inGm" numeric,
    "inML" numeric,
    "inPiece" numeric,
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT recipe_entries_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.recipe_entries OWNER TO poc;
GRANT ALL ON TABLE public.recipe_entries TO poc;

DROP TRIGGER IF EXISTS recipe_entries_touch_last_updated_at ON public.recipe_entries;
CREATE TRIGGER recipe_entries_touch_last_updated_at
    BEFORE UPDATE ON public.recipe_entries
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- Table: public.raw_materials (pgNo, itemname, comments)
CREATE TABLE IF NOT EXISTS public.raw_materials
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    "pgNo" text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.raw_materials OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials TO poc;

DROP TRIGGER IF EXISTS raw_materials_touch_last_updated_at ON public.raw_materials;
CREATE TRIGGER raw_materials_touch_last_updated_at
    BEFORE UPDATE ON public.raw_materials
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- Table: public.scoop_config (Scoop tab flat rows)
CREATE TABLE IF NOT EXISTS public.scoop_config
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    scoop_item_name text COLLATE pg_catalog."default",
    scoop_item_id text COLLATE pg_catalog."default",
    destination_unit text COLLATE pg_catalog."default",
    scoop_name text COLLATE pg_catalog."default",
    factor numeric,
    conversion_chain text COLLATE pg_catalog."default",
    qty_in_grams numeric,
    qty_in_ml numeric,
    qty_in_piece numeric,
    unused boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scoop_config_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.scoop_config OWNER TO poc;
GRANT ALL ON TABLE public.scoop_config TO poc;

DROP TRIGGER IF EXISTS scoop_config_touch_last_updated_at ON public.scoop_config;
CREATE TRIGGER scoop_config_touch_last_updated_at
    BEFORE UPDATE ON public.scoop_config
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- ==========================================
-- 3. STATIC REFERENCE DATA (catalog / lookups)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.vendors
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    vendor_name text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vendors_pkey PRIMARY KEY (id),
    CONSTRAINT vendors_vendor_name_key UNIQUE (vendor_name)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.vendors OWNER TO poc;
GRANT ALL ON TABLE public.vendors TO poc;

DROP TRIGGER IF EXISTS vendors_touch_last_updated_at ON public.vendors;
CREATE TRIGGER vendors_touch_last_updated_at
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

CREATE TABLE IF NOT EXISTS public.categories
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    category_name text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT categories_pkey PRIMARY KEY (id),
    CONSTRAINT categories_category_name_key UNIQUE (category_name)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.categories OWNER TO poc;
GRANT ALL ON TABLE public.categories TO poc;

DROP TRIGGER IF EXISTS categories_touch_last_updated_at ON public.categories;
CREATE TRIGGER categories_touch_last_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

CREATE TABLE IF NOT EXISTS public.dishes
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    dish_name text COLLATE pg_catalog."default" NOT NULL,
    dish_code text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dishes_pkey PRIMARY KEY (id),
    CONSTRAINT dishes_dish_name_key UNIQUE (dish_name),
    CONSTRAINT dishes_dish_code_key UNIQUE (dish_code)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.dishes OWNER TO poc;
GRANT ALL ON TABLE public.dishes TO poc;

DROP TRIGGER IF EXISTS dishes_touch_last_updated_at ON public.dishes;
CREATE TRIGGER dishes_touch_last_updated_at
    BEFORE UPDATE ON public.dishes
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();
