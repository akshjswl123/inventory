#!/usr/bin/env node
/**
 * For each pgNo in raw_materials_destination_unit (with scoop_factor):
 *   - Keep CSV purchase_unit triplet (already from seed)
 *   - Ensure gm + pkt in/out/reciepe triplets (all destination_unit gm) when missing
 * Does not delete or retire scoops.
 *
 *   PGPORT=5433 node scripts/ensure_gm_family_scoops.js
 */
'use strict';

const { waitForDb } = require('../dbqueries');

function poolConfig() {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'poc',
    user: process.env.PGUSER || 'poc',
    password: process.env.PGPASSWORD || 'poc_secret'
  };
}

const GM = {
  destination_unit: 'gm',
  factor: 1,
  conversion_chain: 'gm:1:gm',
  qty_in_grams: 1,
  qty_in_ml: null,
  qty_in_piece: null
};

const PKT = {
  destination_unit: 'gm',
  factor: 500,
  conversion_chain: 'pkt:500:gm',
  qty_in_grams: 500,
  qty_in_ml: null,
  qty_in_piece: null
};

function buildRows(name, pgNo, unitSlug, spec) {
  return ['in', 'out', 'reciepe'].map(suffix => ({
    scoop_item_name: name,
    scoop_item_id: pgNo,
    scoop_name: `${name}_${unitSlug}_${suffix}`,
    ...spec,
    unused: false
  }));
}

async function loadSelectionMap(pool) {
  const res = await pool.query(`
    SELECT TRIM(d.pg_no) AS pgno,
           LOWER(TRIM(d.destination_unit)) AS canon,
           COALESCE(
             NULLIF(TRIM(sel.selected_scoop_name), ''),
             (SELECT TRIM(rm.itemname) FROM raw_materials rm
              WHERE TRIM(rm."pgNo") = TRIM(d.pg_no)
                AND COALESCE(LOWER(TRIM(rm.comments)), '') <> 'unused'
              ORDER BY rm.id LIMIT 1)
           ) AS name
    FROM raw_materials_destination_unit d
    LEFT JOIN raw_material_selected_scoop sel ON TRIM(sel.pg_no_or_dishcode) = TRIM(d.pg_no)
    WHERE d.scoop_factor IS NOT NULL AND d.scoop_factor > 0
  `);
  return res.rows.filter(r => r.name && r.canon === 'gm');
}

async function existsName(client, scoopName) {
  const r = await client.query(
    `SELECT 1 FROM scoop_config WHERE LOWER(TRIM(scoop_name)) = LOWER(TRIM($1)) LIMIT 1`,
    [scoopName]
  );
  return r.rows.length > 0;
}

async function main() {
  await waitForDb();
  const { Pool } = require('pg');
  const pool = new Pool(poolConfig());
  const items = await loadSelectionMap(pool);

  let inserted = 0;
  let skipped = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { pgno, name, canon } of items) {
      if (canon !== 'gm') continue;
      const templates = [
        ...buildRows(name, pgno, 'gm', GM),
        ...buildRows(name, pgno, 'pkt', PKT)
      ];
      for (const row of templates) {
        const exists = await existsName(client, row.scoop_name);
        if (exists) {
          skipped += 1;
          continue;
        }
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
            row.unused
          ]
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

  console.log(`ensure_gm_family_scoops: inserted ${inserted}, already present ${skipped}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});