# Versioning runbook

## Goals

- Dish cost always uses **current** recipe + RMC + scoop (`item_versions`).
- Recipe **Save to DB** → new `dishes` version; old `recipe_entries` kept.
- Bill **Save to DB** → new `raw_materials_cost` version row; old rates kept.
- Scoop **Save to DB** → new `scoop_config` version row; old scoops kept.

## Apply on a restored pre-version dump

```bash
# 1–2 schema
docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 < scripts/14_item_versions.sql
docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 < scripts/15_recipe_entries_and_raw_materials_cost_version.sql

# 3 RMC unique (pgNo, version) after consolidating dupes at same version
docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 < scripts/17_raw_materials_cost_version_unique.sql

# 4 scoop dedupe (one row per scoop_name)
docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 < scripts/17b_scoop_config_dedupe_v1.sql
```

Restart the Node app so Query / Recipe Maker pick up `dbqueries.js` + `dishCostWalk.js`.

## How “latest” is chosen

| Data | Current version | Tie-break within that version |
|------|-----------------|-------------------------------|
| Recipes | `item_versions` `dishes` | `DISTINCT ON` line key → max `id` |
| RMC | `item_versions` `raw_materials_cost` | one row per `(pgNo, version)` |
| Scoops | `item_versions` `scoop_config` | match name (+ item), max `id` |

## Before vs after versioning (same cost)

After restore → 14/15/17/17b with **no** recipe/bill saves, cost export should match pre-version baseline (all data at version 1).

If the dump had **many historical recipe saves**, script 15 stamps them all as v1 and cost explodes. Fix by wiping history and reseeding from cleaned staging:

```bash
# dish_cost_staging must hold cleaned baseline CSV (e.g. dishCostFromQueryTabCounterDb_cleaned.csv)
docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
  < scripts/18_recipe_entries_reseed_from_staging_v1.sql
```

Then re-run **Calculate cost (all dishes)** and compare again.

## Compare versions later

```sql
-- Recipe history for a dish
SELECT version, reciepeitemname, "pgNo", qty, receipescoop
FROM recipe_entries
WHERE upper(trim(dishcode)) = 'D057'
ORDER BY version, id;

-- RMC history for a raw
SELECT version, "pgNo", based_on_billno, ratepergram, rateperml, created_at
FROM raw_materials_cost
WHERE upper(trim("pgNo")) = 'V10'
ORDER BY version;
```
