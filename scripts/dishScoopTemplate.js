'use strict';

function isProcessedCode(code) {
    return /^P\d+$/i.test(String(code || '').trim());
}

/**
 * Standard scoop_config rows per dish (matches data/dishscoops.csv generator).
 * @returns {object[]} rows with scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused
 */
function buildDishScoopConfigRows(dishName, dishCode) {
    const name = String(dishName || '').trim();
    const code = String(dishCode || '').trim();
    if (!name) return [];

    const processed = isProcessedCode(code);
    const rows = [];

    function push(fields) {
        rows.push({
            scoop_item_name: name,
            scoop_item_id: code || null,
            destination_unit: fields.destination_unit,
            scoop_name: fields.scoop_name,
            factor: fields.factor != null ? Number(fields.factor) : 1,
            conversion_chain: fields.conversion_chain != null ? fields.conversion_chain : null,
            qty_in_grams: fields.qty_in_grams != null ? Number(fields.qty_in_grams) : null,
            qty_in_ml: fields.qty_in_ml != null ? Number(fields.qty_in_ml) : null,
            qty_in_piece: fields.qty_in_piece != null ? Number(fields.qty_in_piece) : null,
            unused: false
        });
    }

    const reciepeUnits = [
        { unit: 'gm', dest: 'gm', chain: 'gm:1:gm', g: 1, ml: null, p: null },
        { unit: 'ml', dest: 'ml', chain: 'ml:1:ml', g: null, ml: 1, p: null },
        { unit: 'piece', dest: 'piece', chain: 'piece:1:piece', g: null, ml: null, p: 1 }
    ];
    reciepeUnits.forEach(u => {
        push({
            destination_unit: u.dest,
            scoop_name: `${name}_${u.unit}_reciepe`,
            factor: 1,
            conversion_chain: u.chain,
            qty_in_grams: u.g,
            qty_in_ml: u.ml,
            qty_in_piece: u.p
        });
    });

    push({
        destination_unit: 'portion',
        scoop_name: `${name}_portion_reciepe`,
        factor: 1,
        conversion_chain: 'portion:1:portion',
        qty_in_grams: null,
        qty_in_ml: null,
        qty_in_piece: 1
    });

    push({
        destination_unit: 'portion',
        scoop_name: `${name}_1_portion`,
        factor: 1,
        conversion_chain: null,
        qty_in_grams: null,
        qty_in_ml: null,
        qty_in_piece: 1
    });

    if (processed) {
        push({
            destination_unit: 'gm',
            scoop_name: `${name}_gm_in`,
            factor: 1,
            conversion_chain: 'gm:1:gm',
            qty_in_grams: 1,
            qty_in_ml: null,
            qty_in_piece: null
        });
        push({
            destination_unit: 'gm',
            scoop_name: `${name}_gm_out`,
            factor: 1,
            conversion_chain: 'gm:1:gm',
            qty_in_grams: 1,
            qty_in_ml: null,
            qty_in_piece: null
        });
    } else {
        push({
            destination_unit: 'piece',
            scoop_name: `${name}_piece_in`,
            factor: 1,
            conversion_chain: 'portion:1:piece',
            qty_in_grams: null,
            qty_in_ml: null,
            qty_in_piece: 1
        });
        push({
            destination_unit: 'piece',
            scoop_name: `${name}_piece_out`,
            factor: 1,
            conversion_chain: 'portion:1:piece',
            qty_in_grams: null,
            qty_in_ml: null,
            qty_in_piece: 1
        });
    }

    return rows;
}

module.exports = { buildDishScoopConfigRows, isProcessedCode };
