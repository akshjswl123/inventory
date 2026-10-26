-- Zomato / Swiggy menu prices (same shape as dinein_menu)
-- Run on existing DB:
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/27_zomato_swiggy_menu.sql

CREATE TABLE IF NOT EXISTS public.zomato_menu
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    dishcode text NOT NULL,
    dishname text NOT NULL,
    petpooja_item_id text,
    price numeric(12,4),
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT zomato_menu_pkey PRIMARY KEY (id),
    CONSTRAINT zomato_menu_dishcode_dishname_version_key UNIQUE (dishcode, dishname, version)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.zomato_menu OWNER TO poc;
GRANT ALL ON TABLE public.zomato_menu TO poc;

DROP TRIGGER IF EXISTS zomato_menu_touch_last_updated_at ON public.zomato_menu;
CREATE TRIGGER zomato_menu_touch_last_updated_at
    BEFORE UPDATE ON public.zomato_menu
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

ALTER TABLE public.zomato_menu
    ADD COLUMN IF NOT EXISTS petpooja_item_id text;

CREATE TABLE IF NOT EXISTS public.swiggy_menu
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    dishcode text NOT NULL,
    dishname text NOT NULL,
    petpooja_item_id text,
    price numeric(12,4),
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT swiggy_menu_pkey PRIMARY KEY (id),
    CONSTRAINT swiggy_menu_dishcode_dishname_version_key UNIQUE (dishcode, dishname, version)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.swiggy_menu OWNER TO poc;
GRANT ALL ON TABLE public.swiggy_menu TO poc;

DROP TRIGGER IF EXISTS swiggy_menu_touch_last_updated_at ON public.swiggy_menu;
CREATE TRIGGER swiggy_menu_touch_last_updated_at
    BEFORE UPDATE ON public.swiggy_menu
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

ALTER TABLE public.swiggy_menu
    ADD COLUMN IF NOT EXISTS petpooja_item_id text;
