#!/usr/bin/env node
/**
 * CSV is source of truth for purchase-unit scoops (in/out/reciepe per pgNo).
 * - Dedupe pgNo in data/scoop-ScoopConfig.csv (run normalize_scoop_config_csv.py first).
 * - Chain: single-step unit:factor:dest (lowercase) unless conversion_chain column set (multistep ok).
 * - Deletes ALL scoop_config rows for each processed pgNo, then inserts 3 rows at version 1.
 *
 *   PGPORT=5433 node scripts/seed_scoop_from_scoop_config_csv.js
 *   PGPORT=5433 node scripts/seed_scoop_from_scoop_config_csv.js --dry-run
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { waitForDb } = require('../dbqueries');

const CSV_PATH = path.join(__dirname, '..', 'data', 'scoop-ScoopConfig.csv');
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

function normDest(raw) {
  const d = String(raw || '').trim().toLowerCase();
  return d;
}

function normUnit(raw) {
  let u = String(raw || '').trim().toLowerCase();
  if (u === 'superpacket') u = 'superpkt';
  return u;
}

/** Lowercase chain segments: unit:qty:next|unit:qty:next */
function normalizeChain(chain) {
  if (!chain) return '';
  return String(chain)
    .split(';;')
    .map(part =>
      part
        .split('|')
        .map(step => {
          const bits = step.split(':');
          if (bits.length < 3) return step.toLowerCase();
          return bits.map(b => String(b).trim().toLowerCase()).join(':');
        })
        .join('|')
    )
    .join(';;');
}

function parseArgs(argv) {
  const out = { pgNo: null, dryRun: false, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--pgNo' && argv[i + 1]) out.pgNo = String(argv[++i]).trim();
    else if (a === '--limit' && argv[i + 1]) out.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Options: --pgNo <id>  --limit <n>  --dry-run');
      process.exit(0);
    }
  }
  return out;
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
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  const rows = [];
  const seenPg = new Map();
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    if (!cells.some(c => c.trim())) continue;
    const row = {};
    header.forEach((h, idx) => { row[h] = cells[idx] != null ? cells[idx] : ''; });
    const pgNo = String(row.pgNo || '').trim();
    if (!pgNo) continue;
    if (seenPg.has(pgNo)) continue;
    seenPg.set(pgNo, true);
    rows.push(row);
  }
  return rows;
}

function buildTripletRows(csvRow, selectedName) {
  const pgNo = String(csvRow.pgNo || '').trim();
  const unit = normUnit(csvRow.Unit);
  const factorRaw = String(csvRow.scoopfactor ?? '').trim();
  if (!factorRaw) {
    return { error: 'missing scoopfactor', rows: [] };
  }
  const factor = Number(factorRaw);
  if (!Number.isFinite(factor) || factor <= 0) {
    return { error: `invalid scoopfactor: ${factorRaw}`, rows: [] };
  }

  const dest = normDest(csvRow.DestinationUnit);
  if (!['gm', 'ml', 'piece'].includes(dest)) {
    return { error: `unsupported DestinationUnit: ${dest || '(blank)'}`, rows: [] };
  }

  const explicit = String(csvRow.conversion_chain || '').trim();
  const chain = explicit
    ? normalizeChain(explicit)
    : normalizeChain(`${unit}:${factor}:${dest}`);

  const qty = {
    qty_in_grams: dest === 'gm' ? factor : null,
    qty_in_ml: dest === 'ml' ? factor : null,
    qty_in_piece: dest === 'piece' ? factor : null
  };

  const base = {
    scoop_item_name: selectedName,
    scoop_item_id: pgNo,
    destination_unit: dest,
    conversion_chain: chain,
    ...qty,
    unused: false
  };

  return {
    error: null,
    rows: ['in', 'out', 'reciepe'].map(suffix => ({
      ...base,
      scoop_name: `${selectedName}_${unit}_${suffix}`,
      factor
    }))
  };
}

