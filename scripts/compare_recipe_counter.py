#!/usr/bin/env python3
"""Compare recipe_entries DB export vs CounterHost CSV (read-only; no DB)."""
import csv
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

COMPARE_COLS = [
    "dishname",
    "dishcode",
    "reciepeitemname",
    "pgNo",
    "receipescoop",
    "qty",
    "inGm",
    "inML",
    "inPiece",
    "is_usable_in_other_dish",
    "usable_processed_scoop",
    "qty_of_scoops",
    "comments",
]

KEY_COLS = ("dishcode", "reciepeitemname", "pgNo", "receipescoop")


def norm(val):
    if val is None:
        return ""
    s = str(val).strip()
    if s == "":
        return ""
    if s.lower() in ("f", "false"):
        return "false"
    if s.lower() in ("t", "true"):
        return "true"
    try:
        d = Decimal(s)
        if d == d.to_integral_value():
            return str(int(d))
        return format(d.normalize(), "f").rstrip("0").rstrip(".") or "0"
    except (InvalidOperation, ValueError):
        return s


def row_key(row: dict) -> tuple:
    return tuple(norm(row.get(c, "")) for c in KEY_COLS)


def norm_row(row: dict) -> tuple:
    return tuple(norm(row.get(c, "")) for c in COMPARE_COLS)


def load_csv(path):
    out = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            k = row_key(row)
            out[k] = norm_row(row)
    return out


def main() -> int:
    counter_path = Path(sys.argv[1])
    db_path = Path(sys.argv[2])
    counter = load_csv(counter_path)
    db = load_csv(db_path)

    counter_keys = set(counter)
    db_keys = set(db)

    only_counter = sorted(counter_keys - db_keys, key=lambda x: (x[0], x[1], x[2], x[3]))
    only_db = sorted(db_keys - counter_keys, key=lambda x: (x[0], x[1], x[2], x[3]))

    mismatched = []
    for k in sorted(counter_keys & db_keys, key=lambda x: (x[0], x[1], x[2], x[3])):
        if counter[k] != db[k]:
            mismatched.append(k)

    print("=== Recipe compare: recipe_entries (DB) vs reciepeentriescounter.csv ===")
    print(f"Counter rows (unique keys): {len(counter)}")
    print(f"DB rows (unique keys):      {len(db)}")
    print(f"Only in Counter export:   {len(only_counter)}")
    print(f"Only in DB:                 {len(only_db)}")
    print(f"Same key, different values: {len(mismatched)}")
    print(f"Match:                      {len(counter_keys & db_keys) - len(mismatched)}")
    print()

    def dish_summary(keys):
        d = {}
        for k in keys:
            d[k[0]] = d.get(k[0], 0) + 1
        return dict(sorted(d.items(), key=lambda x: (-x[1], x[0])))

    if only_counter:
        print("--- Only in Counter export (by line) ---")
        for k in only_counter[:200]:
            print(f"  {k[0]} | {k[1]} | item={k[2]} | pgNo={k[3]}")
        if len(only_counter) > 200:
            print(f"  ... and {len(only_counter) - 200} more")
        print("\n--- Dishes with lines only in Counter ---")
        for dish, n in list(dish_summary(only_counter).items())[:50]:
            print(f"  {dish} ({n} lines)")
        print()

    if only_db:
        print("--- Only in DB (by line) ---")
        for k in only_db[:200]:
            print(f"  {k[0]} | {k[1]} | item={k[2]} | pgNo={k[3]}")
        if len(only_db) > 200:
            print(f"  ... and {len(only_db) - 200} more")
        print("\n--- Dishes with lines only in DB ---")
        for dish, n in list(dish_summary(only_db).items())[:50]:
            print(f"  {dish} ({n} lines)")
        print()

    if mismatched:
        print("--- Same key, field differences (counter vs db) ---")
        col_names = COMPARE_COLS
        for k in mismatched[:150]:
            c_row = counter[k]
            d_row = db[k]
            diffs = []
            for i, col in enumerate(col_names):
                if c_row[i] != d_row[i]:
                    diffs.append(f"{col}: '{c_row[i]}' -> '{d_row[i]}'")
            print(f"  {k[0]} | {k[1]} | {k[2]} | {k[3]}")
            for d in diffs:
                print(f"    {d}")
        if len(mismatched) > 150:
            print(f"  ... and {len(mismatched) - 150} more mismatched keys")

    return 0 if not (only_counter or only_db or mismatched) else 1


if __name__ == "__main__":
    raise SystemExit(main())
