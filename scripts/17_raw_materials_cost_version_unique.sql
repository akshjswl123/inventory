-- =============================================================================
-- raw_materials_cost: one row per (pgNo, version) for append-only rate history
-- Prerequisite: scripts/14 + 15 (version column + item_versions)
-- Run: psql ... -f scripts/17_raw_materials_cost_version_unique.sql
-- =============================================================================

BEGIN;

-- 1) Within each version, keep one row per pgNo (latest last_updated_at / id)
DELETE FROM public.raw_materials_cost r
WHERE r.id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY UPPER(TRIM("pgNo")), version
                ORDER BY last_updated_at DESC NULLS LAST, id DESC
            ) AS rn
        FROM public.raw_materials_cost
        WHERE "pgNo" IS NOT NULL AND TRIM("pgNo") <> ''
    ) d
    WHERE d.rn > 1
);

-- 2) Replace unique (pgNo, based_on_billno) with (pgNo, version)
ALTER TABLE public.raw_materials_cost
    DROP CONSTRAINT IF EXISTS raw_materials_cost_pgno_billno_key;

ALTER TABLE public.raw_materials_cost
    DROP CONSTRAINT IF EXISTS raw_materials_cost_pgno_version_key;

ALTER TABLE public.raw_materials_cost
    ADD CONSTRAINT raw_materials_cost_pgno_version_key UNIQUE ("pgNo", version);

COMMIT;

SELECT
    count(*) AS rmc_rows,
    count(DISTINCT UPPER(TRIM("pgNo"))) AS distinct_pgno
FROM public.raw_materials_cost;
