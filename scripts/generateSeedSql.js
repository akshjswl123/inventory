'use strict';

const fs = require('fs');
const path = require('path');
const { loadCatalog, buildCatalogMaps, buildScoopConfigs } = require('./catalogLoader');

const OUT_FILE = path.join(__dirname, 'seed_data.sql');
const BATCH = 80;

function sqlStr(value) {
    if (value == null || value === '') return 'NULL';
    return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlNum(value) {
    if (value == null || value === '') return 'NULL';
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : 'NULL';
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

function buildSampleTransactional(catalog, pgByItem, vendors, categories, dishes, scoops, dishCatalog) {
    const items = catalog.slice(0, 5);
    const vendorList = vendors.slice(0, 5);
    const categoryList = categories.slice(0, 5);
    const dishList = dishes.slice(0, 5);

    const scoopIn = scoops.find(s => s.scoop_name.endsWith('_in')) || scoops[0];
    const scoopOut = scoops.find(s => s.scoop_name.endsWith('_out')) || scoops[0];
    const scoopRecipe = scoops.find(s => s.scoop_name.includes('_reciepe') || s.scoop_name.includes('_recipe')) || scoops[0];

    const orders = vendorList.map((vendor, i) => ({
        vendor: sqlStr(vendor),
        dt: sqlStr('2025-09-' + String(i + 1).padStart(2, '0')),
        billno: sqlStr('SEED-B' + String(i + 1).padStart(3, '0')),
        customer: sqlStr('Main Kitchen'),
        billtotal: sqlNum(1000 + i * 250),
        billcomments: sqlStr('Seed from catalog.js')
    }));

    const orderItems = items.map((item, i) => ({
        billno: sqlStr('SEED-B' + String(i + 1).padStart(3, '0')),
        itemname: sqlStr(item.itemname),
        pgno: sqlStr(item.pgNo),
        scoopin: sqlStr(scoopIn ? scoopIn.scoop_name : item.itemname + '_gm_in'),
        qty: sqlNum(1 + i),
        rate: sqlNum(100 + i * 10),
        itemtotal: sqlNum((1 + i) * (100 + i * 10)),
        comments: sqlStr('Seed from catalog.js')
    }));

    const inventoryOut = categoryList.map((category, i) => ({
        category: sqlStr(category),
        dt: sqlStr('2025-09-' + String(i + 1).padStart(2, '0')),
        tm: sqlStr('10:' + String(i * 10).padStart(2, '0')),
        issuedto: sqlStr('Line ' + (i + 1)),
        commontag: sqlStr('SEED-OUT-' + String(i + 1).padStart(3, '0')),
        totalqty: sqlNum(100 * (i + 1))
    }));

    const inventoryOutItems = items.map((item, i) => ({
        commontag: sqlStr('SEED-OUT-' + String(i + 1).padStart(3, '0')),
        itemname: sqlStr(item.itemname),
        pgno: sqlStr(item.pgNo),
        scoop_out: sqlStr(scoopOut ? scoopOut.scoop_name : item.itemname + '_gm_out'),
        qty: sqlNum(50 + i * 10),
        comments: sqlStr('Seed from catalog.js')
    }));

    const orderEntries = items.map((item, i) => ({
        vendor: sqlStr(vendorList[i % vendorList.length]),
        dt: sqlStr('2025-09-10'),
        billno: sqlStr('SEED-FLAT-' + String(i + 1).padStart(2, '0')),
        itemname: sqlStr(item.itemname),
        pgno: sqlStr(item.pgNo),
        scoopin: sqlStr(scoopIn ? scoopIn.scoop_name : item.itemname + '_gm_in'),
        qty: sqlNum(1 + i),
        rate: sqlNum(120 + i * 5),
        itemtotal: sqlNum((1 + i) * (120 + i * 5)),
        comments: sqlStr('Seed from catalog.js')
    }));

    const orderOut = items.map((item, i) => ({
        category: sqlStr(categoryList[i % categoryList.length]),
        dt: sqlStr('2025-09-10'),
        time: sqlStr('09:' + String(i * 10).padStart(2, '0')),
        itemname: sqlStr(item.itemname),
        pgNo: sqlStr(item.pgNo),
        scoop_out: sqlStr(scoopOut ? scoopOut.scoop_name : item.itemname + '_gm_out'),
        qty: sqlNum(25 + i * 5),
        comments: sqlStr('Seed from catalog.js')
    }));

    const recipeEntries = dishList.map((dish, i) => {
        const item = items[i % items.length];
        const dishMeta = (dishCatalog || [])[i] || {};
        return {
            dishname: sqlStr(dish),
            dishcode: sqlStr(dishMeta.dishCode || null),
            reciepeitemname: sqlStr(item.itemname),
            pgNo: sqlStr(item.pgNo),
            receipescoop: sqlStr(scoopRecipe ? scoopRecipe.scoop_name : item.itemname + '_gm_reciepe'),
            qty: sqlNum(100 + i * 25),
            inGm: sqlNum(100 + i * 25),
            inML: 'NULL::numeric',
            inPiece: 'NULL::numeric',
            comments: sqlStr('Seed from catalog.js')
        };
    });

    return { orders, orderItems, inventoryOut, inventoryOutItems, orderEntries, orderOut, recipeEntries };
}

function main() {
    const ctx = loadCatalog();
    const { catalog, pgByItem, vendors, categories, dishes, dishCatalog } = buildCatalogMaps(ctx);
    const scoops = buildScoopConfigs(ctx, pgByItem);
    const sample = buildSampleTransactional(catalog, pgByItem, vendors, categories, dishes, scoops, dishCatalog);

    const vendorRows = vendors.map(v => ({ vendor_name: sqlStr(v) }));
    const categoryRows = categories.map(c => ({ category_name: sqlStr(c) }));
    const dishRows = dishCatalog.map(d => ({
        dish_name: sqlStr(d.dishName),
        dish_code: sqlStr(d.dishCode || null)
    }));
    const rawRows = catalog.map(c => ({
        pgNo: sqlStr(c.pgNo),
        itemname: sqlStr(c.itemname),
        comments: sqlStr('From catalog.js CATALOG_CSV')
    }));
    const configRows = scoops.map(s => ({
        scoop_item_name: sqlStr(s.scoop_item_name),
        scoop_item_id: sqlStr(s.scoop_item_id),
        destination_unit: sqlStr(s.destination_unit),
        scoop_name: sqlStr(s.scoop_name),
        factor: sqlNumeric(s.factor),
        conversion_chain: 'NULL',
        qty_in_grams: sqlNumeric(s.qty_in_grams),
        qty_in_ml: sqlNumeric(s.qty_in_ml),
        qty_in_piece: sqlNumeric(s.qty_in_piece),
        unused: sqlBool(s.unused)
    }));

    const header = `-- =============================================================================
-- seed_data.sql — generated from catalog.js
-- =============================================================================
-- Source: catalog.js (VENDORS_CSV, CATEGORIES_CSV, DISHNAME_CSV, CATALOG_CSV,
--         SCOOP_IN/OUT/RECIPE/INVENTORY, DISH_OUT_SCOOP_CSV)
--
-- Regenerate:
--   node scripts/generateSeedSql.js
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

    sql += `-- raw_materials (${rawRows.length} rows from CATALOG_CSV)\n`;
    chunk(rawRows, BATCH).forEach(part => {
        const values = part.map(r => `(${r.pgNo}, ${r.itemname}, ${r.comments})`).join(',\n    ');
        sql += `INSERT INTO public.raw_materials ("pgNo", itemname, comments)\nSELECT v."pgNo", v.itemname, v.comments\nFROM (VALUES\n    ${values}\n) AS v("pgNo", itemname, comments)\nWHERE NOT EXISTS (\n    SELECT 1 FROM public.raw_materials rm WHERE rm.itemname = v.itemname\n);\n\n`;
    });

    sql += `-- scoop_config (${configRows.length} rows from scoop catalogs)\n`;
    chunk(configRows, BATCH).forEach(part => {
        const values = part.map(r =>
            `(${r.scoop_item_name}, ${r.scoop_item_id}, ${r.destination_unit}, ${r.scoop_name}, ${r.factor}, ${r.conversion_chain}, ${r.qty_in_grams}, ${r.qty_in_ml}, ${r.qty_in_piece}, ${r.unused})`
        ).join(',\n    ');
        sql += `INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)\nSELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused\nFROM (VALUES\n    ${values}\n) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)\nWHERE NOT EXISTS (\n    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name\n);\n\n`;
    });

    // Transactional samples (5 rows each, catalog-backed)
    sql += `-- orders (sample — first 5 vendors from catalog.js)\n`;
    sql += `INSERT INTO public.orders (vendor, dt, billno, customer, billtotal, billcomments)\nSELECT v.vendor, v.dt::date, v.billno, v.customer, v.billtotal::numeric, v.billcomments\nFROM (VALUES\n    ${sample.orders.map(r => `(${r.vendor}, ${r.dt}, ${r.billno}, ${r.customer}, ${r.billtotal}, ${r.billcomments})`).join(',\n    ')}\n) AS v(vendor, dt, billno, customer, billtotal, billcomments)\nWHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.billno = v.billno);\n\n`;

    sql += `-- order_items (sample — first 5 catalog items)\n`;
    sql += `INSERT INTO public.order_items (order_id, itemname, pgno, scoopin, qty, rate, itemtotal, comments)\nSELECT o.id, v.itemname, v.pgno, v.scoopin, v.qty::numeric, v.rate::numeric, v.itemtotal::numeric, v.comments\nFROM (VALUES\n    ${sample.orderItems.map(r => `(${r.billno}, ${r.itemname}, ${r.pgno}, ${r.scoopin}, ${r.qty}, ${r.rate}, ${r.itemtotal}, ${r.comments})`).join(',\n    ')}\n) AS v(billno, itemname, pgno, scoopin, qty, rate, itemtotal, comments)\nJOIN public.orders o ON o.billno = v.billno\nWHERE NOT EXISTS (\n    SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id AND oi.itemname = v.itemname\n);\n\n`;

    sql += `-- inventory_out (sample — first 5 categories)\n`;
    sql += `INSERT INTO public.inventory_out (category, dt, tm, issuedto, commontag, totalqty)\nSELECT v.category, v.dt::date, v.tm, v.issuedto, v.commontag, v.totalqty::numeric\nFROM (VALUES\n    ${sample.inventoryOut.map(r => `(${r.category}, ${r.dt}, ${r.tm}, ${r.issuedto}, ${r.commontag}, ${r.totalqty})`).join(',\n    ')}\n) AS v(category, dt, tm, issuedto, commontag, totalqty)\nWHERE NOT EXISTS (SELECT 1 FROM public.inventory_out io WHERE io.commontag = v.commontag);\n\n`;

    sql += `-- inventory_out_items (sample)\n`;
    sql += `INSERT INTO public.inventory_out_items (inventory_out_id, itemname, pgno, scoop_out, qty, comments)\nSELECT io.id, v.itemname, v.pgno, v.scoop_out, v.qty::numeric, v.comments\nFROM (VALUES\n    ${sample.inventoryOutItems.map(r => `(${r.commontag}, ${r.itemname}, ${r.pgno}, ${r.scoop_out}, ${r.qty}, ${r.comments})`).join(',\n    ')}\n) AS v(commontag, itemname, pgno, scoop_out, qty, comments)\nJOIN public.inventory_out io ON io.commontag = v.commontag\nWHERE NOT EXISTS (\n    SELECT 1 FROM public.inventory_out_items ioi WHERE ioi.inventory_out_id = io.id AND ioi.itemname = v.itemname\n);\n\n`;

    sql += `-- order_entries (sample flat in — first 5 catalog items)\n`;
    sql += `INSERT INTO public.order_entries (vendor, dt, billno, itemname, pgno, scoopin, qty, rate, itemtotal, comments)\nSELECT v.vendor, v.dt::date, v.billno, v.itemname, v.pgno, v.scoopin, v.qty::numeric, v.rate::numeric, v.itemtotal::numeric, v.comments\nFROM (VALUES\n    ${sample.orderEntries.map(r => `(${r.vendor}, ${r.dt}, ${r.billno}, ${r.itemname}, ${r.pgno}, ${r.scoopin}, ${r.qty}, ${r.rate}, ${r.itemtotal}, ${r.comments})`).join(',\n    ')}\n) AS v(vendor, dt, billno, itemname, pgno, scoopin, qty, rate, itemtotal, comments)\nWHERE NOT EXISTS (\n    SELECT 1 FROM public.order_entries oe\n    WHERE oe.vendor = v.vendor AND oe.dt = v.dt::date AND oe.billno = v.billno\n      AND oe.itemname = v.itemname AND oe.pgno = v.pgno\n);\n\n`;

    sql += `-- order_out (sample flat out)\n`;
    sql += `INSERT INTO public.order_out (category, dt, "time", itemname, "pgNo", scoop_out, qty, comments)\nSELECT v.category, v.dt::date, v."time", v.itemname, v."pgNo", v.scoop_out, v.qty::numeric, v.comments\nFROM (VALUES\n    ${sample.orderOut.map(r => `(${r.category}, ${r.dt}, ${r.time}, ${r.itemname}, ${r.pgNo}, ${r.scoop_out}, ${r.qty}, ${r.comments})`).join(',\n    ')}\n) AS v(category, dt, "time", itemname, "pgNo", scoop_out, qty, comments)\nWHERE NOT EXISTS (\n    SELECT 1 FROM public.order_out oo\n    WHERE oo.itemname = v.itemname AND oo."pgNo" = v."pgNo"\n      AND oo.scoop_out = v.scoop_out AND oo.dt = v.dt::date AND oo."time" = v."time"\n);\n\n`;

    sql += `-- recipe_entries (sample — first 5 dishes + catalog items)\n`;
    sql += `INSERT INTO public.recipe_entries (dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece", comments)\nSELECT v.dishname, v.dishcode, v.reciepeitemname, v."pgNo", v.receipescoop, v.qty::numeric, v."inGm"::numeric, v."inML", v."inPiece", v.comments\nFROM (VALUES\n    ${sample.recipeEntries.map(r => `(${r.dishname}, ${r.dishcode}, ${r.reciepeitemname}, ${r.pgNo}, ${r.receipescoop}, ${r.qty}, ${r.inGm}, ${r.inML}, ${r.inPiece}, ${r.comments})`).join(',\n    ')}\n) AS v(dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece", comments)\nWHERE NOT EXISTS (\n    SELECT 1 FROM public.recipe_entries re\n    WHERE re.dishname = v.dishname AND re.reciepeitemname = v.reciepeitemname\n      AND re.receipescoop = v.receipescoop\n);\n\n`;

    sql += `COMMIT;

