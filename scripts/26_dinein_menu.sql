-- Dine-in menu prices (dishcode + dishname + price)
-- Run on existing DB:
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/26_dinein_menu.sql

CREATE TABLE IF NOT EXISTS public.dinein_menu
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    dishcode text NOT NULL,
    dishname text NOT NULL,
    petpooja_item_id text,
    online_display_name text,
    price numeric(12,4),
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dinein_menu_pkey PRIMARY KEY (id),
    CONSTRAINT dinein_menu_dishcode_dishname_version_key UNIQUE (dishcode, dishname, version)
) TABLESPACE pg_default;

ALTER TABLE public.dinein_menu DROP CONSTRAINT IF EXISTS dinein_menu_dishcode_dishname_key;
ALTER TABLE public.dinein_menu DROP CONSTRAINT IF EXISTS dinein_menu_dishcode_dishname_version_key;
ALTER TABLE public.dinein_menu
    ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.dinein_menu
    ADD CONSTRAINT dinein_menu_dishcode_dishname_version_key UNIQUE (dishcode, dishname, version);
ALTER TABLE public.dinein_menu
    ADD COLUMN IF NOT EXISTS petpooja_item_id text;
ALTER TABLE public.dinein_menu
    ADD COLUMN IF NOT EXISTS online_display_name text;

ALTER TABLE IF EXISTS public.dinein_menu OWNER TO poc;
GRANT ALL ON TABLE public.dinein_menu TO poc;

DROP TRIGGER IF EXISTS dinein_menu_touch_last_updated_at ON public.dinein_menu;
CREATE TRIGGER dinein_menu_touch_last_updated_at
    BEFORE UPDATE ON public.dinein_menu
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();
