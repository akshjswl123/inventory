// dbqueries.js
'use strict';
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'poc',
    user: process.env.PGUSER || 'poc',
    password: process.env.PGPASSWORD || 'poc_secret',
});

const SQL_LOG = path.join(__dirname, 'successquery.sql');
if (!fs.existsSync(SQL_LOG)) {
    fs.writeFileSync(SQL_LOG, '-- Successful INSERT log - auto-created at server start\n');
}

async function saveOrder(orderData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // CTE implementation to prevent FK violations during replay
        let cteQuery = `
      WITH new_order AS (
        INSERT INTO orders (vendor, dt, billNo, billTotal) 
        VALUES ($1, $2, $3, $4) RETURNING id
      )
      INSERT INTO order_items (order_id, itemname, scoopIn, qty, rate, itemTotal, comments)
      SELECT id, unnest($5::text[]), unnest($6::text[]), unnest($7::numeric[]), unnest($8::numeric[]), unnest($9::numeric[]), unnest($10::text[])
      FROM new_order RETURNING order_id;
    `;

        const names = orderData.items.map(i => i.itemname);
        const scoops = orderData.items.map(i => i.scoopIn);
        const qtys = orderData.items.map(i => i.qty);
        const rates = orderData.items.map(i => i.rate);
        const totals = orderData.items.map(i => i.itemTotal);
        const comments = orderData.items.map(i => i.comments);

        const values = [orderData.vendor, orderData.dt, orderData.billNo, orderData.billTotal, names, scoops, qtys, rates, totals, comments];

        const res = await client.query(cteQuery, values);
        fs.appendFileSync(SQL_LOG, `-- Logged Order for ${orderData.billNo}\n`);

        await client.query('COMMIT');
        return { id: res.rows[0].order_id };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}


