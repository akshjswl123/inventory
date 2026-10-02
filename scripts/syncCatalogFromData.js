'use strict';

/**
 * Merge data/raw_materials30sept11am.csv and data/dishes.csv into catalog.js
 * (CATALOG_CSV, sabji scoops, DISHNAME_CSV, DISH_OUT_SCOOP_CSV).
 *
 *   node scripts/syncCatalogFromData.js
 *   node scripts/generateScoopConfigCatalog.js
 *   node scripts/generateStaticSeedCatalog.js
 */

const fs = require('fs');
const path = require('path');
const { readCsv } = require('./csvSeedUtils');
const { loadCatalog, parseBlock } = require('./catalogLoader');

const ROOT = path.join(__dirname, '..');
const CATALOG_FILE = path.join(ROOT, 'catalog.js');
const MATERIALS_CSV = path.join(ROOT, 'data/raw_materials30sept11am.csv');
const DISHES_CSV = path.join(ROOT, 'data/dishes.csv');
const SCOOPS_CSV = path.join(ROOT, 'data/raw_materialsscoop.csv');
const DISH_SCOOPS_CSV = path.join(ROOT, 'data/dishscoops.csv');

function quote(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
}

function replaceConstBlock(source, constName, newBody) {
    const re = new RegExp(
        `(const ${constName} = \`\\n)[\\s\\S]*?(\\n\`;\\r?\\n)`,
        'm'
    );
    if (!re.test(source)) {
        throw new Error('Could not find const block: ' + constName);
    }
    return source.replace(re, `$1${newBody}\n$2`);
}

function dedupeMaterials(rows) {
    const byKey = new Map();
    for (const r of rows) {
        const itemname = String(r.itemname || '').trim();
        const pgNo = String(r.pgNo || '').trim();
        if (!itemname || !pgNo) continue;
        const key = pgNo + '|' + itemname;
        byKey.set(key, { itemname, pgNo });
    }
    return Array.from(byKey.values()).sort((a, b) =>
        a.itemname.localeCompare(b.itemname, undefined, { sensitivity: 'base' })
    );
}

function buildCatalogCsvBody(materials) {
    return materials.map(m => `${quote(m.itemname)},${quote(m.pgNo)}`).join('\n');
}

function parseCatalogEntries(csvText) {
    return parseBlock(csvText).map(c => ({
        itemname: (c[0] || '').trim(),
        pgNo: (c[1] || '').trim()
    })).filter(c => c.itemname && c.pgNo);
}

function catalogKey(entry) {
    return entry.pgNo + '|' + entry.itemname;
}

function appendLinesIfMissing(blockBody, lines) {
    const existing = new Set(
        blockBody
            .split(/\r?\n/)
            .map(l => l.trim().toLowerCase())
            .filter(Boolean)
    );
    const toAdd = [];
    for (const line of lines) {
        if (!existing.has(line.trim().toLowerCase())) {
            toAdd.push(line);
            existing.add(line.trim().toLowerCase());
        }
    }
    if (!toAdd.length) return blockBody.trimEnd();
    return blockBody.trimEnd() + '\n' + toAdd.join('\n');
}

function materialReciepeLines(materials, scoops) {
    const matKeys = new Set(materials.map(catalogKey));
    const lines = [];
    const seen = new Set();
    for (const s of scoops) {
        const scoop = String(s.scoop_name || '').trim();
        if (!/_(gm|ml|piece|kg|ltr|pkt)_reciepe$/i.test(scoop)) continue;
        const name = String(s.scoop_item_name || '').trim();
        const id = String(s.scoop_item_id || '').trim();
        if (!name || !id || !matKeys.has(id + '|' + name)) continue;
        const line = `${quote(name)},${quote(scoop)}`;
        if (seen.has(line.toLowerCase())) continue;
        seen.add(line.toLowerCase());
        lines.push(line);
    }
    return lines;
}

