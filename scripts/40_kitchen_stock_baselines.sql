-- kitchen_stock_baselines — kitchen physical count per pgNo (ACTIVE / RETIRED)
-- Apply: psql -h localhost -p 5433 -U poc -d poc -f scripts/40_kitchen_stock_baselines.sql

CREATE TABLE IF NOT EXISTS public.kitchen_stock_baselines
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    pgno text COLLATE pg_catalog."default" NOT NULL,
    baseline_date date NOT NULL,
    qty_gm numeric,
    qty_ml numeric,
    qty_piece numeric,
    verified_by text COLLATE pg_catalog."default",
    status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'ACTIVE',
    remarks text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by text COLLATE pg_catalog."default",
    CONSTRAINT kitchen_stock_baselines_pkey PRIMARY KEY (id),
    CONSTRAINT kitchen_stock_baselines_status_check CHECK (LOWER(TRIM(status)) IN ('active', 'retired'))
);

ALTER TABLE IF EXISTS public.kitchen_stock_baselines OWNER TO poc;
GRANT ALL ON TABLE public.kitchen_stock_baselines TO poc;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_stock_baselines_one_active_per_pgno
    ON public.kitchen_stock_baselines (TRIM(pgno))
    WHERE LOWER(TRIM(status)) = 'active';