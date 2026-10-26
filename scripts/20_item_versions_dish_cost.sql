-- Per-dish published cost counter (item_versions.item_type = 'dish_cost_staging').
-- Bumps when rows are appended to dish_cost_staging for that dish_code.
-- Recipe version stays item_type = 'dishes' (Recipe Maker Save to DB only).

ALTER TABLE public.item_versions DROP CONSTRAINT IF EXISTS item_versions_item_type_check;

ALTER TABLE public.item_versions
    ADD CONSTRAINT item_versions_item_type_check CHECK (
        item_type IN ('dishes', 'raw_materials_cost', 'scoop_config', 'dish_cost_staging')
    );

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

ALTER TABLE public.dish_cost_staging
    ADD COLUMN IF NOT EXISTS cost_version text COLLATE pg_catalog."default";

INSERT INTO public.item_versions (item_code, item_type, version)
SELECT DISTINCT UPPER(TRIM(dishcode)), 'dish_cost_staging', 1
FROM public.recipe_entries
WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
ON CONFLICT (item_code, item_type) DO NOTHING;
