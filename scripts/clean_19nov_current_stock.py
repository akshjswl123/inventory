#!/usr/bin/env python3
"""Clean data/19NovCurrentStock.csv using scoop-ScoopConfig.csv and ScoopUnits-Table 1.csv."""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "19NovCurrentStock.csv"
SCOOP = ROOT / "data" / "scoop-ScoopConfig.csv"
SCOOP_UNITS = ROOT / "data" / "ScoopUnits-Table 1.csv"
OUT = ROOT / "data" / "19NovCurrentStock_cleaned.csv"
NOT_OUT = ROOT / "data" / "19NovCurrentStock_notinserted.csv"
BASELINE_DATE = "2026-11-19"

QTY_UNIT_RE = re.compile(
    r"^\s*(\d+(?:\.\d+)?)\s*"
    r"(kg|gm|g|ml|l|ltr|liter|pkt|packet|pcs?|piece|tin|bag|bottle|sachet|superpkt|loose|box|block)?\s*$",
    re.IGNORECASE,
)


def norm_pg(pg: str) -> str:
    return re.sub(r"\s+", "", str(pg or "").strip())


def norm_unit(u: str) -> str:
    s = str(u or "").strip().lower()
    if not s:
        return ""
    s = re.split(r"[/\s]", s)[0]
    if s in ("superpacket",):
        return "superpkt"
    if s in ("g",):
        return "gm"
    if s in ("l", "liter", "litre"):
        return "ltr"
    if s in ("pc", "pcs"):
        return "piece"
    if s in ("packet",):
        return "pkt"
    if s in ("sachet",):
        return "pkt"
    if s in ("frozen",):
        return "tin"
    if s in ("block",):
        return "pkt"
    return s


def parse_num(v) -> float | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    m = QTY_UNIT_RE.match(s)
    if m:
        return float(m.group(1))
    try:
        return float(s)
    except ValueError:
        return None


def parse_row_qty_unit(cell2: str, cell3: str, scoop_unit: str = ""):
    cell2 = (cell2 or "").strip()
    cell3 = (cell3 or "").strip()
    # Optional unit column — only used if stock cell has no embedded unit and no ScoopUnits default
    unit3 = norm_unit(cell3) if cell3 and len(cell3) < 20 and not cell3[0].isdigit() else ""
    default_u = norm_unit(scoop_unit)

    m = QTY_UNIT_RE.match(cell2)
    if m:
        qty = float(m.group(1))
        embedded = norm_unit(m.group(2) or "")
        if embedded:
            return qty, embedded
        if default_u:
            return qty, default_u
        return qty, unit3

    qty = parse_num(cell2)
    if qty is not None:
        if default_u:
            return qty, default_u
        return qty, unit3
    return None, unit3


def load_scoop_units() -> dict[str, str]:
    by_pg: dict[str, str] = {}
    if not SCOOP_UNITS.is_file():
        return by_pg
    with SCOOP_UNITS.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pg = norm_pg(row.get("pgNo", ""))
            unit = norm_unit(row.get("scoop_unit", ""))
            if pg and unit:
                by_pg[pg] = unit
    return by_pg


def load_scoop_config():
    by_pg: dict[str, dict] = {}
    with SCOOP.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pg = norm_pg(row.get("pgNo", ""))
            if not pg:
                continue
            factor_raw = str(row.get("scoopfactor", "")).strip()
            factor = float(factor_raw) if factor_raw else None
            dest = str(row.get("DestinationUnit", "")).strip().lower()
            purchase = norm_unit(row.get("Unit", ""))
            entry = by_pg.setdefault(
                pg,
                {
                    "pgNo": str(row.get("pgNo", "")).strip(),
                    "rack": str(row.get("Rack", "")).strip(),
                    "itemnames_cfg": str(row.get("itemnames", "")).strip(),
                    "dest": dest,
                    "purchase_unit": purchase,
                    "units": {},
                },
            )
            if purchase:
                prev_f, _ = entry["units"].get(purchase, (None, dest))
                if factor and (prev_f is None or factor >= prev_f):
                    entry["units"][purchase] = (factor, dest)
            score = (100 if factor and factor > 0 else 0) + (20 if dest in ("gm", "ml", "piece") else 0)
            if score >= entry.get("_score", -1):
                entry["dest"] = dest
                entry["purchase_unit"] = purchase or entry.get("purchase_unit") or ""
                entry["_score"] = score
    return by_pg


def primary_itemname(itemnames: str, cfg: dict) -> str:
    raw = (itemnames or "").strip()
    if raw:
        return raw.split(",")[0].strip()
    cfg_names = cfg.get("itemnames_cfg", "")
    if cfg_names:
        return cfg_names.split(",")[0].strip()
    return raw


def unit_cfg(cfg: dict, unit: str) -> tuple[str, float | None, float | None]:
    purchase = cfg.get("purchase_unit") or ""
    u = norm_unit(unit) or purchase
    units: dict = cfg.get("units") or {}
    factor, dest = units.get(u, (None, cfg.get("dest") or ""))
    if factor is None and u in units:
        _, dest = units[u]
    if not dest:
        dest = cfg.get("dest") or ""
    return u, factor, dest


