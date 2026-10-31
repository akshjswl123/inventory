-- =============================================================================
-- SELECT current stock by pgNo (preview)
-- =============================================================================
-- Same definition as view public.current_stock_by_pgno (scripts/32_current_stock_by_pgno.sql).
-- Apply view on DB: psql ... -f scripts/32_current_stock_by_pgno.sql
-- As-of date API: psql ... -f scripts/33_current_stock_by_pgno_as_of.sql
--   GET /api/current-stock/by-pgno?asOf=YYYY-MM-DD[&pgNo=...]
-- =============================================================================

SELECT *
FROM public.current_stock_by_pgno
ORDER BY "pgNo";
