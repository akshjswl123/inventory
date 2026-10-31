-- PetPooja base menu export (item master + variation; no channel prices)
-- Run on existing DB:
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/31_petpooja_basemenu.sql
-- Import CSV:
--   ./scripts/petpooja_basemenu_import.sh

CREATE TABLE IF NOT EXISTS public.petpooja_basemenu
(
    item_id bigint NOT NULL,
    category text COLLATE pg_catalog."default",
    item_name text COLLATE pg_catalog."default" NOT NULL,
    variation text COLLATE pg_catalog."default",
    online_display_name text COLLATE pg_catalog."default",
    item_type text COLLATE pg_catalog."default",
    price numeric(12,4),
    description text COLLATE pg_catalog."default",
    dietary text COLLATE pg_catalog."default",
    short_code text COLLATE pg_catalog."default",
    sap_code text COLLATE pg_catalog."default",
    hsn_code text COLLATE pg_catalog."default",
    weight numeric(12,4),
    weight_unit text COLLATE pg_catalog."default",
    item_rank integer,
    packing_charges numeric(12,4),
    expose_in_captain text COLLATE pg_catalog."default",
    goods_or_services text COLLATE pg_catalog."default",
    allow_decimal_qty text COLLATE pg_catalog."default",
    manufacturing_date text COLLATE pg_catalog."default",
    expiry_date text COLLATE pg_catalog."default",
    dine_in_qr text COLLATE pg_catalog."default"
) TABLESPACE pg_default;

ALTER TABLE public.petpooja_basemenu DROP CONSTRAINT IF EXISTS petpooja_basemenu_pkey;
ALTER TABLE public.petpooja_basemenu
    ALTER COLUMN variation DROP NOT NULL;
ALTER TABLE public.petpooja_basemenu
    ALTER COLUMN variation DROP DEFAULT;
ALTER TABLE public.petpooja_basemenu
    ADD CONSTRAINT petpooja_basemenu_pkey PRIMARY KEY (item_id);

ALTER TABLE IF EXISTS public.petpooja_basemenu OWNER TO poc;
GRANT ALL ON TABLE public.petpooja_basemenu TO poc;