async function loadSelectionMap(pool, pgNos) {
  const sel = await pool.query(
    `SELECT TRIM(pg_no_or_dishcode) AS pgno, TRIM(selected_scoop_name) AS name
     FROM raw_material_selected_scoop
     WHERE TRIM(pg_no_or_dishcode) = ANY($1::text[])`,
    [pgNos]
  );
  const map = new Map(sel.rows.map(r => [r.pgno, r.name]));

  const missing = pgNos.filter(p => !map.has(p));
  if (missing.length) {
    const fb = await pool.query(
      `SELECT DISTINCT ON (TRIM("pgNo"))
              TRIM("pgNo") AS pgno, TRIM(itemname) AS name
       FROM raw_materials
       WHERE TRIM("pgNo") = ANY($1::text[])
         AND COALESCE(LOWER(TRIM(comments)), '') <> 'unused'
       ORDER BY TRIM("pgNo"), id`,
      [missing]
    );
    fb.rows.forEach(r => {
      if (!map.has(r.pgno)) map.set(r.pgno, r.name);
    });
  }
  return map;
}

function appendReport(sections) {
  const stamp = `\n=== scoop_config DB apply ${new Date().toISOString()} ===\n`;
  fs.appendFileSync(REPORT_PATH, stamp + sections.join('\n') + '\n', 'utf8');
}

