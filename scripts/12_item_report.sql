-- Item report lines (POS export: one row per item per invoice)
CREATE TABLE IF NOT EXISTS public.item_report_lines
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    report_date date NOT NULL,
    invoice_no text NOT NULL,
    item_name text NOT NULL,
    area text NOT NULL,
    qty numeric NOT NULL,
    event_timestamp timestamp with time zone,
    payment_type text,
    order_type text,
    price numeric,
    sub_total numeric,
    discount numeric,
    tax numeric,
    final_total numeric,
    status text,
    table_no text,
    server_name text,
    covers numeric,
    variation text,
    category text,
    group_name text,
    hsn text,
    phone text,
    customer_name text,
    address text,
    gst text,
    assign_to text,
    non_taxable numeric,
    line_total numeric,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT item_report_lines_pkey PRIMARY KEY (id),
    CONSTRAINT item_report_lines_invoice_date_item_area_key
        UNIQUE (invoice_no, report_date, item_name, area)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.item_report_lines OWNER TO poc;
GRANT ALL ON TABLE public.item_report_lines TO poc;

DROP TRIGGER IF EXISTS item_report_lines_touch_last_updated_at ON public.item_report_lines;
CREATE TRIGGER item_report_lines_touch_last_updated_at
    BEFORE UPDATE ON public.item_report_lines
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();
