#!/usr/bin/env node
/**
 * Upsert raw_materials_storage from data/scoop-ScoopConfig.csv (Rack → storage, pgNo → pg_no).
 *
 *   PGPORT=5433 node scripts/populate_raw_materials_storage.js
 *   PGPORT=5433 node scripts/populate_raw_materials_storage.js --pgNo 1
 *   PGPORT=5433 node scripts/populate_raw_materials_storage.js --dry-run
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'scoop-ScoopConfig.csv');

function poolConfig() {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'poc',
    user: process.env.PGUSER || 'poc',
    password: process.env.PGPASSWORD || 'poc_secret'
  };
}

function parseCsvLine(line) {
  const out = [];
  let i = 0;
  let cur = '';
  let inQ = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQ = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { out.push(cur); cur = ''; i++; continue; }
    cur += ch;
    i++;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

function loadCsvRows() {
  const text = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const byPg = new Map();
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    const row = {};
    header.forEach((h, idx) => { row[h] = cells[idx] != null ? cells[idx] : ''; });
    const pgNo = String(row.pgNo || '').trim();
    if (!pgNo) continue;
    const rack = String(row.Rack || row.rack || '').trim();
    const storage = rack || null;
    const prev = byPg.get(pgNo);
    if (!prev) {
      byPg.set(pgNo, { pg_no: pgNo, storage });
      continue;
    }
    if (!prev.storage && storage) {
      byPg.set(pgNo, { pg_no: pgNo, storage });
    }
  }
  return [...byPg.values()];
}

function parseArgs(argv) {
  const out = { pgNo: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--pgNo' && argv[i + 1]) out.pgNo = String(argv[++i]).trim();
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv);
  let rows = loadCsvRows();
  if (opts.pgNo) rows = rows.filter(r => r.pg_no === opts.pgNo);

  const { Pool } = require('pg');
  const pool = new Pool(poolConfig());

  const tableCheck = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'raw_materials_storage'
  `);
  if (!tableCheck.rows.length) {
    console.error('Table missing. Run scripts/37_raw_materials_storage.sql first.');
    process.exit(1);
  }

  console.log(`Upserting ${rows.length} pgNo row(s) from ${CSV_PATH}`);
  if (opts.dryRun) {
    rows.forEach(r => console.log(`${r.pg_no}\t${r.storage ?? ''}`));
    await pool.end();
    return;
  }

  let n = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO raw_materials_storage (pg_no, storage, source)
       VALUES ($1, $2, 'scoop-ScoopConfig.csv')
       ON CONFLICT (pg_no)
       DO UPDATE SET
         storage = EXCLUDED.storage,
         source = EXCLUDED.source,
         last_updated_at = CURRENT_TIMESTAMP`,
      [r.pg_no, r.storage]
    );
    n += 1;
  }
  console.log(`Done. ${n} row(s) upserted.`);
  if (opts.pgNo) {
    const show = await pool.query('SELECT * FROM raw_materials_storage WHERE pg_no = $1', [opts.pgNo]);
    console.table(show.rows);
  }
  await pool.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});