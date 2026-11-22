#!/usr/bin/env python3
"""Dedupe scoop-ScoopConfig.csv by pgNo; normalize Unit/DestinationUnit lowercase; optional conversion_chain column."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "scoop-ScoopConfig.csv"
REPORT_PATH = ROOT / "data" / "scoop_config_from_csv_report.txt"


def norm_dest(raw: str) -> str:
    d = (raw or "").strip().lower()
    if d in ("gm", "ml", "piece"):
        return d
    return d


def norm_unit(raw: str) -> str:
    u = (raw or "").strip().lower()
    if u == "superpacket":
        return "superpkt"
    return u


def score_row(row: dict) -> int:
    s = 0
    if (row.get("scoopfactor") or "").strip():
        s += 100
    dest = norm_dest(row.get("DestinationUnit") or "")
    if dest in ("gm", "ml", "piece"):
        s += 20
    if (row.get("Unit") or "").strip():
        s += 5
    return s


def main() -> int:
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    header = list(rows[0].keys()) if rows else []
    if "conversion_chain" not in header:
        header.append("conversion_chain")

    kept: dict[str, dict] = {}
    order: list[str] = []
    dropped: list[tuple[str, dict, str]] = []

    for row in rows:
        pg = (row.get("pgNo") or "").strip()
        if not pg:
            dropped.append(("", row, "blank pgNo"))
            continue
        row["Unit"] = norm_unit(row.get("Unit") or "")
        row["DestinationUnit"] = norm_dest(row.get("DestinationUnit") or "")
        if "conversion_chain" not in row:
            row["conversion_chain"] = (row.get("conversion_chain") or "").strip()

        prev = kept.get(pg)
        if prev is None:
            kept[pg] = row
            order.append(pg)
            continue
        if score_row(row) > score_row(prev):
            dropped.append((pg, prev, f"replaced by better row (unit={row.get('Unit')}, factor={row.get('scoopfactor')})"))
            kept[pg] = row
        elif score_row(row) < score_row(prev):
            dropped.append((pg, row, f"duplicate pgNo; kept unit={prev.get('Unit')} factor={prev.get('scoopfactor')}"))
        else:
            dropped.append((pg, prev, f"replaced by later duplicate (unit={row.get('Unit')}, factor={row.get('scoopfactor')})"))
            kept[pg] = row

    out_rows = [kept[p] for p in order]

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        w.writeheader()
        w.writerows(out_rows)

    report_lines = [
        "=== CSV normalize / dedupe ===",
        f"Input rows: {len(rows)}",
        f"Output rows (unique pgNo): {len(out_rows)}",
        f"Dropped / replaced: {len(dropped)}",
        "",
        "--- Dropped duplicate or blank pgNo ---",
    ]
    for pg, r, reason in dropped:
        report_lines.append(
            f"pgNo={pg or '(empty)'}\tunit={r.get('Unit')}\tfactor={r.get('scoopfactor')}\tdest={r.get('DestinationUnit')}\t{reason}"
        )

    existing = REPORT_PATH.read_text(encoding="utf-8") if REPORT_PATH.exists() else ""
    if existing and not existing.startswith("=== CSV normalize"):
        report_lines.append("\n" + existing)

    REPORT_PATH.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"Wrote {CSV_PATH} ({len(out_rows)} rows)")
    print(f"Report (partial): {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())