'use strict';

/**
 * Delta seed for items in data/raw_materialv2.csv only (not in raw_materials30sept11am.csv).
 * Trims raw_materialv2.csv to those rows, appends scoops to raw_materialsscoop.csv, writes SQL.
 *
 *   node scripts/generateRawMaterialsV2DeltaSeed.js
 */

const fs = require('fs');
const path = require('path');
const {
    readCsv,
    sqlStr,
    chunk,
    isStandardUnitScoop,
    appendScoopInserts
} = require('./csvSeedUtils');
const { buildAllScoopRowsForMaterial } = require('./rawMaterialScoopTemplate');

const ROOT = path.join(__dirname, '..');
const V2_CSV = path.join(ROOT, 'data/raw_materialv2.csv');
const BASE_CSV = path.join(ROOT, 'data/raw_materials30sept11am.csv');
const SCOOPS_CSV = path.join(ROOT, 'data/raw_materialsscoop.csv');
const OUT_FILE = path.join(__dirname, 'raw_materials_v2_delta_seed.sql');
const BATCH = 80;

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

function materialKey(r) {
    return String(r.pgNo || '').trim().toLowerCase() + '|' + String(r.itemname || '').trim().toLowerCase();
}

function dedupeMaterials(rows) {
    const byKey = new Map();
    rows.forEach(r => {
        const name = String(r.itemname || '').trim();
        const pgNo = String(r.pgNo || '').trim();
        if (!name || !pgNo) return;
        byKey.set(pgNo + '|' + name, {
            pgNo,
            itemname: name,
            comments: String(r.comments || 'From raw_materialv2.csv delta').trim()
        });
    });
    return Array.from(byKey.values()).sort((a, b) =>
        a.itemname.localeCompare(b.itemname, undefined, { sensitivity: 'base' })
    );
}

function csvCell(value) {
    if (value == null || value === '') return '';
    return '"' + String(value).replace(/"/g, '""') + '"';
}

function scoopKey(row) {
    return (
        String(row.scoop_item_id || '').trim() + '|' +
        String(row.scoop_item_name || '').trim() + '|' +
        String(row.scoop_name || '').trim()
    );
}

function writeV2Csv(materials) {
    const lines = ['"pgNo","itemname"'];
    materials.forEach(m => {
        lines.push('"' + m.pgNo.replace(/"/g, '""') + '","' + m.itemname.replace(/"/g, '""') + '"');
    });
    fs.writeFileSync(V2_CSV, lines.join('\n') + '\n', 'utf8');
}

function mergeScoopsIntoCsv(materials) {
    let existing = [];
    if (fs.existsSync(SCOOPS_CSV)) {
        existing = readCsv(SCOOPS_CSV).filter(r => String(r.scoop_name || '').trim());
    }
    const byKey = new Map();
    existing.forEach(r => byKey.set(scoopKey(r), r));

    let added = 0;
    materials.forEach(m => {
        buildAllScoopRowsForMaterial(m).forEach(row => {
            const key = scoopKey(row);
            if (byKey.has(key)) return;
            byKey.set(key, row);
            added++;
        });
    });

    const merged = Array.from(byKey.values()).sort((a, b) =>
        String(a.scoop_name).localeCompare(String(b.scoop_name), undefined, { sensitivity: 'base' })
    );

    const lines = [CSV_HEADER.join(',')];
    merged.forEach(r => {
        lines.push(CSV_HEADER.map(h => csvCell(r[h])).join(','));
    });
    fs.writeFileSync(SCOOPS_CSV, lines.join('\n') + '\n', 'utf8');
    return { added, total: merged.length };
}

function main() {
    const v2All = readCsv(V2_CSV);
    const base = readCsv(BASE_CSV);
    const baseKeys = new Set(base.map(materialKey));
    const deltaRows = v2All.filter(r => !baseKeys.has(materialKey(r)));
    const materials = dedupeMaterials(deltaRows);

    writeV2Csv(materials);
    console.log('Trimmed ' + V2_CSV + ' → ' + materials.length + ' delta row(s)');

    const scoopStats = mergeScoopsIntoCsv(materials);
    console.log('raw_materialsscoop.csv: +' + scoopStats.added + ' rows (' + scoopStats.total + ' total)');

    const allNewScoops = materials.flatMap(m => buildAllScoopRowsForMaterial(m));
    const standardScoops = allNewScoops.filter(r => isStandardUnitScoop(r.scoop_name));
    const customScoops = allNewScoops.filter(r => !isStandardUnitScoop(r.scoop_name));

    let sql = `-- =============================================================================
-- raw_materials_v2_delta_seed.sql — generated from data/raw_materialv2.csv
-- =============================================================================
-- Items in v2 CSV that are not in data/raw_materials30sept11am.csv (+ full scoops).
--
-- Regenerate:
--   node scripts/generateRawMaterialsV2DeltaSeed.js
--
-- Run after raw_materials_seed.sql and raw_materials_custom_scoops_seed.sql:
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/raw_materials_v2_delta_seed.sql
-- =============================================================================

BEGIN;

`;

    sql += `-- raw_materials delta (${materials.length} rows)\n`;
    if (materials.length) {
        const values = materials
            .map(r => `(${sqlStr(r.pgNo)}, ${sqlStr(r.itemname)}, ${sqlStr(r.comments)})`)
            .join(',\n    ');
        sql += `INSERT INTO public.raw_materials ("pgNo", itemname, comments)
SELECT v."pgNo", v.itemname, v.comments
FROM (VALUES
    ${values}
) AS v("pgNo", itemname, comments)
WHERE NOT EXISTS (
    SELECT 1 FROM public.raw_materials rm WHERE rm.itemname = v.itemname
);

`;
    }

    const scoopParts = [];
    appendScoopInserts(scoopParts, 'scoop_config (standard units, v2 delta)', standardScoops, BATCH);
    appendScoopInserts(scoopParts, 'scoop_config (custom other_in, v2 delta)', customScoops, BATCH);
    sql += scoopParts.join('');

    sql += `COMMIT;

SELECT 'raw_materials_v2_delta_materials' AS tbl, ${materials.length}::bigint AS expected_rows;
`;

    fs.writeFileSync(OUT_FILE, sql, 'utf8');
    console.log('Wrote ' + OUT_FILE);
    console.log('  materials:       ' + materials.length);
    console.log('  standard scoops: ' + standardScoops.length);
    console.log('  custom scoops:   ' + customScoops.length);
}

main();
