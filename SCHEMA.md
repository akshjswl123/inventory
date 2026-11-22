# Database schema reference

DDL lives in [`01_schema.sql`](01_schema.sql) (PostgreSQL `public` schema).

---

## Guide for business users (main tables)

These are the tables and reports most people care about day to day. Names match what you see in the app/exports (e.g. **pgNo** = product code on bills and recipes).

| What you want | Where to look | In plain English |
|---------------|---------------|------------------|
| **What materials do we track?** | `raw_materials` | Master list of ingredients and supplies. Each row has a **product code (pgNo)** and **item name** (plus optional comments). |
| **What came in on vendor bills?** | `order_items` (with `orders` for bill header) | **Bill line items**: what was bought, how much, which scoop/unit, rate, and line total. One bill = one `orders` row + many `order_items`. *(Some older data may still be in `order_entries` as flat bill lines.)* |
| **How is each dish made?** | `recipe_entries` | **Recipe details**: dish, each ingredient, scoops, quantities in gm/ml/piece, etc. **Always use the latest `version`** for a dish (see `item_versions` below). |
| **How do scoops convert to gm, ml, or pieces?** | `scoop_config` | **Conversion rules** from purchase/issue scoops into **destination units** (gm, ml, or piece). **Always use the latest `version`**. |
| **What does each dish cost (ingredient by ingredient)?** | `dish_cost_staging` | **Full dish cost breakdown**: every recipe line, rates, and cost for that dish/material. **Always use the latest version** (tracked as `dish_cost_staging` in `item_versions`). |
| **Which version is “current”?** | `item_versions` | One row per thing that gets versioned (recipe, dish cost, scoop list, material rates). Tells you the **current version number** to use when reading `recipe_entries`, `scoop_config`, or `dish_cost_staging`. Higher number = newer save. |
| **How much stock do we have now?** | `current_stock_by_pgno` (report/view, not a table) | **Stock on hand by product code**: effectively **everything billed in**, minus **everything taken out**, converted to gm, ml, and pieces using `scoop_config`. |

**Rule of thumb:** Whenever a table has a `version` column, filter to the **latest version** (or match the number shown in `item_versions` for that dish or item type).

---

## Technical reference

**Housekeeping:** Most tables have `created_at` / `last_updated_at`. On `UPDATE`, `touch_last_updated_at` sets `last_updated_at`. These columns are not part of app CSV formats.

**Related objects:** Functions `touch_last_updated_at()`, `normalize_item_version_code()`, `bump_item_version()`.

---

## 1. Normalized inventory (in / out)

| Table | Description |
|--------|-------------|
| `orders` | Parent purchase bill header. One row per vendor bill: vendor, date, bill number, customer, bill total, comments. Used with `order_items` as the normalized alternative to flat `order_entries`. |
| `order_items` | Child lines for purchase bills. Links to `orders`; item name, catalog `pgno`, inbound scoop (`scoopin`), qty, rate, line total, comments. Feeds stock-in logic (with `order_entries` in `current_stock_by_pgno`). |
| `inventory_out` | Parent issuance / stock-out header. Category, date, time, issued-to, common tag, total qty—groups multiple outbound lines. |
| `inventory_out_items` | Child lines for stock-out. Links to `inventory_out`; item, `pgno`, outbound scoop (`scoop_out`), qty, comments. Feeds stock-out logic (with `order_out`). |

---

## 2. Flat schema (CSV / app rows)

