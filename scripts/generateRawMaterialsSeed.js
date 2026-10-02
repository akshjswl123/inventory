'use strict';

const fs = require('fs');
const path = require('path');
const {
    readCsv,
    sqlStr,
    chunk,
    isStandardUnitScoop,
    appendScoopInserts
} = require('./csvSeedUtils');

const ROOT = path.join(__dirname, '..');
const MATERIALS_CSV = path.join(ROOT, 'data/raw_materials30sept11am.csv');
const SCOOPS_CSV = path.join(ROOT, 'data/raw_materialsscoop.csv');
const OUT_FILE = path.join(__dirname, 'raw_materials_seed.sql');
const BATCH = 80;

function dedupeMaterials(rows) {
    const byKey = new Map();
    rows.forEach(r => {
        const name = String(r.itemname || '').trim();
        const pgNo = String(r.pgNo || '').trim();
        if (!name || !pgNo) return;
        byKey.set(pgNo + '|' + name, {
            pgNo,
            itemname: name,
            comments: String(r.comments || '').trim()
        });
    });
    return Array.from(byKey.values()).sort((a, b) =>
        a.itemname.localeCompare(b.itemname, undefined, { sensitivity: 'base' })
    );
}

function main() {
    require('./generateRawMaterialsScoopCsv').main();

    const materials = dedupeMaterials(readCsv(MATERIALS_CSV));
    const allScoops = readCsv(SCOOPS_CSV).filter(r => String(r.scoop_name || '').trim());
    const standardScoops = allScoops.filter(r => isStandardUnitScoop(r.scoop_name));

    let sql = `-- =============================================================================
-- raw_materials_seed.sql — generated from data/*.csv
-- =============================================================================
-- Sources:
--   data/raw_materials30sept11am.csv  → public.raw_materials
--   data/raw_materialsscoop.csv       → standard unit scoops only
--     (gm/ml/piece/kg/ltr/pkt × in|out|inventory|reciepe)
-- Custom units (other, bag, portion, …): raw_materials_custom_scoops_seed.sql
--
-- Regenerate:
--   node scripts/generateRawMaterialsSeed.js
--   node scripts/generateCustomScoopsSeed.js
--
-- Run:
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/raw_materials_seed.sql
-- =============================================================================

BEGIN;

`;

    sql += `-- raw_materials (${materials.length} rows)\n`;
    chunk(materials, BATCH).forEach(part => {
        const values = part
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
    });

    const scoopParts = [];
    appendScoopInserts(scoopParts, 'scoop_config (standard units)', standardScoops, BATCH);
    sql += scoopParts.join('');

    sql += `COMMIT;

-- Row counts
SELECT 'raw_materials' AS tbl, COUNT(*) AS rows FROM public.raw_materials
UNION ALL SELECT 'scoop_config (standard units)', COUNT(*)
FROM public.scoop_config sc
WHERE sc.scoop_name ~* '_(gm|ml|piece|kg|ltr|pkt)_(in|out|inventory|reciepe)$'
ORDER BY tbl;
`;

    fs.writeFileSync(OUT_FILE, sql, 'utf8');
    console.log('Wrote ' + OUT_FILE);
    console.log('  raw_materials:   ' + materials.length);
    console.log('  standard scoops: ' + standardScoops.length + ' / ' + allScoops.length + ' total');
}

main();
