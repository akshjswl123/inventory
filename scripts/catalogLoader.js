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

/** CSV rows with fixed columns — keeps empty fields (needed for SCOOP_UNIT_DEFAULTS_CSV). */
function parseBlockFixed(text) {
    return String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.split(',').map(c => c.trim()));
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

function parseNumOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function parseUnitDefaultRow(row) {
    if (!row || !row[0]) return null;
    return {
        unit: String(row[0]).trim().toLowerCase(),
        factor: parseNumOrNull(row[1]),
        conversion_chain: row[2] ? String(row[2]).trim() : null,
        qty_in_grams: parseNumOrNull(row[3]),
        qty_in_ml: parseNumOrNull(row[4]),
        qty_in_piece: parseNumOrNull(row[5]),
        destination_unit: row[6] ? String(row[6]).trim() : null
    };
}

function buildScoopUnitDefaultsMaps(ctx) {
    const byUnit = new Map();
    parseBlockFixed(ctx.SCOOP_UNIT_DEFAULTS_CSV || '').forEach(row => {
        const def = parseUnitDefaultRow(row);
        if (def) byUnit.set(def.unit, def);
    });

    return { byUnit };
}

function scoopUnitFromName(scoopName) {
    const s = String(scoopName || '').toLowerCase();
    const reciepe = s.match(/_(gm|kg|ml|piece|pkt|ltr)_reciepe$/);
    if (reciepe) return reciepe[1];
    const recipe = s.match(/_(gm|kg|ml|piece|pkt|ltr)_recipe$/);
    if (recipe) return recipe[1];
    const rules = [
        ['_gm_inventory', 'gm'],
        ['_gm_in', 'gm'],
        ['_gm_out', 'gm'],
        ['_ml_in', 'ml'],
        ['_ml_out', 'ml'],
        ['_piece_in', 'piece'],
        ['_piece_out', 'piece'],
        ['_pkt_in', 'pkt'],
        ['_pkt_out', 'pkt'],
        ['_kg_in', 'kg'],
        ['_kg_out', 'kg'],
        ['_bag_in', 'bag'],
        ['_other_in', 'other'],
        ['_1_portion', 'portion'],
        ['_portion_reciepe', 'portion']
    ];
    for (const [suffix, unit] of rules) {
        if (s.endsWith(suffix)) return unit;
    }
    return null;
}

function destUnitFromScoop(scoopName) {
    const unit = scoopUnitFromName(scoopName);
    if (unit === 'gm' || unit === 'ml' || unit === 'piece') return unit;
    if (unit === 'kg' || unit === 'pkt' || unit === 'bag') return 'gm';
    if (unit === 'portion') return 'portion';
    if (unit === 'other') return 'other';
    return null;
}

