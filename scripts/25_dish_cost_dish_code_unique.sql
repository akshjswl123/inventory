-- dish_cost: one loaded total per dish_code; upsert from staging uses highest dish_cost_version per code.
ALTER TABLE public.dish_cost DROP CONSTRAINT IF EXISTS dish_cost_code_name_key;
ALTER TABLE public.dish_cost DROP CONSTRAINT IF EXISTS dish_cost_dish_code_key;
ALTER TABLE public.dish_cost
    ADD CONSTRAINT dish_cost_dish_code_key UNIQUE (dish_code);
