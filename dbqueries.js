// dbqueries.js
'use strict';
const { Pool } = require('pg');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildDefaultScoopConfigRows } = require('./scoopUnitDefaultsBuilder');

function dbEnv() {
    return {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        database: process.env.PGDATABASE || 'poc',
        user: process.env.PGUSER || 'poc',
        password: process.env.PGPASSWORD || 'poc_secret',
        maintenanceDatabase: process.env.PGMAINTDATABASE || 'postgres'
    };
}

function assertSafeDbName(name) {
    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new Error('Invalid database name');
    }
    return name;
}

function createPool() {
    const cfg = dbEnv();
    return new Pool({
        host: cfg.host,
        port: cfg.port,
        database: cfg.database,
        user: cfg.user,
        password: cfg.password
    });
}

let pool = createPool();

function getDbInfo() {
    const cfg = dbEnv();
    return {
        host: cfg.host,
        port: cfg.port,
        database: cfg.database,
        user: cfg.user
    };
}

function pgClientEnv() {
    const cfg = dbEnv();
    return {
        ...process.env,
        PGHOST: cfg.host,
        PGPORT: String(cfg.port),
        PGUSER: cfg.user,
        PGPASSWORD: cfg.password,
        PGDATABASE: cfg.maintenanceDatabase
    };
}

