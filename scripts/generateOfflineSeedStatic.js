'use strict';

/**
 * Generate offline static JS duplicates of all SQL seed data (same CSV sources).
 *
 *   node scripts/generateOfflineSeedStatic.js
 *
 * Outputs:
 *   static_seed_core.js       — vendors, categories, dishes (seed_data.sql)
 *   static_seed_materials.js  — raw_materials catalog (raw_materials_seed.sql)
 *   scoop_config_catalog.js   — all scoop_config rows (dish + material seeds)
 *   static_seed_catalog.js    — full bundle for StaticDataFetcher (file:// mode)
 */

const fs = require('fs');
const path = require('path');
const { buildOfflineStaticData } = require('./buildStaticDataFromSeeds');

const ROOT = path.join(__dirname, '..');

function writeJsConst(outPath, constName, obj, headerLines) {
    const json = JSON.stringify(obj, null, 0);
    const header = headerLines.join('\n') + '\n\n';
    const body =
        'var ' + constName + ' = ' + json + ';\n'
        + 'if (typeof window !== "undefined") { window.' + constName + ' = ' + constName + '; }\n'
        + 'if (typeof globalThis !== "undefined") { globalThis.' + constName + ' = ' + constName + '; }\n';
    fs.writeFileSync(outPath, header + body, 'utf8');
}

function writeScoopConfigCatalog(scoopConfig) {
    const OUT = path.join(ROOT, 'scoop_config_catalog.js');
    function csvQuote(value) {
        if (value == null || value === '') return '""';
        return '"' + String(value).replace(/"/g, '""') + '"';
    }
    const lines = scoopConfig.map(r => {
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
    });

    const header = `/* =============================================================================
 * scoop_config_catalog.js — GENERATED; do not edit by hand
 * =============================================================================
 * Offline duplicate of public.scoop_config from seed CSVs:
 *   data/raw_materialsscoop.csv + data/dishscoops.csv
 *
 * Regenerate:
 *   node scripts/generateOfflineSeedStatic.js
 *
 * Rows: ${scoopConfig.length}
 * ============================================================================= */

`;
    const content = header
        + 'var SCOOP_CONFIG_CSV = `\n' + lines.join('\n') + '\n`;\n'
        + 'if (typeof window !== "undefined") { window.SCOOP_CONFIG_CSV = SCOOP_CONFIG_CSV; }\n'
        + 'if (typeof globalThis !== "undefined") { globalThis.SCOOP_CONFIG_CSV = SCOOP_CONFIG_CSV; }\n';
    fs.writeFileSync(OUT, content, 'utf8');
    console.log('Wrote ' + OUT + ' (' + scoopConfig.length + ' rows)');
}

function main() {
    const { core, materials, scoopConfig, bundle } = buildOfflineStaticData();

    writeJsConst(
        path.join(ROOT, 'static_seed_core.js'),
        'STATIC_SEED_CORE',
        core,
        [
            '/* GENERATED — offline duplicate of scripts/seed_data.sql (vendors, categories, dishes)',
            ' * Source: catalog.js + data/dishes.csv',
            ' * Regenerate: node scripts/generateOfflineSeedStatic.js */'
        ]
    );
    console.log('Wrote static_seed_core.js'
        + ' (vendors=' + core.VENDORS.length
        + ' categories=' + core.CATEGORIES.length
        + ' dishes=' + core.DISH_CATALOG.length + ')');

    writeJsConst(
        path.join(ROOT, 'static_seed_materials.js'),
        'STATIC_SEED_MATERIALS',
        materials,
        [
            '/* GENERATED — offline duplicate of scripts/raw_materials_seed.sql (raw_materials rows)',
            ' * Source: data/raw_materials30sept11am.csv + data/raw_materialv2.csv',
            ' * Regenerate: node scripts/generateOfflineSeedStatic.js */'
        ]
    );
    console.log('Wrote static_seed_materials.js (materials=' + materials.CATALOG.length + ')');

    writeScoopConfigCatalog(scoopConfig);

    writeJsConst(
        path.join(ROOT, 'static_seed_catalog.js'),
        'STATIC_SEED_CATALOG',
        bundle,
        [
            '/* GENERATED — full offline bundle (matches GET /api/static-data after seeds)',
            ' * Same data as static_seed_core + static_seed_materials + scoop_config_catalog',
            ' * Regenerate: node scripts/generateOfflineSeedStatic.js */'
        ]
    );
    console.log('Wrote static_seed_catalog.js'
        + ' (' + Math.round(JSON.stringify(bundle).length / 1024) + ' KB)'
        + ' SCOOP_CONFIG=' + bundle.SCOOP_CONFIG.length);
}

main();