function sabjiScoopLines(materials, scoops) {
    const matKeys = new Set(materials.map(catalogKey));
    const sabji = materials.filter(m => /^v\d+/i.test(m.pgNo));
    const byItem = new Map();
    for (const s of scoops) {
        const name = String(s.scoop_item_name || '').trim();
        const id = String(s.scoop_item_id || '').trim();
        if (!name || !id) continue;
        if (!matKeys.has(id + '|' + name)) continue;
        if (!byItem.has(name)) byItem.set(name, []);
        byItem.get(name).push(s);
    }

    const inGm = [];
    const outGm = [];
    const recipe = [];
    for (const m of sabji) {
        const rows = byItem.get(m.itemname) || [];
        for (const s of rows) {
            const scoop = String(s.scoop_name || '').trim();
            if (!scoop) continue;
            const line = `${quote(m.itemname)},${quote(scoop)}`;
            if (scoop.endsWith('_gm_in')) inGm.push(line);
            else if (scoop.endsWith('_gm_out')) outGm.push(line);
            else if (scoop.endsWith('_gm_reciepe') || scoop.endsWith('_gm_recipe')) {
                recipe.push(line);
            }
        }
    }
    return { inGm, outGm, recipe };
}

function dedupeDishes(rows) {
    const byCode = new Map();
    for (const r of rows) {
        const dish_name = String(r.dish_name || r.dishName || '').trim();
        const dish_code = String(r.dish_code || r.dishCode || '').trim();
        if (!dish_name || !dish_code) continue;
        byCode.set(dish_code.toLowerCase(), { dish_name, dish_code });
    }
    return Array.from(byCode.values()).sort((a, b) =>
        a.dish_code.localeCompare(b.dish_code, undefined, { numeric: true, sensitivity: 'base' })
    );
}

function buildDishnameBody(dishes) {
    return dishes.map(d => `${quote(d.dish_name)},${quote(d.dish_code)}`).join('\n');
}

function buildDishOutSupplement(dishes, dishScoops, existingOut) {
    const existing = new Set(
        existingOut.map(r => `${r.dishname.toLowerCase()}|${r.dish_out_scoop.toLowerCase()}`)
    );
    const nameByCode = new Map(dishes.map(d => [d.dish_code.toLowerCase(), d.dish_name]));
    const lines = [];
    for (const s of dishScoops) {
        const scoop = String(s.scoop_name || '').trim();
        if (!scoop.endsWith('_1_portion')) continue;
        const code = String(s.dish_code || '').trim();
        const dishName = String(s.dish_name || nameByCode.get(code.toLowerCase()) || '').trim();
        if (!dishName) continue;
        const key = `${dishName.toLowerCase()}|${scoop.toLowerCase()}`;
        if (existing.has(key)) continue;
        lines.push(`${quote(dishName)},${quote(scoop)}`);
        existing.add(key);
    }
    return lines;
}

function buildDishRecipeScoopBody(dishScoops) {
    const lines = [];
    const seen = new Set();
    for (const s of dishScoops) {
        const scoop = String(s.scoop_name || '').trim();
        if (!scoop.endsWith('_reciepe') && !scoop.endsWith('_recipe')) continue;
        const name = String(s.dish_name || s.scoop_item_name || '').trim();
        if (!name) continue;
        const line = `${quote(name)},${quote(scoop)}`;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(line);
    }
    return lines.sort((a, b) => a.localeCompare(b)).join('\n');
}

function ensureConstBlock(source, constName, body, insertBeforeConst) {
    if (new RegExp(`const ${constName} =`).test(source)) {
        return replaceConstBlock(source, constName, body);
    }
    const marker = `const ${insertBeforeConst} =`;
    const idx = source.indexOf(marker);
    if (idx < 0) {
        throw new Error('Could not insert ' + constName + ' before ' + insertBeforeConst);
    }
    return source.slice(0, idx)
        + `const ${constName} = \`\n${body}\n\`;\n\n`
        + source.slice(idx);
}

