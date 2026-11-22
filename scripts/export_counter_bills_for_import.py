#!/usr/bin/env python3
"""Build per-bill CSVs for Inventory In tab import from orders + order_items exports."""

from __future__ import annotations

import argparse
import csv
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

# Matches csv.js CSV_HEADER_BILL
BILL_HEADER = [
    "Vendor",
    "dt",
    "billno",
    "itemname",
    "pgno",
    "scoopin",
    "qty",
    "rate",
    "itemtotal",
    "comments",
]


def norm_decimal(val: str) -> str:
    s = (val or "").strip()
    if not s or s.upper() == "NULL":
        return ""
    try:
        d = Decimal(s)
        if d == d.to_integral_value():
            return str(int(d))
        return format(d.normalize(), "f")
    except InvalidOperation:
        return s


def safe_filename(*parts: str) -> str:
    raw = "_".join(p.strip() for p in parts if p is not None)
    raw = re.sub(r"[^\w.\-]+", "_", raw, flags=re.UNICODE)
    return raw.strip("_") or "bill"


def load_orders(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_items_by_order(path: Path) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            oid = row["order_id"]
            out.setdefault(oid, []).append(row)
    return out


def bill_rows_for_order(order: dict, items: list[dict]) -> list[list[str]]:
    vendor = (order.get("vendor") or "").strip()
    dt = (order.get("dt") or "").strip()
    billno = (order.get("billno") or "").strip()
    billtotal = norm_decimal(order.get("billtotal") or "")
    billcomments = (order.get("billcomments") or "").strip()
    if billcomments.upper() == "NULL":
        billcomments = ""

    rows: list[list[str]] = []
    for it in items:
        rows.append(
            [
                vendor,
                dt,
                billno,
                (it.get("itemname") or "").strip(),
                (it.get("pgno") or "").strip(),
                (it.get("scoopin") or "").strip(),
                norm_decimal(it.get("qty") or ""),
                norm_decimal(it.get("rate") or ""),
                norm_decimal(it.get("itemtotal") or ""),
                (it.get("comments") or "").strip(),
            ]
        )

    if rows:
        rows.append([vendor, dt, billno, "billtotal", "", "", "", "", billtotal, billcomments])
    return rows


def write_bill_csv(path: Path, rows: list[list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(BILL_HEADER)
        w.writerows(rows)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--orders",
        type=Path,
        default=Path("data/counter_orders.csv"),
        help="orders table CSV export",
    )
    p.add_argument(
        "--items",
        type=Path,
        default=Path("data/Counter_order_items.csv"),
        help="order_items table CSV export",
    )
    p.add_argument(
        "--after",
        default="2026-11-03",
        help="Include bills with dt strictly after this date (YYYY-MM-DD)",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/bills_import_post_3nov"),
        help="Directory for per-bill CSV files",
    )
    p.add_argument(
        "--summary",
        type=Path,
        default=None,
        help="Optional summary CSV path (default: <out-dir>/bills_summary.csv)",
    )
    args = p.parse_args()

    orders = load_orders(args.orders)
    items_by_order = load_items_by_order(args.items)

    selected = [o for o in orders if (o.get("dt") or "").strip() > args.after]
    selected.sort(key=lambda o: ((o.get("dt") or ""), (o.get("vendor") or ""), (o.get("billno") or "")))

    summary_path = args.summary or (args.out_dir / "bills_summary.csv")
    args.out_dir.mkdir(parents=True, exist_ok=True)

    summary_rows: list[dict] = []
    written = 0
    skipped = 0

    for order in selected:
        oid = order["id"]
        lines = items_by_order.get(oid, [])
        if not lines:
            skipped += 1
            continue
        csv_rows = bill_rows_for_order(order, lines)
        fname = f"bill_addition_{safe_filename(order.get('vendor', ''), order.get('billno', ''), order.get('dt', ''))}.csv"
        out_path = args.out_dir / fname
        write_bill_csv(out_path, csv_rows)
        written += 1
        summary_rows.append(
            {
                "order_id": oid,
                "dt": order.get("dt", ""),
                "vendor": order.get("vendor", ""),
                "billno": order.get("billno", ""),
                "billtotal": norm_decimal(order.get("billtotal") or ""),
                "line_items": len(lines),
                "import_file": fname,
            }
        )

    with summary_path.open("w", newline="", encoding="utf-8") as f:
        fields = ["order_id", "dt", "vendor", "billno", "billtotal", "line_items", "import_file"]
        w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(summary_rows)

    print(f"Cutoff: dt > {args.after}")
    print(f"Orders matched: {len(selected)}")
    print(f"Bill CSVs written: {written}")
    if skipped:
        print(f"Skipped (no line items): {skipped}")
    print(f"Output dir: {args.out_dir.resolve()}")
    print(f"Summary: {summary_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())