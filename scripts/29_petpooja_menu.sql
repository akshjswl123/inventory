-- PetPooja POS menu export (one row per item; channel prices + availability)
-- Run on existing DB:
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/29_petpooja_menu.sql
-- Import CSV:
--   ./scripts/petpooja_menu_import.sh

CREATE TABLE IF NOT EXISTS public.petpooja_menu
(
    item_id bigint NOT NULL,
    category_name text COLLATE pg_catalog."default",
    item_name text COLLATE pg_catalog."default" NOT NULL,
    sap_code text COLLATE pg_catalog."default",
    item_short_code text COLLATE pg_catalog."default",
    item_short_code1 text COLLATE pg_catalog."default",
    item_description text COLLATE pg_catalog."default",
    expose_to_online text COLLATE pg_catalog."default",
    online_display_name text COLLATE pg_catalog."default",
    is_favorite text COLLATE pg_catalog."default",
    item_base_price numeric(12,4),
    container_charge numeric(12,4),
    dietary text COLLATE pg_catalog."default",
    home_delivery_price numeric(12,4),
    home_delivery_available text COLLATE pg_catalog."default",
    garden_price numeric(12,4),
    garden_available text COLLATE pg_catalog."default",
    dining_price numeric(12,4),
    dining_available text COLLATE pg_catalog."default",
    bar_price numeric(12,4),
    bar_available text COLLATE pg_catalog."default",
    sofa_price numeric(12,4),
    sofa_available text COLLATE pg_catalog."default",
    lounge_price numeric(12,4),
    lounge_available text COLLATE pg_catalog."default",
    parcel_price numeric(12,4),
    parcel_available text COLLATE pg_catalog."default",
    zomato_price numeric(12,4),
    zomato_available text COLLATE pg_catalog."default",
    swiggy_price numeric(12,4),
    swiggy_available text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT petpooja_menu_pkey PRIMARY KEY (item_id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.petpooja_menu OWNER TO poc;
GRANT ALL ON TABLE public.petpooja_menu TO poc;

DROP TRIGGER IF EXISTS petpooja_menu_touch_last_updated_at ON public.petpooja_menu;
CREATE TRIGGER petpooja_menu_touch_last_updated_at
    BEFORE UPDATE ON public.petpooja_menu
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();
