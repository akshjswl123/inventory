#!/usr/bin/env node
/**
 * Retire scoops whose destination_unit does not match raw_materials_destination_unit for that pgNo.
 *
 *   PGPORT=5433 node scripts/retire_non_csv_scoops.js
 *   PGPORT=5433 node scripts/retire_non_csv_scoops.js --pgNo 1
 *   PGPORT=5433 node scripts/retire_non_csv_scoops.js --dry-run
 */
'use strict';

const path = require('path');

const REPORT_PATH = path.join(__dirname, '..', 'data', 'scoop_config_from_csv_report.txt');

function poolConfig() {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'poc',
    user: process.env.PGUSER || 'poc',
    password: process.env.PGPASSWORD || 'poc_secret'
  };
}

function parseArgs(argv) {
  const out = { pgNo: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--pgNo' && argv[i + 1]) out.pgNo = String(argv[++i]).trim();
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Options: --pgNo <id>  --dry-run');
      process.exit(0);
    }
  }
  return out;
}

const SELECT_MISMATCH = `
  SELECT TRIM(d.pg_no) AS pg_no,
         LOWER(TRIM(d.destination_unit)) AS canon_dest,
         sc.id,
         sc.scoop_name,
         sc.destination_unit,
         sc.unused
  FROM public.raw_materials_destination_unit d
  INNER JOIN public.scoop_config sc
    ON TRIM(sc.scoop_item_id) = TRIM(d.pg_no)
  WHERE LOWER(TRIM(sc.destination_unit)) <> LOWER(TRIM(d.destination_unit))
    AND COALESCE(sc.unused, false) = false
    AND ($1::text IS NULL OR TRIM(d.pg_no) = TRIM($1))
  ORDER BY d.pg_no, sc.scoop_name`;

const UPDATE_MISMATCH = `
  UPDATE public.scoop_config sc
  SET unused = true,
      last_updated_at = CURRENT_TIMESTAMP
  FROM public.raw_materials_destination_unit d
  WHERE TRIM(sc.scoop_item_id) = TRIM(d.pg_no)
    AND LOWER(TRIM(sc.destination_unit)) <> LOWER(TRIM(d.destination_unit))
    AND COALESCE(sc.unused, false) = false
    AND ($1::text IS NULL OR TRIM(d.pg_no) = TRIM($1))
  RETURNING TRIM(d.pg_no) AS pg_no, sc.scoop_name, sc.destination_unit,
            LOWER(TRIM(d.destination_unit)) AS canon_dest`;

async function main() {
  const opts = parseArgs(process.argv);
  const { Pool } = require('pg');
  const pool = new Pool(poolConfig());

  const tableCheck = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'raw_materials_destination_unit'
  `);
  if (!tableCheck.rows.length) {
    console.error('Table raw_materials_destination_unit missing. Run scripts/36_raw_materials_destination_unit.sql');
    process.exit(1);
  }

  const pgFilter = opts.pgNo || null;
  const toRetire = await pool.query(SELECT_MISMATCH, [pgFilter]);

  console.log(`Non-matching destination_unit scoops to retire: ${toRetire.rows.length}`);
  const byPg = new Map();
  for (const r of toRetire.rows) {
    if (!byPg.has(r.pg_no)) byPg.set(r.pg_no, []);
    byPg.get(r.pg_no).push(r);
  }
  for (const [pg, rows] of byPg) {
    console.log(`\npgNo ${pg} (canonical dest: ${rows[0].canon_dest})`);
    rows.forEach(r => console.log(`  ${r.scoop_name} dest=${r.destination_unit}`));
  }

  if (opts.dryRun) {
    await pool.end();
    return;
  }

  if (!toRetire.rows.length) {
    console.log('\nNo rows to update.');
    await pool.end();
    return;
  }

  const upd = await pool.query(UPDATE_MISMATCH, [pgFilter]);
  console.log(`\nRetired ${upd.rowCount} scoop_config row(s) (unused=true).`);

  const reportLines = [
    '',
    `=== Retire non destination_unit scoops ${new Date().toISOString()} ===`,
    `pgNo filter: ${pgFilter || 'all'}`,
    `Retired: ${upd.rowCount}`,
    ...upd.rows.map(r =>
      `${r.pg_no}\t${r.scoop_name}\tdest=${r.destination_unit}\tcanonical=${r.canon_dest}`
    )
  ];
  require('fs').appendFileSync(REPORT_PATH, reportLines.join('\n') + '\n', 'utf8');
  console.log(`Appended to ${REPORT_PATH}`);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});