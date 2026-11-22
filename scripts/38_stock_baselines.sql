-- stock_baselines — physical verification anchor per pgNo (ACTIVE / RETIRED)
-- Apply: psql -h localhost -p 5433 -U poc -d poc -f scripts/38_stock_baselines.sql
-- Then: psql ... -f scripts/32_current_stock_by_pgno.sql

CREATE TABLE IF NOT EXISTS public.stock_baselines
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    pgno text COLLATE pg_catalog."default" NOT NULL,
    baseline_date date NOT NULL,
    qty_gm numeric,
    qty_ml numeric,
    qty_piece numeric,
    qty_gm_calculated_at_time_of_override numeric,
    qty_ml_calculated_at_time_of_override numeric,
    qty_piece_calculated_at_time_of_override numeric,
    verified_by text COLLATE pg_catalog."default",
    status text COLLATE pg_catalog."default" NOT NULL DEFAULT 'ACTIVE',
    remarks text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by text COLLATE pg_catalog."default",
    CONSTRAINT stock_baselines_pkey PRIMARY KEY (id),
    CONSTRAINT stock_baselines_status_check CHECK (LOWER(TRIM(status)) IN ('active', 'retired'))
);

ALTER TABLE IF EXISTS public.stock_baselines OWNER TO poc;
GRANT ALL ON TABLE public.stock_baselines TO poc;

CREATE UNIQUE INDEX IF NOT EXISTS stock_baselines_one_active_per_pgno
    ON public.stock_baselines (TRIM(pgno))
    WHERE LOWER(TRIM(status)) = 'active';

DROP TRIGGER IF EXISTS stock_baselines_touch_last_updated_at ON public.stock_baselines;
-- Optional updated_at if you add column later