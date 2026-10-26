-- Manual dish / total cost overrides for Item Report summary (per channel, date, item)
CREATE TABLE IF NOT EXISTS public.item_report_summary_costs
(
    channel text NOT NULL,
    report_date date NOT NULL,
    item_name text NOT NULL,
    dish_cost numeric,
    total_dish_cost numeric,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT item_report_summary_costs_pkey PRIMARY KEY (channel, report_date, item_name)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.item_report_summary_costs OWNER TO poc;
GRANT ALL ON TABLE public.item_report_summary_costs TO poc;

DROP TRIGGER IF EXISTS item_report_summary_costs_touch_last_updated_at ON public.item_report_summary_costs;
CREATE TRIGGER item_report_summary_costs_touch_last_updated_at
    BEFORE UPDATE ON public.item_report_summary_costs
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();
