-- raw_materials_destination_unit — one gm/ml/piece per pgNo (scoop-ScoopConfig.csv)
-- Apply: docker exec -i poc_db psql -U poc -d poc -f - < scripts/36_raw_materials_destination_unit.sql
-- Populate: PGPORT=5433 node scripts/populate_raw_materials_destination_unit.js

CREATE TABLE IF NOT EXISTS public.raw_materials_destination_unit
(
    pg_no text COLLATE pg_catalog."default" NOT NULL,
    destination_unit text COLLATE pg_catalog."default" NOT NULL,
    purchase_unit text COLLATE pg_catalog."default",
    scoop_factor numeric,
    conversion_chain text COLLATE pg_catalog."default",
    source text COLLATE pg_catalog."default" DEFAULT 'scoop-ScoopConfig.csv',
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT raw_materials_destination_unit_pkey PRIMARY KEY (pg_no),
    CONSTRAINT raw_materials_destination_unit_dest_check
        CHECK (LOWER(TRIM(destination_unit)) IN ('gm', 'ml', 'piece'))
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.raw_materials_destination_unit OWNER TO poc;
GRANT ALL ON TABLE public.raw_materials_destination_unit TO poc;

DROP TRIGGER IF EXISTS raw_materials_destination_unit_touch_last_updated_at ON public.raw_materials_destination_unit;
CREATE TRIGGER raw_materials_destination_unit_touch_last_updated_at
    BEFORE UPDATE ON public.raw_materials_destination_unit
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();