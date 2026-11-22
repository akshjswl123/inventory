-- raw_material_selected_scoop: pgNo or dishcode → chosen scoop name (scoop names UI)
-- Apply on existing DBs: docker exec -i poc_db psql -U poc -d poc -f - < scripts/34_raw_material_selected_scoop.sql

CREATE TABLE IF NOT EXISTS public.raw_material_selected_scoop
(
    pg_no_or_dishcode text COLLATE pg_catalog."default" NOT NULL,
    selected_scoop_name text COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT raw_material_selected_scoop_pkey PRIMARY KEY (pg_no_or_dishcode)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.raw_material_selected_scoop OWNER TO poc;
GRANT ALL ON TABLE public.raw_material_selected_scoop TO poc;