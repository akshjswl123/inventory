'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { saveOrder, saveInventoryOut, runQuery } = require('./dbqueries');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname))); // serves index.html.newversion, catalog.js, report.js

/*
 * POST /api/orders
 */
app.post('/api/orders', async (req, res) => {
    const { vendor, dt, billNo, items = [] } = req.body;
    if (!vendor || !dt || !billNo) {
        return res.status(400).json({ error: 'vendor, dt and billNo are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required' });
    }

    try {
        const { id } = await saveOrder(req.body);
        res.status(201).json({ id, message: 'Order saved' });
    } catch (err) {
        console.error('POST /api/orders error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * POST /api/inventory-out
 */
app.post('/api/inventory-out', async (req, res) => {
    const { category, dt, items = [] } = req.body;
    if (!category || !dt) {
        return res.status(400).json({ error: 'category and dt are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required' });
    }

    try {
        const { id } = await saveInventoryOut(req.body);
        res.status(201).json({ id, message: 'Inventory Out saved' });
    } catch (err) {
        console.error('POST /api/inventory-out error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * POST /api/query
 */
app.post('/api/query', async (req, res) => {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL query required' });
    try {
        const result = await runQuery(sql);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/*
 * GET /api/pgdump
 */
app.get('/api/pgdump', (req, res) => {
    const dumpsDir = path.join(__dirname, 'dumps');
    if (!fs.existsSync(dumpsDir)) fs.mkdirSync(dumpsDir, { recursive: true });

    const filename = `dump_${Date.now()}.sql`;
    const filepath = path.join(dumpsDir, filename);

    const dump = spawn('pg_dump', [
        '-h', process.env.PGHOST || 'db',
        '-U', process.env.PGUSER || 'poc',
        '-d', process.env.PGDATABASE || 'poc'
    ], {
        env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'poc_secret' }
    });

    const outStream = fs.createWriteStream(filepath);
    dump.stdout.pipe(outStream);

    dump.on('close', (code) => {
        if (code === 0) {
            res.json({ filename });
        } else {
            res.status(500).json({ error: `pg_dump failed with exit code ${code}` });
        }
    });
});

app.listen(port, () => {
    console.log(`==================================================`);
    console.log(` Application server running on port ${port}`);
    console.log(` Access UI at: http://localhost:3050`);
    console.log(`==================================================`);
});