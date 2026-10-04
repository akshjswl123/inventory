-- =============================================================================
-- Table: public.dish_cost
-- One row per line from dish_cost_cases.sql (row_kind = line | dish_total).
-- Paste into Query tab or: psql -f scripts/11_dish_cost.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dish_cost
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY (
        INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1
    ),
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
    rate numeric(16, 6),
    line_cost numeric(16, 4),
    is_usable_in_other_dish boolean,
    out_scoop text COLLATE pg_catalog."default",
    qty_of_scoops numeric,
    out_unit text COLLATE pg_catalog."default",
    out_factor numeric,
    dish_cost numeric(16, 4),
    cost_of_one_scoop numeric(16, 4),
    rate_per_destination_unit numeric(16, 6),
    incomplete boolean,
    cost_calculation text COLLATE pg_catalog."default",
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dish_cost_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.dish_cost OWNER TO poc;
GRANT ALL ON TABLE public.dish_cost TO poc;

DROP TRIGGER IF EXISTS dish_cost_touch_last_updated_at ON public.dish_cost;
CREATE TRIGGER dish_cost_touch_last_updated_at
    BEFORE UPDATE ON public.dish_cost
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

CREATE INDEX IF NOT EXISTS dish_cost_dish_code_idx
    ON public.dish_cost (dish_code);

CREATE INDEX IF NOT EXISTS dish_cost_row_kind_idx
    ON public.dish_cost (row_kind);

CREATE INDEX IF NOT EXISTS dish_cost_created_at_idx
    ON public.dish_cost (created_at DESC);

-- Example: load from dish_cost_cases.sql (edit params at top of that file first)
-- INSERT INTO public.dish_cost (
--     row_kind, dish_code, dishname, dish_case, line_kind, itemname,
--     "pgNo_or_dishCode", receipescoop, qty, destination_unit, scoop_factor,
--     rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
--     out_unit, out_factor, dish_cost, cost_of_one_scoop,
--     rate_per_destination_unit, incomplete, cost_calculation
-- )
-- SELECT
--     row_kind, dish_code, dishname, dish_case, line_kind, itemname,
--     "pgNo_or_dishCode", receipescoop, qty, destination_unit, scoop_factor,
--     rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
--     out_unit, out_factor, dish_cost, cost_of_one_scoop,
--     rate_per_destination_unit, incomplete, cost_calculation
-- FROM (
--     -- paste full dish_cost_cases.sql here as subquery, or use a saved view
-- ) AS src;
