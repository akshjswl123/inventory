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
    is_usable_in_other_dish boolean DEFAULT false,
    usable_processed_scoop text COLLATE pg_catalog."default",
    qty_of_scoops numeric,
    comments text COLLATE pg_catalog."default",
    version integer NOT NULL DEFAULT 1,
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

-- Table: public.raw_materials_cost (computed rates from purchases + scoop_config)
CREATE TABLE IF NOT EXISTS public.raw_materials_cost
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    "pgNo" text COLLATE pg_catalog."default" NOT NULL,
    item_names text[] COLLATE pg_catalog."default",
    ratepergram numeric(12,4),
    rateperml numeric(12,4),
    rateperpiece numeric(12,4),
    based_on_billno text COLLATE pg_catalog."default",
    comments text COLLATE pg_catalog."default",
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_cost_pkey PRIMARY KEY (id),
    -- One rate snapshot per pgNo per version (bill save appends a new version)
    CONSTRAINT raw_materials_cost_pgno_version_key UNIQUE ("pgNo", version)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.raw_materials_cost OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials_cost TO poc;

DROP TRIGGER IF EXISTS raw_materials_cost_touch_last_updated_at ON public.raw_materials_cost;
CREATE TRIGGER raw_materials_cost_touch_last_updated_at
    BEFORE UPDATE ON public.raw_materials_cost
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
    version integer NOT NULL DEFAULT 1,
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

