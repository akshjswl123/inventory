'use strict';

/**
 * Build offline static-data bundle from the same sources as SQL seeds:
 *   seed_data.sql          → catalog.js vendors/categories + data/dishes.csv
 *   raw_materials_seed     → data/raw_materials30sept11am.csv + data/raw_materialv2.csv (delta)
 *   dish + material scoops → data/dishscoops.csv + data/raw_materialsscoop.csv
 */

const path = require('path');
const { readCsv } = require('./csvSeedUtils');
const { loadCatalog, parseBlock } = require('./catalogLoader');
const {
    buildScoopDerivedCatalogs,
    buildScoopConfigByDishName
} = require('../scoopStaticBuilders');

const ROOT = path.join(__dirname, '..');
const DISHES_CSV = path.join(ROOT, 'data/dishes.csv');
const MATERIALS_CSV = path.join(ROOT, 'data/raw_materials30sept11am.csv');
const MATERIALS_V2_CSV = path.join(ROOT, 'data/raw_materialv2.csv');
const MATERIAL_SCOOPS_CSV = path.join(ROOT, 'data/raw_materialsscoop.csv');
const DISH_SCOOPS_CSV = path.join(ROOT, 'data/dishscoops.csv');

const ALL_ITEMS = 'All';

function dedupeMaterials(rows) {
    const byKey = new Map();
    rows.forEach(r => {
        const itemname = String(r.itemname || '').trim();
        const pgNo = String(r.pgNo || '').trim();
        if (!itemname || !pgNo) return;
        byKey.set(pgNo + '|' + itemname, { itemname, pgNo });
    });
    return Array.from(byKey.values()).sort((a, b) =>
        a.itemname.localeCompare(b.itemname, undefined, { sensitivity: 'base' })
    );
}

function dedupeDishes(rows) {
    const byCode = new Map();
    rows.forEach(r => {
        const dish_name = String(r.dish_name || '').trim();
        const dish_code = String(r.dish_code || '').trim();
        if (!dish_name || !dish_code) return;
        byCode.set(dish_code.toLowerCase(), { dish_name, dish_code });
    });
    return Array.from(byCode.values()).sort((a, b) =>
        a.dish_code.localeCompare(b.dish_code, undefined, { numeric: true, sensitivity: 'base' })
    );
}

function parseNumOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function csvNullish(value) {
    if (value == null || value === '') return null;
    if (String(value).trim().toUpperCase() === 'NULL') return null;
    return value;
}

function normalizeScoopRow(r) {
    const chainRaw = r.conversion_chain;
    const chain = chainRaw != null && chainRaw !== ''
        && String(chainRaw).trim().toUpperCase() !== 'NULL'
        ? String(chainRaw).trim()
        : null;
    return {
        scoop_item_name: String(r.scoop_item_name || r.dish_name || '').trim(),
        scoop_item_id: r.scoop_item_id != null && String(r.scoop_item_id).trim() !== ''
            ? String(r.scoop_item_id).trim()
            : (r.dish_code ? String(r.dish_code).trim() : null),
        destination_unit: String(r.destination_unit || '').trim(),
        scoop_name: String(r.scoop_name || '').trim(),
        factor: parseNumOrNull(r.factor),
        conversion_chain: chain,
        qty_in_grams: parseNumOrNull(r.qty_in_grams),
        qty_in_ml: parseNumOrNull(r.qty_in_ml),
        qty_in_piece: parseNumOrNull(r.qty_in_piece),
        unused: String(r.unused || '').toLowerCase() === 'true'
    };
}

/** All scoop_config rows inserted by dish + raw_materials seed SQL (CSV sources). */
function buildScoopConfigFromSeedCsvs() {
    const byName = new Map();
    [MATERIAL_SCOOPS_CSV, DISH_SCOOPS_CSV].forEach(file => {
        readCsv(file).forEach(r => {
            const row = normalizeScoopRow(r);
            if (!row.scoop_name) return;
            if (!byName.has(row.scoop_name)) {
                byName.set(row.scoop_name, row);
            }
        });
    });
    return Array.from(byName.values()).sort((a, b) =>
        String(a.scoop_name).localeCompare(String(b.scoop_name))
    );
}

function buildVendorItemsOffline(vendorItemsCsv, vendors, catalog) {
    const itemNames = catalog.map(r => r.itemname).filter(Boolean);
    const out = {};
    parseBlock(vendorItemsCsv).forEach(c => {
        if (!c[0]) return;
        const items = c.slice(1).filter(item => item !== '');
        out[c[0]] = (items.length === 1 && items[0].toLowerCase() === ALL_ITEMS.toLowerCase())
            ? ALL_ITEMS
            : items;
    });
    vendors.forEach(vendor => {
        if (!out[vendor]) out[vendor] = ALL_ITEMS;
    });
    Object.keys(out).forEach(vendor => {
        if (Array.isArray(out[vendor])
            && out[vendor].length === itemNames.length
            && itemNames.length > 0) {
            out[vendor] = ALL_ITEMS;
        }
    });
    return out;
}

