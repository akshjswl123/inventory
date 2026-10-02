'use strict';

/**
 * Generate scoop_config_catalog.js — offline replica of public.scoop_config
 * from seed CSVs (same rows as dish + raw_materials scoop seeds).
 *
 * Regenerate:
 *   node scripts/generateScoopConfigCatalog.js
 *   (or node scripts/generateOfflineSeedStatic.js)
 */

const fs = require('fs');
const path = require('path');
const { buildScoopConfigFromSeedCsvs } = require('./buildStaticDataFromSeeds');

const OUT_FILE = path.join(__dirname, '..', 'scoop_config_catalog.js');

function csvQuote(value) {
  if (value == null || value === '') return '""';
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function rowToCsvLine(r) {
  const cells = [
    r.scoop_item_name || '',
    r.scoop_item_id != null ? String(r.scoop_item_id) : '',
    r.destination_unit || '',
    r.scoop_name || '',
    r.factor != null && Number.isFinite(Number(r.factor)) ? String(r.factor) : '',
    r.conversion_chain || '',
    r.qty_in_grams != null && Number.isFinite(Number(r.qty_in_grams)) ? String(r.qty_in_grams) : '',
    r.qty_in_ml != null && Number.isFinite(Number(r.qty_in_ml)) ? String(r.qty_in_ml) : '',
    r.qty_in_piece != null && Number.isFinite(Number(r.qty_in_piece)) ? String(r.qty_in_piece) : '',
    r.unused ? 'true' : 'false'
  ];
  return cells.map(csvQuote).join(',');
}

function main() {
  const rows = buildScoopConfigFromSeedCsvs();

  const header = `/* =============================================================================
 * scoop_config_catalog.js — GENERATED; do not edit by hand
 * =============================================================================
 * Offline duplicate of public.scoop_config from seed CSVs:
 *   data/raw_materialsscoop.csv + data/dishscoops.csv
 *
 * Regenerate:
 *   node scripts/generateOfflineSeedStatic.js
 *   node scripts/generateScoopConfigCatalog.js
 *
 * Rows: ${rows.length}
 * ============================================================================= */

`;

  const csvBody = rows.map(rowToCsvLine).join('\n');
  const content = header
    + 'var SCOOP_CONFIG_CSV = `\n' + csvBody + '\n`;\n'
    + 'if (typeof window !== "undefined") { window.SCOOP_CONFIG_CSV = SCOOP_CONFIG_CSV; }\n'
    + 'if (typeof globalThis !== "undefined") { globalThis.SCOOP_CONFIG_CSV = SCOOP_CONFIG_CSV; }\n';

  fs.writeFileSync(OUT_FILE, content, 'utf8');
  console.log('Wrote ' + OUT_FILE + ' (' + rows.length + ' scoop_config rows)');
}

if (require.main === module) {
  main();
}

module.exports = { main };
