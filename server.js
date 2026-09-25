'use strict';

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const {
    saveOrder,
    saveInventoryOut,
    saveRecipe,
    saveDishes,
    saveRawMaterials,
    saveScoopConfig,
    loadScoopConfig,
    runQuery,
    fetchStaticData,
    waitForDb,
    runSeedData,
    loadRecipeByDish,
    loadRecipeByDishcode
} = require('./dbqueries');

const app = express();
const port = process.env.PORT || 3000;

// Middleware — pgAdmin CSV → INSERT payloads can exceed the default 100kb JSON limit
app.use(express.json({ limit: '25mb' }));
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
 * GET /api/recipes/by-dishcode/:dishcode — load saved recipe rows by dish code
 */
app.get('/api/recipes/by-dishcode/:dishcode', async (req, res) => {
    const dishcode = decodeURIComponent(req.params.dishcode || '').trim();
    if (!dishcode) {
        return res.status(400).json({ error: 'dishcode is required' });
    }

    try {
        const rows = await loadRecipeByDishcode(dishcode);
        const dishname = rows.length ? rows[0].dishname : null;
        res.json({ dishcode, dishname, rows, count: rows.length });
    } catch (err) {
        console.error('GET /api/recipes/by-dishcode/:dishcode error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * GET /api/recipes/:dishname — load saved recipe rows for a dish
 */
app.get('/api/recipes/:dishname', async (req, res) => {
    const dishname = decodeURIComponent(req.params.dishname || '').trim();
    if (!dishname) {
        return res.status(400).json({ error: 'dishname is required' });
    }

    try {
        const rows = await loadRecipeByDish(dishname);
        res.json({ dishname, rows, count: rows.length });
    } catch (err) {
        console.error('GET /api/recipes/:dishname error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * POST /api/recipes
 */
app.post('/api/recipes', async (req, res) => {
    const { dishname, rows = [] } = req.body;
    if (!dishname) {
        return res.status(400).json({ error: 'dishname is required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'At least one recipe row is required' });
    }

    try {
        const result = await saveRecipe(req.body);
        res.status(201).json({ id: result.id, count: result.count, message: 'Recipe saved' });
    } catch (err) {
        console.error('POST /api/recipes error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * POST /api/dishes
 */
app.post('/api/dishes', async (req, res) => {
    const { rows = [] } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'At least one row is required' });
    }

    try {
        const result = await saveDishes(req.body);
        res.status(201).json({ id: result.id, count: result.count, message: 'Dishes saved' });
    } catch (err) {
        console.error('POST /api/dishes error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * POST /api/raw-materials
 */
app.post('/api/raw-materials', async (req, res) => {
    const { rows = [] } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'At least one row is required' });
    }

    try {
        const result = await saveRawMaterials(req.body);
        res.status(201).json({ id: result.id, count: result.count, message: 'Raw materials saved' });
    } catch (err) {
        console.error('POST /api/raw-materials error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * POST /api/scoop-config
 */
app.post('/api/scoop-config', async (req, res) => {
    const { rows = [] } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'At least one row is required' });
    }

    try {
        const result = await saveScoopConfig(req.body);
        res.status(201).json({ id: result.id, count: result.count, message: 'Scoop config saved' });
    } catch (err) {
        console.error('POST /api/scoop-config error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * GET /api/scoop-config
 */
app.get('/api/scoop-config', async (req, res) => {
    try {
        const rows = await loadScoopConfig();
        res.json({ rows });
    } catch (err) {
        console.error('GET /api/scoop-config error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * GET /api/static-data — catalog / lookup constants from DB
 */
app.get('/api/static-data', async (req, res) => {
    try {
        const data = await fetchStaticData();
        res.json(data);
    } catch (err) {
        console.error('GET /api/static-data error:', err);
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
 * GET /api/pgdump — download full database SQL dump
 */
app.get('/api/pgdump', (req, res) => {
    const chunks = [];
    let stderr = '';

    const dump = spawn('pg_dump', [
        '-h', process.env.PGHOST || 'db',
        '-p', String(process.env.PGPORT || 5432),
        '-U', process.env.PGUSER || 'poc',
        '-d', process.env.PGDATABASE || 'poc'
    ], {
        env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'poc_secret' }
    });

    dump.stdout.on('data', chunk => chunks.push(chunk));
    dump.stderr.on('data', chunk => { stderr += chunk.toString(); });

    dump.on('error', err => {
        if (!res.headersSent) {
            res.status(500).json({ error: 'pg_dump failed to start', detail: err.message });
        }
    });

    dump.on('close', code => {
        if (code !== 0) {
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'pg_dump failed',
                    detail: stderr.trim() || `exit code ${code}`
                });
            }
            return;
        }

        const filename = `poc_dump_${new Date().toISOString().slice(0, 10)}.sql`;
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.concat(chunks));
    });
});

async function startServer() {
    try {
        await waitForDb();
        const seedResult = await runSeedData();
        if (!seedResult.skipped) {
            const failed = seedResult.files.filter(f => !f.ok);
            if (failed.length) {
                console.warn('[seed] some files failed:', failed.map(f => f.file).join(', '));
            }
        }
    } catch (err) {
        console.error('Startup DB/seed step failed:', err.message);
        console.error('App will still start — fix DB connectivity or seed SQL and restart.');
    }

    app.listen(port, () => {
        console.log(`==================================================`);
        console.log(` Application server running on port ${port}`);
        console.log(` Access UI at: http://localhost:3050`);
        console.log(`==================================================`);
    });
}

startServer();