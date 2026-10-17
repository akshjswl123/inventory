-- dish_cost + staging (matches 01_schema.sql; for existing DBs without full schema re-run)
CREATE TABLE IF NOT EXISTS public.dish_cost_staging
(
    row_kind text COLLATE pg_catalog."default",
    dish_code text COLLATE pg_catalog."default",
    dishname text COLLATE pg_catalog."default",
    dish_case text COLLATE pg_catalog."default",
    line_kind text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    "pgNo_or_dishCode" text COLLATE pg_catalog."default",
    receipescoop text COLLATE pg_catalog."default",
    qty text COLLATE pg_catalog."default",
    destination_unit text COLLATE pg_catalog."default",
    scoop_factor text COLLATE pg_catalog."default",
    rate text COLLATE pg_catalog."default",
    line_cost text COLLATE pg_catalog."default",
    is_usable_in_other_dish text COLLATE pg_catalog."default",
    out_scoop text COLLATE pg_catalog."default",
    qty_of_scoops text COLLATE pg_catalog."default",
    out_unit text COLLATE pg_catalog."default",
    out_factor text COLLATE pg_catalog."default",
    dish_cost text COLLATE pg_catalog."default",
    cost_of_one_scoop text COLLATE pg_catalog."default",
    rate_per_destination_unit text COLLATE pg_catalog."default",
    incomplete text COLLATE pg_catalog."default",
    cost_calculation text COLLATE pg_catalog."default"
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.dish_cost_staging OWNER TO poc;
GRANT ALL ON TABLE public.dish_cost_staging TO poc;

CREATE TABLE IF NOT EXISTS public.dish_cost
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    row_kind text COLLATE pg_catalog."default",
    dish_code text COLLATE pg_catalog."default",
    dishname text COLLATE pg_catalog."default",
    dish_case text COLLATE pg_catalog."default",
    line_kind text COLLATE pg_catalog."default",
    itemname text COLLATE pg_catalog."default",
    "pgNo_or_dishCode" text COLLATE pg_catalog."default",
    receipescoop text COLLATE pg_catalog."default",
    qty numeric,
    destination_unit text COLLATE pg_catalog."default",
    scoop_factor numeric,
    rate numeric(16,6),
    line_cost numeric(16,4),
    is_usable_in_other_dish boolean,
    out_scoop text COLLATE pg_catalog."default",
    qty_of_scoops numeric,
    out_unit text COLLATE pg_catalog."default",
    out_factor numeric,
    dish_cost numeric(16,4),
    cost_of_one_scoop numeric(16,4),
    rate_per_destination_unit numeric(16,6),
    incomplete boolean,
    cost_calculation text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dish_cost_pkey PRIMARY KEY (id),
    CONSTRAINT dish_cost_dish_code_key UNIQUE (dish_code)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.dish_cost OWNER TO poc;
GRANT ALL ON TABLE public.dish_cost TO poc;

DROP TRIGGER IF EXISTS dish_cost_touch_last_updated_at ON public.dish_cost;
CREATE TRIGGER dish_cost_touch_last_updated_at
    BEFORE UPDATE ON public.dish_cost
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();
