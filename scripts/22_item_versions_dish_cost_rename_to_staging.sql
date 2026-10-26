-- Rename legacy item_type 'dish_cost' → 'dish_cost_staging' (table-name convention).
-- Safe if you already ran an older scripts/20 that used 'dish_cost'.

UPDATE public.item_versions
SET item_type = 'dish_cost_staging'
WHERE item_type = 'dish_cost';

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
