'use strict';

/**
 * Routes for kitchen_stock_baselines.html — kitchen baselines (no override columns).
 */
const { Pool } = require('pg');
const stockQtyDisplay = require('./stockQtyDisplay');

function dbPool() {
    return new Pool({
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5432,
        database: process.env.PGDATABASE || 'poc',
        user: process.env.PGUSER || 'poc',
        password: process.env.PGPASSWORD || 'poc_secret'
    });
}

let pagePool;

function getPool() {
    if (!pagePool) pagePool = dbPool();
    return pagePool;
}

async function loadPackagingByPg(pgList) {
    if (!pgList.length) return new Map();
    const { rows } = await getPool().query(stockQtyDisplay.PACKAGING_SCOOP_SQL, [pgList]);
    return stockQtyDisplay.buildPackagingIndex(rows);
}

async function loadUnitFactorIndex(pgList) {
    if (!pgList.length) return new Map();
    const { rows } = await getPool().query(stockQtyDisplay.UNIT_FACTOR_SCOOP_SQL, [pgList]);
    return stockQtyDisplay.buildUnitFactorIndex(rows);
}

function mapDefaultScoopRow(row) {
    if (!row) return null;
    const pgno = String(row.pg_no).trim();
    const scoopName = row.scoop_name || '';
    return {
        pgno,
        destination_unit: row.destination_unit,
        scoop_name: scoopName || null,
        scoopUsed: scoopName ? stockQtyDisplay.packUnitFromScoopName(scoopName) : '',
        factor: row.factor != null ? Number(row.factor) : null
    };
}

async function loadDefaultScoopsForPgList(pgList) {
    if (!pgList.length) return {};
    const { rows } = await getPool().query(
        `SELECT pg_no, destination_unit, scoop_name, factor
         FROM public.raw_materials_default_scoop
         WHERE TRIM(pg_no) = ANY($1::text[])`,
        [pgList]
    );
    const out = {};
    for (const row of rows) {
        const mapped = mapDefaultScoopRow(row);
        if (mapped) out[mapped.pgno] = mapped;
    }
    return out;
}

function unitFactorIndexToJson(index) {
    const out = {};
    for (const [pg, units] of index.entries()) {
        out[pg] = {};
        for (const [unit, meta] of units.entries()) {
            out[pg][unit] = meta;
        }
    }
    return out;
}

const RAW_MATERIAL_ITEMNAMES_LATERAL = `
LEFT JOIN LATERAL (
    SELECT STRING_AGG(
        DISTINCT NULLIF(TRIM(itemname), ''),
        ', ' ORDER BY NULLIF(TRIM(itemname), '')
    ) AS itemnames
    FROM public.raw_materials
    WHERE TRIM("pgNo") = TRIM(ksb.pgno)
) rm ON true
`;

const BASELINE_LIST_SQL = `
SELECT
    ksb.id,
    ksb.pgno,
    rm.itemnames,
    ksb.baseline_date,
    ksb.qty_gm,
    ksb.qty_ml,
    ksb.qty_piece,
    rdu.destination_unit,
    ksb.verified_by,
    ksb.status,
    ksb.remarks,
    ksb.created_at,
    ksb.created_by
FROM public.kitchen_stock_baselines ksb
${RAW_MATERIAL_ITEMNAMES_LATERAL}
LEFT JOIN public.raw_materials_destination_unit rdu
    ON TRIM(rdu.pg_no) = TRIM(ksb.pgno)
WHERE ksb.baseline_date = $1::date
`;

const BASELINE_DATES_SQL = `
SELECT DISTINCT baseline_date
FROM public.kitchen_stock_baselines
ORDER BY baseline_date DESC
`;

function mapKitchenBaselineRow(row, packagingByPg) {
    const dest = row.destination_unit;
    const pgno = row.pgno;
    const qtyView = stockQtyDisplay.enrichQtyFields(
        { gm: row.qty_gm, ml: row.qty_ml, piece: row.qty_piece, destinationUnit: dest, pgno },
        packagingByPg
    );
    return {
        id: row.id,
        pgno: row.pgno,
        itemnames: row.itemnames,
        baseline_date: row.baseline_date,
        qty: qtyView.qty,
        qty_in_packaging: qtyView.qty_in_packaging,
        destination_unit: row.destination_unit,
        verified_by: row.verified_by,
        status: row.status,
        remarks: row.remarks,
        created_at: row.created_at,
        created_by: row.created_by
    };
}

