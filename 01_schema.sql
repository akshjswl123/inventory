-- 01_schema.sql

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
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
                             CONSTRAINT orders_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.orders OWNER TO poc;

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
    CONSTRAINT order_items_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.order_items OWNER TO poc;

-- Parent Table: inventory_out
CREATE TABLE IF NOT EXISTS public.inventory_out (
                                                    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    category text,
    dt date,
    tm text,
    issuedto text,
    commontag text,
    totalqty numeric,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
                             CONSTRAINT inventory_out_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.inventory_out OWNER TO poc;

-- Child Table: inventory_out_items
CREATE TABLE IF NOT EXISTS public.inventory_out_items (
                                                          id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    inventory_out_id bigint REFERENCES public.inventory_out(id) ON DELETE CASCADE,
    itemname text,
    pgno text,
    scoop_out text,
    qty numeric,
    comments text,
    CONSTRAINT inventory_out_items_pkey PRIMARY KEY (id)
    ) TABLESPACE pg_default;

ALTER TABLE public.inventory_out_items OWNER TO poc;


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
    CONSTRAINT order_entries_pkey PRIMARY KEY (id),
    CONSTRAINT unique_order_row UNIQUE (vendor, dt, billno, itemname, pgno)
    ) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.order_entries OWNER TO poc;
GRANT ALL ON TABLE public.order_entries TO poc;

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
    CONSTRAINT order_out_pkey PRIMARY KEY (id),
    CONSTRAINT unique_order_out UNIQUE (itemname, "pgNo", scoop_out, dt, "time")
    ) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.order_out OWNER TO poc;
GRANT ALL ON TABLE public.order_out TO poc;

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
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT recipe_entries_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.recipe_entries OWNER TO poc;
GRANT ALL ON TABLE public.recipe_entries TO poc;

-- Table: public.raw_materials (pgNo, itemname, comments)
CREATE TABLE IF NOT EXISTS public.raw_materials
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    "pgNo" text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.raw_materials OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials TO poc;

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
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scoop_config_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.scoop_config OWNER TO poc;
GRANT ALL ON TABLE public.scoop_config TO poc;

-- ==========================================
-- 3. STATIC REFERENCE DATA (catalog / lookups)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.vendors
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    vendor_name text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vendors_pkey PRIMARY KEY (id),
    CONSTRAINT vendors_vendor_name_key UNIQUE (vendor_name)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.vendors OWNER TO poc;
GRANT ALL ON TABLE public.vendors TO poc;

CREATE TABLE IF NOT EXISTS public.categories
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    category_name text COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT categories_pkey PRIMARY KEY (id),
    CONSTRAINT categories_category_name_key UNIQUE (category_name)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.categories OWNER TO poc;
GRANT ALL ON TABLE public.categories TO poc;

CREATE TABLE IF NOT EXISTS public.dishes
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    dish_name text COLLATE pg_catalog."default" NOT NULL,
    dish_code text COLLATE pg_catalog."default",
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dishes_pkey PRIMARY KEY (id),
    CONSTRAINT dishes_dish_name_key UNIQUE (dish_name),
    CONSTRAINT dishes_dish_code_key UNIQUE (dish_code)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.dishes OWNER TO poc;
GRANT ALL ON TABLE public.dishes TO poc;