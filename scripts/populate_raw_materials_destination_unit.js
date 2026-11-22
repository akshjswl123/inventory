#!/usr/bin/env node
/**
 * Upsert raw_materials_destination_unit from data/scoop-ScoopConfig.csv (one row per pgNo).
 *
 *   PGPORT=5433 node scripts/populate_raw_materials_destination_unit.js
 *   PGPORT=5433 node scripts/populate_raw_materials_destination_unit.js --pgNo 1
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

function normDest(raw) {
  return String(raw || '').trim().toLowerCase();
}

function normUnit(raw) {
  let u = String(raw || '').trim().toLowerCase();
  if (u === 'superpacket') u = 'superpkt';
  return u;
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
    const dest = normDest(row.DestinationUnit);
    if (!['gm', 'ml', 'piece'].includes(dest)) continue;
    const factorRaw = String(row.scoopfactor ?? '').trim();
    const factor = factorRaw ? Number(factorRaw) : null;
    const unit = normUnit(row.Unit);
    const explicit = String(row.conversion_chain || '').trim();
    const chain = explicit || (factor > 0 ? `${unit}:${factor}:${dest}` : null);
    const prev = byPg.get(pgNo);
    const score = (factor > 0 ? 100 : 0) + (chain ? 10 : 0);
    if (!prev || score >= prev._score) {
      byPg.set(pgNo, {
        pg_no: pgNo,
        destination_unit: dest,
        purchase_unit: unit || null,
        scoop_factor: factor > 0 ? factor : null,
        conversion_chain: chain,
        _score: score
      });
    }
  }
  return [...byPg.values()].map(({ _score, ...r }) => r);
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
    WHERE table_schema = 'public' AND table_name = 'raw_materials_destination_unit'
  `);
  if (!tableCheck.rows.length) {
    console.error('Table missing. Run scripts/36_raw_materials_destination_unit.sql first.');
    process.exit(1);
  }

  console.log(`Upserting ${rows.length} pgNo row(s) from CSV`);
  if (opts.dryRun) {
    rows.forEach(r => console.log(`${r.pg_no}\t${r.destination_unit}\t${r.purchase_unit}\t${r.scoop_factor}\t${r.conversion_chain}`));
    await pool.end();
    return;
  }

  let n = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO raw_materials_destination_unit
         (pg_no, destination_unit, purchase_unit, scoop_factor, conversion_chain, source)
       VALUES ($1, $2, $3, $4, $5, 'scoop-ScoopConfig.csv')
       ON CONFLICT (pg_no)
       DO UPDATE SET
         destination_unit = EXCLUDED.destination_unit,
         purchase_unit = EXCLUDED.purchase_unit,
         scoop_factor = EXCLUDED.scoop_factor,
         conversion_chain = EXCLUDED.conversion_chain,
         source = EXCLUDED.source,
         last_updated_at = CURRENT_TIMESTAMP`,
      [r.pg_no, r.destination_unit, r.purchase_unit, r.scoop_factor, r.conversion_chain]
    );
    n += 1;
  }
  console.log(`Done. ${n} row(s) upserted.`);
  if (opts.pgNo) {
    const show = await pool.query('SELECT * FROM raw_materials_destination_unit WHERE pg_no = $1', [opts.pgNo]);
    console.table(show.rows);
  }
  await pool.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});