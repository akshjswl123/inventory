-- dish_cost_staging.dish_cost_version: global snapshot run id per "calculate all" or cascade batch
-- (same value on every row in that batch). This is NOT recipe version — see recipe_version (script 19).

ALTER TABLE public.dish_cost_staging
    ADD COLUMN IF NOT EXISTS dish_cost_version text COLLATE pg_catalog."default";

UPDATE public.dish_cost_staging
SET dish_cost_version = '1'
WHERE dish_cost_version IS NULL OR TRIM(dish_cost_version) = '';

ALTER TABLE public.dish_cost_staging
    ALTER COLUMN dish_cost_version SET DEFAULT '1';
