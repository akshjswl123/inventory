-- =============================================================================
-- Backfill scoop_config factor / conversion_chain / qty for rows seeded before
-- SCOOP_UNIT_DEFAULTS were applied (seed SQL uses WHERE NOT EXISTS on scoop_name).
--
-- Run after pulling fixed seeds:
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/08_scoop_config_backfill.sql
-- =============================================================================

BEGIN;

-- gm in / out / reciepe
UPDATE public.scoop_config
SET factor = 1,
    conversion_chain = 'gm:1:gm',
    qty_in_grams = 1,
    destination_unit = COALESCE(NULLIF(TRIM(destination_unit), ''), 'gm')
WHERE factor IS NULL
  AND scoop_name ~* '_gm_(in|out|reciepe)$';

-- kg in / out
UPDATE public.scoop_config
SET factor = 1000,
    conversion_chain = 'kg:1000:gm',
    qty_in_grams = 1000,
    destination_unit = COALESCE(NULLIF(TRIM(destination_unit), ''), 'gm')
WHERE factor IS NULL
  AND scoop_name ~* '_kg_(in|out)$';

-- ml in / out
UPDATE public.scoop_config
SET factor = 1,
    conversion_chain = 'ml:1:ml',
    qty_in_ml = 1,
    destination_unit = COALESCE(NULLIF(TRIM(destination_unit), ''), 'ml')
WHERE factor IS NULL
  AND scoop_name ~* '_ml_(in|out)$';

-- piece in / out
UPDATE public.scoop_config
SET factor = 1,
    conversion_chain = 'piece:1:piece',
    qty_in_piece = 1,
    destination_unit = COALESCE(NULLIF(TRIM(destination_unit), ''), 'piece')
WHERE factor IS NULL
  AND scoop_name ~* '_piece_(in|out)$';

-- pkt in / out
UPDATE public.scoop_config
SET factor = 500,
    conversion_chain = 'pkt:500:gm',
    qty_in_grams = 500,
    destination_unit = COALESCE(NULLIF(TRIM(destination_unit), ''), 'gm')
WHERE factor IS NULL
  AND scoop_name ~* '_pkt_(in|out)$';

-- dish portion scoops
UPDATE public.scoop_config
SET factor = 1,
    qty_in_piece = 1,
    destination_unit = COALESCE(NULLIF(TRIM(destination_unit), ''), 'portion')
WHERE factor IS NULL
  AND scoop_name ~* '_1_portion$';

-- other purchase scoops
UPDATE public.scoop_config
SET factor = 1,
    qty_in_piece = 1,
    destination_unit = COALESCE(NULLIF(TRIM(destination_unit), ''), 'other')
WHERE factor IS NULL
  AND scoop_name ~* '_other_in$';

-- Remove erroneous multi-unit scoops on dishes (legacy auto-create)
DELETE FROM public.scoop_config sc
WHERE sc.scoop_name ~* '_(kg|ml|piece|pkt)_(in|out|reciepe)$'
  AND EXISTS (
    SELECT 1 FROM public.dishes d
    WHERE LOWER(TRIM(d.dish_name)) = LOWER(TRIM(sc.scoop_item_name))
  );

COMMIT;
