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

async function runQuery(sqlText) {
    const res = await pool.query(sqlText);
    return {
        columns: res.fields ? res.fields.map(f => f.name) : [],
        rows: res.rows
    };
}

module.exports = { saveOrder, saveInventoryOut,runQuery };