function applyScoopDefaults(cfg, defaultsMaps) {
    const maps = defaultsMaps || { byUnit: new Map() };
    const unit = scoopUnitFromName(cfg.scoop_name);
    if (unit === 'portion') {
        if (!cfg.destination_unit) cfg.destination_unit = 'portion';
        if (cfg.factor == null) cfg.factor = 1;
        if (cfg.qty_in_piece == null) cfg.qty_in_piece = 1;
        return cfg;
    }
    if (unit === 'other') {
        if (!cfg.destination_unit) cfg.destination_unit = 'other';
        if (cfg.factor == null) cfg.factor = 1;
        if (cfg.qty_in_piece == null) cfg.qty_in_piece = 1;
        return cfg;
    }
    if (!unit) {
        if (!cfg.destination_unit) cfg.destination_unit = destUnitFromScoop(cfg.scoop_name);
        return cfg;
    }

    const def = maps.byUnit.get(unit);

    if (!def) {
        if (!cfg.destination_unit) cfg.destination_unit = destUnitFromScoop(cfg.scoop_name);
        return cfg;
    }

    if (def.destination_unit) cfg.destination_unit = def.destination_unit;
    if (def.conversion_chain) cfg.conversion_chain = def.conversion_chain;
    if (def.qty_in_grams != null) cfg.qty_in_grams = def.qty_in_grams;
    if (def.qty_in_ml != null) cfg.qty_in_ml = def.qty_in_ml;
    if (def.qty_in_piece != null) cfg.qty_in_piece = def.qty_in_piece;

    const isOut = /_out$/i.test(String(cfg.scoop_name || ''));
    if (!isOut && def.factor != null) {
        cfg.factor = def.factor;
    } else if (cfg.factor == null && def.factor != null) {
        cfg.factor = def.factor;
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

function mergeMaterialScoopsFromCsv(byScoop) {
    const scoopsPath = path.join(__dirname, '..', 'data', 'raw_materialsscoop.csv');
    if (!fs.existsSync(scoopsPath)) return;

    const { readCsv } = require('./csvSeedUtils');
    readCsv(scoopsPath).forEach(r => {
        const scoop = String(r.scoop_name || '').trim();
        if (!scoop || byScoop.has(scoop)) return;
        const item = String(r.scoop_item_name || '').trim();
        const id = String(r.scoop_item_id || '').trim() || null;
        const chainRaw = r.conversion_chain;
        const chain = chainRaw != null && chainRaw !== ''
            && String(chainRaw).trim().toUpperCase() !== 'NULL'
            ? String(chainRaw).trim()
            : null;
        byScoop.set(scoop, {
            scoop_item_name: item,
            scoop_item_id: id,
            destination_unit: (r.destination_unit && String(r.destination_unit).trim())
                || destUnitFromScoop(scoop),
            scoop_name: scoop,
            factor: parseNumOrNull(r.factor),
            conversion_chain: chain,
            qty_in_grams: parseNumOrNull(r.qty_in_grams),
            qty_in_ml: parseNumOrNull(r.qty_in_ml),
            qty_in_piece: parseNumOrNull(r.qty_in_piece),
            unused: String(r.unused || '').toLowerCase() === 'true'
        });
    });
}

function mergeDishScoopsFromCsv(byScoop, pgByItem) {
    const dishScoopsPath = path.join(__dirname, '..', 'data', 'dishscoops.csv');
    if (!fs.existsSync(dishScoopsPath)) return;

    const { readCsv } = require('./csvSeedUtils');
    const rows = readCsv(dishScoopsPath);
    rows.forEach(r => {
        const scoop = String(r.scoop_name || '').trim();
        if (!scoop || byScoop.has(scoop)) return;
        const item = String(r.scoop_item_name || r.dish_name || '').trim();
        const id = String(r.scoop_item_id || r.dish_code || '').trim()
            || lookupPgNo(pgByItem, item);
        const chainRaw = r.conversion_chain;
        const chain = chainRaw != null && chainRaw !== ''
            && String(chainRaw).trim().toUpperCase() !== 'NULL'
            ? String(chainRaw).trim()
            : null;
        byScoop.set(scoop, {
            scoop_item_name: item,
            scoop_item_id: id || null,
            destination_unit: (r.destination_unit && String(r.destination_unit).trim())
                || destUnitFromScoop(scoop),
            scoop_name: scoop,
            factor: parseNumOrNull(r.factor),
            conversion_chain: chain,
            qty_in_grams: parseNumOrNull(r.qty_in_grams),
            qty_in_ml: parseNumOrNull(r.qty_in_ml),
            qty_in_piece: parseNumOrNull(r.qty_in_piece),
            unused: String(r.unused || '').toLowerCase() === 'true'
        });
    });
}

function buildScoopConfigs(ctx, pgByItem) {
    const defaultsMaps = buildScoopUnitDefaultsMaps(ctx);
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
    parseBlock(ctx.DISH_RECIPE_SCOOP_CSV || '').forEach(c => add(c[0], c[1], c[2]));
    parseBlock(ctx.SCOOP_INVENTORY_CSV).forEach(c => add(c[0], c[1], null));
    parseBlock(ctx.DISH_OUT_SCOOP_CSV).forEach(c => add(c[0], c[1], null));

    parseBlock(ctx.SCOOP_BAG_IN_CSV || '').forEach(c => {
        const item = String(c[0] || '').trim();
        const scoop = String(c[1] || '').trim();
        if (!scoop) return;
        byScoop.set(scoop, {
            scoop_item_name: item,
            scoop_item_id: lookupPgNo(pgByItem, item),
            destination_unit: (c[5] || 'gm').trim(),
            scoop_name: scoop,
            factor: parseNumOrNull(c[2]),
            conversion_chain: c[3] ? String(c[3]).trim() : null,
            qty_in_grams: parseNumOrNull(c[4]),
            qty_in_ml: null,
            qty_in_piece: null,
            unused: false
        });
    });

    mergeMaterialScoopsFromCsv(byScoop);
    mergeDishScoopsFromCsv(byScoop, pgByItem);

    synthesizeOutScoops(byScoop);
    byScoop.forEach(cfg => applyScoopDefaults(cfg, defaultsMaps));

    return Array.from(byScoop.values());
}

module.exports = {
    loadCatalog,
    parseBlock,
    parseBlockFixed,
    flattenRows,
    buildCatalogMaps,
    buildScoopConfigs,
    buildScoopUnitDefaultsMaps,
    applyScoopDefaults,
    scoopUnitFromName,
    lookupPgNo
};