-- Row counts after seed
SELECT 'vendors' AS tbl, COUNT(*) AS rows FROM public.vendors
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'dishes', COUNT(*) FROM public.dishes
UNION ALL SELECT 'raw_materials', COUNT(*) FROM public.raw_materials
UNION ALL SELECT 'scoop_config', COUNT(*) FROM public.scoop_config
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'order_items', COUNT(*) FROM public.order_items
UNION ALL SELECT 'inventory_out', COUNT(*) FROM public.inventory_out
UNION ALL SELECT 'inventory_out_items', COUNT(*) FROM public.inventory_out_items
UNION ALL SELECT 'order_entries', COUNT(*) FROM public.order_entries
UNION ALL SELECT 'order_out', COUNT(*) FROM public.order_out
UNION ALL SELECT 'recipe_entries', COUNT(*) FROM public.recipe_entries
ORDER BY tbl;
`;

    fs.writeFileSync(OUT_FILE, sql, 'utf8');

    console.log('Wrote ' + OUT_FILE);
    console.log('  vendors:          ' + vendorRows.length);
    console.log('  categories:       ' + categoryRows.length);
    console.log('  dishes:           ' + dishRows.length);
    console.log('  raw_materials:    ' + rawRows.length);
    console.log('  scoop_config: ' + configRows.length);
}

main();
