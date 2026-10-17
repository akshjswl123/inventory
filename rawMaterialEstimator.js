'use strict';

const {
    MAX_DEPTH,
    resolveDish,
    loadScoop,
    dedupeLines,
    dishOutRow,
    scoopFactor,
    num,
    roundTo,
    classifyRecipeLine
} = require('./recipeWalkShared');

async function loadRecipeRows(pool, dishCode) {
    const res = await pool.query(
        `
        SELECT id, dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty,
               "inGm", "inML", "inPiece",
               is_usable_in_other_dish, usable_processed_scoop, qty_of_scoops
        FROM public.recipe_entries re
        WHERE UPPER(TRIM(re.dishcode)) = UPPER(TRIM($1::text))
          AND re.version = COALESCE(
              (
                  SELECT iv.version
                  FROM public.item_versions iv
                  WHERE iv.item_type = 'dishes'
                    AND iv.item_code = UPPER(TRIM($1::text))
                  LIMIT 1
              ),
              (
                  SELECT MAX(sub.version)
                  FROM public.recipe_entries sub
                  WHERE UPPER(TRIM(sub.dishcode)) = UPPER(TRIM($1::text))
              ),
              1
          )
        ORDER BY re.id
        `,
        [dishCode]
    );
    return res.rows;
}

function aggKey(pgNo, itemName, unit) {
    return `${String(pgNo || '').trim()}|${String(itemName || '').trim().toLowerCase()}|${unit}`;
}

function addQty(map, pgNo, itemName, unit, qty, extra) {
    const key = aggKey(pgNo, itemName, unit);
    const prev = map.get(key);
    const add = num(qty) || 0;
    if (prev) {
        prev.qty = roundTo(prev.qty + add, 6);
    } else {
        map.set(key, {
            pgNo: String(pgNo || '').trim(),
            itemName: String(itemName || '').trim(),
            unit,
            qty: roundTo(add, 6),
            ...extra
        });
    }
}

function mapToSortedRows(map) {
    return Array.from(map.values()).sort((a, b) => {
        const n = a.itemName.localeCompare(b.itemName);
        if (n !== 0) return n;
        return String(a.pgNo).localeCompare(String(b.pgNo));
    });
}

function processedKey(dishCode, itemName, unit) {
    return `${String(dishCode || '').toUpperCase()}|${String(itemName || '').trim().toLowerCase()}|${unit}`;
}

function addProcessed(map, dishCode, itemName, unit, qty) {
    const key = processedKey(dishCode, itemName, unit);
    const add = num(qty) || 0;
    const prev = map.get(key);
    if (prev) {
        prev.qty = roundTo(prev.qty + add, 6);
    } else {
        map.set(key, {
            dishcode: String(dishCode || '').trim().toUpperCase(),
            itemName: String(itemName || '').trim(),
            unit,
            qty: roundTo(add, 6)
        });
    }
}

async function batchYieldInUnit(pool, dishCode, dishName, rows, unit) {
    const out = dishOutRow(rows);
    if (!out) return { yield: null, reason: 'No dish_out row on recipe' };

    const isUsable = !!out.is_usable_in_other_dish;
    const scoopName = isUsable
        ? (out.usable_processed_scoop || out.receipescoop)
        : (out.receipescoop || out.usable_processed_scoop);
    const outScoop = scoopName
        ? await loadScoop(pool, scoopName, dishCode, dishName)
        : null;
    const outUnit = outScoop
        ? String(outScoop.destination_unit || '').trim().toLowerCase()
        : null;

    if (isUsable && outScoop && outUnit === unit) {
        const qtyOfScoops = num(out.qty_of_scoops) ?? num(out.qty);
        const perScoop = scoopFactor(outScoop);
        if (qtyOfScoops > 0 && perScoop > 0) {
            return { yield: roundTo(qtyOfScoops * perScoop, 6), reason: null };
        }
        return { yield: null, reason: 'Usable dish_out missing qty_of_scoops or scoop factor' };
    }

    if (unit === 'gm' && num(out.inGm) > 0) return { yield: num(out.inGm), reason: null };
    if (unit === 'ml' && num(out.inML) > 0) return { yield: num(out.inML), reason: null };
    if (unit === 'piece' && num(out.inPiece) > 0) return { yield: num(out.inPiece), reason: null };

    if (outScoop && outUnit === unit) {
        const qtyOfScoops = num(out.qty_of_scoops) ?? num(out.qty);
        const perScoop = scoopFactor(outScoop);
        if (qtyOfScoops > 0 && perScoop > 0) {
            return { yield: roundTo(qtyOfScoops * perScoop, 6), reason: null };
        }
    }

    return {
        yield: null,
        reason: `Batch yield not available in ${unit} (check dish_out inGm/inML/inPiece or usable scoop)`
    };
}

