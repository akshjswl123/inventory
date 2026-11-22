-- =============================================================================
-- REMOVED: current_stock_by_pgno_as_of(date)
-- Stock is ONLY public.current_stock_by_pgno (view): baseline + in/out after baseline.
-- Apply: psql -h localhost -p 5433 -U poc -d poc -f scripts/33_current_stock_by_pgno_as_of.sql
-- =============================================================================

DROP FUNCTION IF EXISTS public.current_stock_by_pgno_as_of(date);