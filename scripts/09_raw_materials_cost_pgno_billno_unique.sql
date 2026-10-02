-- =============================================================================
-- raw_materials_cost: unique on ("pgNo", based_on_billno)
-- =============================================================================
-- Run on an existing DB (after 01_schema.sql) when the table still has only
-- UNIQUE ("pgNo"):
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/09_raw_materials_cost_pgno_billno_unique.sql
-- =============================================================================

ALTER TABLE public.raw_materials_cost
    DROP CONSTRAINT IF EXISTS raw_materials_cost_pgno_key;

ALTER TABLE public.raw_materials_cost
    DROP CONSTRAINT IF EXISTS raw_materials_cost_pgno_billno_key;

ALTER TABLE public.raw_materials_cost
    ADD CONSTRAINT raw_materials_cost_pgno_billno_key
    UNIQUE ("pgNo", based_on_billno);
