-- =============================================================================
-- Delete scoop_config rows by id (e.g. after exporting your ~2590-row preview).
--
-- 1) Export candidates:
--    \copy (SELECT id FROM ...your preview query...) TO '/tmp/scoop_delete_ids.csv' CSV HEADER
-- 2) Load into a temp table and delete:
-- =============================================================================

BEGIN;

CREATE TEMP TABLE scoop_config_delete_ids (id bigint PRIMARY KEY);

-- Paste ids from your preview, or \copy from CSV:
-- \copy scoop_config_delete_ids FROM '/tmp/scoop_delete_ids.csv' CSV HEADER

-- Example:
-- INSERT INTO scoop_config_delete_ids (id) VALUES (123), (456);

DELETE FROM public.scoop_config sc
USING scoop_config_delete_ids d
WHERE sc.id = d.id;

-- SELECT COUNT(*) FROM scoop_config_delete_ids;  -- should match DELETE row count

-- COMMIT;
ROLLBACK;
