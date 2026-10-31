#!/usr/bin/env bash
# Load PetPooja base menu CSV into public.petpooja_basemenu.
# Usage: ./scripts/petpooja_basemenu_import.sh [csv_path] [database]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSV="${1:-$ROOT/data/Base_Menu_2026-10-29 (1).csv}"
DB="${2:-poc}"
CONTAINER="${POC_DB_CONTAINER:-poc_db}"

if [[ ! -f "$CSV" ]]; then
  echo "CSV not found: $CSV" >&2
  exit 1
fi

echo "Ensuring petpooja_basemenu table ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 \
  < "$ROOT/scripts/31_petpooja_basemenu.sql"

echo "Truncating petpooja_basemenu and importing $CSV ..."
docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c "TRUNCATE public.petpooja_basemenu;"

COPY_COLS="item_id,category,item_name,variation,online_display_name,item_type,price,description,dietary,short_code,sap_code,hsn_code,weight,weight_unit,item_rank,packing_charges,expose_in_captain,goods_or_services,allow_decimal_qty,manufacturing_date,expiry_date,dine_in_qr"

python3 - "$CSV" <<'PY' | docker exec -i "$CONTAINER" psql -U poc -d "$DB" -v ON_ERROR_STOP=1 -c \
  "\\copy public.petpooja_basemenu ($COPY_COLS) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '\\N')"
import csv
import sys

path = sys.argv[1]

CSV_TO_DB = [
    ("Item ID", "item_id"),
    ("Category", "category"),
    ("Item Name", "item_name"),
    ("Variation", "variation"),
    ("Online Display Name", "online_display_name"),
    ("Item Type", "item_type"),
    ("Price", "price"),
    ("Description", "description"),
    ("Dietary", "dietary"),
    ("Short Code", "short_code"),
    ("Sap Code", "sap_code"),
    ("HSN Code", "hsn_code"),
    ("Weight", "weight"),
    ("Weight Unit", "weight_unit"),
    ("Rank", "item_rank"),
    ("Packing Charges", "packing_charges"),
    ("Expose in Captain", "expose_in_captain"),
    ("Goods/Services", "goods_or_services"),
    ("Allow Decimal Qty", "allow_decimal_qty"),
    ("Manufacturing Date (DD-MM-YYYY)", "manufacturing_date"),
    ("Expiry Date (DD-MM-YYYY)", "expiry_date"),
    ("Dine-In QR", "dine_in_qr"),
]

NUMERIC_COLS = {"item_id", "price", "weight", "item_rank", "packing_charges"}


def normalize(col, value):
    if value is None:
        value = ""
    s = str(value).strip()
    if col in NUMERIC_COLS:
        return None if s == "" else s
    return None if s == "" else s


with open(path, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow([db for _, db in CSV_TO_DB])
    for row in reader:
        if not row or all(not (row.get(k) or "").strip() for k in row):
            continue
        out = [normalize(db, row.get(csv_col)) for csv_col, db in CSV_TO_DB]
        if not out[0]:
            continue
        w.writerow(out)
PY

COUNT="$(docker exec "$CONTAINER" psql -U poc -d "$DB" -t -A -c "SELECT COUNT(*) FROM public.petpooja_basemenu;")"
echo "Done. petpooja_basemenu rows: $COUNT"
