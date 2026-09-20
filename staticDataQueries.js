'use strict';

const ALL_ITEMS = 'All';

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
        SELECT scoop_item_name, scoop_name, factor
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
    `
};

function endsWithSuffix(value, suffix) {
    const v = String(value || '');
    const s = String(suffix || '');
    return v.length >= s.length && v.slice(-s.length).toLowerCase() === s.toLowerCase();
}

function buildScoopCatalog(rows, suffix, scoopField) {
    return rows
        .filter(r => endsWithSuffix(r.scoop_name, suffix))
        .map(r => ({
            itemname: r.scoop_item_name || '',
            [scoopField]: r.scoop_name,
            rate: r.factor != null ? Number(r.factor) : 0,
            defaultQty: r.factor != null ? Number(r.factor) : null
        }));
}

function buildRecipeScoopCatalog(rows) {
    return rows
        .filter(r => endsWithSuffix(r.scoop_name, '_reciepe') || endsWithSuffix(r.scoop_name, '_recipe'))
        .map(r => ({
            recipeItemName: r.scoop_item_name || '',
            recipeScoop: r.scoop_name
        }));
}

function buildInventoryCatalog(rows) {
    const out = {};
    rows
        .filter(r => endsWithSuffix(r.scoop_name, '_inventory'))
        .forEach(r => {
            if (r.scoop_item_name) out[r.scoop_item_name] = r.scoop_name;
        });
    return out;
}

function buildDishOutScoopCatalog(rows, dishNames) {
    const fromScoops = rows
        .filter(r => endsWithSuffix(r.scoop_name, '_1_portion'))
        .map(r => ({
            dishname: r.scoop_item_name || r.scoop_name.replace(/_1_portion$/i, ''),
            dish_out_scoop: r.scoop_name
        }));

    if (fromScoops.length) return fromScoops;

    return (dishNames || []).map(name => ({
        dishname: name,
        dish_out_scoop: name + '_1_portion'
    }));
}

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
        categoryItemsRes
    ] = await Promise.all([
        pool.query(SQL.vendors),
        pool.query(SQL.categories),
        pool.query(SQL.rawMaterials),
        pool.query(SQL.dishes),
        pool.query(SQL.scoopRows),
        pool.query(SQL.vendorItems),
        pool.query(SQL.categoryItems)
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

    const scoopInCatalog = buildScoopCatalog(scoopRows, '_in', 'scoop_in');
    const scoopOutCatalog = buildScoopCatalog(scoopRows, '_out', 'scoop_out');

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
        SCOOP_IN_CATALOG: scoopInCatalog,
        SCOOP_OUT_CATALOG: scoopOutCatalog.map(r => ({
            itemname: r.itemname,
            scoop_out: r.scoop_out,
            defaultQty: r.defaultQty
        })),
        RECIPE_SCOOP_CATALOG: buildRecipeScoopCatalog(scoopRows),
        DISH_OUT_SCOOP_CATALOG: buildDishOutScoopCatalog(scoopRows, dishNames),
        SCOOP_INVENTORY_CATALOG: buildInventoryCatalog(scoopRows),
        VENDOR_ITEMS: buildVendorItems(vendorItemsRes.rows, itemNames),
        CATEGORY_ITEMS: buildCategoryItems(categoryItemsRes.rows, itemNames),
        UNIT_CONVERSION_CATALOG: []
    };
}

module.exports = {
    SQL,
    fetchStaticDataBundle
};
