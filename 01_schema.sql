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