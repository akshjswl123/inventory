#!/usr/bin/env bash
# Clean dishCostAfterVersion.csv → dish_cost_after_ersion (last block per dish)
# Preserve dish_cost_staging (baseline cleaned) via temp backup.
# Usage: ./scripts/dish_cost_clean_after_version_compare.sh [after_csv] [database]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AFTER_CSV="${1:-$ROOT/data/dishCostAfterVersion.csv}"
DB="${2:-poc}"
CONTAINER="${POC_DB_CONTAINER:-poc_db}"
OUT="${AFTER_CSV%.csv}_cleaned.csv"

if [[ ! -f "$AFTER_CSV" ]]; then
  echo "CSV not found: $AFTER_CSV" >&2
  exit 1
fi

echo "Backing up dish_cost_staging → temp ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
DROP TABLE IF EXISTS _staging_baseline_bak;
CREATE TABLE _staging_baseline_bak AS SELECT * FROM public.dish_cost_staging;
SQL

echo "Importing after-version CSV into dish_cost_staging ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c "TRUNCATE public.dish_cost_staging;"
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy public.dish_cost_staging FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')" < "$AFTER_CSV"

echo "Cleaning last block per dish → dish_cost_after_ersion ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE public.dish_cost_after_ersion;

WITH ordered AS (
    SELECT s.*, row_number() OVER (ORDER BY ctid) AS seq
    FROM public.dish_cost_staging s
),
with_seg AS (
    SELECT o.*,
        sum(
            CASE
                WHEN trim(coalesce(o.dish_code, '')) = ''
                 AND trim(coalesce(o.row_kind, '')) = ''
                 AND trim(coalesce(o.dishname, '')) = ''
                 AND trim(coalesce(o.itemname, '')) = ''
                THEN 1 ELSE 0
            END
        ) OVER (ORDER BY o.seq ROWS UNBOUNDED PRECEDING) AS seg
    FROM ordered o
),
segments AS (
    SELECT upper(trim(dish_code)) AS dish_code_key, seg, max(seq) AS seg_end
    FROM with_seg
    WHERE trim(coalesce(dish_code, '')) <> ''
    GROUP BY upper(trim(dish_code)), seg
),
last_seg AS (
    SELECT DISTINCT ON (dish_code_key) dish_code_key, seg
    FROM segments
    ORDER BY dish_code_key, seg_end DESC
)
INSERT INTO public.dish_cost_after_ersion (
    row_kind, dish_code, dishname, dish_case, line_kind, itemname,
    "pgNo_or_dishCode", receipescoop, qty, destination_unit, scoop_factor,
    rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
    out_unit, out_factor, dish_cost, cost_of_one_scoop,
    rate_per_destination_unit, incomplete, cost_calculation
)
SELECT
    w.row_kind, w.dish_code, w.dishname, w.dish_case, w.line_kind, w.itemname,
    w."pgNo_or_dishCode", w.receipescoop, w.qty, w.destination_unit, w.scoop_factor,
    w.rate, w.line_cost, w.is_usable_in_other_dish, w.out_scoop, w.qty_of_scoops,
    w.out_unit, w.out_factor, w.dish_cost, w.cost_of_one_scoop,
    w.rate_per_destination_unit, w.incomplete, w.cost_calculation
FROM with_seg w
INNER JOIN last_seg l
  ON upper(trim(w.dish_code)) = l.dish_code_key
 AND w.seg = l.seg
ORDER BY w.seq;

SELECT 'dish_cost_after_ersion' AS tbl, count(*) AS rows,
       count(*) FILTER (WHERE lower(trim(coalesce(row_kind,'')))='dish_total') AS totals
FROM public.dish_cost_after_ersion;
SQL

echo "Restoring dish_cost_staging from baseline backup ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE public.dish_cost_staging;
INSERT INTO public.dish_cost_staging SELECT * FROM _staging_baseline_bak;
DROP TABLE _staging_baseline_bak;
SELECT 'dish_cost_staging' AS tbl, count(*) AS rows,
       count(*) FILTER (WHERE lower(trim(coalesce(row_kind,'')))='dish_total') AS totals
FROM public.dish_cost_staging;
SQL

echo "Exporting cleaned after CSV → $OUT ..."
docker exec "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy (
    SELECT row_kind, dish_code, dishname, dish_case, line_kind, itemname,
           \"pgNo_or_dishCode\", receipescoop, qty, destination_unit, scoop_factor,
           rate, line_cost, is_usable_in_other_dish, out_scoop, qty_of_scoops,
           out_unit, out_factor, dish_cost, cost_of_one_scoop,
           rate_per_destination_unit, incomplete, cost_calculation
    FROM public.dish_cost_after_ersion
  ) TO STDOUT WITH (FORMAT csv, HEADER true, NULL '')" > "$OUT"

echo "Done. Cleaned after CSV: $OUT"
