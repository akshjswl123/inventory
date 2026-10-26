-- item_versions: item_type = target table name (dishes, dish_cost_staging, raw_materials_cost, scoop_config).
-- item_code keys:
--   dishes            → UPPER(TRIM(dish_code))     recipe version (Recipe Maker Save to DB)
--   dish_cost_staging → UPPER(TRIM(dish_code))     published cost version (dish_cost_staging)
--   raw_materials_cost→ UPPER(TRIM("pgNo"))        e.g. V10
--   scoop_config      → LOWER(TRIM(scoop_name))

DROP TABLE IF EXISTS public.item_versions CASCADE;

CREATE TABLE public.item_versions
(
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    item_code text COLLATE pg_catalog."default" NOT NULL,
    item_type text COLLATE pg_catalog."default" NOT NULL,
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT item_versions_pkey PRIMARY KEY (id),
    CONSTRAINT item_versions_code_type_key UNIQUE (item_code, item_type),
    CONSTRAINT item_versions_item_type_check CHECK (
        item_type IN ('dishes', 'raw_materials_cost', 'scoop_config', 'dish_cost_staging')
    ),
    CONSTRAINT item_versions_version_positive CHECK (version >= 1)
) TABLESPACE pg_default;

ALTER TABLE public.item_versions OWNER TO poc;
GRANT ALL ON TABLE public.item_versions TO poc;

DROP TRIGGER IF EXISTS item_versions_touch_last_updated_at ON public.item_versions;
CREATE TRIGGER item_versions_touch_last_updated_at
    BEFORE UPDATE ON public.item_versions
    FOR EACH ROW EXECUTE FUNCTION public.touch_last_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_item_version_code(
    p_item_code text,
    p_item_type text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_type text := TRIM(p_item_type);
    v_code text := TRIM(p_item_code);
BEGIN
    IF v_code IS NULL OR v_code = '' THEN
        RETURN NULL;
    END IF;
    IF v_type = 'scoop_config' THEN
        RETURN LOWER(v_code);
    END IF;
    RETURN UPPER(v_code);
END;
$$;

ALTER FUNCTION public.normalize_item_version_code(text, text) OWNER TO poc;

CREATE OR REPLACE FUNCTION public.bump_item_version(
    p_item_code text,
    p_item_type text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_type text := TRIM(p_item_type);
    v_code text := public.normalize_item_version_code(p_item_code, v_type);
    v_version integer;
BEGIN
    IF v_code IS NULL OR v_code = '' THEN
        RAISE EXCEPTION 'item_code is required';
    END IF;
    IF v_type IS NULL OR v_type NOT IN ('dishes', 'raw_materials_cost', 'scoop_config', 'dish_cost_staging') THEN
        RAISE EXCEPTION 'item_type must be dishes, raw_materials_cost, scoop_config, or dish_cost_staging';
    END IF;

    INSERT INTO public.item_versions (item_code, item_type, version)
    VALUES (v_code, v_type, 1)
    ON CONFLICT (item_code, item_type)
    DO UPDATE SET
        version = public.item_versions.version + 1,
        last_updated_at = CURRENT_TIMESTAMP
    RETURNING version INTO v_version;

    RETURN v_version;
END;
$$;

ALTER FUNCTION public.bump_item_version(text, text) OWNER TO poc;

-- Examples (optional seed):
-- INSERT INTO public.item_versions (item_code, item_type, version) VALUES
--     ('D01', 'dishes', 1),
--     ('D01', 'dish_cost_staging', 1),
--     ('V10', 'raw_materials_cost', 1),
--     ('amul cream_gm_reciepe', 'scoop_config', 1)
-- ON CONFLICT (item_code, item_type) DO NOTHING;