const BASELINE_ROW_BY_ID_SQL = `
SELECT
    ksb.id,
    ksb.pgno,
    rm.itemnames,
    ksb.baseline_date,
    ksb.qty_gm,
    ksb.qty_ml,
    ksb.qty_piece,
    rdu.destination_unit,
    ksb.verified_by,
    ksb.status,
    ksb.remarks,
    ksb.created_at,
    ksb.created_by
FROM public.kitchen_stock_baselines ksb
${RAW_MATERIAL_ITEMNAMES_LATERAL}
LEFT JOIN public.raw_materials_destination_unit rdu
    ON TRIM(rdu.pg_no) = TRIM(ksb.pgno)
WHERE ksb.id = $1
`;

const CURRENT_STOCK_CATALOG_SQL = `
SELECT
    rm.pgno,
    rm.itemnames,
    COALESCE(
        NULLIF(LOWER(TRIM(rdu.destination_unit)), ''),
        sco.fallback_dest,
        'gm'
    ) AS destination_unit,
    cs.current_stock_gm AS gm,
    cs.current_stock_ml AS ml,
    cs.current_stock_piece AS piece,
    ab.baseline_date AS active_baseline_date
FROM (
    SELECT
        TRIM("pgNo") AS pgno,
        STRING_AGG(
            DISTINCT NULLIF(TRIM(itemname), ''),
            ', ' ORDER BY NULLIF(TRIM(itemname), '')
        ) AS itemnames
    FROM public.raw_materials
    WHERE TRIM("pgNo") IS NOT NULL AND TRIM("pgNo") <> ''
    GROUP BY TRIM("pgNo")
) rm
LEFT JOIN public.raw_materials_destination_unit rdu
    ON TRIM(rdu.pg_no) = TRIM(rm.pgno)
LEFT JOIN LATERAL (
    SELECT LOWER(TRIM(sc.destination_unit)) AS fallback_dest
    FROM public.scoop_config sc
    WHERE TRIM(sc.scoop_item_id) = TRIM(rm.pgno)
      AND COALESCE(sc.unused, false) = false
      AND LOWER(TRIM(sc.destination_unit)) IN ('gm', 'ml', 'piece')
    ORDER BY sc.version DESC, sc.id DESC
    LIMIT 1
) sco ON true
LEFT JOIN public.current_stock_by_pgno cs
    ON TRIM(cs."pgNo") = TRIM(rm.pgno)
LEFT JOIN LATERAL (
    SELECT baseline_date
    FROM public.kitchen_stock_baselines
    WHERE TRIM(pgno) = TRIM(rm.pgno)
      AND LOWER(TRIM(status)) = 'active'
    ORDER BY baseline_date DESC, id DESC
    LIMIT 1
) ab ON true
`;

function mapCurrentStockRow(row, packagingByPg) {
    const pgno = String(row.pgno).trim();
    const dest = row.destination_unit;
    const qtyView = stockQtyDisplay.enrichQtyFields(
        { gm: row.gm, ml: row.ml, piece: row.piece, destinationUnit: dest, pgno },
        packagingByPg
    );
    const baselineDate =
        row.active_baseline_date instanceof Date
            ? row.active_baseline_date.toISOString().slice(0, 10)
            : row.active_baseline_date
              ? String(row.active_baseline_date).slice(0, 10)
              : '';
    return {
        pgno,
        itemnames: row.itemnames,
        destination_unit: dest,
        qty: qtyView.qty,
        qty_in_packaging: qtyView.qty_in_packaging,
        qty_gm: row.gm,
        qty_ml: row.ml,
        qty_piece: row.piece,
        active_baseline_date: baselineDate
    };
}

