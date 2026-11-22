-- raw_materials_default_scoop — highest-factor scoop per pgNo for raw_materials_destination_unit dest
-- Apply: docker exec -i poc_db psql -U poc -d poc -f - < scripts/39_raw_materials_default_scoop.sql
-- Populate: PGPORT=5433 node scripts/populate_raw_materials_default_scoop.js

CREATE TABLE IF NOT EXISTS public.raw_materials_default_scoop
(
    pg_no text COLLATE pg_catalog."default" NOT NULL,
    destination_unit text COLLATE pg_catalog."default" NOT NULL,
    scoop_name text COLLATE pg_catalog."default",
    factor numeric,
    source text COLLATE pg_catalog."default" DEFAULT 'scoop_config',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_default_scoop_pkey PRIMARY KEY (pg_no),
    CONSTRAINT raw_materials_default_scoop_dest_check
        CHECK (LOWER(TRIM(destination_unit)) IN ('gm', 'ml', 'piece'))
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.raw_materials_default_scoop OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials_default_scoop TO poc;

DROP TRIGGER IF EXISTS raw_materials_default_scoop_touch_last_updated_at ON public.raw_materials_default_scoop;
CREATE TRIGGER raw_materials_default_scoop_touch_last_updated_at
    BEFORE UPDATE ON public.raw_materials_default_scoop
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();