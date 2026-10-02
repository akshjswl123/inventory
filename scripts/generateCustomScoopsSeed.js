'use strict';

const fs = require('fs');
const path = require('path');
const {
    readCsv,
    isStandardUnitScoop,
    appendScoopInserts
} = require('./csvSeedUtils');

const ROOT = path.join(__dirname, '..');
const SCOOPS_CSV = path.join(ROOT, 'data/raw_materialsscoop.csv');
const OUT_FILE = path.join(__dirname, 'raw_materials_custom_scoops_seed.sql');
const BATCH = 80;

function main() {
    const allScoops = readCsv(SCOOPS_CSV).filter(r => String(r.scoop_name || '').trim());
    const customScoops = allScoops
        .filter(r => !isStandardUnitScoop(r.scoop_name))
        .sort((a, b) => String(a.scoop_name).localeCompare(String(b.scoop_name)));

    const parts = [
        `-- =============================================================================
-- raw_materials_custom_scoops_seed.sql — generated from data/raw_materialsscoop.csv
-- =============================================================================
-- Non-standard purchase/recipe units (not gm/ml/piece/kg/ltr/pkt × in/out/inventory/reciepe).
-- Examples: *_other_in, *_bag_in, *_1_portion
--
-- Regenerate:
--   node scripts/generateCustomScoopsSeed.js
--
-- Run (after raw_materials_seed.sql):
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/raw_materials_custom_scoops_seed.sql
-- =============================================================================

BEGIN;

`
    ];

    appendScoopInserts(parts, 'scoop_config (custom units)', customScoops, BATCH);

    parts.push(`COMMIT;

SELECT COUNT(*) AS custom_scoop_config_rows
FROM public.scoop_config sc
WHERE sc.scoop_name !~* '_(gm|ml|piece|kg|ltr|pkt)_(in|out|inventory|reciepe)$';
`);

    fs.writeFileSync(OUT_FILE, parts.join(''), 'utf8');
    console.log('Wrote ' + OUT_FILE);
    console.log('  custom scoop_config: ' + customScoops.length + ' / ' + allScoops.length + ' total');
}

main();
