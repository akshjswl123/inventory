-- Optional: enforce one catalog row per (pgNo, itemname) at DB level.
-- App upsert already matches on TRIM(pgNo) + LOWER(TRIM(itemname)).
--
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/10_raw_materials_pgno_itemname_unique.sql

CREATE UNIQUE INDEX IF NOT EXISTS raw_materials_pgno_itemname_lower_key
    ON public.raw_materials (
        TRIM(COALESCE("pgNo", '')),
        LOWER(TRIM(itemname))
    );