async function main() {
  const opts = parseArgs(process.argv);
  await waitForDb();
  const { Pool } = require('pg');
  const pool = new Pool(poolConfig());

  let csvRows = loadCsvRows();
  if (opts.pgNo) csvRows = csvRows.filter(r => String(r.pgNo).trim() === opts.pgNo);
  if (opts.limit > 0) csvRows = csvRows.slice(0, opts.limit);

  const pgNos = [...new Set(csvRows.map(r => String(r.pgNo).trim()))];
  const selectionMap = await loadSelectionMap(pool, pgNos);

  const report = {
    applied: [],
    skippedNoName: [],
    skippedNoFactor: [],
    skippedBadDest: [],
    conflicts: [],
    deletedByPgNo: []
  };

  const plan = [];
  for (const csvRow of csvRows) {
    const pgNo = String(csvRow.pgNo).trim();
    const selectedName = selectionMap.get(pgNo);
    if (!selectedName) {
      report.skippedNoName.push({ pgNo, itemnames: csvRow.itemnames });
      continue;
    }
    const built = buildTripletRows(csvRow, selectedName);
    if (built.error) {
      if (built.error.includes('scoopfactor')) report.skippedNoFactor.push({ pgNo, error: built.error });
      else report.skippedBadDest.push({ pgNo, error: built.error, dest: csvRow.DestinationUnit });
      continue;
    }
    plan.push({ pgNo, csvRow, selectedName, rows: built.rows });
  }

  for (const item of plan) {
    const prev = await pool.query(
      `SELECT scoop_name, version, factor, conversion_chain, destination_unit,
              qty_in_grams, qty_in_ml, qty_in_piece
       FROM scoop_config
       WHERE TRIM(scoop_item_id) = TRIM($1)
       ORDER BY scoop_name, version DESC`,
      [item.pgNo]
    );
    const targetByName = new Map(item.rows.map(r => [r.scoop_name.toLowerCase(), r]));
    let legacyRemoved = 0;
    for (const row of prev.rows) {
      const key = String(row.scoop_name).toLowerCase();
      const target = targetByName.get(key);
      if (target) {
        const chainN = normalizeChain(row.conversion_chain);
        const chainT = normalizeChain(target.conversion_chain);
        if (chainN !== chainT || Number(row.factor) !== Number(target.factor)) {
          report.conflicts.push({
            pgNo: item.pgNo,
            scoop_name: row.scoop_name,
            was: { factor: row.factor, chain: row.conversion_chain, version: row.version },
            now: { factor: target.factor, chain: target.conversion_chain }
          });
        }
      } else {
        legacyRemoved += 1;
      }
    }
    report.deletedByPgNo.push({
      pgNo: item.pgNo,
      total: prev.rows.length,
      legacyRemoved,
      tripletConflicts: prev.rows.length - legacyRemoved
    });
    report.applied.push({
      pgNo: item.pgNo,
      selected: item.selectedName,
      unit: normUnit(item.csvRow.Unit),
      factor: item.csvRow.scoopfactor,
      dest: normDest(item.csvRow.DestinationUnit),
      chain: item.rows[0].conversion_chain
    });
  }

  const lines = [
    `CSV rows read: ${csvRows.length}`,
    `Planned pgNo: ${plan.length}`,
    `Skipped no name: ${report.skippedNoName.map(s => s.pgNo).join(', ') || '(none)'}`,
    `Skipped no factor: ${report.skippedNoFactor.length}`,
    `Skipped bad dest: ${report.skippedBadDest.map(s => `${s.pgNo}(${s.error})`).join(', ') || '(none)'}`,
    `Conflicts (before delete): ${report.conflicts.length}`,
    '',
    '--- Applied from CSV (sample) ---',
    ...report.applied.map(a =>
      `${a.pgNo}\t${a.selected}\t${a.unit}\t${a.factor}\t${a.dest}\t${a.chain}`
    ),
    '',
    '--- Conflicts ---',
    ...report.conflicts.map(c => {
      if (c.now.removed) {
        return `${c.pgNo}\t${c.scoop_name}\tv${c.was.version}\t${c.was.chain}\t=>\tDELETED (pgNo replace)`;
      }
      return `${c.pgNo}\t${c.scoop_name}\tv${c.was.version}\t${c.was.chain}\t=>\t${c.now.chain} (factor ${c.was.factor} => ${c.now.factor})`;
    }),
    '',
    '--- Deleted row counts per pgNo ---',
    ...report.deletedByPgNo.map(
      d => `pgNo ${d.pgNo}: deleted ${d.total} old row(s) (${d.legacyRemoved} legacy seed scoops removed)`
    )
  ];

  if (opts.dryRun) {
    lines.push('', '--dry-run: no DB changes');
    appendReport(lines);
    console.log(lines.join('\n'));
    await pool.end();
    process.exit(0);
  }

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const item of plan) {
      const del = await client.query(
        'DELETE FROM scoop_config WHERE TRIM(scoop_item_id) = TRIM($1) RETURNING lower(trim(scoop_name)) AS sn',
        [item.pgNo]
      );
      const scoopCodes = [...new Set(del.rows.map(r => r.sn).filter(Boolean))];
      if (scoopCodes.length) {
        await client.query(
          `DELETE FROM item_versions
           WHERE item_type = 'scoop_config' AND lower(item_code) = ANY($1::text[])`,
          [scoopCodes]
        );
      }

      for (const row of item.rows) {
        await client.query(
          `INSERT INTO scoop_config
            (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
             qty_in_grams, qty_in_ml, qty_in_piece, unused, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1)`,
          [
            row.scoop_item_name,
            row.scoop_item_id,
            row.destination_unit,
            row.scoop_name,
            row.factor,
            row.conversion_chain,
            row.qty_in_grams,
            row.qty_in_ml,
            row.qty_in_piece,
            false
          ]
        );
        await client.query(
          `INSERT INTO item_versions (item_code, item_type, version)
           VALUES (lower(trim($1)), 'scoop_config', 1)
           ON CONFLICT (item_code, item_type)
           DO UPDATE SET version = 1, last_updated_at = CURRENT_TIMESTAMP`,
          [row.scoop_name]
        );
        inserted += 1;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  lines.push('', `Inserted: ${inserted} row(s) at version 1 (old rows for those pgNos deleted).`);
  appendReport(lines);
  console.log(lines.join('\n'));
  console.log(`\nFull report: ${REPORT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});