async function saveInventoryOut(data) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Insert inventory_out header
        const headerQuery = `
            INSERT INTO inventory_out
                (category, dt, tm, issuedTo, commonTag, totalQty)
            VALUES
                ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;

        const headerResult = await client.query(headerQuery, [
            data.category,
            data.dt,
            data.tm || null,
            data.issuedTo || '',
            data.commonTag || '',
            data.totalQty ?? 0
        ]);

        const inventoryOutId = headerResult.rows[0].id;

        // 2. Insert all items
        const itemQuery = `
            INSERT INTO inventory_out_items
                (inventory_out_id, itemname, pgno, scoop_out, qty, comments)
            VALUES
                ($1, $2, $3, $4, $5, $6)
        `;

        for (const item of data.items) {
            await client.query(itemQuery, [
                inventoryOutId,
                item.itemname,
                item.pgNo,
                item.scoopOut,
                item.qty,
                item.comments || ''
            ]);
        }

        // 3. Commit everything together
        await client.query('COMMIT');

        return {
            id: inventoryOutId
        };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function saveRecipe(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO recipe_entries
                (dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece", comments)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `;

        let lastId = null;
        for (const row of data.rows) {
            const res = await client.query(insertQuery, [
                row.dishname,
                row.dishcode || null,
                row.reciepeItemname,
                row.pgNo || null,
                row.receipescoop || null,
                row.qty,
                row.inGm,
                row.inML,
                row.inPiece,
                row.comments || ''
            ]);
            lastId = res.rows[0].id;
        }

        await client.query('COMMIT');
        return { id: lastId, count: data.rows.length };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function saveDishes(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO dishes
                (dish_code, dish_name)
            VALUES
                ($1, $2)
            RETURNING id
        `;

        let lastId = null;
        for (const row of data.rows) {
            const res = await client.query(insertQuery, [
                row.dishcode || null,
                row.dishname || null
            ]);
            lastId = res.rows[0].id;
        }

        await client.query('COMMIT');
        return { id: lastId, count: data.rows.length };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function saveRawMaterials(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO raw_materials
                ("pgNo", itemname, comments)
            VALUES
                ($1, $2, $3)
            RETURNING id
        `;

        let lastId = null;
        for (const row of data.rows) {
            const res = await client.query(insertQuery, [
                row.pgNo || null,
                row.itemname || null,
                row.comments || ''
            ]);
            lastId = res.rows[0].id;
        }

        await client.query('COMMIT');
        return { id: lastId, count: data.rows.length };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function saveScoopConfig(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO scoop_config
                (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
                 qty_in_grams, qty_in_ml, qty_in_piece, unused)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `;

        let lastId = null;
        for (const row of data.rows) {
            const res = await client.query(insertQuery, [
                row.scoopItemName || row.scoop_item_name || row.itemname || null,
                row.scoopItemId || row.scoop_item_id || row.pgNo || null,
                row.destinationUnit || null,
                row.scoopName || null,
                row.factor,
                row.chain || null,
                row.qtyInGrams,
                row.qtyInMl,
                row.qtyInPiece,
                !!row.unused
            ]);
            lastId = res.rows[0].id;
        }

        await client.query('COMMIT');
        return { id: lastId, count: data.rows.length };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function loadScoopConfig() {
    const res = await pool.query(`
        SELECT id, scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor,
               conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused,
               created_at, last_updated_at
        FROM scoop_config
        ORDER BY id
    `);
    return res.rows;
}

const { fetchStaticDataBundle } = require('./staticDataQueries');

async function fetchStaticData() {
    return fetchStaticDataBundle(pool);
}

async function runQuery(sqlText) {
    const res = await pool.query(sqlText);
    return {
        columns: res.fields ? res.fields.map(f => f.name) : [],
        rows: res.rows || [],
        rowCount: res.rowCount
    };
}

const DEFAULT_SEED_FILES = [
    'scripts/seed_data.sql',
    'scripts/03_seed_data.sql',
    'scripts/05_sabji3_seed.sql',
    'scripts/06_processed_seed.sql'
];

async function waitForDb(maxAttempts = 30, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await pool.query('SELECT 1');
            return;
        } catch (err) {
            if (attempt === maxAttempts) throw err;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

async function runSeedData() {
    if (process.env.RUN_SEED_ON_STARTUP === 'false') {
        console.log('[seed] skipped — RUN_SEED_ON_STARTUP=false');
        return { skipped: true, files: [] };
    }

    const fromEnv = (process.env.SEED_FILES || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const seedFiles = fromEnv.length ? fromEnv : DEFAULT_SEED_FILES;
    const results = [];

    for (const rel of seedFiles) {
        const filePath = path.join(__dirname, rel);
        if (!fs.existsSync(filePath)) {
            console.warn(`[seed] missing file, skipped: ${rel}`);
            results.push({ file: rel, ok: false, error: 'file not found' });
            continue;
        }
        try {
            const sql = fs.readFileSync(filePath, 'utf8');
            await pool.query(sql);
            console.log(`[seed] applied: ${rel}`);
            results.push({ file: rel, ok: true });
        } catch (err) {
            console.error(`[seed] failed: ${rel} — ${err.message}`);
            results.push({ file: rel, ok: false, error: err.message });
        }
    }

    return { skipped: false, files: results };
}

const RECIPE_LATEST_BATCH_SQL = `
        SELECT dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece", comments
        FROM recipe_entries r
        WHERE {{WHERE}}
          AND r.created_at >= (
            SELECT MAX(sub.created_at) - interval '30 seconds'
            FROM recipe_entries sub
            WHERE {{WHERE_SUB}}
          )
        ORDER BY r.id`;

async function loadRecipeByDish(dishname) {
    const sql = RECIPE_LATEST_BATCH_SQL
        .replace(/\{\{WHERE\}\}/g, 'LOWER(TRIM(r.dishname)) = LOWER(TRIM($1))')
        .replace(/\{\{WHERE_SUB\}\}/g, 'LOWER(TRIM(sub.dishname)) = LOWER(TRIM($1))');
    const res = await pool.query(sql, [dishname]);
    return res.rows;
}

async function loadRecipeByDishcode(dishcode) {
    const sql = RECIPE_LATEST_BATCH_SQL
        .replace(/\{\{WHERE\}\}/g, 'LOWER(TRIM(r.dishcode)) = LOWER(TRIM($1))')
        .replace(/\{\{WHERE_SUB\}\}/g, 'LOWER(TRIM(sub.dishcode)) = LOWER(TRIM($1))');
    const res = await pool.query(sql, [dishcode]);
    return res.rows;
}

module.exports = {
    saveOrder,
    saveInventoryOut,
    saveRecipe,
    saveDishes,
    saveRawMaterials,
    saveScoopConfig,
    loadScoopConfig,
    fetchStaticData,
    runQuery,
    waitForDb,
    runSeedData,
    loadRecipeByDish,
    loadRecipeByDishcode
};