function buildCategoryItemsOffline(categoryItemsCsv, categories, catalog) {
    const itemNames = catalog.map(r => r.itemname).filter(Boolean);
    const out = {};
    parseBlock(categoryItemsCsv).forEach(c => {
        if (!c[0]) return;
        const items = c.slice(1).filter(item => item !== '');
        out[c[0]] = (items.length === 1 && items[0].toLowerCase() === ALL_ITEMS.toLowerCase())
            ? ALL_ITEMS
            : items;
    });
    categories.forEach(cat => {
        if (!out[cat]) out[cat] = ALL_ITEMS;
    });
    Object.keys(out).forEach(cat => {
        if (Array.isArray(out[cat])
            && out[cat].length === itemNames.length
            && itemNames.length > 0) {
            out[cat] = ALL_ITEMS;
        }
    });
    return out;
}

/**
 * @returns {{ core, materials, scoopConfig, bundle }}
 */
function buildOfflineStaticData() {
    const ctx = loadCatalog();

    const vendors = [...new Set(
        parseBlock(ctx.VENDORS_CSV).reduce((acc, row) => acc.concat(row.filter(v => v !== '')), [])
            .map(v => v.trim())
            .filter(v => v && v.toLowerCase() !== 'all')
    )];
    const categories = parseBlock(ctx.CATEGORIES_CSV)
        .reduce((acc, row) => acc.concat(row.filter(v => v !== '')), [])
        .map(c => c.trim())
        .filter(Boolean);

    const dishRows = dedupeDishes(readCsv(DISHES_CSV));
    const dishCatalog = dishRows.map(d => ({
        dishName: d.dish_name,
        dishCode: d.dish_code
    }));
    const dishNames = dishCatalog.map(d => d.dishName);

    const catalog = dedupeMaterials([
        ...readCsv(MATERIALS_CSV),
        ...readCsv(MATERIALS_V2_CSV)
    ]);
    const scoopConfig = buildScoopConfigFromSeedCsvs();
    const scoopDerived = buildScoopDerivedCatalogs(scoopConfig, dishNames, dishCatalog);
    const SCOOP_CONFIG_BY_DISH_NAME = buildScoopConfigByDishName(
        scoopDerived.SCOOP_CONFIG,
        dishCatalog
    );

    const vendorItemsCsv = String(ctx.VENDOR_ITEMS_CSV || '');
    const categoryItemsCsv = String(ctx.CATEGORY_ITEMS_CSV || '');

    const core = {
        source: 'static_seed_core.js',
        ALL_ITEMS,
        VENDORS: vendors,
        CATEGORIES: categories,
        DISHNAMES: dishNames,
        DISH_CATALOG: dishCatalog
    };

    const materials = {
        source: 'static_seed_materials.js',
        CATALOG: catalog,
        RECIPE_CATALOG: catalog.map(r => ({
            recipeItemName: r.itemname,
            pgNo: r.pgNo
        }))
    };

    const bundle = {
        source: 'static_seed_catalog.js',
        fetchedAt: new Date().toISOString(),
        ALL_ITEMS,
        VENDORS: vendors,
        CATEGORIES: categories,
        DISHNAMES: dishNames,
        DISH_CATALOG: dishCatalog,
        CATALOG: catalog,
        RECIPE_CATALOG: materials.RECIPE_CATALOG,
        SCOOP_CONFIG: scoopDerived.SCOOP_CONFIG,
        SCOOP_IN_CATALOG: scoopDerived.SCOOP_IN_CATALOG,
        SCOOP_OUT_CATALOG: scoopDerived.SCOOP_OUT_CATALOG,
        RECIPE_SCOOP_CATALOG: scoopDerived.RECIPE_SCOOP_CATALOG,
        DISH_OUT_SCOOP_CATALOG: scoopDerived.DISH_OUT_SCOOP_CATALOG,
        SCOOP_INVENTORY_CATALOG: scoopDerived.SCOOP_INVENTORY_CATALOG,
        SCOOP_CONFIG_BY_DISH_NAME,
        USABLE_PROCESSED_DISH_CATALOG: [],
        VENDOR_ITEMS: buildVendorItemsOffline(vendorItemsCsv, vendors, catalog),
        CATEGORY_ITEMS: buildCategoryItemsOffline(categoryItemsCsv, categories, catalog)
    };

    return { core, materials, scoopConfig, bundle };
}

module.exports = {
    buildOfflineStaticData,
    buildScoopConfigFromSeedCsvs
};
