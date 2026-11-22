#!/usr/bin/env python3
"""Recompute 19-Nov baselines using ScoopUnits-Table 1.csv + scoop CSV + DB unit factors."""
from __future__ import annotations

import csv
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from clean_19nov_current_stock import (  # noqa: E402
    BASELINE_DATE,
    QTY_UNIT_RE,
    SCOOP,
    SCOOP_UNITS,
    SRC,
    load_scoop_config,
    load_scoop_units,
    norm_pg,
    norm_unit,
    parse_row_qty_unit,
    unit_cfg,
)

OUT = ROOT / "data" / "19NovCurrentStock_cleaned.csv"

# P1 source lines → real pgNos (ScoopUnits)
P1_MAP = {
    180: "99",
    181: "100",
    182: "101",
}


def load_db_unit_factors() -> dict[tuple[str, str], tuple[float, str]]:
    try:
        out = subprocess.check_output(
            [
                "docker",
                "exec",
                "poc_db",
                "psql",
                "-U",
                "poc",
                "-d",
                "poc",
                "-t",
                "-A",
                "-c",
                "SELECT TRIM(scoop_item_id), scoop_name, factor::text, LOWER(destination_unit) "
                "FROM scoop_config WHERE COALESCE(unused,false)=false",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {}

    pat = re.compile(r"_([^_]+)_(?:in|out|reciepe|inventory)$")
    by: dict[tuple[str, str], list[tuple[float, str]]] = {}
    for ln in out.splitlines():
        parts = ln.split("|")
        if len(parts) < 4:
            continue
        pg = norm_pg(parts[0].strip())
        m = pat.search(parts[1])
        if not m:
            continue
        unit = norm_unit(m.group(1))
        try:
            fac = float(parts[2])
        except ValueError:
            continue
        if fac <= 1:
            continue
        by.setdefault((pg, unit), []).append((fac, parts[3].strip()))

    return {k: max(v, key=lambda x: x[0]) for k, v in by.items()}


def factor_for(pg: str, unit: str, cfg: dict, db: dict[tuple[str, str], tuple[float, str]]):
    _, fac, dest = unit_cfg(cfg, unit)
    if fac:
        return fac, dest
    hit = db.get((norm_pg(pg), norm_unit(unit)))
    if hit:
        return hit[0], hit[1]
    return None, cfg.get("dest") or "gm"


def convert_qty(qty: float, unit: str, dest: str, factor: float | None):
    u = norm_unit(unit)
    if u == "kg" and dest == "gm":
        return qty * 1000, None, None, "entered_kg_as_gm"
    if u == "gm" and dest == "gm":
        return qty, None, None, "direct_gm"
    if u == "ltr" and dest == "ml":
        return None, qty * 1000, None, "entered_ltr_as_ml"
    if u == "ml" and dest == "ml":
        return None, qty, None, "direct_ml"
    if u == "piece" and dest == "piece":
        return None, None, qty, "direct_piece"
    if not factor:
        return None, None, None, f"cannot_convert unit={u} factor={factor}"
    v = round(qty * factor, 4)
    note = f"scoop_x_factor({factor}) unit={u}"
    if dest == "gm":
        return v, None, None, note
    if dest == "ml":
        return None, v, None, note
    return None, None, v, note


def load_cleaned_index():
    if not OUT.is_file():
        return {}
    return {norm_pg(r["pgNo"]): r for r in csv.DictReader(OUT.open(encoding="utf-8-sig"))}


def main():
    cfg_by_pg = load_scoop_config()
    scoop_units = load_scoop_units()
    db_factors = load_db_unit_factors()
    cleaned_idx = load_cleaned_index()

    # source rows by pg
    by_pg: dict[str, list] = {}
    with SRC.open(encoding="utf-8-sig", newline="") as f:
        for line_no, cells in enumerate(csv.reader(f), start=1):
            if line_no == 1:
                continue
            while len(cells) < 4:
                cells.append("")
            if line_no in P1_MAP:
                pg = norm_pg(P1_MAP[line_no])
            else:
                pg = norm_pg(cells[0])
            if not pg:
                continue
            by_pg.setdefault(pg, []).append(
                {"source_line": line_no, "itemnames": cells[1], "stock_raw": cells[2], "unit_col": cells[3]}
            )

    updates: list[dict] = []
    active_pgs = subprocess.check_output(
        [
            "docker",
            "exec",
            "poc_db",
            "psql",
            "-U",
            "poc",
            "-d",
            "poc",
            "-t",
            "-A",
            "-c",
            "SELECT TRIM(pgno) FROM stock_baselines WHERE baseline_date='2026-11-19' AND LOWER(TRIM(status))='active'",
        ],
        text=True,
    )
    db_active = {norm_pg(x) for x in active_pgs.splitlines() if x.strip()}

    for pg in sorted(db_active):
        cfg = cleaned_idx.get(pg, {})
        if pg not in scoop_units:
            continue
        group = by_pg.get(pg)
        if not group:
            continue
        srcline = int(cfg.get("source_line") or 0) if cfg else 0
        src = next((r for r in group if r["source_line"] == srcline), group[0])
        scoop_cfg = cfg_by_pg.get(pg)
        if not scoop_cfg:
            continue

        scoop_u = scoop_units.get(pg, "")
        qty, unit = parse_row_qty_unit(src["stock_raw"], src["unit_col"], scoop_u)
        if qty is None:
            continue
        use_unit = unit or scoop_u or scoop_cfg["purchase_unit"]
        factor, dest = factor_for(pg, use_unit, scoop_cfg, db_factors)
        gm, ml, pc, note = convert_qty(qty, use_unit, dest, factor)
        if note.startswith("cannot"):
            print(f"SKIP {pg}: {note}", file=sys.stderr)
            continue

        row = {
            **cfg,
            "Rack": cfg.get("Rack") or scoop_cfg.get("rack", ""),
            "pgNo": cfg.get("pgNo") or scoop_cfg["pgNo"],
            "itemnames": cfg.get("itemnames") or src["itemnames"].split(",")[0].strip(),
            "baseline_date": BASELINE_DATE,
            "source_line": src["source_line"],
            "scoop_qty": qty,
            "Unit": use_unit,
            "DestinationUnit": dest,
            "conversion": note,
        }
        row["qty_gm"] = "" if gm is None else gm
        row["qty_ml"] = "" if ml is None else ml
        row["qty_piece"] = "" if pc is None else pc
        updates.append(row)

    if not updates:
        print("No updates")
        return

    by_pg_out: dict[str, dict] = {norm_pg(r["pgNo"]): r for r in csv.DictReader(OUT.open(encoding="utf-8-sig"))}
    changed = []
    for u in updates:
        pg = norm_pg(u["pgNo"])
        old = by_pg_out.get(pg, {})
        def num(k):
            v = u.get(k)
            if v == "" or v is None:
                return None
            return float(v)

        if (
            norm_unit(old.get("Unit", "")) != norm_unit(u["Unit"])
            or num("qty_gm") != (float(old["qty_gm"]) if old.get("qty_gm") else None)
            or num("qty_ml") != (float(old["qty_ml"]) if old.get("qty_ml") else None)
            or num("qty_piece") != (float(old["qty_piece"]) if old.get("qty_piece") else None)
        ):
            changed.append(pg)
        by_pg_out[pg] = u

    hdr = [
        "Rack", "pgNo", "itemnames", "scoop_qty", "Unit", "DestinationUnit",
        "qty_gm", "qty_ml", "qty_piece", "baseline_date", "conversion", "source_line",
    ]
    rows = sorted(by_pg_out.values(), key=lambda x: (x.get("Rack", ""), x.get("pgNo", "")))
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=hdr, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    sql_parts = ["BEGIN;"]
    for u in updates:
        pg = u["pgNo"].replace("'", "''")
        qg = "NULL" if u["qty_gm"] == "" else str(float(u["qty_gm"]))
        qm = "NULL" if u["qty_ml"] == "" else str(float(u["qty_ml"]))
        qp = "NULL" if u["qty_piece"] == "" else str(float(u["qty_piece"]))
        remark = (
            f"19Nov ScoopUnits; L{u['source_line']}; {u['conversion']}; "
            f"scoop_qty={u['scoop_qty']} {u['Unit']}"
        ).replace("'", "''")
        sql_parts.append(
            f"UPDATE stock_baselines SET qty_gm={qg}, qty_ml={qm}, qty_piece={qp}, remarks='{remark}' "
            f"WHERE baseline_date='{BASELINE_DATE}' AND LOWER(TRIM(status))='active' AND TRIM(pgno)='{norm_pg(u['pgNo'])}';"
        )
    sql_parts.append("COMMIT;")
    sql = "\n".join(sql_parts)
    tmp = Path("/tmp/reconcile_19nov.sql")
    tmp.write_text(sql)
    subprocess.run(["docker", "cp", str(tmp), "poc_db:/tmp/reconcile_19nov.sql"], check=True)
    subprocess.run(
        ["docker", "exec", "poc_db", "psql", "-U", "poc", "-d", "poc", "-f", "/tmp/reconcile_19nov.sql"],
        check=True,
    )
    print(f"Updated cleaned CSV; corrected {len(changed)} pgNo(s) in DB: {', '.join(sorted(changed, key=str))}")


if __name__ == "__main__":
    main()