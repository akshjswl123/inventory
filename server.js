'use strict';

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
    saveOrder,
    loadOrderByBillNo,
    saveInventoryOut,
    saveRecipe,
    saveDishes,
    saveRawMaterials,
    saveScoopConfig,
    loadScoopConfig,
    loadScoopConfigByDishCode,
    runQuery,
    upsertRawMaterialsCostFromOrders,
    fetchStaticData,
    waitForDb,
    runSeedData,
    getDbInfo,
    recreateDatabaseFromDump,
    loadRecipeByDish,
    loadRecipeByDishcode,
    runRecipeCostForDish,
    runDishCostValidation,
    listDishesForCostCalculation,
    ensureItemReportTable,
    upsertItemReportLines,
    listItemReportLines,
    getItemReportSummary
} = require('./dbqueries');
const { excelBufferToCsv } = require('./excelToCsv');

const app = express();
const port = process.env.PORT || 3000;

// Middleware — pgAdmin CSV → INSERT payloads can exceed the default 100kb JSON limit
app.use(express.json({ limit: '25mb' }));

// Standalone recreateFromPgDump.html (file://) calls the API on another origin
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Confirm-Recreate, X-Dump-Filename'
    );
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/query.html', (req, res) => res.redirect(301, '/recreateFromPgDump.html'));

/*
 * POST /excelToCsv — raw .xlsx/.xls body; optional ?sheet=WorksheetName
 * Response: text/csv (UTF-8 BOM) unless Accept: application/json
 */