function runPgCmd(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { env: pgClientEnv() });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', err => {
            reject(new Error(`${cmd} failed to start: ${err.message}`));
        });
        child.on('close', code => {
            if (code !== 0) {
                reject(new Error(
                    `${cmd} ${args.join(' ')} failed (exit ${code}): ${(stderr || stdout).trim() || 'no output'}`
                ));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

function sniffDumpKind(filePath) {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(5);
    try {
        fs.readSync(fd, buf, 0, 5, 0);
    } finally {
        fs.closeSync(fd);
    }
    if (buf.toString('utf8') === 'PGDMP') return 'custom';
    return 'plain';
}

function sanitizePlainDump(sql) {
    return sql.split(/\r?\n/).filter(line => {
        const t = line.trim();
        if (/^CREATE\s+DATABASE\b/i.test(t)) return false;
        if (/^DROP\s+DATABASE\b/i.test(t)) return false;
        if (/^\\c(onnect)?\b/i.test(t)) return false;
        return true;
    }).join('\n');
}

function formatBackupTimestamp() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_` +
        `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function pgQuoteIdent(name) {
    assertSafeDbName(name);
    return `"${name.replace(/"/g, '""')}"`;
}

async function databaseExists(dbName) {
    assertSafeDbName(dbName);
    const maintenance = dbEnv().maintenanceDatabase;
    const { stdout } = await runPgCmd('psql', [
        '-d', maintenance,
        '-tAc',
        `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`
    ]);
    return stdout.trim() === '1';
}

/** If the app database exists, rename it to {dbName}_backup_YYYYMMDD_HHMMSS (unique). */
async function renameExistingDatabaseToBackup(dbName) {
    const maintenance = dbEnv().maintenanceDatabase;
    if (!(await databaseExists(dbName))) {
        return null;
    }

    const ts = formatBackupTimestamp();
    let backupName = assertSafeDbName(`${dbName}_backup_${ts}`);
    let suffix = 0;
    while (await databaseExists(backupName)) {
        suffix += 1;
        backupName = assertSafeDbName(`${dbName}_backup_${ts}_${suffix}`);
    }

    await runPgCmd('psql', [
        '--set', 'ON_ERROR_STOP=1',
        '-d', maintenance,
        '-c',
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ' +
        `'${dbName}' AND pid <> pg_backend_pid();`
    ]);

    await runPgCmd('psql', [
        '--set', 'ON_ERROR_STOP=1',
        '-d', maintenance,
        '-c',
        `ALTER DATABASE ${pgQuoteIdent(dbName)} RENAME TO ${pgQuoteIdent(backupName)};`
    ]);

    return backupName;
}

async function recreateDatabaseFromDump(dumpFilePath) {
    const cfg = dbEnv();
    const dbName = assertSafeDbName(cfg.database);
    const owner = assertSafeDbName(cfg.user);
    assertSafeDbName(cfg.maintenanceDatabase);
    const kind = sniffDumpKind(dumpFilePath);

    let restorePath = dumpFilePath;
    let sanitizedPath = null;
    if (kind === 'plain') {
        const original = fs.readFileSync(dumpFilePath, 'utf8');
        const sanitized = sanitizePlainDump(original);
        sanitizedPath = path.join(os.tmpdir(), `poc-restore-sanitized-${Date.now()}.sql`);
        fs.writeFileSync(sanitizedPath, sanitized, 'utf8');
        restorePath = sanitizedPath;
    }

    try {
        try {
            await pool.end();
        } catch (e) {
            // Pool may already be idle or ending.
        }

        const previousDatabaseBackup = await renameExistingDatabaseToBackup(dbName);
        await runPgCmd('createdb', ['-O', owner, dbName]);

        if (kind === 'custom') {
            await runPgCmd('pg_restore', [
                '--no-owner',
                '--no-acl',
                '--exit-on-error',
                '-d', dbName,
                restorePath
            ]);
        } else {
            await runPgCmd('psql', [
                '--set', 'ON_ERROR_STOP=1',
                '-d', dbName,
                '-f', restorePath
            ]);
        }

        pool = createPool();
        await waitForDb(15, 500);
        return {
            database: dbName,
            host: cfg.host,
            port: cfg.port,
            format: kind,
            previousDatabaseBackup
        };
    } catch (err) {
        pool = createPool();
        throw err;
    } finally {
        if (sanitizedPath) {
            try { fs.unlinkSync(sanitizedPath); } catch (e) { /* ignore */ }
        }
    }
}

const SQL_LOG = path.join(__dirname, 'successquery.sql');
if (!fs.existsSync(SQL_LOG)) {
    fs.writeFileSync(SQL_LOG, '-- Successful INSERT log - auto-created at server start\n');
}

function orderDateToIso(dtValue) {
    if (dtValue == null) return '';
    if (dtValue instanceof Date) return dtValue.toISOString().slice(0, 10);
    return String(dtValue).slice(0, 10);
}

async function saveOrder(orderData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const names = orderData.items.map(i => i.itemname);
        const pgnos = orderData.items.map(i => i.pgNo ?? i.pgno ?? null);
        const scoops = orderData.items.map(i => i.scoopIn);
        const qtys = orderData.items.map(i => i.qty);
        const rates = orderData.items.map(i => i.rate);
        const totals = orderData.items.map(i => i.itemTotal);
        const comments = orderData.items.map(i => i.comments);

        const existing = await client.query(
            `SELECT id FROM orders
             WHERE TRIM(COALESCE(vendor, '')) = TRIM(COALESCE($1, ''))
               AND dt = $2::date
               AND TRIM(COALESCE(billno, '')) = TRIM(COALESCE($3, ''))
             ORDER BY id DESC
             LIMIT 1`,
            [orderData.vendor, orderData.dt, orderData.billNo]
        );

        let orderId;
        let created = false;
        if (existing.rows.length) {
            orderId = existing.rows[0].id;
            await client.query(
                `UPDATE orders SET vendor = $1, billtotal = $2 WHERE id = $3`,
                [orderData.vendor, orderData.billTotal, orderId]
            );
            await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
        } else {
            const ins = await client.query(
                `INSERT INTO orders (vendor, dt, billno, billtotal)
                 VALUES ($1, $2::date, $3, $4)
                 RETURNING id`,
                [orderData.vendor, orderData.dt, orderData.billNo, orderData.billTotal]
            );
            orderId = ins.rows[0].id;
            created = true;
        }

        if (names.length) {
            await client.query(
                `INSERT INTO order_items (order_id, itemname, pgno, scoopin, qty, rate, itemtotal, comments)
                 SELECT $1,
                        unnest($2::text[]),
                        unnest($3::text[]),
                        unnest($4::text[]),
                        unnest($5::numeric[]),
                        unnest($6::numeric[]),
                        unnest($7::numeric[]),
                        unnest($8::text[])`,
                [orderId, names, pgnos, scoops, qtys, rates, totals, comments]
            );
        }

        let removedDuplicates = 0;
        const consolidateIds = orderData.consolidateOrderIds;
        if (Array.isArray(consolidateIds) && consolidateIds.length) {
            const rem = await client.query(
                `DELETE FROM orders WHERE id = ANY($1::bigint[]) AND id <> $2 RETURNING id`,
                [consolidateIds, orderId]
            );
            removedDuplicates = rem.rowCount || 0;
        }

        const costRes = await upsertRawMaterialsCostForOrder(client, orderId);
        fs.appendFileSync(SQL_LOG, `-- Logged Order for ${orderData.billNo}\n`);

        await client.query('COMMIT');
        return {
            id: orderId,
            created,
            updated: !created,
            removedDuplicates,
            rawMaterialsCostCount: costRes.rowCount || 0
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function loadOrderByBillNo(billNo, dt) {
    const bn = String(billNo || '').trim();
    if (!bn) {
        throw new Error('billNo is required');
    }

    const dtTrim = dt != null && String(dt).trim() !== '' ? String(dt).trim() : null;

    const ordersRes = await pool.query(
        `SELECT id, vendor, dt, billno
         FROM orders
         WHERE TRIM(billno) = TRIM($1)
           AND ($2::date IS NULL OR dt = $2::date)
         ORDER BY dt DESC NULLS LAST, id DESC`,
        [bn, dtTrim]
    );

    if (!ordersRes.rows.length) {
        return null;
    }

    const matchCount = ordersRes.rows.length;
    const sourceOrderIds = ordersRes.rows.map(r => r.id);

    const itemsRes = await pool.query(
        `SELECT oi.itemname, oi.pgno, oi.scoopin, oi.qty, oi.rate, oi.itemtotal, oi.comments
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE TRIM(o.billno) = TRIM($1)
           AND ($2::date IS NULL OR o.dt = $2::date)
         ORDER BY o.dt DESC NULLS LAST, o.id, oi.id`,
        [bn, dtTrim]
    );

    const vendorSet = new Set();
    ordersRes.rows.forEach(r => {
        const v = r.vendor != null ? String(r.vendor).trim() : '';
        if (v) vendorSet.add(v);
    });

    let vendor;
    if (vendorSet.size === 1) {
        vendor = [...vendorSet][0];
    } else if (vendorSet.size === 0) {
        vendor = '';
    } else {
        vendor = 'ALL';
    }

    const header = ordersRes.rows[0];

    return {
        matchCount,
        mergedOrders: matchCount > 1,
        filteredByDate: Boolean(dtTrim),
        sourceOrderIds,
        order: {
            vendor,
            dt: orderDateToIso(header.dt),
            billNo: header.billno,
            items: itemsRes.rows.map(r => ({
                itemname: r.itemname,
                pgNo: r.pgno,
                scoopIn: r.scoopin,
                qty: r.qty,
                rate: r.rate,
                itemTotal: r.itemtotal,
                comments: r.comments
            }))
        }
    };
}


/** Same rate math as scripts/07_raw_materials_cost.sql, scoped to one saved bill. */
const UPSERT_RAW_MATERIALS_COST_FOR_ORDER_SQL = `
INSERT INTO public.raw_materials_cost (
    "pgNo",
    item_names,
    ratepergram,
    rateperml,
    rateperpiece,
    based_on_billno,
    comments
)
WITH purchases AS (
    SELECT
        TRIM(oi.itemname) AS itemname,
        TRIM(oi.pgno) AS pgno,
        TRIM(oi.scoopin) AS scoopin,
        TRIM(o.billno) AS billno,
        oi.qty::numeric AS qty,
        oi.itemtotal::numeric AS itemtotal,
        o.dt AS purchase_dt,
        oi.created_at AS line_ts,
        oi.id AS line_id
    FROM public.order_items oi
    INNER JOIN public.orders o ON o.id = oi.order_id
    WHERE o.id = $1
      AND oi.pgno IS NOT NULL AND TRIM(oi.pgno) <> ''
      AND oi.itemname IS NOT NULL AND TRIM(oi.itemname) <> ''
      AND oi.qty IS NOT NULL AND oi.qty > 0
      AND oi.itemtotal IS NOT NULL
      AND oi.scoopin IS NOT NULL AND TRIM(oi.scoopin) <> ''
),
bill_pg AS (
    SELECT pgno, billno
    FROM purchases
    GROUP BY pgno, billno
),
name_agg AS (
    SELECT pgno, ARRAY_AGG(DISTINCT itemname ORDER BY itemname) AS item_names
    FROM purchases
    GROUP BY pgno
),
lines AS (
    SELECT
        p.pgno,
        p.itemname AS purchase_itemname,
        p.qty,
        p.itemtotal,
        p.purchase_dt,
        p.line_ts,
        p.line_id,
        LOWER(TRIM(sc.destination_unit)) AS destination_unit,
        sc.factor,
        sc.qty_in_grams,
        sc.qty_in_ml,
        sc.qty_in_piece
    FROM purchases p
    INNER JOIN public.scoop_config sc
        ON sc.scoop_name = p.scoopin
       AND TRIM(sc.scoop_item_id) = p.pgno
       AND LOWER(TRIM(sc.scoop_item_name)) = LOWER(TRIM(p.itemname))
       AND sc.destination_unit IS NOT NULL
       AND TRIM(sc.destination_unit) <> ''
),
with_units AS (
    SELECT
        l.*,
        CASE l.destination_unit
            WHEN 'gm' THEN COALESCE(l.qty_in_grams, l.factor, 1::numeric)
            WHEN 'ml' THEN COALESCE(l.qty_in_ml, l.factor, 1::numeric)
            WHEN 'piece' THEN COALESCE(l.qty_in_piece, l.factor, 1::numeric)
            ELSE NULL
        END AS units_per_scoop
    FROM lines l
    WHERE l.destination_unit IN ('gm', 'ml', 'piece')
),
priced AS (
    SELECT
        w.*,
        (w.qty * w.units_per_scoop) AS base_qty
    FROM with_units w
    WHERE w.units_per_scoop IS NOT NULL AND w.units_per_scoop > 0
      AND w.qty IS NOT NULL AND w.qty > 0
),
latest_gm AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        purchase_dt,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS ratepergram
    FROM priced
    WHERE destination_unit = 'gm'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_ml AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        purchase_dt,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperml
    FROM priced
    WHERE destination_unit = 'ml'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
),
latest_piece AS (
    SELECT DISTINCT ON (pgno)
        pgno,
        purchase_dt,
        ROUND((itemtotal / NULLIF(base_qty, 0))::numeric, 4) AS rateperpiece
    FROM priced
    WHERE destination_unit = 'piece'
    ORDER BY pgno, purchase_dt DESC NULLS LAST, line_ts DESC NULLS LAST, line_id DESC
)
SELECT
    bp.pgno AS "pgNo",
    n.item_names,
    g.ratepergram,
    m.rateperml,
    p.rateperpiece,
    bp.billno AS based_on_billno,
    CASE
        WHEN g.pgno IS NULL AND m.pgno IS NULL AND p.pgno IS NULL THEN 'No purchase lines'
        ELSE TRIM(BOTH '; ' FROM CONCAT_WS(
            '; ',
            CASE WHEN g.ratepergram IS NOT NULL
                THEN 'ratepergram from latest gm-dest purchase on ' || g.purchase_dt::text
            END,
            CASE WHEN m.rateperml IS NOT NULL
                THEN 'rateperml from latest ml purchase on ' || m.purchase_dt::text
            END,
            CASE WHEN p.rateperpiece IS NOT NULL
                THEN 'rateperpiece from latest piece purchase on ' || p.purchase_dt::text
            END
        ))
    END AS comments
FROM bill_pg bp
INNER JOIN name_agg n ON n.pgno = bp.pgno
LEFT JOIN latest_gm g ON g.pgno = bp.pgno
LEFT JOIN latest_ml m ON m.pgno = bp.pgno
LEFT JOIN latest_piece p ON p.pgno = bp.pgno
ON CONFLICT ("pgNo", based_on_billno) DO UPDATE SET
    item_names = EXCLUDED.item_names,
    ratepergram = EXCLUDED.ratepergram,
    rateperml = EXCLUDED.rateperml,
    rateperpiece = EXCLUDED.rateperpiece,
    comments = EXCLUDED.comments,
    last_updated_at = CURRENT_TIMESTAMP
`;

async function upsertRawMaterialsCostForOrder(client, orderId) {
    return client.query(UPSERT_RAW_MATERIALS_COST_FOR_ORDER_SQL, [orderId]);
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
                (dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece",
                 is_usable_in_other_dish, usable_processed_scoop, qty_of_scoops, comments)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
                !!row.isUsableInOtherDish,
                row.usableProcessedScoop || null,
                row.qtyOfScoops != null && row.qtyOfScoops !== '' ? row.qtyOfScoops : null,
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

const INSERT_SCOOP_CONFIG_IF_MISSING = `
    INSERT INTO scoop_config
        (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain,
         qty_in_grams, qty_in_ml, qty_in_piece, unused)
    SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    WHERE NOT EXISTS (
        SELECT 1 FROM scoop_config i
        WHERE LOWER(TRIM(i.scoop_name)) = LOWER(TRIM($4))
    )
    RETURNING id
`;

async function insertDefaultScoopConfigs(client, entityName, entityId, includePortion) {
    const configs = buildDefaultScoopConfigRows(entityName, entityId, { includePortion });
    let inserted = 0;
    for (const cfg of configs) {
        const res = await client.query(INSERT_SCOOP_CONFIG_IF_MISSING, [
            cfg.scoop_item_name,
            cfg.scoop_item_id,
            cfg.destination_unit,
            cfg.scoop_name,
            cfg.factor,
            cfg.conversion_chain,
            cfg.qty_in_grams,
            cfg.qty_in_ml,
            cfg.qty_in_piece,
            !!cfg.unused
        ]);
        if (res.rowCount > 0) inserted += res.rowCount;
    }
    return inserted;
}

const FIND_DISH_BY_CODE_NAME = `
    SELECT id FROM dishes
    WHERE TRIM(COALESCE(dish_code, '')) = TRIM(COALESCE($1, ''))
      AND LOWER(TRIM(dish_name)) = LOWER(TRIM($2))
    ORDER BY id DESC
    LIMIT 1`;

const FIND_RAW_MATERIAL_BY_PGNO_NAME = `
    SELECT id FROM raw_materials
    WHERE TRIM(COALESCE("pgNo", '')) = TRIM(COALESCE($1, ''))
      AND LOWER(TRIM(itemname)) = LOWER(TRIM($2))
    ORDER BY id DESC
    LIMIT 1`;

async function saveDishes(data) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO dishes (dish_code, dish_name)
            VALUES ($1, $2)
            RETURNING id
        `;
        const updateQuery = `
            UPDATE dishes
            SET dish_code = $1, dish_name = $2
            WHERE id = $3
            RETURNING id
        `;

        let lastId = null;
        let scoopConfigCount = 0;
        let inserted = 0;
        let updated = 0;
        for (const row of data.rows) {
            const dishcode = row.dishcode != null ? String(row.dishcode).trim() : '';
            const dishname = row.dishname != null ? String(row.dishname).trim() : '';
            if (!dishname) continue;

            const existing = await client.query(FIND_DISH_BY_CODE_NAME, [dishcode || null, dishname]);
            let res;
            if (existing.rows[0]) {
                res = await client.query(updateQuery, [dishcode || null, dishname, existing.rows[0].id]);
                updated += 1;
            } else {
                res = await client.query(insertQuery, [dishcode || null, dishname]);
                inserted += 1;
            }
            lastId = res.rows[0].id;
            scoopConfigCount += await insertDefaultScoopConfigs(
                client,
                dishname,
                dishcode || null,
                true
            );
        }

        await client.query('COMMIT');
        return {
            id: lastId,
            count: inserted + updated,
            inserted,
            updated,
            scoopConfigCount
        };
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
            INSERT INTO raw_materials ("pgNo", itemname, comments)
            VALUES ($1, $2, $3)
            RETURNING id
        `;
        const updateQuery = `
            UPDATE raw_materials
            SET "pgNo" = $1, itemname = $2, comments = $3
            WHERE id = $4
            RETURNING id
        `;

        let lastId = null;
        let scoopConfigCount = 0;
        let inserted = 0;
        let updated = 0;
        for (const row of data.rows) {
            const pgNo = row.pgNo != null ? String(row.pgNo).trim() : '';
            const itemname = row.itemname != null ? String(row.itemname).trim() : '';
            if (!itemname) continue;

            const comments = row.comments || '';
            const existing = await client.query(FIND_RAW_MATERIAL_BY_PGNO_NAME, [pgNo || null, itemname]);
            let res;
            if (existing.rows[0]) {
                res = await client.query(updateQuery, [pgNo || null, itemname, comments, existing.rows[0].id]);
                updated += 1;
            } else {
                res = await client.query(insertQuery, [pgNo || null, itemname, comments]);
                inserted += 1;
            }
            lastId = res.rows[0].id;
            scoopConfigCount += await insertDefaultScoopConfigs(
                client,
                itemname,
                pgNo || null,
                false
            );
        }

        await client.query('COMMIT');
        return {
            id: lastId,
            count: inserted + updated,
            inserted,
            updated,
            scoopConfigCount
        };
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

        const updateQuery = `
            UPDATE scoop_config
            SET scoop_item_name = $1,
                scoop_item_id = $2,
                destination_unit = $3,
                factor = $4,
                conversion_chain = $5,
                qty_in_grams = $6,
                qty_in_ml = $7,
                qty_in_piece = $8,
                unused = $9
            WHERE id = $10
            RETURNING id
        `;

        const findCanonicalIdQuery = `
            SELECT id FROM scoop_config
            WHERE LOWER(TRIM(scoop_name)) = LOWER(TRIM($1))
            ORDER BY unused ASC, id DESC
            LIMIT 1
        `;

        const deleteDupesQuery = `
            DELETE FROM scoop_config
            WHERE LOWER(TRIM(scoop_name)) = LOWER(TRIM($1))
              AND id <> $2
        `;

        let lastId = null;
        let updated = 0;
        let inserted = 0;
        for (const row of data.rows) {
            const scoopName = row.scoopName || row.scoop_name || null;
            if (!scoopName || !String(scoopName).trim()) continue;

            const params = [
                row.scoopItemName || row.scoop_item_name || row.itemname || null,
                row.scoopItemId || row.scoop_item_id || row.pgNo || null,
                row.destinationUnit || row.destination_unit || null,
                scoopName,
                row.factor,
                row.chain || row.conversion_chain || null,
                row.qtyInGrams != null ? row.qtyInGrams : row.qty_in_grams,
                row.qtyInMl != null ? row.qtyInMl : row.qty_in_ml,
                row.qtyInPiece != null ? row.qtyInPiece : row.qty_in_piece,
                !!row.unused
            ];

            const existing = await client.query(findCanonicalIdQuery, [scoopName]);
            if (existing.rows[0]) {
                const id = existing.rows[0].id;
                const res = await client.query(updateQuery, [
                    params[0],
                    params[1],
                    params[2],
                    params[4],
                    params[5],
                    params[6],
                    params[7],
                    params[8],
                    params[9],
                    id
                ]);
                lastId = res.rows[0].id;
                updated += 1;
                await client.query(deleteDupesQuery, [scoopName, id]);
            } else {
                const res = await client.query(insertQuery, params);
                lastId = res.rows[0].id;
                inserted += 1;
            }
        }

        await client.query('COMMIT');
        return { id: lastId, count: data.rows.length, inserted, updated };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function loadScoopConfig(scoopItemName = null) {
    const name = typeof scoopItemName === 'string' ? scoopItemName.trim() : '';
    const baseSql = `
        SELECT id, scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor,
               conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused,
               created_at, last_updated_at
        FROM scoop_config`;
    const res = name
        ? await pool.query(
            `${baseSql}
        WHERE LOWER(TRIM(scoop_item_name)) = LOWER(TRIM($1))
        ORDER BY id`,
            [name]
        )
        : await pool.query(`${baseSql}
        ORDER BY id`);
    return res.rows;
}

/** All scoop_config rows for a dish (match scoop_item_id = dish code, e.g. P8). */
async function loadScoopConfigByDishCode(dishCode) {
    const code = typeof dishCode === 'string' ? dishCode.trim() : '';
    if (!code) return [];
    const res = await pool.query(
        `
        SELECT DISTINCT ON (LOWER(TRIM(scoop_name)))
               id, scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor,
               conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused,
               created_at, last_updated_at
        FROM scoop_config
        WHERE LOWER(TRIM(scoop_item_id)) = LOWER(TRIM($1))
        ORDER BY LOWER(TRIM(scoop_name)), unused ASC, id DESC`,
        [code]
    );
    return res.rows;
}

const { fetchStaticDataBundle } = require('./staticDataQueries');
const { runRecipeCostQuery } = require('./recipeCostQueries');
const { validateAndQueryDishCost } = require('./dishCostWalk');

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

const UPSERT_RMC_FROM_ORDERS_SQL_PATH = path.join(
    __dirname,
    'scripts/useful_queries/raw_materials_cost_insert_from_orders.sql'
);

const RAW_MATERIALS_COST_PREVIEW_SQL = `
SELECT id, "pgNo", item_names, ratepergram, rateperml, rateperpiece,
       based_on_billno, comments, created_at, last_updated_at
FROM public.raw_materials_cost
ORDER BY last_updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
LIMIT 500`;

/** Upsert raw_materials_cost from all order_items (ON CONFLICT pgNo + bill). */
async function upsertRawMaterialsCostFromOrders() {
    const upsertSql = fs.readFileSync(UPSERT_RMC_FROM_ORDERS_SQL_PATH, 'utf8');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const upsertRes = await client.query(upsertSql);
        const previewRes = await client.query(RAW_MATERIALS_COST_PREVIEW_SQL);
        await client.query('COMMIT');
        return {
            upserted: upsertRes.rowCount || 0,
            columns: previewRes.fields ? previewRes.fields.map(f => f.name) : [],
            rows: previewRes.rows || []
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

const DEFAULT_SEED_FILES = [
    'scripts/seed_data.sql',
    'scripts/dish_scoops_seed.sql',
    'scripts/raw_materials_seed.sql',
    'scripts/raw_materials_custom_scoops_seed.sql',
    'scripts/raw_materials_v2_delta_seed.sql'
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
        SELECT dishname, dishcode, reciepeitemname, "pgNo", receipescoop, qty, "inGm", "inML", "inPiece",
               is_usable_in_other_dish, usable_processed_scoop, qty_of_scoops, comments
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

async function runRecipeCostForDish(options) {
    return runRecipeCostQuery(pool, options);
}

async function runDishCostValidation(dishcode, dishname) {
    return validateAndQueryDishCost(pool, { dishcode, dishname });
}

/** Dishes with a saved recipe, same order as Dishes tab (dish_name), then recipe-only codes. */
const DISHES_FOR_COST_LIST_SQL = `
WITH has_recipe AS (
    SELECT DISTINCT UPPER(TRIM(dishcode)) AS dish_code
    FROM recipe_entries
    WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
),
from_catalog AS (
    SELECT UPPER(TRIM(d.dish_code)) AS dish_code,
           TRIM(d.dish_name) AS dishname,
           1 AS sort_key,
           LOWER(TRIM(d.dish_name)) AS sort_name
    FROM dishes d
    INNER JOIN has_recipe h ON UPPER(TRIM(d.dish_code)) = h.dish_code
),
recipe_names AS (
    SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
        UPPER(TRIM(dishcode)) AS dish_code,
        TRIM(dishname) AS dishname
    FROM recipe_entries
    WHERE dishcode IS NOT NULL AND TRIM(dishcode) <> ''
    ORDER BY UPPER(TRIM(dishcode)), created_at DESC, id DESC
),
orphan AS (
    SELECT r.dish_code,
           r.dishname,
           2 AS sort_key,
           LOWER(r.dishname) AS sort_name
    FROM recipe_names r
    WHERE NOT EXISTS (
        SELECT 1 FROM dishes d WHERE UPPER(TRIM(d.dish_code)) = r.dish_code
    )
)
SELECT dish_code, dishname
FROM (
    SELECT dish_code, dishname, sort_key, sort_name FROM from_catalog
    UNION ALL
    SELECT dish_code, dishname, sort_key, sort_name FROM orphan
) combined
ORDER BY sort_key, sort_name, dish_code`;

async function listDishesForCostCalculation() {
    const res = await pool.query(DISHES_FOR_COST_LIST_SQL);
    return (res.rows || []).map(r => ({
        dishcode: r.dish_code,
        dishname: r.dishname || r.dish_code
    }));
}

module.exports = {
    saveOrder,
    loadOrderByBillNo,
    saveInventoryOut,
    saveRecipe,
    saveDishes,
    saveRawMaterials,
    saveScoopConfig,
    loadScoopConfig,
    loadScoopConfigByDishCode,
    fetchStaticData,
    runQuery,
    upsertRawMaterialsCostFromOrders,
    waitForDb,
    runSeedData,
    getDbInfo,
    recreateDatabaseFromDump,
    loadRecipeByDish,
    loadRecipeByDishcode,
    runRecipeCostForDish,
    runDishCostValidation,
    listDishesForCostCalculation
};