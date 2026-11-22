-- =============================================================================
-- SELECT current stock by pgNo (preview)
-- =============================================================================
-- Same definition as view public.current_stock_by_pgno (scripts/32_current_stock_by_pgno.sql).
-- Apply: psql ... -f scripts/38_stock_baselines.sql
--        psql ... -f scripts/32_current_stock_by_pgno.sql
-- API: GET /api/current-stock/by-pgno[?pgNo=...]
-- =============================================================================

SELECT *
FROM public.current_stock_by_pgno
ORDER BY "pgNo";
