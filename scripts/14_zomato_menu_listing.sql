-- Zomato menu export (zomato_dishname + Cost from CSV)
CREATE TABLE IF NOT EXISTS public.zomato_menu_listing
(
    zomato_dishname text NOT NULL,
    cost numeric,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT zomato_menu_listing_pkey PRIMARY KEY (zomato_dishname)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.zomato_menu_listing OWNER TO poc;
GRANT ALL ON TABLE public.zomato_menu_listing TO poc;

DROP TRIGGER IF EXISTS zomato_menu_listing_touch_last_updated_at ON public.zomato_menu_listing;
CREATE TRIGGER zomato_menu_listing_touch_last_updated_at
    BEFORE UPDATE ON public.zomato_menu_listing
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();
