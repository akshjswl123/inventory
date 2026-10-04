'use strict';

const fs = require('fs');
const path = require('path');

const MAX_DEPTH = 25;
const COST_SQL_FILE = path.join(__dirname, 'scripts', 'useful_queries', 'dish_cost_cases.sql');
const META_ITEMS = new Set(['totalingredientsqty', 'totalprocessedqty', 'dish_out']);

function roundTo(value, places) {
    const factor = 10 ** places;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function num(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function money(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(4);
}

function sqlLiteral(value) {
    if (value == null || String(value).trim() === '') return 'NULL';
    return `'${String(value).trim().replace(/'/g, "''")}'`;
}

function buildCostSql({ dishcode, dishname, basedOnBillno } = {}) {
    let sql = fs.readFileSync(COST_SQL_FILE, 'utf8');
    const codeLit = dishcode && String(dishcode).trim()
        ? `${sqlLiteral(String(dishcode).trim().toUpperCase())}::text`
        : 'NULL::text';
    const nameLit = dishname && String(dishname).trim()
        ? `${sqlLiteral(String(dishname).trim())}::text`
        : 'NULL::text';
    const billLit = basedOnBillno && String(basedOnBillno).trim()
        ? `${sqlLiteral(String(basedOnBillno).trim())}::text`
        : 'NULL::text';

    sql = sql.replace(
        /NULL::text AS dishcode,\s*-- e\.g\. 'P8'/,
        `${codeLit} AS dishcode,`
    );
    sql = sql.replace(
        /NULL::text AS dishname,\s*-- e\.g\. 'PROCESSED GULAB JAMUN'/,
        `${nameLit} AS dishname,`
    );
    sql = sql.replace(
        /NULL::text AS based_on_billno\s*-- e\.g\. 'recipe'; NULL = latest row per pgNo/,
        `${billLit} AS based_on_billno`
    );
    return sql;
}

function note(doneSoFar, action, detail) {
    doneSoFar.push({
        n: doneSoFar.length + 1,
        action,
        detail: detail == null ? '' : String(detail)
    });
}

function fail(doneSoFar, failedStep, message, data) {
    const err = new Error(message);
    err.validation = true;
    err.failedStep = failedStep;
    err.data = data;
    err.doneSoFar = doneSoFar.slice();
    throw err;
}

function scoopFactor(scoop) {
    const unit = String(scoop.destination_unit || '').trim().toLowerCase();
    if (unit === 'gm') return num(scoop.qty_in_grams) ?? num(scoop.factor) ?? 1;
    if (unit === 'ml') return num(scoop.qty_in_ml) ?? num(scoop.factor) ?? 1;
    if (unit === 'piece') return num(scoop.qty_in_piece) ?? num(scoop.factor) ?? 1;
    return num(scoop.factor) ?? 1;
}

function rawRateForUnit(cost, unit) {
    if (!cost) return null;
    if (unit === 'gm') return num(cost.ratepergram) ?? num(cost.rateperml);
    if (unit === 'ml') return num(cost.rateperml) ?? num(cost.ratepergram);
    if (unit === 'piece') return num(cost.rateperpiece);
    return null;
}

function rateColumnLabel(unit, cost) {
    if (unit === 'gm') {
        return cost && num(cost.ratepergram) != null ? 'ratepergram' : 'rateperml';
    }
    if (unit === 'ml') {
        return cost && num(cost.rateperml) != null ? 'rateperml' : 'ratepergram';
    }
    if (unit === 'piece') return 'rateperpiece';
    return null;
}

async function resolveDish(pool, dishcode, dishname) {
    const code = dishcode ? String(dishcode).trim() : '';
    const name = dishname ? String(dishname).trim() : '';
    const res = await pool.query(
        `
        SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
            UPPER(TRIM(dishcode)) AS dish_code,
            TRIM(dishname) AS dishname
        FROM public.recipe_entries
        WHERE dishcode IS NOT NULL
          AND TRIM(dishcode) <> ''
          AND (
                ($1::text <> '' AND UPPER(TRIM(dishcode)) = UPPER($1::text))
             OR ($1::text = '' AND $2::text <> '' AND LOWER(TRIM(dishname)) = LOWER($2::text))
          )
        ORDER BY UPPER(TRIM(dishcode)), created_at DESC, id DESC
        LIMIT 1
        `,
        [code, name]
    );
    return res.rows[0] || null;
}

async function loadRecipeRows(pool, dishCode) {
    const saved = await pool.query(
        `
        SELECT created_at AS saved_at
        FROM public.recipe_entries
        WHERE UPPER(TRIM(dishcode)) = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        `,
        [dishCode]
    );
    if (!saved.rows[0]) return [];
    const rows = await pool.query(
        `
        SELECT id, dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty,
               is_usable_in_other_dish, usable_processed_scoop, qty_of_scoops
        FROM public.recipe_entries
        WHERE UPPER(TRIM(dishcode)) = $1
          AND created_at >= $2::timestamptz - interval '30 seconds'
        ORDER BY id
        `,
        [dishCode, saved.rows[0].saved_at]
    );
    return rows.rows;
}

async function loadScoop(pool, scoopName, itemId, itemName) {
    if (!scoopName) return null;
    const res = await pool.query(
        `
        SELECT id, scoop_item_name, scoop_item_id, destination_unit, scoop_name,
               factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece
        FROM public.scoop_config
        WHERE LOWER(TRIM(scoop_name)) = LOWER(TRIM($1))
          AND COALESCE(unused, false) = false
          AND (
                scoop_item_id IS NULL OR TRIM(scoop_item_id) = ''
                OR TRIM(scoop_item_id) = TRIM($2::text)
          )
          AND (
                scoop_item_name IS NULL OR TRIM(scoop_item_name) = ''
                OR LOWER(TRIM(scoop_item_name)) = LOWER(TRIM($3::text))
          )
        ORDER BY
            CASE WHEN TRIM(COALESCE(scoop_item_id, '')) = TRIM($2::text) THEN 0 ELSE 1 END,
            CASE
                WHEN LOWER(TRIM(COALESCE(scoop_item_name, ''))) = LOWER(TRIM($3::text)) THEN 0
                ELSE 1
            END,
            id DESC
        LIMIT 1
        `,
        [scoopName, itemId || '', itemName || '']
    );
    return res.rows[0] || null;
}

async function loadRawMaterial(pool, pgNo, itemName) {
    const res = await pool.query(
        `
        SELECT "pgNo", itemname
        FROM public.raw_materials
        WHERE TRIM("pgNo") = TRIM($1)
          AND LOWER(TRIM(itemname)) = LOWER(TRIM($2))
        LIMIT 1
        `,
        [pgNo, itemName]
    );
    return res.rows[0] || null;
}

async function loadDishName(pool, dishCode) {
    const res = await pool.query(
        `
        SELECT TRIM(dishname) AS dishname
        FROM public.recipe_entries
        WHERE UPPER(TRIM(dishcode)) = UPPER(TRIM($1))
          AND dishcode IS NOT NULL
          AND TRIM(dishcode) <> ''
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        `,
        [dishCode]
    );
    return res.rows[0] ? res.rows[0].dishname : null;
}

async function loadRawCost(pool, pgNo) {
    const res = await pool.query(
        `
        SELECT "pgNo", ratepergram, rateperml, rateperpiece, based_on_billno
        FROM public.raw_materials_cost
        WHERE TRIM("pgNo") = TRIM($1)
        ORDER BY last_updated_at DESC NULLS LAST, id DESC
        LIMIT 1
        `,
        [pgNo]
    );
    return res.rows[0] || null;
}

function dedupeUnpricedKey(entry) {
    return [
        String(entry.dishCode || '').toUpperCase(),
        String(entry.itemId || '').trim().toUpperCase(),
        String(entry.itemName || '').trim().toLowerCase()
    ].join('|');
}

function recordUnpriced(unpricedItems, entry) {
    const key = dedupeUnpricedKey(entry);
    if (unpricedItems.some(item => dedupeUnpricedKey(item) === key)) return;
    unpricedItems.push(entry);
}

function collectUnpricedFromSqlRows(rows) {
    const out = [];
    for (const row of rows) {
        if (row.row_kind !== 'line') continue;
        if (row.line_cost != null && row.line_cost !== '') continue;
        recordUnpriced(out, {
            dishCode: row.dish_code,
            dishName: row.dishname,
            itemName: row.itemname,
            itemId: row.pgNo_or_dishCode,
            scoopName: row.receipescoop,
            qty: row.qty,
            destinationUnit: row.destination_unit,
            lineKind: row.line_kind,
            reason: row.cost_calculation
                ? String(row.cost_calculation)
                : 'Line could not be priced'
        });
    }
    return out;
}

function mergeUnpricedLists(...lists) {
    const merged = [];
    for (const list of lists) {
        for (const entry of list || []) {
            recordUnpriced(merged, entry);
        }
    }
    return merged;
}

function dedupeLines(rows) {
    const seen = new Set();
    const lines = [];
    const ordered = rows.slice().sort((a, b) => Number(b.id) - Number(a.id));
    for (const row of ordered) {
        const name = String(row.reciepeitemname || '').trim();
        if (META_ITEMS.has(name.toLowerCase())) continue;
        if (num(row.qty) == null || num(row.qty) <= 0) continue;
        const key = [
            String(row['pgNo'] || '').trim(),
            name.toLowerCase(),
            String(row.receipescoop || '').trim(),
            String(row.qty)
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(row);
    }
    lines.sort((a, b) => Number(a.id) - Number(b.id));
    return lines;
}

function dishOutRow(rows) {
    const outs = rows.filter(row => String(row.reciepeitemname || '').trim().toLowerCase() === 'dish_out');
    if (!outs.length) return null;
    return outs.sort((a, b) => Number(b.id) - Number(a.id))[0];
}

async function priceDish(pool, dishCode, stack, depth, doneSoFar, visited, unpricedItems) {
    if (depth > MAX_DEPTH) {
        fail(doneSoFar, 'depth limit',
            `Recipe chain is deeper than ${MAX_DEPTH} levels at ${dishCode}. Stopped before pricing this dish.`,
            { dishCode, depth, path: stack.concat(dishCode) });
    }
    if (stack.includes(dishCode)) {
        fail(doneSoFar, 'cycle',
            `Cycle: ${stack.concat(dishCode).join(' → ')}. A dish cannot use a dish that eventually uses it again.`,
            { path: stack.concat(dishCode) });
    }

    const rows = await loadRecipeRows(pool, dishCode);
    if (!rows.length) {
        fail(doneSoFar, 'load recipe',
            `No saved recipe for dish code ${dishCode}.`,
            { dishCode });
    }

    const dishName = String(rows[rows.length - 1].dishname || '').trim();
    visited.add(dishCode);
    stack.push(dishCode);

    try {
        const lines = dedupeLines(rows);
        const out = dishOutRow(rows);
        const isUsable = !!(out && out.is_usable_in_other_dish);
        const outScoopName = out
            ? (isUsable
                ? (out.usable_processed_scoop || out.receipescoop)
                : (out.receipescoop || out.usable_processed_scoop))
            : null;
        const qtyOfScoops = out ? (num(out.qty_of_scoops) ?? num(out.qty)) : null;

        note(doneSoFar, `Load recipe ${dishName} (${dishCode})`,
            `${lines.length} ingredient line(s). Usable in other dishes: ${isUsable}. `
            + `Dish-out scoop: ${outScoopName || 'none'}. Qty of scoops: ${qtyOfScoops == null ? 'none' : qtyOfScoops}.`);

        let dishCost = 0;
        const pricedLines = [];

        for (const line of lines) {
            const itemName = String(line.reciepeitemname || '').trim();
            const itemId = String(line['pgNo'] || '').trim();
            const scoopName = String(line.receipescoop || '').trim();
            const qty = num(line.qty);
            const lineLabel = `${dishName} (${dishCode}) line "${itemName}" pgNo ${itemId || '—'}`;

            if (itemId && itemId.toUpperCase() === dishCode) {
                fail(doneSoFar, 'self reference',
                    `${lineLabel} is the same dish. A dish cannot contain itself.`,
                    { dishCode, dishName, itemName, itemId, scoopName, qty });
            }

            const scoop = await loadScoop(pool, scoopName, itemId, itemName);
            if (!scoop) {
                const reason = `Scoop "${scoopName || '(blank)'}" not found in scoop_config.`;
                recordUnpriced(unpricedItems, {
                    dishCode,
                    dishName,
                    itemName,
                    itemId,
                    scoopName,
                    qty,
                    destinationUnit: null,
                    scoopFactor: null,
                    lineKind: 'unknown',
                    reason
                });
                pricedLines.push({
                    itemName, itemId, kind: 'unknown', qty, unit: null, factor: null,
                    rate: null, lineCost: null, unpriced: true
                });
                note(doneSoFar, `Skip line ${itemName}`, `${lineLabel}: ${reason}`);
                continue;
            }

            const unit = String(scoop.destination_unit || '').trim().toLowerCase();
            const factor = scoopFactor(scoop);
            if (!['gm', 'ml', 'piece'].includes(unit)) {
                const reason = `Scoop "${scoop.scoop_name}" destination unit "${scoop.destination_unit || 'blank'}" must be gm, ml, or piece.`;
                recordUnpriced(unpricedItems, {
                    dishCode,
                    dishName,
                    itemName,
                    itemId,
                    scoopName: scoop.scoop_name,
                    qty,
                    destinationUnit: scoop.destination_unit,
                    scoopFactor: factor,
                    lineKind: 'unknown',
                    reason
                });
                pricedLines.push({
                    itemName, itemId, kind: 'unknown', qty, unit, factor,
                    rate: null, lineCost: null, unpriced: true
                });
                note(doneSoFar, `Skip line ${itemName}`, `${lineLabel}: ${reason}`);
                continue;
            }

            const raw = await loadRawMaterial(pool, itemId, itemName);
            const childDishName = await loadDishName(pool, itemId.toUpperCase());
            const codeIsDish = childDishName != null;
            const nameMatchesDish = codeIsDish && childDishName.toLowerCase() === itemName.toLowerCase();
            let kind = 'unknown';
            if (codeIsDish && (!raw || nameMatchesDish)) kind = 'processed';
            else if (raw) kind = 'raw';

            if (kind === 'unknown') {
                const reason = 'Line is neither a raw material nor a dish recipe in the catalog.';
                recordUnpriced(unpricedItems, {
                    dishCode,
                    dishName,
                    itemName,
                    itemId,
                    scoopName,
                    qty,
                    destinationUnit: unit,
                    scoopFactor: factor,
                    lineKind: 'unknown',
                    reason
                });
                pricedLines.push({
                    itemName, itemId, kind, qty, unit, factor,
                    rate: null, lineCost: null, unpriced: true
                });
                note(doneSoFar, `Skip line ${itemName}`, `${lineLabel}: ${reason}`);
                continue;
            }

            if (kind === 'raw') {
                const cost = await loadRawCost(pool, itemId);
                const rate = rawRateForUnit(cost, unit);
                const column = rateColumnLabel(unit, cost);
                if (rate == null) {
                    const reason = cost
                        ? `No ${unit} rate on raw_materials_cost for pgNo ${itemId} (gm/ml/piece columns empty)`
                        : `No raw_materials_cost row for pgNo ${itemId}`;
                    recordUnpriced(unpricedItems, {
                        dishCode,
                        dishName,
                        itemName,
                        itemId,
                        scoopName,
                        qty,
                        destinationUnit: unit,
                        scoopFactor: factor,
                        lineKind: 'raw',
                        reason
                    });
                    pricedLines.push({
                        itemName, itemId, kind, qty, unit, factor, rate: null, lineCost: null, unpriced: true
                    });
                    note(doneSoFar, `Skip raw line ${itemName}`,
                        `${lineLabel}: ${reason}. Running priced subtotal for ${dishCode}: ${money(dishCost)}.`);
                    continue;
                }
                const lineCost = roundTo(rate * factor * qty, 4);
                dishCost = roundTo(dishCost + lineCost, 4);
                pricedLines.push({ itemName, itemId, kind, qty, unit, factor, rate, lineCost });
                note(doneSoFar, `Price raw line ${itemName}`,
                    `${column} ${money(rate)} × factor ${factor} × qty ${qty} = ${money(lineCost)}`
                    + `${cost.based_on_billno ? ` (bill ${cost.based_on_billno})` : ''}. `
                    + `Running dish cost for ${dishCode}: ${money(dishCost)}.`);
                continue;
            }

            const childCode = itemId.toUpperCase();
            note(doneSoFar, `Open processed line ${itemName}`,
                `${lineLabel} uses dish ${childCode}. Recipe scoop ${scoop.scoop_name} is ${unit}, factor ${factor}, qty ${qty}.`);
            const child = await priceDish(pool, childCode, stack, depth + 1, doneSoFar, visited, unpricedItems);

            if (child.ratePerDestinationUnit == null) {
                const reason = `${child.dishName} (${child.dishCode}) has batch cost ${money(child.dishCost)} but no per-${unit} rate (qty of scoops or dish-out scoop missing).`;
                recordUnpriced(unpricedItems, {
                    dishCode,
                    dishName,
                    itemName,
                    itemId: childCode,
                    scoopName,
                    qty,
                    destinationUnit: unit,
                    scoopFactor: factor,
                    lineKind: 'processed',
                    reason
                });
                pricedLines.push({
                    itemName, itemId: childCode, kind, qty, unit, factor,
                    rate: null, lineCost: null, unpriced: true
                });
                note(doneSoFar, `Skip processed line ${itemName}`, `${lineLabel}: ${reason}`);
                continue;
            }
            if (child.outUnit !== unit) {
                const reason = `Recipe scoop is ${unit} but child dish-out is ${child.outUnit}.`;
                recordUnpriced(unpricedItems, {
                    dishCode,
                    dishName,
                    itemName,
                    itemId: childCode,
                    scoopName,
                    qty,
                    destinationUnit: unit,
                    scoopFactor: factor,
                    lineKind: 'processed',
                    reason
                });
                pricedLines.push({
                    itemName, itemId: childCode, kind, qty, unit, factor,
                    rate: null, lineCost: null, unpriced: true
                });
                note(doneSoFar, `Skip processed line ${itemName}`, `${lineLabel}: ${reason}`);
                continue;
            }

            const lineCost = roundTo(child.ratePerDestinationUnit * factor * qty, 4);
            dishCost = roundTo(dishCost + lineCost, 4);
            pricedLines.push({
                itemName, itemId: childCode, kind, qty, unit, factor,
                rate: child.ratePerDestinationUnit, lineCost
            });
            note(doneSoFar, `Price processed line ${itemName}`,
                `child rate per ${unit} ${Number(child.ratePerDestinationUnit).toFixed(6)} × factor ${factor} × qty ${qty} = ${money(lineCost)}. `
                + `Child dish cost ${money(child.dishCost)} ÷ qty of scoops ${child.qtyOfScoops} ÷ out factor ${child.outFactor}. `
                + `Running dish cost for ${dishCode}: ${money(dishCost)}.`);
        }

        let outScoop = null;
        let outUnit = null;
        let outFactor = null;
        if (outScoopName) {
            outScoop = await loadScoop(pool, outScoopName, dishCode, dishName);
            if (outScoop) {
                outUnit = String(outScoop.destination_unit || '').trim().toLowerCase();
                outFactor = scoopFactor(outScoop);
            }
        }

        let ratePerDestinationUnit = null;
        if (qtyOfScoops > 0 && outFactor > 0 && ['gm', 'ml', 'piece'].includes(outUnit)) {
            const oneScoop = dishCost / qtyOfScoops;
            ratePerDestinationUnit = roundTo(oneScoop / outFactor, 6);
            note(doneSoFar, `Per-unit rate for ${dishCode}`,
                `dish cost ${money(dishCost)} ÷ qty of scoops ${qtyOfScoops} = ${money(oneScoop)} per scoop. `
                + `÷ dish-out factor ${outFactor} (${outUnit}) = ${ratePerDestinationUnit.toFixed(6)} per ${outUnit}.`);
        } else {
            note(doneSoFar, `Batch cost for ${dishCode}`,
                `dish cost ${money(dishCost)}. No per-gm/ml/piece rate yet `
                + `(qty of scoops: ${qtyOfScoops == null ? 'none' : qtyOfScoops}, `
                + `dish-out unit: ${outUnit || 'none'}). Another dish cannot use this until that rate exists.`);
        }

        return {
            dishCode,
            dishName,
            dishCost,
            ratePerDestinationUnit,
            qtyOfScoops,
            outScoopName: outScoopName || null,
            outUnit,
            outFactor,
            isUsable,
            lines: pricedLines
        };
    } finally {
        stack.pop();
    }
}

async function runCostQuery(pool, filter) {
    const sql = buildCostSql(filter);
    return pool.query(sql);
}

async function validateAndQueryDishCost(pool, { dishcode, dishname, basedOnBillno } = {}) {
    const doneSoFar = [];
    const code = dishcode ? String(dishcode).trim() : '';
    const name = dishname ? String(dishname).trim() : '';
    if (!code && !name) {
        fail(doneSoFar, 'input', 'dishcode or dishname is required.', {});
    }

    note(doneSoFar, 'Resolve dish', code ? `dishcode ${code}` : `dishname ${name}`);
    const dish = await resolveDish(pool, code, name);
    if (!dish) {
        fail(doneSoFar, 'resolve dish',
            `No recipe found for ${code ? `dishcode ${code}` : `dishname ${name}`}.`,
            { dishcode: code || null, dishname: name || null });
    }
    note(doneSoFar, 'Resolved dish', `${dish.dishname} (${dish.dish_code})`);

    const visited = new Set();
    const unpricedItems = [];
    const priced = await priceDish(pool, dish.dish_code, [], 1, doneSoFar, visited, unpricedItems);

    const queryFilter = {
        dishcode: dish.dish_code,
        dishname: null,
        basedOnBillno: basedOnBillno || null
    };
    note(doneSoFar, 'Run dish_cost_cases.sql',
        `Validation finished. Running cost query for dish code ${dish.dish_code}.`);
    const queryRes = await runCostQuery(pool, queryFilter);
    const columns = queryRes.fields ? queryRes.fields.map(field => field.name) : [];
    const rows = queryRes.rows || [];

    const sqlTotal = rows.find(row =>
        row.dish_code === priced.dishCode && row.row_kind === 'dish_total');
    const sqlDishCost = sqlTotal ? num(sqlTotal.dish_cost) : null;
    const sqlIncomplete = sqlTotal ? !!sqlTotal.incomplete : null;

    if (sqlDishCost != null && roundTo(sqlDishCost, 4) !== roundTo(priced.dishCost, 4)) {
        note(doneSoFar, 'Compare walk to query',
            `Step walk dish cost ${money(priced.dishCost)} differs from dish_cost_cases.sql dish_total ${money(sqlDishCost)}.`);
    } else if (sqlDishCost != null) {
        note(doneSoFar, 'Compare walk to query',
            `Step walk dish cost ${money(priced.dishCost)} matches dish_cost_cases.sql dish_total.`);
    }

    const dishCost = sqlDishCost != null ? sqlDishCost : priced.dishCost;
    const ratePerDestinationUnit = sqlTotal && sqlTotal.rate_per_destination_unit != null
        ? num(sqlTotal.rate_per_destination_unit)
        : priced.ratePerDestinationUnit;

    const unpricedFromSql = collectUnpricedFromSqlRows(rows);
    const unpricedMerged = mergeUnpricedLists(unpricedItems, unpricedFromSql);
    const incomplete = sqlIncomplete === true || unpricedMerged.length > 0;

    if (unpricedMerged.length) {
        note(doneSoFar, 'Unpriced lines',
            `${unpricedMerged.length} line(s) excluded from cost (see unpricedItems).`);
    }

    return {
        ok: true,
        dishcode: priced.dishCode,
        dishname: priced.dishName,
        dishCost: dishCost ?? 0,
        ratePerDestinationUnit,
        destinationUnit: priced.outUnit,
        qtyOfScoops: priced.qtyOfScoops,
        incomplete,
        unpricedItems: unpricedMerged,
        doneSoFar,
        lines: priced.lines,
        query: {
            file: 'scripts/useful_queries/dish_cost_cases.sql',
            columns,
            rows,
            rowCount: rows.length
        }
    };
}

module.exports = {
    validateAndQueryDishCost
};
