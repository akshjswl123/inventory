# Dish cost CSV cleanup (`dish_cost_staging` → `dish_cost_cleaned_up`)

Clean a full Query-tab dish-cost CSV export (e.g. `data/dishCostFromQueryTabCounterDb.csv`) so it matches what Recipe Maker shows after **Load from DB**, without repeated dish blocks or stale ingredient lines.

## Problem

A single dish-cost export often includes:

1. **The same `dish_code` in many blocks** (e.g. `P8`, `P7`, `P5`) because processed child dishes are printed again whenever another dish uses them.
2. **Extra line rows** if `recipe_entries` still has older saves, while the app only loads the **latest batch** (max `created_at` ± 30 seconds per dish).

Within one block, duplicate `(dish_code, item, pgNo, scoop, qty)` lines are uncommon; the main issue is **repeated sections** and **lines not on the current recipe**.

## What the cleanup does

| Step | Action |
|------|--------|
| 1 | Import CSV into `public.dish_cost_staging` (all columns text). |
| 2 | **Last block per `dish_code`** — blank separator rows in the CSV define blocks; only the final block for each code is kept. |
| 3 | **Filter `row_kind = line`** — keep a line only if it matches an ingredient on the latest recipe batch (same logic as `loadRecipeByDishcode` / `recipe_latest_batch` in `dish_cost_cases.sql`). |
| 4 | Keep all non-`line` rows in those blocks (e.g. `dish_total`). |
| 5 | Write `public.dish_cost_cleaned_up` (includes `sort_seq` for export order) and optionally export `*_cleaned.csv`. |

**Note:** Separator blank rows are not exported. **`dish_total` amounts are not recalculated** after lines are dropped; for fresh costs, re-run dish-cost SQL or the API after recipes are correct.

## Files

| File | Purpose |
|------|---------|
| [`dish_cost_staging_clean.sql`](dish_cost_staging_clean.sql) | SQL cleanup (staging must already be loaded). |
| [`../dish_cost_import_and_clean.sh`](../dish_cost_import_and_clean.sh) | Truncate staging → `\copy` import → run SQL → export CSV. |

Schema: staging table is defined in [`../../01_schema.sql`](../../01_schema.sql) (`dish_cost_staging`). Promoting totals to `dish_cost` is still described in [`../../useful.sql`](../../useful.sql).

## Quick run (Docker)

Default container: `poc_db`, database: `poc`, user: `poc`.

```bash
./scripts/dish_cost_import_and_clean.sh data/dishCostFromQueryTabCounterDb.csv
```

Output:

- Table: `public.dish_cost_cleaned_up`
- File: `data/dishCostFromQueryTabCounterDb_cleaned.csv`

Optional args:

```bash
./scripts/dish_cost_import_and_clean.sh path/to/export.csv other_database
```

Environment: `POC_DB_CONTAINER` overrides the Docker container name.

## Manual steps (pgAdmin)

1. Connect: host `localhost`, port `5433` (or your map), user `poc`, database `poc`.
2. **Import/Export** on `dish_cost_staging`: CSV, header on, empty nulls as needed.
3. Query Tool: run [`dish_cost_staging_clean.sql`](dish_cost_staging_clean.sql).
4. Export `dish_cost_cleaned_up` ordered by `sort_seq`, or use `\copy` from the shell script.

## Example result

From `dishCostFromQueryTabCounterDb.csv` (counter DB export):

| Metric | Before (staging) | After (cleaned) |
|--------|------------------|-----------------|
| Rows | 2,790 | 1,147 |
| `line` rows | — | 972 |
| `dish_total` rows | many repeats per code | 175 (one per dish) |

After cleanup there should be **no duplicate `dish_total` per `dish_code`**.

## Checks

```sql
-- Duplicate dish totals (expect 0 rows)
SELECT upper(trim(dish_code)), count(*)
FROM public.dish_cost_cleaned_up
WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total'
GROUP BY 1
HAVING count(*) > 1;

-- Staging vs cleaned counts
SELECT
  (SELECT count(*) FROM public.dish_cost_staging) AS staging_rows,
  (SELECT count(*) FROM public.dish_cost_cleaned_up) AS cleaned_rows;
```

## Staging duplicate diagnostics (before clean)

```sql
-- More than one dish_total per dish_code in staging
SELECT upper(trim(dish_code)), count(*)
FROM public.dish_cost_staging
WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total'
  AND trim(coalesce(dish_code, '')) <> ''
GROUP BY 1
HAVING count(*) > 1
ORDER BY 1;

-- Repeated line key within same dish (same pgNo, item, scoop, qty)
SELECT upper(trim(dish_code)) AS dish_code,
       itemname, "pgNo_or_dishCode", receipescoop, qty, count(*)
FROM public.dish_cost_staging
WHERE lower(trim(coalesce(row_kind, ''))) = 'line'
GROUP BY 1, 2, 3, 4, 5
HAVING count(*) > 1;
```

## Root cause: old recipes in `recipe_entries`

Recipe Maker **Load from DB** only reads the latest save batch. Old rows can still affect exports if the export query differed. Preview rows outside the latest batch:

