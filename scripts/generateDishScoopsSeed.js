'use strict';

const fs = require('fs');
const path = require('path');
const { readCsv, appendScoopInserts } = require('./csvSeedUtils');
const { buildDishScoopConfigRows, isProcessedCode } = require('./dishScoopTemplate');

const ROOT = path.join(__dirname, '..');
const DISHES_CSV = path.join(ROOT, 'data/dishes.csv');
const DISH_SCOOPS_CSV = path.join(ROOT, 'data/dishscoops.csv');
const OUT_SQL = path.join(__dirname, 'dish_scoops_seed.sql');
const BATCH = 80;

const CSV_HEADER = [
    'dish_code',
    'dish_name',
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

function toCsvRow(dish, cfg) {
    return {
        dish_code: dish.dish_code,
        dish_name: dish.dish_name,
        scoop_item_name: cfg.scoop_item_name,
        scoop_item_id: cfg.scoop_item_id,
        destination_unit: cfg.destination_unit,
        scoop_name: cfg.scoop_name,
        factor: cfg.factor != null ? String(cfg.factor) : '',
        conversion_chain: cfg.conversion_chain != null ? cfg.conversion_chain : '',
        qty_in_grams: cfg.qty_in_grams != null ? String(cfg.qty_in_grams) : '',
        qty_in_ml: cfg.qty_in_ml != null ? String(cfg.qty_in_ml) : '',
        qty_in_piece: cfg.qty_in_piece != null ? String(cfg.qty_in_piece) : '',
        unused: 'False'
    };
}

function csvCell(value) {
    if (value == null || value === '') return '';
    return '"' + String(value).replace(/"/g, '""') + '"';
}

function writeDishScoopsCsv(rows) {
    const lines = [CSV_HEADER.join(',')];
    rows.forEach(r => {
        lines.push(CSV_HEADER.map(h => csvCell(r[h])).join(','));
    });
    fs.writeFileSync(DISH_SCOOPS_CSV, lines.join('\n') + '\n', 'utf8');
}

function main() {
    const dishes = readCsv(DISHES_CSV).filter(d => String(d.dish_name || '').trim());
    const allRows = [];
    dishes.forEach(d => {
        const dish = {
            dish_code: String(d.dish_code || '').trim(),
            dish_name: String(d.dish_name || '').trim()
        };
        buildDishScoopConfigRows(dish.dish_name, dish.dish_code).forEach(cfg => {
            allRows.push(toCsvRow(dish, cfg));
        });
    });

    allRows.sort((a, b) => {
        const c = String(a.dish_code).localeCompare(String(b.dish_code));
        if (c !== 0) return c;
        return String(a.scoop_name).localeCompare(String(b.scoop_name));
    });

    writeDishScoopsCsv(allRows);

    const parts = [
        `-- =============================================================================
-- dish_scoops_seed.sql — generated from data/dishscoops.csv
-- =============================================================================
-- Per dish: gm/ml/piece/portion _reciepe, _1_portion; menu: piece_in/out; P*: gm in/out.
--
-- Regenerate:
--   node scripts/generateDishScoopsSeed.js
--
-- Run (after seed_data.sql inserts dishes):
--   psql -h localhost -p 5433 -U poc -d poc -f scripts/dish_scoops_seed.sql
-- =============================================================================

BEGIN;

`
    ];
    appendScoopInserts(parts, 'scoop_config (dishes)', allRows, BATCH);
    parts.push(`COMMIT;

SELECT COUNT(*) AS dish_scoop_config_rows
FROM public.scoop_config sc
WHERE EXISTS (
    SELECT 1 FROM public.dishes d
    WHERE LOWER(TRIM(d.dish_name)) = LOWER(TRIM(sc.scoop_item_name))
);
`);
    fs.writeFileSync(OUT_SQL, parts.join(''), 'utf8');

    const menu = dishes.filter(d => !isProcessedCode(d.dish_code)).length;
    const proc = dishes.length - menu;
    console.log('Wrote ' + DISH_SCOOPS_CSV);
    console.log('Wrote ' + OUT_SQL);
    console.log('  dishes: ' + dishes.length + ' (menu ' + menu + ', processed ' + proc + ')');
    console.log('  scoop rows: ' + allRows.length);
}

main();
