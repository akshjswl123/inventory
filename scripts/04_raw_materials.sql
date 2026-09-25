-- =============================================================================
-- raw_materials — master item list (pgNo, itemname, comments)
-- =============================================================================
-- Used by:
--   - Raw Materials tab (Save to DB)
--   - StaticDataFetcher CATALOG / RECIPE_CATALOG
--   - vendor_items & category_items cross-join queries
--
-- Run:
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/04_raw_materials.sql
--
-- Docker (port 5433):
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/04_raw_materials.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.raw_materials
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY (
        INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1
    ),
    "pgNo" text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

COMMENT ON TABLE public.raw_materials IS 'Master raw material catalog: item name and page number.';
COMMENT ON COLUMN public.raw_materials."pgNo" IS 'Page/catalog number (exposed as pg_no in static data queries).';
COMMENT ON COLUMN public.raw_materials.itemname IS 'Item name (exposed as item_name in static data queries).';
COMMENT ON COLUMN public.raw_materials.comments IS 'Optional notes from Raw Materials tab.';

CREATE UNIQUE INDEX IF NOT EXISTS raw_materials_itemname_key
    ON public.raw_materials (itemname);

CREATE INDEX IF NOT EXISTS raw_materials_pgno_idx
    ON public.raw_materials ("pgNo");

ALTER TABLE IF EXISTS public.raw_materials OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials TO poc;
