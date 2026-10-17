'use strict';

const MAX_DEPTH = 25;
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

function scoopFactor(scoop) {
    const unit = String(scoop.destination_unit || '').trim().toLowerCase();
    if (unit === 'gm') return num(scoop.qty_in_grams) ?? num(scoop.factor) ?? 1;
    if (unit === 'ml') return num(scoop.qty_in_ml) ?? num(scoop.factor) ?? 1;
    if (unit === 'piece') return num(scoop.qty_in_piece) ?? num(scoop.factor) ?? 1;
    return num(scoop.factor) ?? 1;
}

const RECIPE_VERSION_FOR_DISH_SQL = `
    COALESCE(
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
    )`;

async function resolveDish(pool, dishcode, dishname) {
    const code = dishcode ? String(dishcode).trim() : '';
    const name = dishname ? String(dishname).trim() : '';
    const res = await pool.query(
        `
        SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
            UPPER(TRIM(re.dishcode)) AS dish_code,
            TRIM(re.dishname) AS dishname
        FROM public.recipe_entries re
        WHERE re.dishcode IS NOT NULL
          AND TRIM(re.dishcode) <> ''
          AND (
                ($1::text <> '' AND UPPER(TRIM(re.dishcode)) = UPPER($1::text))
             OR ($1::text = '' AND $2::text <> '' AND LOWER(TRIM(re.dishname)) = LOWER($2::text))
          )
          AND re.version = COALESCE(
              (
                  SELECT iv.version
                  FROM public.item_versions iv
                  WHERE iv.item_type = 'dishes'
                    AND iv.item_code = UPPER(TRIM(re.dishcode))
                  LIMIT 1
              ),
              (
                  SELECT MAX(sub.version)
                  FROM public.recipe_entries sub
                  WHERE UPPER(TRIM(sub.dishcode)) = UPPER(TRIM(re.dishcode))
              ),
              1
          )
        ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
        LIMIT 1
        `,
        [code, name]
    );
    return res.rows[0] || null;
}

async function loadScoop(pool, scoopName, itemId, itemName) {
    if (!scoopName) return null;
    const res = await pool.query(
        `
        SELECT id, scoop_item_name, scoop_item_id, destination_unit, scoop_name,
               factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece
        FROM public.scoop_config sc
        WHERE LOWER(TRIM(sc.scoop_name)) = LOWER(TRIM($1))
          AND COALESCE(sc.unused, false) = false
          AND sc.version = COALESCE(
              (
                  SELECT iv.version
                  FROM public.item_versions iv
                  WHERE iv.item_type = 'scoop_config'
                    AND iv.item_code = LOWER(TRIM(sc.scoop_name))
                  LIMIT 1
              ),
              1
          )
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
        SELECT TRIM(re.dishname) AS dishname
        FROM public.recipe_entries re
        WHERE UPPER(TRIM(re.dishcode)) = UPPER(TRIM($1))
          AND re.dishcode IS NOT NULL
          AND TRIM(re.dishcode) <> ''
          AND re.version = ${RECIPE_VERSION_FOR_DISH_SQL}
        ORDER BY re.id DESC
        LIMIT 1
        `,
        [dishCode]
    );
    return res.rows[0] ? res.rows[0].dishname : null;
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
            String(row.pgNo || row['pgNo'] || '').trim(),
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

async function classifyRecipeLine(pool, line, dishCode) {
    const itemName = String(line.reciepeitemname || '').trim();
    const itemId = String(line.pgNo || line['pgNo'] || '').trim();
    const scoopName = String(line.receipescoop || '').trim();
    const qty = num(line.qty);

    const scoop = await loadScoop(pool, scoopName, itemId, itemName);
    if (!scoop) {
        return {
            ok: false,
            itemName,
            reason: `Scoop "${scoopName || '(blank)'}" not found`
        };
    }

    const unit = String(scoop.destination_unit || '').trim().toLowerCase();
    const factor = scoopFactor(scoop);
    if (!['gm', 'ml', 'piece'].includes(unit)) {
        return {
            ok: false,
            itemName,
            reason: `Scoop "${scoop.scoop_name}" unit must be gm, ml, or piece`
        };
    }

    if (itemId && itemId.toUpperCase() === String(dishCode || '').toUpperCase()) {
        return { ok: false, itemName, reason: 'Dish cannot contain itself' };
    }

    const raw = await loadRawMaterial(pool, itemId, itemName);
    const childDishName = await loadDishName(pool, itemId.toUpperCase());
    const codeIsDish = childDishName != null;
    const nameMatchesDish = codeIsDish && childDishName.toLowerCase() === itemName.toLowerCase();
    let kind = 'unknown';
    if (codeIsDish && (!raw || nameMatchesDish)) kind = 'processed';
    else if (raw) kind = 'raw';

    if (kind === 'unknown') {
        return { ok: false, itemName, reason: 'Not a raw material or processed dish in catalog' };
    }

    return {
        ok: true,
        kind,
        itemName,
        itemId,
        scoopName: scoop.scoop_name,
        unit,
        factor,
        qty
    };
}

module.exports = {
    MAX_DEPTH,
    META_ITEMS,
    roundTo,
    num,
    scoopFactor,
    resolveDish,
    loadScoop,
    loadRawMaterial,
    loadDishName,
    dedupeLines,
    dishOutRow,
    classifyRecipeLine
};
