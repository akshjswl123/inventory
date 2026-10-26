# Processed-dish cascade — find parents & refresh staging

When a **processed dish** recipe changes, dish cost should be recalculated not only for that dish but for **every menu dish that uses it as a processed ingredient**, and for **their** parents, recursively. **Recipe Maker Save to DB** only bumps the **recipe** version (`item_versions.dishes`); it does **not** write `dish_cost_staging`.

Use the **Query tab** to refresh published costs:

- **Calculate cost (all dishes)** — full `dish_cost_cases.sql`, append all dishes, bump `item_versions.dish_cost_staging` per dish.
- **Re-calculate cost (changed only)** — same calc, append only dishes whose `dish_total` changed vs latest staging.

This document matches the **finding** logic in:

- `dishCostWalk.js` — `FIND_AFFECTED_DISHES_SQL`, `runDishCostCascadeToStaging()` (available for scripts; not called on recipe save)

**Do not confuse versions:** `dish_cost_staging.dish_cost_version` is a **global snapshot run id** (the same integer on every row inserted in that calculate-all or cascade batch). It is **not** the recipe version in `item_versions`. Per-dish recipe versions are stored on staging as `recipe_version` (and only change in `item_versions` when you **Save to DB** in Recipe Maker).

---

## Finding logic (recursive)

**Input:** saved dish code, e.g. `P8` (AATA PROCESSED).

**Recipe rows used:** current version only — `recipe_entries.version` = `item_versions` (`item_type = 'dishes'`), same as `dish_cost_cases.sql`.

**Graph walk (upward):**

1. Start with the saved dish code in set **affected**.
2. Find every **parent** dish `P` whose current recipe has a line where:
   - `UPPER(TRIM("pgNo"))` = child dish code (e.g. `P8`), and
   - child is a real dish (has its own recipe in `recipe_scope`), and
   - line is a normal ingredient (`qty > 0`, not `dish_out` / totals).
3. Add each parent to **affected** and repeat until no new parents.

**Example:** `D074` BUTTER TANDOORI ROTI has a line `pgNo = P8` → saving **P8** includes **D074** in **affected** (and 10+ other roti/paratha dishes in a typical DB).

**SQL:** [`dish_cost_processed_cascade.sql`](dish_cost_processed_cascade.sql) — edit `params.saved_dish_code`, run result sets 1–3.

---

## Updating logic

**Recipe Maker → Save to DB:** `bump_item_version(dishcode, 'dishes')` and new `recipe_entries` rows only.

**Query tab → Calculate / Re-calculate cost:** append `dish_cost_staging`, bump `item_versions.dish_cost_staging` (see `dishCostWalk.js` `runDishCostAllToStaging`, `runDishCostRecalculateChangedToStaging`). Optional future: cascade insert for affected codes only (same as `runDishCostCascadeToStaging`).

Staging **appends** history (v1, v2, …). It does not delete older versions.

Promoting totals to `public.dish_cost` for reports is still a separate step (see `useful.sql` staging → `dish_cost`).

---

## Quick tests

```bash
# List affected dishes for P8 (psql)
docker exec -i poc_db psql -U poc -d poc \
  -v saved_dish_code=P8 \
  -f scripts/useful_queries/dish_cost_processed_cascade.sql
```

After saving P8 in Recipe Maker, check latest staging totals:

```sql
SELECT dish_code, dishname, dish_cost, dish_cost_version
FROM public.dish_cost_staging
WHERE lower(trim(row_kind)) = 'dish_total'
  AND dish_code IN ('P8', 'D074')
ORDER BY dish_cost_version::int DESC;
```

---

## Edge cases

| Case | Included in cascade? |
|------|----------------------|
| Parent uses child with `pgNo` = dish code (`P8`) | Yes |
| Parent uses raw material by numeric `pgNo` only | No (not a processed dish link) |
| Child has no recipe / not in `item_versions` | Parent edge not followed |
| Old recipe rows (non-current `version`) | Ignored |
| Multi-level chain A → B → P8 | All ancestors of P8 are in **affected** |
