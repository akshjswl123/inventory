'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function parseBlock(text) {
    return String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const cols = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
            return cols
                .map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
                .filter(v => v !== '');
        });
}

function loadCatalog() {
    const catalogPath = path.join(__dirname, '..', 'catalog.js');
    const helperPath = path.join(__dirname, '..', 'cataloghelper.js');
    const code = fs.readFileSync(catalogPath, 'utf8').replace(/^const /gm, 'var ');
    const helperCode = fs.readFileSync(helperPath, 'utf8');
    const ctx = { global: null, window: null };
    ctx.global = ctx;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    vm.runInContext(helperCode, ctx);
    return ctx;
}

function flattenRows(rows) {
    return rows.reduce((acc, row) => acc.concat(row.filter(v => v !== '')), []);
}

function buildCatalogMaps(ctx) {
    const catalog = parseBlock(ctx.CATALOG_CSV).map(c => ({
        itemname: (c[0] || '').trim(),
        pgNo: (c[1] || '').trim()
    })).filter(c => c.itemname);

    const pgByItem = new Map();
    catalog.forEach(c => {
        pgByItem.set(c.itemname.toLowerCase(), c.pgNo);
    });

    const vendors = [...new Set(flattenRows(parseBlock(ctx.VENDORS_CSV))
        .map(v => v.trim())
        .filter(v => v && v.toLowerCase() !== 'all'))];

    const categories = flattenRows(parseBlock(ctx.CATEGORIES_CSV))
        .map(c => c.trim())
        .filter(Boolean);

    const dishCatalog = parseBlock(ctx.DISHNAME_CSV).map(c => ({
        dishName: (c[0] || '').trim(),
        dishCode: (c[1] || '').trim()
    })).filter(d => d.dishName);

    const dishes = dishCatalog.map(d => d.dishName);

    return { catalog, pgByItem, vendors, categories, dishes, dishCatalog, ctx };
}

function lookupPgNo(pgByItem, itemname) {
    return pgByItem.get(String(itemname || '').trim().toLowerCase()) || null;
}

function destUnitFromScoop(scoopName) {
    const s = String(scoopName || '').toLowerCase();
    if (s.includes('_gm_')) return 'gm';
    if (s.includes('_ml_')) return 'ml';
    if (s.includes('_kg_')) return 'kg';
    if (s.includes('_piece_')) return 'piece';
    if (s.includes('_pkt_')) return 'pkt';
    if (s.includes('_other_')) return 'other';
    if (s.endsWith('_1_portion')) return 'portion';
    return null;
}

function applyScoopDefaults(cfg) {
    const name = String(cfg.scoop_name || '');

    if (name.endsWith('_gm_in') || name.endsWith('_gm_out')) {
        cfg.destination_unit = 'gm';
        cfg.factor = 1;
        cfg.qty_in_grams = 1;
    } else if (name.endsWith('_ml_in') || name.endsWith('_ml_out')) {
        cfg.destination_unit = 'ml';
        cfg.factor = 1;
        cfg.qty_in_ml = 1;
    } else if (name.endsWith('_piece_in') || name.endsWith('_piece_out')) {
        cfg.destination_unit = 'piece';
        cfg.factor = 1;
        cfg.qty_in_piece = 1;
    } else if (name.endsWith('_pkt_in') || name.endsWith('_pkt_out')) {
        cfg.destination_unit = 'gm';
        cfg.factor = 500;
        cfg.qty_in_grams = 500;
    } else if (name.endsWith('_kg_in') || name.endsWith('_kg_out')) {
        cfg.destination_unit = 'gm';
        cfg.factor = 1000;
        cfg.qty_in_grams = 500;
    } else if (name.endsWith('_gm_reciepe') || name.endsWith('_gm_recipe')) {
        cfg.destination_unit = 'gm';
        cfg.qty_in_grams = 1;
    } else if (!cfg.destination_unit) {
        cfg.destination_unit = destUnitFromScoop(name);
    }

    return cfg;
}

function synthesizeOutScoops(byScoop) {
    const pairs = [
        ['_ml_in', '_ml_out'],
        ['_piece_in', '_piece_out'],
        ['_pkt_in', '_pkt_out'],
        ['_kg_in', '_kg_out']
    ];

    for (const [scoop, cfg] of byScoop.entries()) {
        for (const [inSuffix, outSuffix] of pairs) {
            if (!scoop.endsWith(inSuffix)) continue;
            const outName = scoop.slice(0, -inSuffix.length) + outSuffix;
            if (byScoop.has(outName)) continue;
            byScoop.set(outName, {
                scoop_item_name: cfg.scoop_item_name,
                scoop_item_id: cfg.scoop_item_id,
                destination_unit: null,
                scoop_name: outName,
                factor: null,
                conversion_chain: null,
                qty_in_grams: null,
                qty_in_ml: null,
                qty_in_piece: null,
                unused: false
            });
        }
    }
}

function buildScoopConfigs(ctx, pgByItem) {
    const byScoop = new Map();

    function add(itemname, scoopName, factor) {
        const scoop = String(scoopName || '').trim();
        const item = String(itemname || '').trim();
        if (!scoop) return;
        if (!byScoop.has(scoop)) {
            byScoop.set(scoop, {
                scoop_item_name: item,
                scoop_item_id: lookupPgNo(pgByItem, item),
                destination_unit: destUnitFromScoop(scoop),
                scoop_name: scoop,
                factor: factor != null && factor !== '' && !Number.isNaN(Number(factor))
                    ? Number(factor)
                    : null,
                conversion_chain: null,
                qty_in_grams: null,
                qty_in_ml: null,
                qty_in_piece: null,
                unused: false
            });
        }
    }

    parseBlock(ctx.SCOOP_IN_CSV).forEach(c => add(c[0], c[1], c[2]));
    parseBlock(ctx.SCOOP_OUT_CSV).forEach(c => add(c[0], c[1], c[2]));
    parseBlock(ctx.RECIPE_SCOOP_CSV).forEach(c => add(c[0], c[1], null));
    parseBlock(ctx.SCOOP_INVENTORY_CSV).forEach(c => add(c[0], c[1], null));
    parseBlock(ctx.DISH_OUT_SCOOP_CSV).forEach(c => add(c[0], c[1], null));

    synthesizeOutScoops(byScoop);
    byScoop.forEach(cfg => applyScoopDefaults(cfg));

    return Array.from(byScoop.values());
}

module.exports = {
    loadCatalog,
    parseBlock,
    flattenRows,
    buildCatalogMaps,
    buildScoopConfigs,
    applyScoopDefaults,
    lookupPgNo
};
