'use strict';

const ALL_ITEMS = 'All';
const { buildScoopDerivedCatalogs, buildScoopConfigByDishName } = require('./scoopStaticBuilders');

const SQL = {
    vendors: `
        SELECT id, vendor_name
        FROM vendors
        ORDER BY vendor_name
    `,
    categories: `
        SELECT id, category_name
        FROM categories
        ORDER BY category_name
    `,
    rawMaterials: `
        SELECT id, itemname AS item_name, "pgNo" AS pg_no
        FROM raw_materials
        ORDER BY itemname
    `,
    dishes: `
        SELECT id, dish_name, dish_code
        FROM dishes
        ORDER BY dish_name
    `,
    scoopNames: `
        SELECT DISTINCT scoop_name
        FROM scoop_config
        WHERE scoop_name IS NOT NULL AND TRIM(scoop_name) <> ''
        ORDER BY scoop_name
    `,
    scoopRows: `
        SELECT scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor,
               conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused
        FROM scoop_config
        WHERE scoop_name IS NOT NULL AND TRIM(scoop_name) <> ''
        ORDER BY scoop_item_name, scoop_name
    `,
    vendorItems: `
        SELECT v.vendor_name, rm.itemname AS item_name, rm."pgNo" AS pg_no
        FROM vendors v
        CROSS JOIN raw_materials rm
        ORDER BY v.vendor_name, rm.itemname
    `,
    categoryItems: `
        SELECT c.category_name, rm.itemname AS item_name, rm."pgNo" AS pg_no
        FROM categories c
        CROSS JOIN raw_materials rm
        ORDER BY c.category_name, rm.itemname
    `,
    usableProcessedDishes: `
        SELECT DISTINCT ON (LOWER(TRIM(r.dishname)))
            TRIM(r.dishname) AS dish_name,
            TRIM(r.dishcode) AS dish_code,
            TRIM(r.usable_processed_scoop) AS usable_processed_scoop
        FROM recipe_entries r
        WHERE LOWER(TRIM(r.reciepeitemname)) = 'dish_out'
          AND COALESCE(r.is_usable_in_other_dish, false) = true
          AND r.usable_processed_scoop IS NOT NULL
          AND TRIM(r.usable_processed_scoop) <> ''
        ORDER BY LOWER(TRIM(r.dishname)), r.created_at DESC, r.id DESC
    `
};

function buildVendorItems(vendorRows, itemNames) {
    const out = {};
    vendorRows.forEach(r => {
        const vendor = r.vendor_name;
        if (!vendor) return;
        if (!out[vendor]) out[vendor] = [];
        if (r.item_name && !out[vendor].includes(r.item_name)) {
            out[vendor].push(r.item_name);
        }
    });

    Object.keys(out).forEach(vendor => {
        if (out[vendor].length === itemNames.length && itemNames.length > 0) {
            out[vendor] = ALL_ITEMS;
        }
    });

    return out;
}

function buildCategoryItems(categoryRows, itemNames) {
    const out = {};
    categoryRows.forEach(r => {
        const category = r.category_name;
        if (!category) return;
        if (!out[category]) out[category] = [];
        if (r.item_name && !out[category].includes(r.item_name)) {
            out[category].push(r.item_name);
        }
    });

    Object.keys(out).forEach(category => {
        if (out[category].length === itemNames.length && itemNames.length > 0) {
            out[category] = ALL_ITEMS;
        }
    });

    return out;
}

async function fetchStaticDataBundle(pool) {
    const [
        vendorsRes,
        categoriesRes,
        rawMaterialsRes,
        dishesRes,
        scoopRowsRes,
        vendorItemsRes,
        categoryItemsRes,
        usableProcessedRes
    ] = await Promise.all([
        pool.query(SQL.vendors),
        pool.query(SQL.categories),
        pool.query(SQL.rawMaterials),
        pool.query(SQL.dishes),
        pool.query(SQL.scoopRows),
        pool.query(SQL.vendorItems),
        pool.query(SQL.categoryItems),
        pool.query(SQL.usableProcessedDishes)
    ]);

    const vendors = vendorsRes.rows.map(r => r.vendor_name).filter(Boolean);
    const categories = categoriesRes.rows.map(r => r.category_name).filter(Boolean);
    const catalog = rawMaterialsRes.rows.map(r => ({
        itemname: r.item_name || '',
        pgNo: r.pg_no || ''
    }));
    const itemNames = catalog.map(r => r.itemname).filter(Boolean);
    const dishCatalog = dishesRes.rows
        .filter(r => r.dish_name)
        .map(r => ({
            dishName: r.dish_name,
            dishCode: r.dish_code || ''
        }));
    const dishNames = dishCatalog.map(r => r.dishName);
    const scoopRows = scoopRowsRes.rows;
    const scoopDerived = buildScoopDerivedCatalogs(scoopRows, dishNames, dishCatalog);
    const SCOOP_CONFIG_BY_DISH_NAME = buildScoopConfigByDishName(scoopDerived.SCOOP_CONFIG, dishCatalog);
    const USABLE_PROCESSED_DISH_CATALOG = (usableProcessedRes.rows || []).map(r => ({
        dishName: r.dish_name || '',
        dishCode: r.dish_code || '',
        usableProcessedScoop: r.usable_processed_scoop || ''
    })).filter(e => e.dishName && e.usableProcessedScoop);

    return {
        source: 'database',
        fetchedAt: new Date().toISOString(),
        ALL_ITEMS,
        VENDORS: vendors,
        CATEGORIES: categories,
        DISHNAMES: dishNames,
        DISH_CATALOG: dishCatalog,
        CATALOG: catalog,
        RECIPE_CATALOG: catalog.map(r => ({
            recipeItemName: r.itemname,
            pgNo: r.pgNo
        })),
        SCOOP_CONFIG: scoopDerived.SCOOP_CONFIG,
        SCOOP_IN_CATALOG: scoopDerived.SCOOP_IN_CATALOG,
        SCOOP_OUT_CATALOG: scoopDerived.SCOOP_OUT_CATALOG,
        RECIPE_SCOOP_CATALOG: scoopDerived.RECIPE_SCOOP_CATALOG,
        DISH_OUT_SCOOP_CATALOG: scoopDerived.DISH_OUT_SCOOP_CATALOG,
        SCOOP_INVENTORY_CATALOG: scoopDerived.SCOOP_INVENTORY_CATALOG,
        SCOOP_CONFIG_BY_DISH_NAME,
        USABLE_PROCESSED_DISH_CATALOG,
        VENDOR_ITEMS: buildVendorItems(vendorItemsRes.rows, itemNames),
        CATEGORY_ITEMS: buildCategoryItems(categoryItemsRes.rows, itemNames)
    };
}

module.exports = {
    SQL,
    fetchStaticDataBundle
};