async function explodeProcessedIntoRaw(
    pool,
    childCode,
    neededQty,
    unit,
    stack,
    depth,
    allRawMap,
    warnings
) {
    if (depth > MAX_DEPTH) {
        warnings.push(`Depth limit at processed dish ${childCode}`);
        return;
    }
    if (stack.includes(childCode)) {
        warnings.push(`Cycle skipped: ${stack.concat(childCode).join(' → ')}`);
        return;
    }

    const rows = await loadRecipeRows(pool, childCode);
    if (!rows.length) {
        warnings.push(`No recipe for processed dish ${childCode}`);
        return;
    }
    const dishName = String(rows[rows.length - 1].dishname || '').trim();
    const batch = await batchYieldInUnit(pool, childCode, dishName, rows, unit);
    if (!batch.yield || batch.yield <= 0) {
        warnings.push(`${childCode}: ${batch.reason || 'Cannot compute batch yield'}`);
        return;
    }
    const ratio = neededQty / batch.yield;
    const lines = dedupeLines(rows);

    for (const line of lines) {
        const classified = await classifyRecipeLine(pool, line, childCode);
        if (!classified.ok) {
            warnings.push(`${childCode} line "${classified.itemName}": ${classified.reason}`);
            continue;
        }
        const { kind, itemName, itemId, unit: lineUnit, factor, qty } = classified;
        const scaled = roundTo((num(qty) || 0) * (factor || 1) * ratio, 6);
        if (scaled <= 0) continue;

        if (kind === 'raw') {
            addQty(allRawMap, itemId, itemName, lineUnit, scaled, { source: childCode });
        } else if (kind === 'processed') {
            await explodeProcessedIntoRaw(
                pool,
                String(itemId || '').trim().toUpperCase(),
                scaled,
                lineUnit,
                stack.concat(childCode),
                depth + 1,
                allRawMap,
                warnings
            );
        }
    }
}

async function estimateOneDish(pool, dishCode, orderQty) {
    const rows = await loadRecipeRows(pool, dishCode);
    if (!rows.length) {
        return { ok: false, error: `No recipe for dish code ${dishCode}` };
    }
    const dishName = String(rows[rows.length - 1].dishname || '').trim();
    const qtyMult = num(orderQty);
    if (qtyMult == null || qtyMult <= 0) {
        return { ok: false, error: 'Quantity must be a positive number' };
    }

    const lines = dedupeLines(rows);
    const directRaw = new Map();
    const processed = new Map();
    const allRaw = new Map();
    const warnings = [];

    for (const line of lines) {
        const classified = await classifyRecipeLine(pool, line, dishCode);
        if (!classified.ok) {
            warnings.push(`Line "${classified.itemName}": ${classified.reason}`);
            continue;
        }
        const { kind, itemName, itemId, unit, factor, qty } = classified;
        const lineTotal = roundTo((num(qty) || 0) * (factor || 1) * qtyMult, 6);
        if (lineTotal <= 0) continue;

        if (kind === 'raw') {
            addQty(directRaw, itemId, itemName, unit, lineTotal, { source: dishCode });
            addQty(allRaw, itemId, itemName, unit, lineTotal, { source: dishCode });
        } else if (kind === 'processed') {
            const childCode = String(itemId || '').trim().toUpperCase();
            addProcessed(processed, childCode, itemName, unit, lineTotal);
            await explodeProcessedIntoRaw(
                pool,
                childCode,
                lineTotal,
                unit,
                [dishCode],
                1,
                allRaw,
                warnings
            );
        }
    }

    return {
        ok: true,
        dishcode: dishCode,
        dishname: dishName,
        orderQty: qtyMult,
        directRaw: mapToSortedRows(directRaw),
        processed: Array.from(processed.values()).sort((a, b) => a.itemName.localeCompare(b.itemName)),
        allRaw: mapToSortedRows(allRaw),
        warnings
    };
}

function mergeQtyMaps(target, sourceRows, pickFields) {
    for (const row of sourceRows || []) {
        const key = pickFields.key(row);
        const prev = target.get(key);
        const add = num(row.qty) || 0;
        if (prev) {
            prev.qty = roundTo(prev.qty + add, 6);
        } else {
            target.set(key, { ...row, qty: roundTo(add, 6) });
        }
    }
}

async function estimateRawMaterials(pool, lines) {
    const normalized = [];
    const notFound = [];
    const warnings = [];

    for (const line of lines || []) {
        const dishname = line.dishname != null ? String(line.dishname).trim() : '';
        const dishcode = line.dishcode != null ? String(line.dishcode).trim() : '';
        const qty = num(line.qty);
        if ((!dishname && !dishcode) || qty == null || qty <= 0) continue;

        const dish = await resolveDish(pool, dishcode, dishname);
        if (!dish) {
            notFound.push({
                dishname: dishname || null,
                dishcode: dishcode || null,
                qty
            });
            continue;
        }
        const key = dish.dish_code;
        const existing = normalized.find(r => r.dishcode === key);
        if (existing) {
            existing.qty = roundTo(existing.qty + qty, 6);
        } else {
            normalized.push({
                dishcode: key,
                dishname: dish.dishname,
                qty
            });
        }
    }

    const dishes = [];
    const grandDirect = new Map();
    const grandProcessed = new Map();
    const grandAllRaw = new Map();

    for (const item of normalized) {
        const result = await estimateOneDish(pool, item.dishcode, item.qty);
        if (!result.ok) {
            warnings.push(`${item.dishname || item.dishcode}: ${result.error}`);
            continue;
        }
        dishes.push(result);
        if (result.warnings?.length) {
            warnings.push(...result.warnings.map(w => `${result.dishname}: ${w}`));
        }
        mergeQtyMaps(grandDirect, result.directRaw, {
            key: r => aggKey(r.pgNo, r.itemName, r.unit)
        });
        mergeQtyMaps(grandProcessed, result.processed, {
            key: r => processedKey(r.dishcode, r.itemName, r.unit)
        });
        mergeQtyMaps(grandAllRaw, result.allRaw, {
            key: r => aggKey(r.pgNo, r.itemName, r.unit)
        });
    }

    return {
        ok: true,
        notFound,
        dishes,
        grandTotals: {
            directRaw: mapToSortedRows(grandDirect),
            processed: Array.from(grandProcessed.values()).sort((a, b) => a.itemName.localeCompare(b.itemName)),
            allRaw: mapToSortedRows(grandAllRaw)
        },
        warnings
    };
}

module.exports = {
    estimateRawMaterials,
    estimateOneDish
};