```sql
WITH recipe_latest_batch AS (
  SELECT DISTINCT ON (upper(trim(dishcode)))
    upper(trim(dishcode)) AS dish_code,
    created_at AS saved_at
  FROM public.recipe_entries
  WHERE dishcode IS NOT NULL AND trim(dishcode) <> ''
  ORDER BY upper(trim(dishcode)), created_at DESC, id DESC
)
SELECT r.id, r.dishcode, r.reciepeitemname, r."pgNo", r.qty, r.created_at
FROM public.recipe_entries r
JOIN recipe_latest_batch lb ON upper(trim(r.dishcode)) = lb.dish_code
WHERE r.created_at < lb.saved_at - interval '30 seconds'
ORDER BY r.dishcode, r.created_at;
```

Delete only after backup and review (prefer `item_versions` after v1 seed).

## dishCostFromDB → version 1 seed

**dishCostFromDB** = [`data/dishCostFromQueryTabCounterDb_cleaned.csv`](../../data/dishCostFromQueryTabCounterDb_cleaned.csv)

```bash
# Once per DB: scripts/14_item_versions.sql (if item_versions missing)
scripts/15_recipe_entries_and_raw_materials_cost_version.sql
./scripts/dish_cost_seed_v1.sh data/dishCostFromQueryTabCounterDb_cleaned.csv
```

See [`../16_seed_v1_from_dish_cost_db.sql`](../16_seed_v1_from_dish_cost_db.sql): upserts `item_versions`, sets `version = 1` on referenced `raw_materials_cost` / `scoop_config`, inserts `recipe_entries` (lines + `dish_out`) for dishes in the file.

## Compare to `menuCostExcel`

`public."menuCostExcel"` (`menu`, `cost`) vs **`dish_total`** rows in `dish_cost_cleaned_up` (match on **menu name = dish name**, case-insensitive). Adjust join if you map menus via `menuexcel` / `dishes`.

**All differences** (missing on either side, or cost mismatch &gt; ₹0.01):

```sql
WITH cleaned_cost AS (
    SELECT
        upper(trim(dish_code)) AS dish_code_key,
        trim(dishname) AS dishname,
        lower(trim(dishname)) AS name_key,
        nullif(trim(dish_cost), '')::numeric AS dish_cost
    FROM public.dish_cost_cleaned_up
    WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total'
      AND trim(coalesce(dish_code, '')) <> ''
),
menu_cost AS (
    SELECT
        trim(menu) AS menu,
        lower(trim(menu)) AS menu_key,
        cost AS menu_cost
    FROM public."menuCostExcel"
    WHERE trim(coalesce(menu, '')) <> ''
)
SELECT
    coalesce(m.menu, c.dishname) AS menu_or_dishname,
    c.dish_code_key AS dish_code,
    m.menu_cost,
    c.dish_cost AS cleaned_dish_cost,
    round(c.dish_cost - m.menu_cost, 4) AS delta_cleaned_minus_menu,
    CASE
        WHEN m.menu_key IS NULL THEN 'only_in_cleaned_dish_cost'
        WHEN c.name_key IS NULL THEN 'only_in_menuCostExcel'
        WHEN c.dish_cost IS NULL AND m.menu_cost IS NOT NULL THEN 'cleaned_cost_null'
        WHEN m.menu_cost IS NULL AND c.dish_cost IS NOT NULL THEN 'menu_cost_null'
        WHEN abs(coalesce(c.dish_cost, 0) - coalesce(m.menu_cost, 0)) > 0.01
        THEN 'cost_mismatch'
        ELSE 'ok'
    END AS status
FROM menu_cost m
FULL OUTER JOIN cleaned_cost c ON m.menu_key = c.name_key
WHERE m.menu_key IS NULL
   OR c.name_key IS NULL
   OR c.dish_cost IS NULL
   OR m.menu_cost IS NULL
   OR abs(coalesce(c.dish_cost, 0) - coalesce(m.menu_cost, 0)) > 0.01
ORDER BY status, menu_or_dishname;
```

**Summary counts:**

```sql
WITH cleaned_cost AS (
    SELECT lower(trim(dishname)) AS name_key,
           nullif(trim(dish_cost), '')::numeric AS dish_cost
    FROM public.dish_cost_cleaned_up
    WHERE lower(trim(coalesce(row_kind, ''))) = 'dish_total'
),
menu_cost AS (
    SELECT lower(trim(menu)) AS menu_key, cost AS menu_cost
    FROM public."menuCostExcel"
    WHERE trim(coalesce(menu, '')) <> ''
),
joined AS (
    SELECT
        coalesce(m.menu_key, c.name_key) AS k,
        m.menu_cost,
        c.dish_cost,
        CASE
            WHEN m.menu_key IS NULL THEN 'only_in_cleaned'
            WHEN c.name_key IS NULL THEN 'only_in_menu'
            WHEN abs(coalesce(c.dish_cost, 0) - coalesce(m.menu_cost, 0)) <= 0.01 THEN 'match'
            ELSE 'mismatch'
        END AS bucket
    FROM menu_cost m
    FULL OUTER JOIN cleaned_cost c ON m.menu_key = c.name_key
)
SELECT bucket, count(*) FROM joined GROUP BY bucket ORDER BY bucket;
```

If menu labels differ from `dishname` (POS name vs kitchen name), join through `dishes` / `menuexcel` instead of `menu_key = name_key`.

## Related

- Dish cost case SQL: [`dish_cost_cases.sql`](dish_cost_cases.sql)
- Load latest recipe in app: `loadRecipeFromDB()` → `dbqueries.js` (`RECIPE_LATEST_BATCH_SQL`)
- Promote `dish_total` from staging to `dish_cost`: [`../../useful.sql`](../../useful.sql) (after you trust the CSV)
