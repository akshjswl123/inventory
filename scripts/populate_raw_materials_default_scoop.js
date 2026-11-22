#!/usr/bin/env node
/**
 * Upsert raw_materials_default_scoop from scoop_config + raw_materials_destination_unit
 * (highest factor per pgNo where scoop dest matches catalog destination_unit).
 *
 *   PGPORT=5433 node scripts/populate_raw_materials_default_scoop.js
 *   PGPORT=5433 node scripts/populate_raw_materials_default_scoop.js --pgNo 1
 *   PGPORT=5433 node scripts/populate_raw_materials_default_scoop.js --dry-run
 */
'use strict';

function poolConfig() {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'poc',
    user: process.env.PGUSER || 'poc',
    password: process.env.PGPASSWORD || 'poc_secret'
  };
}

const SELECT_SQL = `
WITH latest AS (
  SELECT DISTINCT ON (sc.scoop_item_id, sc.scoop_name)
    sc.scoop_item_id AS pg_no,
    sc.scoop_name,
    LOWER(TRIM(sc.destination_unit)) AS scoop_dest,
    sc.factor
  FROM scoop_config sc
  WHERE COALESCE(sc.unused, false) = false
    AND sc.factor IS NOT NULL AND sc.factor > 1
  ORDER BY sc.scoop_item_id, sc.scoop_name, sc.version DESC, sc.id DESC
),
ranked AS (
  SELECT
    d.pg_no,
    d.destination_unit,
    l.scoop_name,
    l.factor,
    ROW_NUMBER() OVER (
      PARTITION BY d.pg_no
      ORDER BY l.factor DESC NULLS LAST, l.scoop_name
    ) AS rn
  FROM raw_materials_destination_unit d
  LEFT JOIN latest l
    ON l.pg_no = d.pg_no
   AND l.scoop_dest = LOWER(TRIM(d.destination_unit))
)
SELECT pg_no, destination_unit, scoop_name, factor
FROM ranked
WHERE rn = 1
`;

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
  const { Pool } = require('pg');
  const pool = new Pool(poolConfig());

  const tableCheck = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'raw_materials_default_scoop'
  `);
  if (!tableCheck.rows.length) {
    console.error('Table missing. Run scripts/39_raw_materials_default_scoop.sql first.');
    process.exit(1);
  }

  let sql = SELECT_SQL;
  const params = [];
  if (opts.pgNo) {
    sql = `${SELECT_SQL.trim()}\nAND pg_no = $1`;
    params.push(opts.pgNo);
  }

  const sel = await pool.query(sql, params);
  const rows = sel.rows;
  console.log(`Found ${rows.length} row(s) to upsert`);

  if (opts.dryRun) {
    rows.forEach((r) =>
      console.log(`${r.pg_no}\t${r.destination_unit}\t${r.scoop_name ?? ''}\t${r.factor ?? ''}`)
    );
    const missing = rows.filter((r) => !r.scoop_name).length;
    if (missing) console.log(`${missing} pgNo(s) without a matching scoop (factor>1, same dest)`);
    await pool.end();
    return;
  }

  let n = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO raw_materials_default_scoop
         (pg_no, destination_unit, scoop_name, factor, source)
       VALUES ($1, $2, $3, $4, 'scoop_config')
       ON CONFLICT (pg_no)
       DO UPDATE SET
         destination_unit = EXCLUDED.destination_unit,
         scoop_name = EXCLUDED.scoop_name,
         factor = EXCLUDED.factor,
         source = EXCLUDED.source,
         last_updated_at = CURRENT_TIMESTAMP`,
      [r.pg_no, r.destination_unit, r.scoop_name, r.factor]
    );
    n += 1;
  }
  console.log(`Done. ${n} row(s) upserted.`);
  const missing = rows.filter((r) => !r.scoop_name).length;
  if (missing) console.log(`${missing} pgNo(s) have NULL scoop_name (no qualifying scoop_config row)`);

  if (opts.pgNo) {
    const show = await pool.query('SELECT * FROM raw_materials_default_scoop WHERE pg_no = $1', [opts.pgNo]);
    console.table(show.rows);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});