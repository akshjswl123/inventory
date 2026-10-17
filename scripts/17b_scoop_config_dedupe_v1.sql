-- =============================================================================
-- Deduplicate scoop_config by LOWER(TRIM(scoop_name)), keep one row (prefer used, max id)
-- Leaves version as-is (all v1 after script 15). Safe before unique index.
-- Run: psql ... -f scripts/17b_scoop_config_dedupe_v1.sql
-- =============================================================================

BEGIN;

DELETE FROM public.scoop_config sc
WHERE sc.id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY LOWER(TRIM(scoop_name))
                ORDER BY COALESCE(unused, false) ASC, id DESC
            ) AS rn
        FROM public.scoop_config
        WHERE scoop_name IS NOT NULL AND TRIM(scoop_name) <> ''
    ) d
    WHERE d.rn > 1
);

-- Optional uniqueness for future inserts (comment out if you prefer soft dedupe only)
-- CREATE UNIQUE INDEX IF NOT EXISTS scoop_config_scoop_name_lower_uidx
--     ON public.scoop_config (LOWER(TRIM(scoop_name)));

COMMIT;

SELECT
    count(*) AS scoop_rows,
    count(DISTINCT LOWER(TRIM(scoop_name))) AS distinct_names
FROM public.scoop_config
WHERE scoop_name IS NOT NULL AND TRIM(scoop_name) <> '';
