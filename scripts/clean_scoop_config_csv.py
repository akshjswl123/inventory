#!/usr/bin/env python3
"""Normalize data/scoop-ScoopConfig.csv: lowercase Unit and DestinationUnit; skip blank pgNo in enable list."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "scoop-ScoopConfig.csv"
ENABLE_CSV_PATH = ROOT / "data" / "scoop-ScoopConfig-enable.csv"


def norm_dest(raw: str) -> str:
    d = (raw or "").strip().lower()
    if d == "pkt":
        return "piece"
    if d in ("gm", "ml", "piece"):
        return d
    return d


def main() -> int:
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    if not rows:
        print("empty csv", file=sys.stderr)
        return 1

    header = rows[0]
    # strip trailing empty header cells
    while header and header[-1] == "":
        header.pop()
    if "Destinationunit" in header:
        idx = header.index("Destinationunit")
        header[idx] = "DestinationUnit"
    unit_i = header.index("Unit") if "Unit" in header else 4
    dest_i = header.index("DestinationUnit")
    pg_i = header.index("pgNo")

    cleaned = [header]
    enable_keys: set[tuple[str, str]] = set()

    for row in rows[1:]:
        if not any(c.strip() for c in row):
            continue
        while len(row) < len(header):
            row.append("")
        row = row[: len(header)]
        row[unit_i] = row[unit_i].strip().lower()
        row[dest_i] = norm_dest(row[dest_i])
        cleaned.append(row)

        pg = row[pg_i].strip()
        dest = row[dest_i]
        if pg and dest in ("gm", "ml", "piece"):
            enable_keys.add((pg, dest))

    enable_rows = [["pgNo", "DestinationUnit"]] + sorted(enable_keys)

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(cleaned)

    with ENABLE_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(enable_rows)

    print(f"Wrote {CSV_PATH} ({len(cleaned) - 1} data rows)")
    print(f"Wrote {ENABLE_CSV_PATH} ({len(enable_rows) - 1} pgNo rows for enable)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
