#!/usr/bin/env bash
# Run dish cost for ALL dishes in one SQL statement (no Query-tab loop).
# Uses scripts/useful_queries/dish_cost_cases.sql
#   params: dishcode NULL, dishname NULL  → every dish with a recipe.
#
# Usage:
#   ./scripts/dish_cost_all_via_sql.sh
#   ./scripts/dish_cost_all_via_sql.sh data/dishCostAllViaSql.csv poc
#   LOAD_AFTER=1 ./scripts/dish_cost_all_via_sql.sh   # also fill dish_cost_after_ersion
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/data/dishCostAllViaSql.csv}"
DB="${2:-poc}"
CONTAINER="${POC_DB_CONTAINER:-poc_db}"
SQL="$ROOT/scripts/useful_queries/dish_cost_cases.sql"

if [[ ! -f "$SQL" ]]; then
  echo "Missing $SQL" >&2
  exit 1
fi

echo "Running dish_cost_cases.sql (all dishes) on $DB → permanent staging table ..."
{
  echo "DROP TABLE IF EXISTS public.dish_cost_sql_run;"
  echo "CREATE TABLE public.dish_cost_sql_run AS"
  sed 's/;[[:space:]]*$//' "$SQL"
  echo ";"
  echo "SELECT count(*) AS rows,"
  echo "       count(*) FILTER (WHERE row_kind = 'dish_total') AS dish_totals"
  echo "FROM public.dish_cost_sql_run;"
} | docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1

docker exec "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy (
    SELECT * FROM public.dish_cost_sql_run
    ORDER BY dishname, dish_code, row_kind DESC, itemname NULLS LAST
  ) TO STDOUT WITH (FORMAT csv, HEADER true, NULL '')" > "$OUT"

echo "Exported: $OUT ($(wc -l < "$OUT" | tr -d ' ') lines incl. header)"

if [[ "${LOAD_AFTER:-0}" == "1" ]]; then
  echo "Loading into dish_cost_after_ersion ..."
  docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE public.dish_cost_after_ersion;
INSERT INTO public.dish_cost_after_ersion (
    row_kind, dish_code, dishname, dish_case, line_kind, itemname,
    "pgNo_or_dishCode", receipescoop, qty, destination_unit, scoop_factor,
    rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
    out_unit, out_factor, dish_cost, cost_of_one_scoop,
    rate_per_destination_unit, incomplete, cost_calculation
)
SELECT
    row_kind::text,
    dish_code::text,
    dishname::text,
    dish_case::text,
    line_kind::text,
    itemname::text,
    "pgNo_or_dishCode"::text,
    receipescoop::text,
    qty::text,
    destination_unit::text,
    scoop_factor::text,
    rate::text,
    line_cost::text,
    is_usable_in_other_dish::text,
    out_scoop::text,
    qty_of_scoops::text,
    out_unit::text,
    out_factor::text,
    dish_cost::text,
    cost_of_one_scoop::text,
    rate_per_destination_unit::text,
    incomplete::text,
    cost_calculation::text
FROM public.dish_cost_sql_run
ORDER BY dishname, dish_code, row_kind DESC, itemname NULLS LAST;

SELECT count(*) AS after_ersion_rows,
       count(*) FILTER (WHERE lower(trim(coalesce(row_kind,'')))='dish_total') AS dish_totals
FROM public.dish_cost_after_ersion;
SQL
fi

echo "Done."
echo "  Table: public.dish_cost_sql_run"
echo "  CSV:   $OUT"
echo "  Compare (after LOAD_AFTER=1):"
echo "    docker exec -i $CONTAINER psql -U poc -d $DB < scripts/useful_queries/compare_staging_vs_after_ersion.sql"
