# Raw materials cost

Computed **`ratepergram`**, **`rateperml`**, and **`rateperpiece`** per catalog item (`pgNo`), using the **latest** purchase line for each unit family—not a weighted average over all history.

| File | Purpose |
|------|---------|
| [`raw_materials_cost_latest.sql`](raw_materials_cost_latest.sql) | **SELECT only** — preview rates from purchases (07 logic, one row per `pgNo`) |
| [`raw_materials_cost_select.sql`](raw_materials_cost_select.sql) | **SELECT** stored rows **+** bill preview — edit **one** `INSERT INTO rmc_cost_filter` at top; run **entire** script |
| [`raw_materials_cost_table_select.sql`](raw_materials_cost_table_select.sql) | **SELECT** stored `raw_materials_cost` only (same filter table) |
| [`raw_materials_cost_insert_from_orders.sql`](raw_materials_cost_insert_from_orders.sql) | **INSERT** per (`pgNo`, `based_on_billno`) from `order_items` |
| [`../07_raw_materials_cost.sql`](../07_raw_materials_cost.sql) | **DROP + CREATE** `raw_materials_cost`, then **INSERT** same logic |

Schema: [`../../01_schema.sql`](../../01_schema.sql) — table `public.raw_materials_cost`.

Unique key: **`("pgNo", based_on_billno)`** — one cost snapshot per item per bill. Migrate existing DBs with [`../09_raw_materials_cost_pgno_billno_unique.sql`](../09_raw_materials_cost_pgno_billno_unique.sql).

---

## Data sources

| Table | Role |
|-------|------|
| `raw_materials` | Catalog: `"pgNo"`, `itemname` |
| `order_items` + `orders` | Normalized bill lines (`orders.dt`, `orders.billno`) |
| `order_entries` | Flat bill lines (`dt`, `billno`) |
| `scoop_config` | Scoop size and **`destination_unit`** for each `scoopin` |

Purchase lines are unioned from `order_items` and `order_entries`. Rates require an **`INNER JOIN`** to `scoop_config`:

- `scoop_config.scoop_name` = line `scoopin`
- `scoop_config.scoop_item_id` = `raw_materials."pgNo"`
- `scoop_config.scoop_item_name` = `raw_materials.itemname`

---

## How rates are calculated

### Step 1 — Units in one scoop (from `destination_unit`)

`scoop_config.destination_unit` drives everything (not parsing scoop names like `_bag_in`):

| `destination_unit` | Units per scoop | Config fields |
|--------------------|-----------------|---------------|
| `gm` | grams | `COALESCE(qty_in_grams, factor, 1)` — includes **kg**, **pkt**, **bag** scoops (all stored as dest. `gm`) |
| `ml` | millilitres | `COALESCE(qty_in_ml, factor, 1)` |
| `piece` | pieces | `COALESCE(qty_in_piece, factor, 1)` |

### Step 2 — Total base quantity on the line

```text
base_qty = purchase.qty × units_per_scoop
```

### Step 3 — Rate on that line

```text
rate = itemtotal / base_qty
```

### Step 4 — Latest line per `pgNo` (per family)

For each `"pgNo"`, pick the **newest** purchase line (by `purchase_dt`, then `created_at`, then `id`) separately for:

- `destination_unit = 'gm'` → **`ratepergram`**
- `destination_unit = 'ml'` → **`rateperml`**
- `destination_unit = 'piece'` → **`rateperpiece`**

An item can have one, two, or all three columns filled if it has recent purchases on different scoop types.

### `based_on_billno`

Taken from the **latest `order_entries` row** per `pgNo` (flat bills only)—not from `orders.billno` on normalized lines. NULL if the item never appears on `order_entries`.

---

## Worked example: aata (`pgNo` 1), bag scoop

`scoop_config` for `aata_bag_in` (after seed):

- `destination_unit` = `gm`
- `qty_in_grams` = `25000` (25 kg bag)
- `conversion_chain` = `BAG:25:kg|kg:1000:gm` (reference; rate math uses `qty_in_grams`)

### One bag

| Field | Value |
|-------|--------|
| `scoopin` | `aata_bag_in` |
| `qty` | `1` |
| `itemtotal` | `10000` |

```text
units_per_scoop = 25000
base_qty        = 1 × 25000 = 25000 gm
ratepergram     = 10000 / 25000 = 0.4000
```

### Two bags (same line)

| Field | Value |
|-------|--------|
| `scoopin` | `aata_bag_in` |
| `qty` | **2** |
| `itemtotal` | **20000** (e.g. ₹10000 per bag × 2) |

```text
units_per_scoop = 25000          -- still per one bag
base_qty        = 2 × 25000 = 50000 gm
ratepergram     = 20000 / 50000 = 0.4000
```

Same ₹/gm as one bag when price scales with quantity. If `qty = 2` but `itemtotal` is only for one bag, the rate will be wrong—that is a **data entry** issue, not the formula.

### Latest line only

Two separate bills (1 bag each, different dates) → only the **most recent line** sets `ratepergram` (that line’s own `qty` and `itemtotal`).

---

## ml and piece (same pattern)

**Oil — ml scoop** (`destination_unit = ml`, `qty_in_ml = 1`):

