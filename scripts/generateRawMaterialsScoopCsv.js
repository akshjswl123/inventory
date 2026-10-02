'use strict';

/**
 * Ensure data/raw_materialsscoop.csv has gm/ml/piece/kg/ltr/pkt _reciepe for every raw material.
 * Preserves all existing scoop rows; only adds missing _reciepe names.
 *
 *   node scripts/generateRawMaterialsScoopCsv.js
 */

const fs = require('fs');
const path = require('path');
const { readCsv } = require('./csvSeedUtils');
const { buildAllReciepeScoopRows } = require('./rawMaterialScoopTemplate');

const ROOT = path.join(__dirname, '..');
const MATERIALS_CSV = path.join(ROOT, 'data/raw_materials30sept11am.csv');
const SCOOPS_CSV = path.join(ROOT, 'data/raw_materialsscoop.csv');

const CSV_HEADER = [
    'scoop_item_name',
    'scoop_item_id',
    'destination_unit',
    'scoop_name',
    'factor',
    'conversion_chain',
    'qty_in_grams',
    'qty_in_ml',
    'qty_in_piece',
    'unused'
];

function dedupeMaterials(rows) {
    const byKey = new Map();
    rows.forEach(r => {
        const name = String(r.itemname || '').trim();
        const pgNo = String(r.pgNo || '').trim();
        if (!name || !pgNo) return;
        byKey.set(pgNo + '|' + name, { pgNo, itemname: name });
    });
    return Array.from(byKey.values());
}

function csvCell(value) {
    if (value == null || value === '') return '';
    return '"' + String(value).replace(/"/g, '""') + '"';
}

function scoopKey(row) {
    const id = String(row.scoop_item_id || '').trim();
    const item = String(row.scoop_item_name || '').trim();
    const name = String(row.scoop_name || '').trim();
    return id + '|' + item + '|' + name;
}

function main() {
    const materials = dedupeMaterials(readCsv(MATERIALS_CSV));
    let existing = [];
    if (fs.existsSync(SCOOPS_CSV)) {
        existing = readCsv(SCOOPS_CSV).filter(r => String(r.scoop_name || '').trim());
    }

    const byName = new Map();
    existing.forEach(r => {
        byName.set(scoopKey(r), r);
    });

    let added = 0;
    materials.forEach(m => {
        buildAllReciepeScoopRows(m).forEach(row => {
            const key = scoopKey(row);
            if (byName.has(key)) return;
            byName.set(key, row);
            added++;
        });
    });

    const merged = Array.from(byName.values()).sort((a, b) =>
        String(a.scoop_name).localeCompare(String(b.scoop_name), undefined, { sensitivity: 'base' })
    );

    const lines = [CSV_HEADER.join(',')];
    merged.forEach(r => {
        lines.push(CSV_HEADER.map(h => csvCell(r[h])).join(','));
    });
    fs.writeFileSync(SCOOPS_CSV, lines.join('\n') + '\n', 'utf8');

    console.log('Wrote ' + SCOOPS_CSV);
    console.log('  materials: ' + materials.length);
    console.log('  scoop rows: ' + merged.length + ' (added ' + added + ' reciepe rows)');
}

main();

module.exports = { main };