function registerKitchenStockBaselinesPageRoutes(app) {
    app.get('/api/kitchen-stock-baselines-page/dates', async (req, res) => {
        try {
            const { rows } = await getPool().query(BASELINE_DATES_SQL);
            res.json({
                dates: rows.map((r) =>
                    r.baseline_date instanceof Date
                        ? r.baseline_date.toISOString().slice(0, 10)
                        : String(r.baseline_date).slice(0, 10)
                )
            });
        } catch (err) {
            console.error('GET /api/kitchen-stock-baselines-page/dates error:', err);
            res.status(500).json({ error: 'Database error', detail: err.message });
        }
    });

    app.get('/api/kitchen-stock-baselines-page/by-date', async (req, res) => {
        const dateStr = String(req.query.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
        }
        const statusRaw = String(req.query.status || 'all').trim().toLowerCase();
        let sql = BASELINE_LIST_SQL;
        const params = [dateStr];
        if (statusRaw === 'active' || statusRaw === 'retired') {
            sql += ` AND LOWER(TRIM(ksb.status)) = $2`;
            params.push(statusRaw);
        }
        sql += ` ORDER BY ${stockQtyDisplay.enhancedOrderByClause('ksb.pgno')}`;

        try {
            const { rows } = await getPool().query(sql, params);
            const pgList = [...new Set(rows.map((r) => String(r.pgno).trim()).filter(Boolean))];
            const packagingByPg = await loadPackagingByPg(pgList);
            res.json({
                date: dateStr,
                status: statusRaw,
                count: rows.length,
                rows: rows.map((r) => mapKitchenBaselineRow(r, packagingByPg))
            });
        } catch (err) {
            console.error('GET /api/kitchen-stock-baselines-page/by-date error:', err);
            res.status(500).json({ error: 'Database error', detail: err.message });
        }
    });

    function normalizeBaselineStatus(raw) {
        const t = String(raw || '')
            .trim()
            .toUpperCase();
        if (t === 'ACTIVE' || t === 'RETIRED') return t;
        return null;
    }

    app.get('/api/kitchen-stock-baselines-page/unit-factors', async (req, res) => {
        const raw = String(req.query.pgnos || req.query.pgNo || '').trim();
        const pgList = raw
            .split(/[,;\s]+/)
            .map((x) => x.trim())
            .filter(Boolean);
        if (!pgList.length) {
            return res.status(400).json({ error: 'pgnos query parameter is required' });
        }
        try {
            const index = await loadUnitFactorIndex(pgList);
            const packaging = await loadPackagingByPg(pgList);
            const defaultScoops = await loadDefaultScoopsForPgList(pgList);
            const packagingJson = {};
            for (const [pg, list] of packaging.entries()) {
                packagingJson[pg] = list;
            }
            res.json({
                unitFactors: unitFactorIndexToJson(index),
                packaging: packagingJson,
                defaultScoops
            });
        } catch (err) {
            console.error('GET /api/kitchen-stock-baselines-page/unit-factors error:', err);
            res.status(500).json({ error: 'Database error', detail: err.message });
        }
    });

    app.get('/api/kitchen-stock-baselines-page/current-stock', async (req, res) => {
        const sql =
            CURRENT_STOCK_CATALOG_SQL +
            stockQtyDisplay.catalogOrderByClause('pgno', 'rm.pgno', 'rm.pgno');
        try {
            const { rows } = await getPool().query(sql);
            const pgList = [...new Set(rows.map((r) => String(r.pgno).trim()).filter(Boolean))];
            const packagingByPg = await loadPackagingByPg(pgList);
            res.json({
                count: rows.length,
                rows: rows.map((r) => mapCurrentStockRow(r, packagingByPg))
            });
        } catch (err) {
            console.error('GET /api/kitchen-stock-baselines-page/current-stock error:', err);
            res.status(500).json({ error: 'Database error', detail: err.message });
        }
    });

    app.post('/api/kitchen-stock-baselines-page/create-batch', async (req, res) => {
        const baselineDate = String(req.body?.baseline_date || '').trim();
        const verifiedBy = String(req.body?.verified_by || '').trim();
        const rowsIn = req.body?.rows;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(baselineDate)) {
            return res.status(400).json({ error: 'baseline_date (YYYY-MM-DD) is required' });
        }
        if (!Array.isArray(rowsIn) || !rowsIn.length) {
            return res.status(400).json({ error: 'rows array is required' });
        }
        const pool = getPool();
        const pgList = [
            ...new Set(rowsIn.map((r) => String(r.pgno || '').trim()).filter(Boolean))
        ];
        const unitIndex = await loadUnitFactorIndex(pgList);
        const created = [];
        const failed = [];

        try {
            for (const item of rowsIn) {
                const pgno = String(item.pgno || '').trim();
                if (!pgno) {
                    failed.push({ pgno: item.pgno, error: 'pgno required' });
                    continue;
                }
                const lines = item.lines || [];
                const { rows: destRows } = await pool.query(
                    `SELECT destination_unit FROM public.raw_materials_destination_unit WHERE TRIM(pg_no)=$1`,
                    [pgno]
                );
                const dest = destRows[0]?.destination_unit || 'gm';
                const totals = stockQtyDisplay.accumulateLinesToBaselineQty(
                    lines,
                    pgno,
                    dest,
                    unitIndex
                );
                if (totals.error) {
                    failed.push({ pgno, error: totals.error });
                    continue;
                }
                await pool.query(
                    `UPDATE public.kitchen_stock_baselines SET status = 'RETIRED'
                     WHERE TRIM(pgno) = $1 AND LOWER(TRIM(status)) = 'active'`,
                    [pgno]
                );
                const remark = `create-batch; lines=${lines.length}; verified_by=${verifiedBy || '—'}`;
                try {
                    const ins = await pool.query(
                        `INSERT INTO public.kitchen_stock_baselines
                         (pgno, baseline_date, qty_gm, qty_ml, qty_piece,
                          verified_by, status, remarks, created_by)
                         VALUES ($1, $2::date, $3, $4, $5, $6, 'ACTIVE', $7, 'kitchen_baseline_create')
                         RETURNING id`,
                        [
                            pgno,
                            baselineDate,
                            totals.qty_gm,
                            totals.qty_ml,
                            totals.qty_piece,
                            verifiedBy || null,
                            remark
                        ]
                    );
                    created.push({ pgno, id: ins.rows[0].id, ...totals });
                } catch (insErr) {
                    if (insErr.code === '23505') {
                        failed.push({ pgno, error: 'ACTIVE baseline conflict after retire' });
                    } else {
                        failed.push({ pgno, error: insErr.message });
                    }
                }
            }
            res.json({ created, failed, createdCount: created.length, failedCount: failed.length });
        } catch (err) {
            console.error('POST /api/kitchen-stock-baselines-page/create-batch error:', err);
            res.status(500).json({ error: 'Database error', detail: err.message });
        }
    });

    app.post('/api/kitchen-stock-baselines-page/force-update', async (req, res) => {
        const updates = req.body && req.body.updates;
        if (!Array.isArray(updates) || !updates.length) {
            return res.status(400).json({ error: 'updates array is required' });
        }
        const pool = getPool();
        const updated = [];
        const failed = [];

        try {
            for (const item of updates) {
                const id = Number(item.id);
                const qtyStr = String(item.qty ?? '').trim();
                const statusNext = normalizeBaselineStatus(item.status);
                if (!Number.isFinite(id) || id <= 0) {
                    failed.push({ id: item.id, error: 'invalid id' });
                    continue;
                }
                if (!statusNext) {
                    failed.push({ id, error: 'status must be ACTIVE or RETIRED' });
                    continue;
                }
                const { rows: metaRows } = await pool.query(
                    `SELECT ksb.id, ksb.pgno, rdu.destination_unit
                     FROM public.kitchen_stock_baselines ksb
                     LEFT JOIN public.raw_materials_destination_unit rdu
                       ON TRIM(rdu.pg_no) = TRIM(ksb.pgno)
                     WHERE ksb.id = $1`,
                    [id]
                );
                if (!metaRows.length) {
                    failed.push({ id, error: 'baseline not found' });
                    continue;
                }
                const dest = metaRows[0].destination_unit;
                const parsed = stockQtyDisplay.parseQtyDisplay(qtyStr, dest);
                if (parsed.error) {
                    failed.push({ id, error: parsed.error });
                    continue;
                }
                const note = `force-update qty=${qtyStr}; status=${statusNext}`;
                try {
                    await pool.query(
                        `UPDATE public.kitchen_stock_baselines
                         SET qty_gm = $2, qty_ml = $3, qty_piece = $4, status = $6,
                             remarks = CASE
                                 WHEN remarks IS NULL OR TRIM(remarks) = '' THEN $5
                                 WHEN remarks LIKE '%' || $5 || '%' THEN remarks
                                 ELSE TRIM(remarks) || ' | ' || $5
                             END
                         WHERE id = $1`,
                        [id, parsed.qty_gm, parsed.qty_ml, parsed.qty_piece, note, statusNext]
                    );
                } catch (updErr) {
                    if (updErr.code === '23505') {
                        failed.push({
                            id,
                            error:
                                'cannot set ACTIVE: another ACTIVE baseline already exists for this pgNo'
                        });
                    } else {
                        failed.push({ id, error: updErr.message || 'update failed' });
                    }
                    continue;
                }
                const { rows } = await pool.query(BASELINE_ROW_BY_ID_SQL, [id]);
                const pgno = String(rows[0].pgno).trim();
                const packagingByPg = await loadPackagingByPg([pgno]);
                updated.push(mapKitchenBaselineRow(rows[0], packagingByPg));
            }
            res.json({ updated, failed, updatedCount: updated.length, failedCount: failed.length });
        } catch (err) {
            console.error('POST /api/kitchen-stock-baselines-page/force-update error:', err);
            res.status(500).json({ error: 'Database error', detail: err.message });
        }
    });
}

module.exports = { registerKitchenStockBaselinesPageRoutes };