```text
rateperml = itemtotal / (qty × qty_in_ml)
```

**Eggs — piece scoop** (`destination_unit = piece`, `qty_in_piece = 1`):

```text
rateperpiece = itemtotal / (qty × qty_in_piece)
```

---

## Filters (billno, pgNo, itemname)

Both SQL files use a **`filter_params`** CTE at the top of the `WITH` clause. Set any field to limit the run; use **`NULL` or `''`** to leave that field unrestricted. Filters combine with **AND** (all set filters must match).

**Default — entire catalog, all bills:**

```sql
filter_params AS (
    SELECT
        NULL::text AS billno,
        NULL::text AS pgno,
        NULL::text AS itemname
),
```

**Single item (aata, pgNo 1):**

```sql
filter_params AS (
    SELECT
        NULL::text AS billno,
        '1'::text AS pgno,
        'aata'::text AS itemname
),
```

**One bill only:**

```sql
filter_params AS (
    SELECT
        'SEED-FLAT-01'::text AS billno,
        NULL::text AS pgno,
        NULL::text AS itemname
),
```

**Bill + item together:**

```sql
filter_params AS (
    SELECT
        'INV-2026-042'::text AS billno,
        '1'::text AS pgno,
        'aata'::text AS itemname
),
```

| Filter | Applies to |
|--------|------------|
| `billno` | Purchase lines (`orders.billno` / `order_entries.billno`); `based_on_billno` |
| `pgno` | Catalog `"pgNo"` and purchase `pgno` |
| `itemname` | Case-insensitive match on catalog and purchase lines |

When filtered:

- Rates use only matching purchase lines; “latest” is within that filtered set.
- Preview query lists only catalog rows matching **pgno** / **itemname** filters.
- **`07_raw_materials_cost.sql`** inserts only those rows into `raw_materials_cost` when pgno/itemname filters are set (not the full catalog).

Preview SELECT columns **`filter_billno`**, **`filter_pgno`**, **`filter_itemname`** echo what you set (NULL if unset).

**psql (optional):** edit `filter_params` in the file, or build the CTE with `-v` substitutions before running.

(App Query tab: edit `filter_params` in the pasted SQL.)

---

## How to run

**Preview (no table changes):**

```bash
psql -h localhost -p 5433 -U poc -d poc -f scripts/useful_queries/raw_materials_cost_latest.sql
```

Or paste [`raw_materials_cost_latest.sql`](raw_materials_cost_latest.sql) into the app **Query** tab (`http://localhost:3050`).

**Refresh table** (drops and recreates `raw_materials_cost`):

```bash
psql -h localhost -p 5433 -U poc -d poc -f scripts/07_raw_materials_cost.sql
```

---

## Output columns

| Column | Meaning |
|--------|---------|
| `"pgNo"` | Catalog page id |
| `itemname` | Catalog item name (preview query only) |
| `filter_billno` | Bill filter applied, if any (preview query only) |
| `filter_pgno` | pgNo filter applied, if any (preview query only) |
| `filter_itemname` | Item name filter applied, if any (preview query only) |
| `item_names` | Names seen on purchase lines (array) |
| `ratepergram` | Latest gm-destination purchase rate |
| `rateperml` | Latest ml-destination purchase rate |
| `rateperpiece` | Latest piece-destination purchase rate |
| `based_on_billno` | Bill that sourced this row (part of unique key with `"pgNo"`) |
| `comments` | Short note on which dates drove each rate |

Scoops with `destination_unit = 'other'` (or missing config) do not contribute to rates.

---

## Dish cost (case 1, 2, 3)

| File | Purpose |
|------|---------|
| [`dish_cost_cases.sql`](dish_cost_cases.sql) | Batch dish cost from stored `raw_materials_cost` plus processed dishes used as ingredients |
| [`dish_cost_cases_sample.sql`](dish_cost_cases_sample.sql) | Sample recipes in **poc_db** only (`SS-GJ`, `SS-BASE`, `SS-AATA`, `SS-ROTI`) |

Edit `params` at the top of `dish_cost_cases.sql` (`dishcode`, `dishname`, `based_on_billno`). Blank means all dishes. A filtered dish also lists the processed dishes it uses.

Line cost for a raw material:

```text
ratepergram|ml|piece × scoop_factor × qty
```

`scoop_factor` is `qty_in_grams`, `qty_in_ml`, or `qty_in_piece` for that destination (the `factor` column is the fallback). A kg scoop is 1000 gm.

| Case | Recipe | Dish cost |
|------|--------|-----------|
| 1 — raw only, not usable in other dishes | `SS-GJ` sugar `0.0600 × 1 × 5000` | **300** |
| 2 — raw only, usable in other dishes | `SS-BASE` maida **1000**, 10 scoops of 1 gm | **100 per gm** |
| 3 — raw plus a processed dish, and itself usable | `SS-AATA` flour **1800** + 2 gm maida **200** | **2000**, **1 per gm** |
| 3 — two levels deep | `SS-ROTI` butter **5** + one gm of AATA **1** | **6** |

Load the sample, then run the cost query (both against poc_db):

```bash
docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
  -f - < scripts/useful_queries/dish_cost_cases_sample.sql
```