function main() {
    const materials = dedupeMaterials(readCsv(MATERIALS_CSV));
    const dishes = dedupeDishes(readCsv(DISHES_CSV));
    const scoops = readCsv(SCOOPS_CSV);
    const dishScoops = readCsv(DISH_SCOOPS_CSV);

    const ctx = loadCatalog();
    const existingCatalog = parseCatalogEntries(ctx.CATALOG_CSV);
    const mergedMaterials = dedupeMaterials([
        ...existingCatalog.map(c => ({ pgNo: c.pgNo, itemname: c.itemname })),
        ...materials
    ]);

    let source = fs.readFileSync(CATALOG_FILE, 'utf8');

    source = replaceConstBlock(source, 'CATALOG_CSV', buildCatalogCsvBody(mergedMaterials));
    source = replaceConstBlock(source, 'DISHNAME_CSV', buildDishnameBody(dishes));

    const { inGm, outGm, recipe: sabjiRecipe } = sabjiScoopLines(mergedMaterials, scoops);
    const materialRecipe = materialReciepeLines(mergedMaterials, scoops);
    const gmInMatch = source.match(/const SCOOP_IN_GM_CSV = `\n([\s\S]*?)\n`;/);
    const gmOutMatch = source.match(/const SCOOP_OUT_GM_CSV = `\n([\s\S]*?)\n`;/);
    const recipeMatch = source.match(/const RECIPE_SCOOP_CSV_ACTUAL = `\n([\s\S]*?)\n`;/);
    if (!gmInMatch || !gmOutMatch || !recipeMatch) {
        throw new Error('Scoop CSV blocks not found in catalog.js');
    }

    source = replaceConstBlock(
        source,
        'SCOOP_IN_GM_CSV',
        appendLinesIfMissing(gmInMatch[1], inGm)
    );
    source = replaceConstBlock(
        source,
        'SCOOP_OUT_GM_CSV',
        appendLinesIfMissing(gmOutMatch[1], outGm)
    );
    source = replaceConstBlock(
        source,
        'RECIPE_SCOOP_CSV_ACTUAL',
        appendLinesIfMissing(recipeMatch[1], sabjiRecipe.concat(materialRecipe))
    );

    const existingDishOut = parseBlock(ctx.DISH_OUT_SCOOP_CSV).map(c => ({
        dishname: (c[0] || '').trim(),
        dish_out_scoop: (c[1] || '').trim()
    }));
    const dishOutLines = buildDishOutSupplement(dishes, dishScoops, existingDishOut);
    const dishOutMatch = source.match(/const DISH_OUT_SCOOP_CSV = `\n([\s\S]*?)\n`;/);
    if (!dishOutMatch) throw new Error('DISH_OUT_SCOOP_CSV block not found');
    source = replaceConstBlock(
        source,
        'DISH_OUT_SCOOP_CSV',
        appendLinesIfMissing(dishOutMatch[1], dishOutLines)
    );

    const dishRecipeBody = buildDishRecipeScoopBody(dishScoops);
    source = ensureConstBlock(source, 'DISH_RECIPE_SCOOP_CSV', dishRecipeBody, 'DISH_OUT_SCOOP_CSV');

    fs.writeFileSync(CATALOG_FILE, source, 'utf8');

    console.log('Updated catalog.js');
    console.log('  CATALOG_CSV rows:', mergedMaterials.length, '(was', existingCatalog.length + ')');
    console.log('  Sabji scoop lines added — in:', inGm.length, 'out:', outGm.length, 'recipe:', sabjiRecipe.length);
    console.log('  Material _reciepe lines merged:', materialRecipe.length);
    console.log('  DISHNAME_CSV rows:', dishes.length);
    console.log('  DISH_OUT_SCOOP lines added:', dishOutLines.length);
    console.log('  DISH_RECIPE_SCOOP_CSV lines:', dishRecipeBody.split('\n').filter(Boolean).length);
}

main();