app.post(
    '/excelToCsv',
    express.raw({ type: () => true, limit: '25mb' }),
    (req, res) => {
        try {
            const result = excelBufferToCsv(
                req.body,
                req.query.sheet || req.headers['x-sheet-name']
            );
            const wantsJson = String(req.headers.accept || '').includes('application/json');
            if (wantsJson) {
                return res.json({
                    sheetName: result.sheetName,
                    sheetNames: result.sheetNames,
                    csv: result.csv
                });
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('X-Sheet-Name', result.sheetName);
            res.send('\uFEFF' + result.csv);
        } catch (err) {
            res.status(400).json({ error: err.message || 'Conversion failed' });
        }
    }
);

app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.static(path.join(__dirname))); // serves index.html, excelToCSV.html, report.js

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
        const result = await saveOrder(req.body);
        res.status(201).json({ ...result, message: result.updated ? 'Order updated' : 'Order saved' });
    } catch (err) {
        console.error('POST /api/orders error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * GET /api/orders/by-bill?billNo=…&dt=… (dt optional — latest by date when omitted)
 */
app.get('/api/orders/by-bill', async (req, res) => {
    const billNo = req.query.billNo;
    const dt = req.query.dt;
    if (!billNo || !String(billNo).trim()) {
        return res.status(400).json({ error: 'billNo is required' });
    }
    try {
        const result = await loadOrderByBillNo(billNo, dt);
        if (!result) {
            return res.status(404).json({ error: 'No order found for this bill number' });
        }
        res.json(result);
    } catch (err) {
        console.error('GET /api/orders/by-bill error:', err);
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
 * GET /api/recipes/cost-dish-list — dishes with recipes (Dishes tab name order).
 */
app.get('/api/recipes/cost-dish-list', async (req, res) => {
    try {
        const dishes = await listDishesForCostCalculation();
        res.json({ dishes, count: dishes.length });
    } catch (err) {
        console.error('GET /api/recipes/cost-dish-list error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * GET /api/recipes/dish-cost?dishcode=&dishname=
 * Recursive step checks (one query per record), then dish_cost_cases.sql unchanged.
 * Registered before /api/recipes/:dishname so "dish-cost" is not treated as a dish name.
 * Validation failures are HTTP 400 with doneSoFar and the row that failed.
 */
app.get('/api/recipes/dish-cost', async (req, res) => {
    const dishcode = (req.query.dishcode || req.query.dish_code || '').trim();
    const dishname = (req.query.dishname || req.query.dish_name || '').trim();
    if (!dishcode && !dishname) {
        return res.status(400).json({
            error: 'dishcode or dishname query parameter is required',
            failedStep: 'input',
            data: {},
            doneSoFar: []
        });
    }
    try {
        const result = await runDishCostValidation(dishcode, dishname);
        res.json(result);
    } catch (err) {
        if (err.validation) {
            return res.status(400).json({
                error: err.message,
                failedStep: err.failedStep,
                data: err.data || {},
                doneSoFar: err.doneSoFar || []
            });
        }
        console.error('GET /api/recipes/dish-cost error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message, doneSoFar: [] });
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
 * GET /api/recipes/cost?dishcode=&dishname=&breakdown=1
 * Recipe cost from receipe_portion.sql or recipe_cost_no_processed.sql (dish_filter).
 */
app.get('/api/recipes/cost', async (req, res) => {
    const dishcode = (req.query.dishcode || req.query.dish_code || '').trim();
    const dishname = (req.query.dishname || req.query.dish_name || '').trim();
    if (!dishcode && !dishname) {
        return res.status(400).json({ error: 'dishcode or dishname query parameter is required' });
    }
    const breakdown = req.query.breakdown !== '0' && req.query.breakdown !== 'false';

    try {
        const result = await runRecipeCostForDish({ dishcode, dishname, breakdown });
        res.json(result);
    } catch (err) {
        console.error('GET /api/recipes/cost error:', err);
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
    const scoopItemName =
        req.query.scoopItemName || req.query.scoop_item_name || req.query.itemname || req.query.dishname || null;
    try {
        const rows = await loadScoopConfig(scoopItemName);
        res.json({ rows, scoopItemName: scoopItemName ? String(scoopItemName).trim() : null });
    } catch (err) {
        console.error('GET /api/scoop-config error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * GET /api/scoop-config/by-dishcode?dishcode=P8
 * All scoop_config rows for a dish (scoop_item_id = dish code).
 */
app.get('/api/scoop-config/by-dishcode', async (req, res) => {
    const dishcode = req.query.dishcode || req.query.dish_code || null;
    const code = dishcode ? String(dishcode).trim() : '';
    if (!code) {
        return res.status(400).json({ error: 'dishcode query parameter is required' });
    }
    try {
        const rows = await loadScoopConfigByDishCode(code);
        res.json({ rows, dishcode: code });
    } catch (err) {
        console.error('GET /api/scoop-config/by-dishcode error:', err);
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
 * POST /api/raw-materials-cost/upsert-from-orders — rebuild costs from order_items, return table (latest first)
 */
app.post('/api/raw-materials-cost/upsert-from-orders', async (req, res) => {
    try {
        const result = await upsertRawMaterialsCostFromOrders();
        res.json({
            message: `Upserted ${result.upserted} raw_materials_cost row(s) from purchases`,
            ...result
        });
    } catch (err) {
        console.error('POST /api/raw-materials-cost/upsert-from-orders error:', err);
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
        '-d', process.env.PGDATABASE || 'poc',
        '--no-owner',
        '--no-acl'
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

app.get('/api/db-info', (req, res) => {
    res.json(getDbInfo());
});

/*
 * POST /api/pgrestore — rename existing DB to *_backup_*, create app DB, restore dump, reconnect pool
 * Body: raw dump bytes (plain SQL from PG Dump, or pg_dump custom format).
 */
app.post('/api/pgrestore', express.raw({ type: () => true, limit: '200mb' }), async (req, res) => {
    if (req.get('X-Confirm-Recreate') !== 'overwrite') {
        return res.status(400).json({ error: 'Confirmation header X-Confirm-Recreate: overwrite is required' });
    }
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: 'Dump file is required' });
    }

    const filename = path.basename(String(req.get('X-Dump-Filename') || 'restore.sql'));
    const tmpPath = path.join(os.tmpdir(), `poc-restore-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    fs.writeFileSync(tmpPath, body);

    try {
        const result = await recreateDatabaseFromDump(tmpPath);
        res.json({
            ok: true,
            message: `Database ${result.database} recreated from dump and app reconnected`,
            ...result,
            ...getDbInfo()
        });
    } catch (err) {
        console.error('POST /api/pgrestore error:', err);
        res.status(500).json({ error: 'Database recreate failed', detail: err.message });
    } finally {
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
    }
});

/*
 * GET /api/item-report — list imported lines (latest first)
 */
app.get('/api/item-report', async (req, res) => {
    try {
        const data = await listItemReportLines({
            limit: req.query.limit,
            offset: req.query.offset
        });
        res.json(data);
    } catch (err) {
        console.error('GET /api/item-report error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * GET /api/item-report/summary?channel=swiggy|zomato|dinein
 * Group by item name + date; dish cost from public.dish_cost (dish_total) or 0.
 */
app.get('/api/item-report/summary', async (req, res) => {
    try {
        const data = await getItemReportSummary(req.query.channel);
        res.json(data);
    } catch (err) {
        console.error('GET /api/item-report/summary error:', err);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

/*
 * POST /api/item-report/import — upsert rows parsed in browser (itemReportCsv.js)
 * Body: { rows: [...], skipped?: number, failed?: [...] }
 */
app.post('/api/item-report/import', async (req, res) => {
    const rows = req.body && req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'rows array is required (parse Excel in the Item Report tab first)' });
    }
    try {
        const upsert = await upsertItemReportLines(rows);
        const failed = (req.body.failed || []).concat(upsert.failed || []);
        res.json({
            parsed: rows.length,
            inserted: upsert.inserted,
            updated: upsert.updated,
            skipped: Number(req.body.skipped) || 0,
            failed
        });
    } catch (err) {
        console.error('POST /api/item-report/import error:', err);
        res.status(500).json({ error: 'Import failed', detail: err.message });
    }
});

async function startServer() {
    try {
        await waitForDb();
        await ensureItemReportTable();
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