#!/usr/bin/env bash
# Load dishCostFromDB (cleaned CSV) into dish_cost_cleaned_up and run 16_seed_v1_from_dish_cost_db.sql
# Usage: ./scripts/dish_cost_seed_v1.sh [cleaned_csv_path] [database]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSV="${1:-$ROOT/data/dishCostFromQueryTabCounterDb_cleaned.csv}"
DB="${2:-poc}"
CONTAINER="${POC_DB_CONTAINER:-poc_db}"

if [[ ! -f "$CSV" ]]; then
  echo "CSV not found: $CSV" >&2
  exit 1
fi

echo "Applying migration 15 (version columns; run 14 once on empty DB) ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 \
  < "$ROOT/scripts/15_recipe_entries_and_raw_materials_cost_version.sql"

echo "Loading dishCostFromDB into dish_cost_cleaned_up ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 <<SQL
TRUNCATE public.dish_cost_staging;
SQL

docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy public.dish_cost_staging FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')" < "$CSV"

docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 <<SQL
TRUNCATE public.dish_cost_cleaned_up;
INSERT INTO public.dish_cost_cleaned_up (
    sort_seq, row_kind, dish_code, dishname, dish_case, line_kind, itemname,
    "pgNo_or_dishCode", receipescoop, qty, destination_unit, scoop_factor,
    rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
    out_unit, out_factor, dish_cost, cost_of_one_scoop,
    rate_per_destination_unit, incomplete, cost_calculation
)
SELECT
    row_number() OVER (ORDER BY ctid),
    row_kind, dish_code, dishname, dish_case, line_kind, itemname,
    "pgNo_or_dishCode", receipescoop, qty, destination_unit, scoop_factor,
    rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
    out_unit, out_factor, dish_cost, cost_of_one_scoop,
    rate_per_destination_unit, incomplete, cost_calculation
FROM public.dish_cost_staging;
SQL

echo "Running 16_seed_v1_from_dish_cost_db.sql ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 \
  < "$ROOT/scripts/16_seed_v1_from_dish_cost_db.sql"

echo "Seed v1 complete."
