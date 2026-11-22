-- raw_materials_storage — physical rack per pgNo (Rack column in scoop-ScoopConfig.csv)
-- Apply: docker exec -i poc_db psql -U poc -d poc -f - < scripts/37_raw_materials_storage.sql
-- Populate: PGPORT=5433 node scripts/populate_raw_materials_storage.js

CREATE TABLE IF NOT EXISTS public.raw_materials_storage
(
    pg_no text COLLATE pg_catalog."default" NOT NULL,
    storage text COLLATE pg_catalog."default",
    source text COLLATE pg_catalog."default" DEFAULT 'scoop-ScoopConfig.csv',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_storage_pkey PRIMARY KEY (pg_no)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.raw_materials_storage OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials_storage TO poc;

DROP TRIGGER IF EXISTS raw_materials_storage_touch_last_updated_at ON public.raw_materials_storage;
CREATE TRIGGER raw_materials_storage_touch_last_updated_at
    BEFORE UPDATE ON public.raw_materials_storage
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();