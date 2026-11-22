-- Clear blanket unused markers on raw_materials (selection now in raw_material_selected_scoop).
-- Re-run safe: only clears comments that are exactly 'unused'.
-- docker exec -i poc_db psql -U poc -d poc -f - < scripts/35_clear_raw_materials_unused_comments.sql

UPDATE public.raw_materials
SET comments = ''
WHERE LOWER(TRIM(COALESCE(comments, ''))) = 'unused';