| Table | Description |
|--------|-------------|
| `order_entries` | Flat purchase / stock-in rows (one row per bill line). Vendor, date, billno, item, pgno, scoopin, qty, rate, totals. Unique on `(vendor, dt, billno, itemname, pgno)`. |
| `order_out` | Flat stock-out rows. Category, date/time, item, pgNo, scoop_out, qty. Unique on item + pgNo + scoop + date + time. |
| `recipe_entries` | Recipe Maker CSV rows. Dish name/code, ingredient, pgNo, recipe scoop, qty and gm/ml/piece amounts, “usable in other dish” fields, version. |
| `raw_materials` | Raw material catalog: pgNo, item name, comments. |
| `raw_material_selected_scoop` | UI preference: canonical scoop display name per pgNo or dish code (PK `pg_no_or_dishcode`). |
| `raw_materials_destination_unit` | One stock/cost unit per pgNo (from `scoop-ScoopConfig.csv`): destination unit (gm/ml/piece), purchase unit, scoop factor, conversion chain. |
| `raw_materials_default_scoop` | Per pgNo: highest-factor active `scoop_config` scoop whose destination unit matches `raw_materials_destination_unit` (packaging/division default). |
| `raw_materials_storage` | Physical rack/storage per pgNo (Rack column from scoop config CSV). |
| `stock_baselines` | Physical stock verification per pgNo: baseline_date, verified gm/ml/piece, system calc at save, ACTIVE/RETIRED. One ACTIVE per pgNo. |
| `kitchen_stock_baselines` | Kitchen/restaurant physical count per pgNo (verified gm/ml/piece only, no system override columns). One ACTIVE per pgNo. **Not** used by `current_stock_by_pgno` (future restaurant-level stock). UI: `kitchen_stock_baselines.html`. |
| `raw_materials_cost` | Computed material rates from purchases + scoop_config: per gm/ml/piece rates, item name aliases, bill reference, version. One snapshot per `(pgNo, version)`. |
| `scoop_config` | Scoop tab flat rows: item id/name, destination unit, scoop name, factors, conversion chain, qty in gm/ml/piece, `unused` flag, version. Central to unit conversion and `current_stock_by_pgno`. |

---

## 3. Static reference / catalog

| Table | Description |
|--------|-------------|
| `vendors` | Vendor lookup with unique `vendor_name`. |
| `categories` | Inventory-out category lookup (unique names)—not the same as menu categories. |
| `dishes` | Dish master: unique dish name and dish code. |
| `menu_categories` | Menu grouping for customer menu (id, name, display order)—distinct from `categories` used for `inventory_out`. |
| `dish_menu_category` | Many-to-many: which dishes appear in which menu categories, with sort order; FKs to `dishes` and `menu_categories`. |
| `dinein_menu` | Dine-in / in-restaurant menu prices: dish code/name, PetPooja id, online display name, price, versioned rows. |
| `zomato_menu` | Zomato aggregator menu prices (dish code/name, PetPooja id, price, version). |
| `swiggy_menu` | Swiggy aggregator menu prices (same shape as `zomato_menu`). |
| `petpooja_menu` | PetPooja POS menu export (wide row per `item_id`): categories, prices/availability by channel. Import via `scripts/petpooja_menu_import.sh`. |
| `dish_cost_staging` | CSV import staging for dish cost export—mostly text columns before load/transform (see `useful.sql`). |
| `dish_cost` | Published dish cost breakdown from staging: recipe lines, rates, line/dish costs, incomplete flag, etc. One row per `dish_code` (unique). |
| `item_report_lines` | POS item report lines from Excel: invoice, date, item, area, qty, payment/order metadata, totals. Unique per invoice/date/item/area. |
| `item_versions` | Version counter per logical item: one row per `(item_code, item_type)`. Types: `dishes` (recipe), `dish_cost_staging` (published cost), `raw_materials_cost`, `scoop_config`. Bumped via `bump_item_version()`. |

**Total: 29 tables**

---

## Views

| View | Description |
|------|-------------|
| `current_stock_by_pgno` | Runtime stock: latest ACTIVE `stock_baselines` + bill-in/out **after** `baseline_date` (via `scoop_config`). No baseline → all movements. `SELECT * FROM public.current_stock_by_pgno`. See `scripts/32_current_stock_by_pgno.sql`. |
| `v_menu_categories_and_dishes` | Menu categories with dishes and sort orders. |
| `v_dishes_with_menu_categories` | Dishes with aggregated menu category ids/names. |
| `v_dish_recipe_and_cost_versions` | Per dish code: recipe vs dish-cost version from `item_versions`. |