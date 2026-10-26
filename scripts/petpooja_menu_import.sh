#!/usr/bin/env bash
# Load data/petpooja_menu.csv into public.petpooja_menu (rewrites duplicate "Available" headers).
# Usage: ./scripts/petpooja_menu_import.sh [csv_path] [database]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSV="${1:-$ROOT/data/petpooja_menu.csv}"
DB="${2:-poc}"
CONTAINER="${POC_DB_CONTAINER:-poc_db}"

if [[ ! -f "$CSV" ]]; then
  echo "CSV not found: $CSV" >&2
  exit 1
fi

echo "Ensuring petpooja_menu table ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 \
  < "$ROOT/scripts/29_petpooja_menu.sql"

echo "Truncating petpooja_menu and importing $CSV ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c "TRUNCATE public.petpooja_menu;"

COPY_COLS="item_id,category_name,item_name,sap_code,item_short_code,item_short_code1,item_description,expose_to_online,online_display_name,is_favorite,item_base_price,container_charge,dietary,home_delivery_price,home_delivery_available,garden_price,garden_available,dining_price,dining_available,bar_price,bar_available,sofa_price,sofa_available,lounge_price,lounge_available,parcel_price,parcel_available,zomato_price,zomato_available,swiggy_price,swiggy_available"

python3 - "$CSV" <<'PY' | docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy public.petpooja_menu ($COPY_COLS) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')"
import csv
import sys

path = sys.argv[1]
out_cols = [
    "item_id", "category_name", "item_name", "sap_code", "item_short_code", "item_short_code1",
    "item_description", "expose_to_online", "online_display_name", "is_favorite",
    "item_base_price", "container_charge", "dietary",
    "home_delivery_price", "home_delivery_available",
    "garden_price", "garden_available",
    "dining_price", "dining_available",
    "bar_price", "bar_available",
    "sofa_price", "sofa_available",
    "lounge_price", "lounge_available",
    "parcel_price", "parcel_available",
    "zomato_price", "zomato_available",
    "swiggy_price", "swiggy_available",
]

def blank_to_none(v):
    if v is None:
        return None
    s = str(v).strip()
    return None if s == "" else s

with open(path, newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # skip PetPooja header (duplicate column names)
    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow(out_cols)
    for row in reader:
        if not row or all(not (c or "").strip() for c in row):
            continue
        if len(row) < 31:
            row = row + [""] * (31 - len(row))
        w.writerow([blank_to_none(c) for c in row[:31]])
PY

COUNT="$(docker exec "$CONTAINER" psql -U poc -d "$DB" -t -A -c "SELECT COUNT(*) FROM public.petpooja_menu;")"
echo "Done. petpooja_menu rows: $COUNT"