-- CSV import staging for dish cost export (see useful.sql: load into dish_cost)
CREATE TABLE IF NOT EXISTS public.dish_cost_staging
(
    row_kind text COLLATE pg_catalog."default",
    dish_code text COLLATE pg_catalog."default",
    dishname text COLLATE pg_catalog."default",
    dish_case text COLLATE pg_catalog."default",
    line_kind text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    "pgNo_or_dishCode" text COLLATE pg_catalog."default",
    receipescoop text COLLATE pg_catalog."default",
    qty text COLLATE pg_catalog."default",
    destination_unit text COLLATE pg_catalog."default",
    scoop_factor text COLLATE pg_catalog."default",
    rate text COLLATE pg_catalog."default",
    line_cost text COLLATE pg_catalog."default",
    is_usable_in_other_dish text COLLATE pg_catalog."default",
    out_scoop text COLLATE pg_catalog."default",
    qty_of_scoops text COLLATE pg_catalog."default",
    out_unit text COLLATE pg_catalog."default",
    out_factor text COLLATE pg_catalog."default",
    dish_cost text COLLATE pg_catalog."default",
    cost_of_one_scoop text COLLATE pg_catalog."default",
    rate_per_destination_unit text COLLATE pg_catalog."default",
    incomplete text COLLATE pg_catalog."default",
    cost_calculation text COLLATE pg_catalog."default"
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.dish_cost_staging OWNER TO poc;
GRANT ALL ON TABLE public.dish_cost_staging TO poc;

-- Loaded dish totals (one row per dish_code; populated from dish_cost_staging)
CREATE TABLE IF NOT EXISTS public.dish_cost
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    row_kind text COLLATE pg_catalog."default",
    dish_code text COLLATE pg_catalog."default",
    dishname text COLLATE pg_catalog."default",
    dish_case text COLLATE pg_catalog."default",
    line_kind text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    "pgNo_or_dishCode" text COLLATE pg_catalog."default",
    receipescoop text COLLATE pg_catalog."default",
    qty numeric,
    destination_unit text COLLATE pg_catalog."default",
    scoop_factor numeric,
    rate numeric(16,6),
    line_cost numeric(16,4),
    is_usable_in_other_dish boolean,
    out_scoop text COLLATE pg_catalog."default",
    qty_of_scoops numeric,
    out_unit text COLLATE pg_catalog."default",
    out_factor numeric,
    dish_cost numeric(16,4),
    cost_of_one_scoop numeric(16,4),
    rate_per_destination_unit numeric(16,6),
    incomplete boolean,
    cost_calculation text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dish_cost_pkey PRIMARY KEY (id),
    CONSTRAINT dish_cost_dish_code_key UNIQUE (dish_code)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.dish_cost OWNER TO poc;
GRANT ALL ON TABLE public.dish_cost TO poc;

DROP TRIGGER IF EXISTS dish_cost_touch_last_updated_at ON public.dish_cost;
CREATE TRIGGER dish_cost_touch_last_updated_at
    BEFORE UPDATE ON public.dish_cost
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- POS item report lines (import from Excel; see scripts/12_item_report.sql)
CREATE TABLE IF NOT EXISTS public.item_report_lines
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    report_date date NOT NULL,
    invoice_no text NOT NULL,
    item_name text NOT NULL,
    area text NOT NULL,
    qty numeric NOT NULL,
    event_timestamp timestamp with time zone,
    payment_type text,
    order_type text,
    price numeric,
    sub_total numeric,
    discount numeric,
    tax numeric,
    final_total numeric,
    status text,
    table_no text,
    server_name text,
    covers numeric,
    variation text,
    category text,
    group_name text,
    hsn text,
    phone text,
    customer_name text,
    address text,
    gst text,
    assign_to text,
    non_taxable numeric,
    line_total numeric,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT item_report_lines_pkey PRIMARY KEY (id),
    CONSTRAINT item_report_lines_invoice_date_item_area_key
        UNIQUE (invoice_no, report_date, item_name, area)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.item_report_lines OWNER TO poc;
GRANT ALL ON TABLE public.item_report_lines TO poc;

DROP TRIGGER IF EXISTS item_report_lines_touch_last_updated_at ON public.item_report_lines;
CREATE TRIGGER item_report_lines_touch_last_updated_at
    BEFORE UPDATE ON public.item_report_lines
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

-- item_type = table name: dishes, raw_materials_cost, scoop_config (see normalize_item_version_code)
CREATE TABLE IF NOT EXISTS public.item_versions
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    item_code text COLLATE pg_catalog."default" NOT NULL,
    item_type text COLLATE pg_catalog."default" NOT NULL,
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT item_versions_pkey PRIMARY KEY (id),
    CONSTRAINT item_versions_code_type_key UNIQUE (item_code, item_type),
    CONSTRAINT item_versions_item_type_check CHECK (
        item_type IN ('dishes', 'raw_materials_cost', 'scoop_config')
    ),
    CONSTRAINT item_versions_version_positive CHECK (version >= 1)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.item_versions OWNER TO poc;
GRANT ALL ON TABLE public.item_versions TO poc;

DROP TRIGGER IF EXISTS item_versions_touch_last_updated_at ON public.item_versions;
CREATE TRIGGER item_versions_touch_last_updated_at
    BEFORE UPDATE ON public.item_versions
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_item_version_code(
    p_item_code text,
    p_item_type text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_type text := TRIM(p_item_type);
    v_code text := TRIM(p_item_code);
BEGIN
    IF v_code IS NULL OR v_code = '' THEN
        RETURN NULL;
    END IF;
    IF v_type = 'scoop_config' THEN
        RETURN LOWER(v_code);
    END IF;
    RETURN UPPER(v_code);
END;
$$;

ALTER FUNCTION public.normalize_item_version_code(text, text) OWNER TO poc;

CREATE OR REPLACE FUNCTION public.bump_item_version(
    p_item_code text,
    p_item_type text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_type text := TRIM(p_item_type);
    v_code text := public.normalize_item_version_code(p_item_code, v_type);
    v_version integer;
BEGIN
    IF v_code IS NULL OR v_code = '' THEN
        RAISE EXCEPTION 'item_code is required';
    END IF;
    IF v_type IS NULL OR v_type NOT IN ('dishes', 'raw_materials_cost', 'scoop_config') THEN
        RAISE EXCEPTION 'item_type must be dishes, raw_materials_cost, or scoop_config';
    END IF;

    INSERT INTO public.item_versions (item_code, item_type, version)
    VALUES (v_code, v_type, 1)
    ON CONFLICT (item_code, item_type)
    DO UPDATE SET
        version = public.item_versions.version + 1,
        last_updated_at = CURRENT_TIMESTAMP
    RETURNING version INTO v_version;

    RETURN v_version;
END;
$$;

ALTER FUNCTION public.bump_item_version(text, text) OWNER TO poc;
