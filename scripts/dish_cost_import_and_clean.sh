#!/usr/bin/env bash
# Import dish cost CSV into staging, run clean SQL, export cleaned CSV.
# Usage: ./scripts/dish_cost_import_and_clean.sh [csv_path] [database]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSV="${1:-$ROOT/data/dishCostFromQueryTabCounterDb.csv}"
DB="${2:-poc}"
CONTAINER="${POC_DB_CONTAINER:-poc_db}"
OUT="${CSV%.csv}_cleaned.csv"

if [[ ! -f "$CSV" ]]; then
  echo "CSV not found: $CSV" >&2
  exit 1
fi

echo "Truncating dish_cost_staging and importing $CSV ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c "TRUNCATE public.dish_cost_staging;"

docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy public.dish_cost_staging FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')" < "$CSV"

echo "Running dish_cost_staging_clean.sql ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 \
  < "$ROOT/scripts/useful_queries/dish_cost_staging_clean.sql"

echo "Exporting to $OUT ..."
docker exec "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy (
    SELECT row_kind, dish_code, dishname, dish_case, line_kind, itemname,
           \"pgNo_or_dishCode\", receipescoop, qty, destination_unit, scoop_factor,
           rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
           out_unit, out_factor, dish_cost, cost_of_one_scoop,
           rate_per_destination_unit, incomplete, cost_calculation
    FROM public.dish_cost_cleaned_up
    ORDER BY sort_seq
  ) TO STDOUT WITH (FORMAT csv, HEADER true, NULL '')" > "$OUT"

echo "Done. Cleaned rows: $(wc -l < "$OUT" | tr -d ' ') lines (incl. header)"