def convert_qty(qty: float, unit: str, cfg: dict):
    u, factor, dest = unit_cfg(cfg, unit)
    purchase = cfg.get("purchase_unit") or ""

    if dest not in ("gm", "ml", "piece"):
        return None, None, None, "no_dest_in_config"

    if u == "kg":
        if dest == "gm":
            return qty * 1000, None, None, "entered_kg_as_gm"
        return None, None, None, "kg_with_dest_not_gm"

    if u == "gm" and dest == "gm":
        return qty, None, None, "direct_gm"
    if u == "ml" and dest == "ml":
        return None, qty, None, "direct_ml"
    if u == "ltr" and dest == "ml":
        return None, qty * 1000, None, "entered_ltr_as_ml"
    if u in ("piece",) and dest == "piece":
        return None, None, qty, "direct_piece"

    if factor and factor > 0:
        v = round(qty * factor, 4)
        if dest == "gm":
            return v, None, None, f"scoop_x_factor({factor}) unit={u or purchase}"
        if dest == "ml":
            return None, v, None, f"scoop_x_factor({factor}) unit={u or purchase}"
        return None, None, v, f"scoop_x_factor({factor}) unit={u or purchase}"

    return None, None, None, f"cannot_convert unit={u} factor={factor}"


def load_source_rows():
    rows = []
    with SRC.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        stock_col = header[2] if header and len(header) > 2 else "stock"
        for line_no, cells in enumerate(reader, start=2):
            while len(cells) < 4:
                cells.append("")
            rows.append(
                {
                    "source_line": line_no,
                    "pgNo_raw": cells[0].strip(),
                    "pgNo": norm_pg(cells[0]),
                    "itemnames": cells[1].strip(),
                    "stock_raw": cells[2].strip(),
                    "unit_col": cells[3].strip(),
                    "stock_column": stock_col,
                }
            )
    return rows


def main():
    cfg_by_pg = load_scoop_config()
    scoop_units = load_scoop_units()
    raw_rows = load_source_rows()
    by_pg: dict[str, list] = {}
    no_pg = []

    for r in raw_rows:
        if not r["pgNo"]:
            no_pg.append({**r, "reason": "no_pgNo"})
            continue
        by_pg.setdefault(r["pgNo"], []).append(r)

    cleaned_candidates = []
    skipped = list(no_pg)

    for pg, group in by_pg.items():
        cfg = cfg_by_pg.get(pg)
        if not cfg:
            for r in group:
                skipped.append({**r, "reason": "pgNo_not_in_scoop_config"})
            continue

        best = None
        best_mag = -1.0
        best_note = ""

        for r in group:
            scoop_u = scoop_units.get(pg, "")
            qty, unit = parse_row_qty_unit(r["stock_raw"], r["unit_col"], scoop_u)
            if qty is None:
                skipped.append({**r, "reason": "empty_or_unparseable_stock"})
                continue
            use_unit = unit or scoop_u or cfg["purchase_unit"]
            gm, ml, pc, note = convert_qty(qty, use_unit, cfg)
            if note.startswith("cannot") or note.startswith("no_dest"):
                skipped.append({**r, "reason": note, "scoop_qty": qty, "unit_used": use_unit})
                continue
            mag = (gm or 0) + (ml or 0) + (pc or 0)
            pack = {**r, "scoop_qty": qty, "Unit": use_unit, "qty_gm": gm, "qty_ml": ml, "qty_piece": pc, "conversion": note, "mag": mag}
            if mag > best_mag or (mag == best_mag and best is None):
                best_mag = mag
                best = pack
                best_note = note

        if not best:
            continue

        cleaned_candidates.append(
            {
                "Rack": cfg["rack"],
                "pgNo": cfg["pgNo"],
                "itemnames": primary_itemname(best["itemnames"], cfg),
                "scoop_qty": best["scoop_qty"],
                "Unit": best["Unit"],
                "DestinationUnit": cfg["dest"],
                "qty_gm": "" if best["qty_gm"] is None else best["qty_gm"],
                "qty_ml": "" if best["qty_ml"] is None else best["qty_ml"],
                "qty_piece": "" if best["qty_piece"] is None else best["qty_piece"],
                "baseline_date": BASELINE_DATE,
                "conversion": best_note,
                "source_line": best["source_line"],
            }
        )

        for r in group:
            if r["source_line"] == best["source_line"]:
                continue
            skipped.append({**r, "reason": "duplicate_row_not_chosen"})

    cleaned_candidates.sort(key=lambda x: (x["Rack"], x["pgNo"]))

    out_hdr = [
        "Rack",
        "pgNo",
        "itemnames",
        "scoop_qty",
        "Unit",
        "DestinationUnit",
        "qty_gm",
        "qty_ml",
        "qty_piece",
        "baseline_date",
        "conversion",
        "source_line",
    ]
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=out_hdr, lineterminator="\n")
        w.writeheader()
        w.writerows(cleaned_candidates)

    skip_hdr = [
        "source_line",
        "pgNo_raw",
        "pgNo",
        "itemnames",
        "stock_raw",
        "unit_col",
        "reason",
        "scoop_qty",
        "unit_used",
    ]
    with NOT_OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=skip_hdr, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        for r in skipped:
            w.writerow(r)

    print(f"Wrote {OUT} — {len(cleaned_candidates)} baseline row(s) ({BASELINE_DATE})")
    print(f"Wrote {NOT_OUT} — {len(skipped)} skipped row(s)")


if __name__ == "__main__":
    main()