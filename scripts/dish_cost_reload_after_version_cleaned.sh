#!/usr/bin/env bash
# Truncate dish_cost_staging_after_version, import raw after-version CSV, keep last block per dish.
# Usage: ./scripts/dish_cost_reload_after_version_cleaned.sh [csv_path] [database]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSV="${1:-$ROOT/data/dishCostFromQueryTabCounterAfterVersionColumnAddition.csv}"
DB="${2:-poc}"
CONTAINER="${POC_DB_CONTAINER:-poc_db}"

if [[ ! -f "$CSV" ]]; then
  echo "CSV not found: $CSV" >&2
  exit 1
fi

echo "Importing raw export into dish_cost_staging ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c "TRUNCATE public.dish_cost_staging;"
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy public.dish_cost_staging FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')" < "$CSV"

echo "Cleaning → dish_cost_staging_after_version (truncate + last block per dish) ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 \
  < "$ROOT/scripts/useful_queries/dish_cost_staging_after_version_clean.sql"

echo "Done."
