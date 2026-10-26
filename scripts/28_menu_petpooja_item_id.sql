-- PetPooja item id on channel menu tables (existing DBs)
--   psql -h localhost -p 5432 -U poc -d poc -f scripts/28_menu_petpooja_item_id.sql

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['dinein_menu', 'zomato_menu', 'swiggy_menu']
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t
              AND column_name = 'petpoojaItemID'
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I RENAME COLUMN "petpoojaItemID" TO petpooja_item_id',
                t
            );
        ELSE
            EXECUTE format(
                'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS petpooja_item_id text',
                t
            );
        END IF;
    END LOOP;
END $$;
