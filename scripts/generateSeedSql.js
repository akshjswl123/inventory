'use strict';

const fs = require('fs');
const path = require('path');
const { loadCatalog, buildCatalogMaps } = require('./catalogLoader');
const { readCsv } = require('./csvSeedUtils');

const OUT_FILE = path.join(__dirname, 'seed_data.sql');
const DISHES_CSV = path.join(__dirname, '..', 'data/dishes.csv');
const BATCH = 80;

function sqlStr(value) {
    if (value == null || value === '') return 'NULL';
    return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlNumeric(value) {
    if (value == null || value === '') return 'NULL::numeric';
    const n = Number(value);
    return Number.isFinite(n) ? String(n) + '::numeric' : 'NULL::numeric';
}

function sqlBool(value) {
    return value ? 'true' : 'false';
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function insertSimple(table, columns, rows, conflictSql) {
    if (!rows.length) return `-- ${table}: no rows\n`;
    const lines = [`-- ${table} (${rows.length} rows)`];
    chunk(rows, BATCH).forEach(part => {
        const values = part.map(row =>
            '(' + columns.map(col => row[col]).join(', ') + ')'
        ).join(',\n    ');
        lines.push(
            `INSERT INTO public.${table} (${columns.map(c => c === 'pgNo' ? '"pgNo"' : c).join(', ')})`,
            'VALUES',
            '    ' + values,
            conflictSql ? conflictSql + ';' : ';',
            ''
        );
    });
    return lines.join('\n');
}

function main() {
    const ctx = loadCatalog();
    const { vendors, categories } = buildCatalogMaps(ctx);
    const dishCsv = readCsv(DISHES_CSV).filter(d => String(d.dish_name || '').trim());
    const vendorRows = vendors.map(v => ({ vendor_name: sqlStr(v) }));
    const categoryRows = categories.map(c => ({ category_name: sqlStr(c) }));
    const dishRows = dishCsv.map(d => ({
        dish_name: sqlStr(String(d.dish_name).trim()),
        dish_code: sqlStr(String(d.dish_code || '').trim() || null)
    }));

    const header = `-- =============================================================================
-- seed_data.sql — generated from catalog.js
-- =============================================================================
-- Source: catalog.js (vendors, categories); data/dishes.csv (dishes)
-- Dish scoops: scripts/dish_scoops_seed.sql (data/dishscoops.csv)
-- Raw materials: scripts/raw_materials_seed.sql + custom scoops
--
-- Regenerate:
--   node scripts/generateSeedSql.js
--   node scripts/generateDishScoopsSeed.js
--   node scripts/generateRawMaterialsSeed.js
--   node scripts/generateStaticSeedCatalog.js
--
-- Run:
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/seed_data.sql
-- =============================================================================

BEGIN;

`;

    const parts = [
        header,
        insertSimple('vendors', ['vendor_name'], vendorRows, 'ON CONFLICT (vendor_name) DO NOTHING'),
        insertSimple('categories', ['category_name'], categoryRows, 'ON CONFLICT (category_name) DO NOTHING'),
        insertSimple('dishes', ['dish_name', 'dish_code'], dishRows, 'ON CONFLICT (dish_name) DO NOTHING')
    ];

    let sql = parts.join('\n');

    sql += `COMMIT;

-- Row counts after seed
SELECT 'vendors' AS tbl, COUNT(*) AS rows FROM public.vendors
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'dishes', COUNT(*) FROM public.dishes
ORDER BY tbl;
`;

    fs.writeFileSync(OUT_FILE, sql, 'utf8');

    console.log('Wrote ' + OUT_FILE);
    console.log('  vendors:          ' + vendorRows.length);
    console.log('  categories:       ' + categoryRows.length);
    console.log('  dishes:           ' + dishRows.length);
}

main();
