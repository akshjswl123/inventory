-- Recipe Maker table (matches CSV export columns)
-- Run on existing DB: psql -U poc -d poc -f scripts/02_recipe_entries.sql

CREATE TABLE IF NOT EXISTS public.recipe_entries
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    dishname text COLLATE pg_catalog."default",
    dishcode text COLLATE pg_catalog."default",
    reciepeitemname text COLLATE pg_catalog."default",
    "pgNo" text COLLATE pg_catalog."default",
    receipescoop text COLLATE pg_catalog."default",
    qty numeric,
    "inGm" numeric,
    "inML" numeric,
    "inPiece" numeric,
    comments text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT recipe_entries_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.recipe_entries OWNER TO poc;
GRANT ALL ON TABLE public.recipe_entries TO poc;
