-- Per-dish recipe version at cost-calc time (from item_versions / recipe_entries).
-- dish_cost_version = global snapshot run id for the whole batch — NOT recipe version.
-- Prerequisite: scripts/16_dish_cost_staging_version.sql

ALTER TABLE public.dish_cost_staging
    ADD COLUMN IF NOT EXISTS recipe_version text COLLATE pg_catalog."default";
