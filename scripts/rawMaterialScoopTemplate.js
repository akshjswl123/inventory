'use strict';

/** Standard purchase/recipe units for raw materials (matches scoop_config convention). */
const RECIPE_UNITS = [
    { unit: 'gm', destination_unit: 'gm', factor: 1, conversion_chain: 'gm:1:gm', qty_in_grams: 1, qty_in_ml: null, qty_in_piece: null },
    { unit: 'ml', destination_unit: 'ml', factor: 1, conversion_chain: 'ml:1:ml', qty_in_grams: null, qty_in_ml: 1, qty_in_piece: null },
    { unit: 'piece', destination_unit: 'piece', factor: 1, conversion_chain: 'piece:1:piece', qty_in_grams: null, qty_in_ml: null, qty_in_piece: 1 },
    { unit: 'kg', destination_unit: 'gm', factor: 1, conversion_chain: 'kg:1000:gm', qty_in_grams: 1000, qty_in_ml: null, qty_in_piece: null },
    { unit: 'ltr', destination_unit: 'ml', factor: 1, conversion_chain: 'ltr:1000:ml', qty_in_grams: null, qty_in_ml: 1000, qty_in_piece: null },
    { unit: 'pkt', destination_unit: 'gm', factor: 1, conversion_chain: 'pkt:500:gm', qty_in_grams: 500, qty_in_ml: null, qty_in_piece: null }
];

function buildReciepeScoopRow(material, unitDef) {
    const name = String(material.itemname || '').trim();
    const pgNo = String(material.pgNo || '').trim();
    const u = unitDef.unit;
    return {
        scoop_item_name: name,
        scoop_item_id: pgNo,
        destination_unit: unitDef.destination_unit,
        scoop_name: `${name}_${u}_reciepe`,
        factor: String(unitDef.factor),
        conversion_chain: unitDef.conversion_chain,
        qty_in_grams: unitDef.qty_in_grams != null ? String(unitDef.qty_in_grams) : '',
        qty_in_ml: unitDef.qty_in_ml != null ? String(unitDef.qty_in_ml) : '',
        qty_in_piece: unitDef.qty_in_piece != null ? String(unitDef.qty_in_piece) : '',
        unused: 'False'
    };
}

function buildAllReciepeScoopRows(material) {
    return RECIPE_UNITS.map(u => buildReciepeScoopRow(material, u));
}

function materialIds(material) {
    return {
        name: String(material.itemname || '').trim(),
        pgNo: String(material.pgNo || '').trim()
    };
}

function baseRow(material, fields) {
    const { name, pgNo } = materialIds(material);
    return {
        scoop_item_name: name,
        scoop_item_id: pgNo,
        destination_unit: fields.destination_unit,
        scoop_name: fields.scoop_name,
        factor: String(fields.factor),
        conversion_chain: fields.conversion_chain != null ? fields.conversion_chain : '',
        qty_in_grams: fields.qty_in_grams != null ? String(fields.qty_in_grams) : '',
        qty_in_ml: fields.qty_in_ml != null ? String(fields.qty_in_ml) : '',
        qty_in_piece: fields.qty_in_piece != null ? String(fields.qty_in_piece) : '',
        unused: 'False'
    };
}

/** Full standard set per raw material (matches dal / raw_materialsscoop.csv). */
function buildAllStandardScoopRows(material) {
    const { name } = materialIds(material);
    const n = name;
    return [
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_gm_in`, factor: 1, conversion_chain: 'gm:1:gm', qty_in_grams: 1 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_gm_inventory`, factor: 1, conversion_chain: 'gm:1:gm', qty_in_grams: 1 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_gm_out`, factor: 1, conversion_chain: 'gm:1:gm', qty_in_grams: 1 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_gm_reciepe`, factor: 1, conversion_chain: 'gm:1:gm', qty_in_grams: 1 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_kg_in`, factor: 1000, conversion_chain: 'kg:1000:gm', qty_in_grams: 1000 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_kg_out`, factor: 500, conversion_chain: 'kg:1000:gm', qty_in_grams: 1000 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_kg_reciepe`, factor: 1, conversion_chain: 'kg:1000:gm', qty_in_grams: 1000 }),
        baseRow(material, { destination_unit: 'ml', scoop_name: `${n}_ltr_reciepe`, factor: 1, conversion_chain: 'ltr:1000:ml', qty_in_ml: 1000 }),
        baseRow(material, { destination_unit: 'ml', scoop_name: `${n}_ml_in`, factor: 1, conversion_chain: 'ml:1:ml', qty_in_ml: 1 }),
        baseRow(material, { destination_unit: 'ml', scoop_name: `${n}_ml_out`, factor: 1, conversion_chain: 'ml:1:ml', qty_in_ml: 1 }),
        baseRow(material, { destination_unit: 'ml', scoop_name: `${n}_ml_reciepe`, factor: 1, conversion_chain: 'ml:1:ml', qty_in_ml: 1 }),
        baseRow(material, { destination_unit: 'piece', scoop_name: `${n}_piece_in`, factor: 1, conversion_chain: 'piece:1:piece', qty_in_piece: 1 }),
        baseRow(material, { destination_unit: 'piece', scoop_name: `${n}_piece_out`, factor: 1, conversion_chain: 'piece:1:piece', qty_in_piece: 1 }),
        baseRow(material, { destination_unit: 'piece', scoop_name: `${n}_piece_reciepe`, factor: 1, conversion_chain: 'piece:1:piece', qty_in_piece: 1 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_pkt_in`, factor: 500, conversion_chain: 'pkt:500:gm', qty_in_grams: 500 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_pkt_out`, factor: 500, conversion_chain: 'pkt:500:gm', qty_in_grams: 500 }),
        baseRow(material, { destination_unit: 'gm', scoop_name: `${n}_pkt_reciepe`, factor: 1, conversion_chain: 'pkt:500:gm', qty_in_grams: 500 })
    ];
}

function buildOtherInScoopRow(material) {
    const { name } = materialIds(material);
    return baseRow(material, {
        destination_unit: 'other',
        scoop_name: `${name}_other_in`,
        factor: 1,
        conversion_chain: '',
        qty_in_piece: 1
    });
}

function buildAllScoopRowsForMaterial(material) {
    return [...buildAllStandardScoopRows(material), buildOtherInScoopRow(material)];
}

module.exports = {
    RECIPE_UNITS,
    buildReciepeScoopRow,
    buildAllReciepeScoopRows,
    buildAllStandardScoopRows,
    buildOtherInScoopRow,
    buildAllScoopRowsForMaterial
};
