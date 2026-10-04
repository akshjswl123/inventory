// report.js
let queryLastResult = null;

const API_BASE_STORAGE_KEY = 'inventoryApiBase';
const DEFAULT_API_BASE = 'http://localhost:3050';

function setQueryExportEnabled(on) {
    const btn = document.getElementById('queryExportCsvBtn');
    if (btn) btn.disabled = !on;
}

function isServerMode() {
    return location.protocol === 'http:' || location.protocol === 'https:';
}

function getApiBase() {
    if (isServerMode()) return '';
    const el = document.getElementById('queryApiBase');
    const fromInput = el && String(el.value || '').trim();
    if (fromInput) return fromInput.replace(/\/$/, '');
    try {
        const stored = localStorage.getItem(API_BASE_STORAGE_KEY);
        if (stored) return String(stored).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    return DEFAULT_API_BASE;
}

function apiUrl(path) {
    const base = getApiBase();
    const p = path.startsWith('/') ? path : '/' + path;
    return base + p;
}

/** Query / PG Dump / restore work from file:// when API base points at the app server. */
function canUseQueryApi() {
    return isServerMode() || Boolean(getApiBase());
}

function saveApiBaseFromUi() {
    const el = document.getElementById('queryApiBase');
    if (!el) return;
    const v = String(el.value || '').trim().replace(/\/$/, '');
    try {
        if (v) localStorage.setItem(API_BASE_STORAGE_KEY, v);
        else localStorage.removeItem(API_BASE_STORAGE_KEY);
    } catch (e) { /* ignore */ }
    loadQueryDbTarget();
}

function initQueryApiBase() {
    const el = document.getElementById('queryApiBase');
    const bar = document.getElementById('queryApiBar');
    if (!el) return;
    if (isServerMode()) {
        if (bar) bar.style.display = 'none';
        return;
    }
    if (bar) bar.style.display = '';
    try {
        const stored = localStorage.getItem(API_BASE_STORAGE_KEY);
        el.value = stored || DEFAULT_API_BASE;
    } catch (e) {
        el.value = DEFAULT_API_BASE;
    }
}

async function readApiJson(res) {
    const text = await res.text();
    if (!text) return {};
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error('Server returned invalid JSON.');
        }
    }
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        if (res.status === 413) {
            throw new Error(
                'Request body too large for the server. Restart the app container after updating server.js (JSON limit raised to 25mb).'
            );
        }
        throw new Error(
            'Server returned HTML instead of JSON (HTTP ' + res.status + '). ' +
            'Open the app at http://localhost:3050 (not pgAdmin/Adminer) and ensure the app container is running.'
        );
    }
    throw new Error(trimmed.slice(0, 500) || res.statusText || 'Request failed');
}

async function run() {
    const sql = document.getElementById("queryInput").value.trim();
    const errBox = document.getElementById("queryError");
    const meta = document.getElementById("queryMeta");
    const table = document.getElementById("queryResult");
    const btn = document.getElementById("queryRunBtn");

    errBox.className = ""; errBox.style.display = "none"; errBox.textContent = "";
    meta.textContent = ""; table.innerHTML = "";
    queryLastResult = null;
    setQueryExportEnabled(false);
    if (!sql) { showErr('Please enter a SQL query.'); return; }
    if (!canUseQueryApi()) {
        showErr('Set App server URL above (e.g. http://localhost:3050) or open this page at http://localhost:3050/recreateFromPgDump.html');
        return;
    }

    btn.disabled = true; btn.textContent = 'Running...';
    const t0 = Date.now();

    try {
        const res = await fetch(apiUrl('/api/query'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });
        const data = await readApiJson(res);
        if (!res.ok) { showErr(data.error || data.detail || res.statusText); return; }

        const elapsed = Date.now() - t0;
        const { columns = [], rows = [] } = data;
        if (!columns.length) {
            const extra = data.rowCount != null ? ` (${data.rowCount} row(s) affected)` : '';
            meta.textContent = `Query executed successfully (${elapsed} ms). No result rows returned${extra}.`;
            return;
        }

        queryLastResult = { columns, rows };
        setQueryExportEnabled(true);

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr>' + columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = columns.map(c => '<td>' + esc(row[c] == null ? '' : row[c]) + '</td>').join('');
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        meta.textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''} in ${elapsed}ms`;
    } catch (err) {
        showErr(err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Run Query';
    }
}

function showErr(msg) {
    const errBox = document.getElementById('queryError');
    errBox.className = 'is-err';
    errBox.textContent = msg;
}

function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function exportQueryCsv(namePrefix) {
    if (!queryLastResult || !queryLastResult.columns.length) {
        showErr('No result rows to export. Run a query that returns rows first.');
        return;
    }
    const C = window.Csv;
    if (!C || !C.rowsToCsv || !C.download) {
        showErr('csv.js not loaded');
        return;
    }
    const { columns, rows } = queryLastResult;
    const dataRows = rows.map(row => columns.map(c => (row[c] == null ? '' : row[c])));
    const text = C.rowsToCsv(columns, dataRows);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const base = namePrefix ? String(namePrefix) : 'query_result';
    C.download(text, base + '_' + stamp + '.csv');
}

const STOCK_SQL = `WITH qty_in AS (
  SELECT
    TRIM(itemname) AS itemname,
    SUM(
      CASE
        WHEN scoopin ILIKE '%kg%' THEN COALESCE(qty, 0) * 1000
        WHEN scoopin ILIKE '%gm%' THEN COALESCE(qty, 0)
        ELSE 0
      END
    ) AS scoopin_gm
  FROM public.order_items
  WHERE itemname IS NOT NULL AND TRIM(itemname) <> ''
  GROUP BY TRIM(itemname)
),
qty_out AS (
  SELECT
    TRIM(itemname) AS itemname,
    SUM(
      CASE
        WHEN scoop_out ILIKE '%kg%' THEN COALESCE(qty, 0) * 1000
        WHEN scoop_out ILIKE '%gm%' THEN COALESCE(qty, 0)
        ELSE 0
      END
    ) AS scoopout_gm
  FROM public.inventory_out_items
  WHERE itemname IS NOT NULL AND TRIM(itemname) <> ''
  GROUP BY TRIM(itemname)
)
SELECT
  COALESCE(i.itemname, o.itemname) AS itemname,
  COALESCE(i.scoopin_gm, 0) AS scoopin_gm,
  COALESCE(o.scoopout_gm, 0) AS scoopout_gm,
  COALESCE(i.scoopin_gm, 0) - COALESCE(o.scoopout_gm, 0) AS current_stock_gm
FROM qty_in i
FULL OUTER JOIN qty_out o ON i.itemname = o.itemname
ORDER BY itemname;`;

const QUERY_BROWSE_TABLES = [
    'categories',
    'dishes',
    'inventory_out',
    'inventory_out_items',
    'order_entries',
    'order_items',
    'order_out',
    'orders',
    'raw_materials',
    'raw_materials_cost',
    'recipe_entries',
    'scoop_config',
    'vendors'
];

function selectedBrowseTable() {
    const el = document.getElementById('queryBrowseTable');
    return el ? String(el.value || '').trim() : '';
}

function showTablesOrderByIdDesc() {
    const tableId = selectedBrowseTable();
    const el = document.getElementById('queryInput');
    if (!el) return;
    if (!tableId) {
        showErr('Select a table from Browse table (default is None).');
        return;
    }
    const errBox = document.getElementById('queryError');
    if (errBox) {
        errBox.className = '';
        errBox.style.display = 'none';
        errBox.textContent = '';
    }
    el.value = `SELECT *\nFROM public.${tableId}\nORDER BY id DESC\nLIMIT 200;`;
}

function initQueryBrowseTable() {
    const sel = document.getElementById('queryBrowseTable');
    if (!sel) return;
    const opts = ['<option value="">None</option>'].concat(
        QUERY_BROWSE_TABLES.map(t => '<option value="' + t + '">' + t + '</option>')
    );
    sel.innerHTML = opts.join('');
}

async function fetchStockMap() {
    if (!isServerMode()) return {};
    try {
        const res = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: STOCK_SQL })
        });
        if (!res.ok) return {};
        const data = await readApiJson(res);
        const map = {};
        (data.rows || []).forEach(row => {
            if (!row.itemname) return;
            const gm = parseFloat(row.current_stock_gm);
            map[String(row.itemname).trim()] = isNaN(gm) ? 0 : gm;
        });
        return map;
    } catch (e) {
        return {};
    }
}

function setQueryDbTarget(info) {
    const el = document.getElementById('queryDbTarget');
    if (!el) return;
    if (!info || !info.database) {
        el.textContent = 'App database: unknown';
        return;
    }
    el.textContent = 'App database: ' + info.database + ' @ ' + (info.host || '?') + ':' + (info.port || '?') +
        ' (user ' + (info.user || '?') + ')';
}

async function loadQueryDbTarget() {
    if (!canUseQueryApi()) {
        setQueryDbTarget({ database: '(set App server URL and click Connect)' });
        return;
    }
    try {
        const res = await fetch(apiUrl('/api/db-info'));
        const data = await readApiJson(res);
        if (!res.ok) throw new Error(data.error || res.statusText);
        setQueryDbTarget(data);
    } catch (e) {
        setQueryDbTarget({ database: 'unavailable (' + e.message + ')' });
    }
}

async function pgDump() {
    const btn = document.getElementById('pgDumpButton');
    const meta = document.getElementById('queryMeta');
    const errBox = document.getElementById('queryError');

    errBox.className = '';
    errBox.style.display = 'none';
    errBox.textContent = '';

    if (!canUseQueryApi()) {
        showErr('Set App server URL above (e.g. http://localhost:3050) or open at http://localhost:3050/recreateFromPgDump.html');
        return;
    }

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = 'Dumping...';

    try {
        const res = await fetch(apiUrl('/api/pgdump'));
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showErr(data.detail || data.error || res.statusText);
            return;
        }

        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const match = cd.match(/filename="([^"]+)"/);
        const filename = match ? match[1] : 'poc_dump.sql';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        meta.textContent = `Database dump downloaded: ${filename}`;
    } catch (err) {
        showErr(err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = prevText;
    }
}

async function pgRestore() {
    const btn = document.getElementById('pgRestoreButton');
    const fileInput = document.getElementById('pgRestoreFile');
    const meta = document.getElementById('queryMeta');
    const errBox = document.getElementById('queryError');

    if (errBox) {
        errBox.className = '';
        errBox.style.display = 'none';
        errBox.textContent = '';
    }

    if (!canUseQueryApi()) {
        showErr('Set App server URL above (e.g. http://localhost:3050) or open at http://localhost:3050/recreateFromPgDump.html');
        return;
    }
    if (!fileInput) {
        showErr('Restore file control is missing.');
        return;
    }

    const ok = window.confirm(
        'This recreates the app database from your dump file.\n\n' +
        'If the database already exists, it is renamed first (e.g. poc_backup_YYYYMMDD_HHMMSS), ' +
        'then a new empty database with the same name is created and restored.\n' +
        'The app reconnects to the restored database.\n\nContinue?'
    );
    if (!ok) return;

    fileInput.value = '';
    fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.onchange = null;
        if (!file) return;

        const prevText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Recreating…';
        }
        try {
            const buf = await file.arrayBuffer();
            const res = await fetch(apiUrl('/api/pgrestore'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Confirm-Recreate': 'overwrite',
                    'X-Dump-Filename': file.name
                },
                body: buf
            });
            const data = await readApiJson(res);
            if (!res.ok) {
                showErr(data.detail || data.error || res.statusText);
                return;
            }
            await loadQueryDbTarget();
            if (meta) {
                let msg = 'Database recreated from ' + file.name +
                    ' — app reconnected to ' + (data.database || 'poc') +
                    ' (' + (data.format || 'sql') + ').';
                if (data.previousDatabaseBackup) {
                    msg += ' Previous DB kept as: ' + data.previousDatabaseBackup + '.';
                }
                meta.textContent = msg;
            }
            if (typeof window.refreshStaticData === 'function') {
                window.refreshStaticData();
            }
            if (typeof window.loadStockMap === 'function') {
                window.loadStockMap();
            }
        } catch (err) {
            showErr(err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = prevText || 'Recreate DB from Dump';
            }
        }
    };
    fileInput.click();
}

function selectedImportTable() {
    const el = document.getElementById('queryImportTable');
    return el ? el.value : 'auto';
}

function setImportMeta(msg) {
    const hint = document.getElementById('queryImportHint');
    if (hint && msg) hint.textContent = msg;
}

function translateCsv() {
    const QT = window.QueryTranslator;
    if (!QT) { showErr('queryTranslator.js not loaded'); return; }
    toggleImportSection(true);
    try {
        const tableId = selectedImportTable();
        const result = QT.translateQueryInput(tableId);
        const detected = tableId === 'auto' ? '' : tableId;
        const banner = document.getElementById('queryInput').value.split('\n')[1] || '';
        setImportMeta('Generated INSERT SQL' + (detected ? ' (' + detected + ')' : '') + '. ' + banner.replace(/^-- /, '') + ' Review, then Run Query.');
    } catch (e) {
        showErr(e.message);
    }
}

async function importCsvFile() {
    const QT = window.QueryTranslator;
    if (!QT) { showErr('queryTranslator.js not loaded'); return; }
    toggleImportSection(true);
    try {
        const { filename } = await QT.importCsvFile(selectedImportTable());
        setImportMeta('Loaded ' + filename + ' as INSERT SQL. Review the SQL editor above, then Run Query.');
    } catch (e) {
        showErr(e.message);
    }
}

async function importCsvAndRun() {
    const QT = window.QueryTranslator;
    if (!QT) { showErr('queryTranslator.js not loaded'); return; }
    toggleImportSection(true);
    const text = document.getElementById('queryInput').value.trim();
    try {
        if (QT.looksLikeCsv(text) && !QT.looksLikeSql(text)) {
            QT.translateQueryInput(selectedImportTable());
        } else if (!QT.looksLikeSql(text)) {
            await QT.importCsvFile(selectedImportTable());
        }
        await run();
    } catch (e) {
        showErr(e.message);
    }
}

function initQueryImportTable() {
    const sel = document.getElementById('queryImportTable');
    const QT = window.QueryTranslator;
    if (!sel || !QT || !QT.TABLE_OPTIONS) return;
    sel.innerHTML = QT.TABLE_OPTIONS.map(o =>
        '<option value="' + o.id + '">' + o.label + '</option>'
    ).join('');
}

function toggleImportSection(forceOpen) {
    const section = document.getElementById('queryImportSection');
    const btn = document.getElementById('queryImportToggleBtn');
    if (!section) return;
    const open = forceOpen === true ? true : forceOpen === false ? false : !section.classList.contains('is-open');
    section.classList.toggle('is-open', open);
    section.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (btn) {
        btn.classList.toggle('is-active', open);
        btn.textContent = open ? 'Hide Import Table' : 'Import Table';
    }
}

const RAW_MATERIALS_COST_PREVIEW_SQL = `
SELECT id, "pgNo", item_names, ratepergram, rateperml, rateperpiece,
       based_on_billno, comments, created_at, last_updated_at
FROM public.raw_materials_cost
ORDER BY last_updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
LIMIT 500`;

function renderQueryResultTable(columns, rows, metaText) {
    const meta = document.getElementById('queryMeta');
    const table = document.getElementById('queryResult');
    table.innerHTML = '';
    queryLastResult = null;
    setQueryExportEnabled(false);

    if (!columns.length) {
        if (meta) meta.textContent = metaText || 'Done. No rows to display.';
        return;
    }

    queryLastResult = { columns, rows };
    setQueryExportEnabled(true);

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>' + columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr');
        if (row._dishCostSeparator) tr.className = 'query-dish-cost-sep';
        else if (row.row_kind === 'dish_total') tr.style.fontWeight = '600';
        tr.innerHTML = columns.map(c => '<td>' + esc(row[c] == null ? '' : row[c]) + '</td>').join('');
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    if (meta) meta.textContent = metaText || '';
}

/** Matches Recipe Maker “Show line breakdown” (default on). */
function dishCostShowLinesFromUi() {
    const el = document.getElementById('queryDishCostShowLines');
    if (!el) return true;
    return el.checked;
}

/** Within one dish-cost API result: ingredient/processed lines, then dish_total (portion / dish-out summary). */
function reorderDishCostBlock(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const byDish = new Map();
    const dishOrder = [];
    list.forEach(row => {
        const code = String(row.dish_code || '');
        if (!byDish.has(code)) {
            byDish.set(code, []);
            dishOrder.push(code);
        }
        byDish.get(code).push(row);
    });
    const out = [];
    dishOrder.forEach(code => {
        const group = byDish.get(code) || [];
        const lines = group.filter(r => r.row_kind === 'line');
        const totals = group.filter(r => r.row_kind === 'dish_total');
        const other = group.filter(r => r.row_kind !== 'line' && r.row_kind !== 'dish_total');
        lines.sort((a, b) => {
            const ka = (a.line_kind || '') + '\0' + (a.itemname || '');
            const kb = (b.line_kind || '') + '\0' + (b.itemname || '');
            return ka.localeCompare(kb);
        });
        out.push(...lines, ...other, ...totals);
    });
    return out;
}

function blankDishCostSeparatorRow(columns) {
    const row = { _dishCostSeparator: true };
    columns.forEach(c => { row[c] = ''; });
    return row;
}

function failedDishCostRow(dish, data, columns) {
    const row = {};
    columns.forEach(c => { row[c] = ''; });
    row.row_kind = 'dish_total';
    row.dish_code = dish.dishcode;
    row.dishname = dish.dishname || data.dishname || dish.dishcode;
    row.incomplete = true;
    const errMsg = data.error || data.detail || 'Validation failed';
    if (columns.includes('cost_calculation')) {
        row.cost_calculation = errMsg + (data.failedStep ? ' (at ' + data.failedStep + ')' : '');
    }
    return row;
}

async function calculateAllDishCosts(andExport) {
    const btn = document.getElementById('queryDishCostAllBtn');
    const exportBtn = document.getElementById('queryDishCostExportBtn');
    const errBox = document.getElementById('queryError');
    const meta = document.getElementById('queryMeta');

    if (errBox) {
        errBox.className = '';
        errBox.style.display = 'none';
        errBox.textContent = '';
    }
    if (meta) meta.textContent = '';

    if (!canUseQueryApi()) {
        showErr('Set App server URL above (e.g. http://localhost:3050) or open at http://localhost:3050/recreateFromPgDump.html');
        return;
    }

    const showLines = dishCostShowLinesFromUi();
    const prevText = btn ? btn.textContent : '';
    const prevExportText = exportBtn ? exportBtn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Calculating…';
    }
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Calculating…';
    }
    setQueryExportEnabled(false);
    const t0 = Date.now();

    try {
        const listRes = await fetch(apiUrl('/api/recipes/cost-dish-list'));
        const listData = await readApiJson(listRes);
        if (!listRes.ok) {
            showErr(listData.detail || listData.error || listRes.statusText);
            return;
        }

        const dishes = listData.dishes || [];
        if (!dishes.length) {
            renderQueryResultTable([], [], 'No dishes with saved recipes found.');
            return;
        }

        let columns = [];
        const allRows = [];
        let okCount = 0;
        let failCount = 0;

        renderQueryResultTable([], [], 'Loading dish list… ' + dishes.length + ' to calculate.');

        for (let i = 0; i < dishes.length; i++) {
            const dish = dishes[i];
            const progressMeta = 'Calculating ' + (i + 1) + '/' + dishes.length
                + ': ' + (dish.dishname || dish.dishcode) + '…';

            const params = new URLSearchParams();
            params.set('dishcode', dish.dishcode);
            const res = await fetch(apiUrl('/api/recipes/dish-cost?' + params.toString()));
            const data = await readApiJson(res);

            if (!res.ok) {
                failCount++;
                if (!columns.length) {
                    columns = [
                        'row_kind', 'dish_code', 'dishname', 'dish_case', 'line_kind',
                        'itemname', 'pgNo_or_dishCode', 'dish_cost', 'incomplete', 'cost_calculation'
                    ];
                }
                if (allRows.length) {
                    allRows.push(blankDishCostSeparatorRow(columns));
                }
                allRows.push(failedDishCostRow(dish, data, columns));
                renderQueryResultTable(columns, allRows, progressMeta);
                continue;
            }

            okCount++;
            const query = data.query || {};
            if (!columns.length && query.columns && query.columns.length) {
                columns = query.columns.slice();
            }

            let rows = query.rows || [];
            if (!showLines) {
                rows = rows.filter(r => r.row_kind === 'dish_total');
            } else {
                rows = reorderDishCostBlock(rows);
            }
            if (allRows.length && columns.length) {
                allRows.push(blankDishCostSeparatorRow(columns));
            }
            allRows.push(...rows);
            renderQueryResultTable(columns, allRows, progressMeta);
        }

        const elapsed = Date.now() - t0;
        const dishTotals = allRows.filter(r => r.row_kind === 'dish_total');
        const incompleteN = dishTotals.filter(r =>
            r.incomplete === true || r.incomplete === 't'
        ).length;
        const metaText =
            'Dish cost (all dishes): ' + okCount + ' ok, ' + failCount + ' failed'
            + ' · ' + allRows.length + ' row(s)'
            + (showLines ? ' (with line breakdown)' : ' (totals only)')
            + (incompleteN ? ' · ' + incompleteN + ' incomplete' : '')
            + ' · ' + elapsed + ' ms. Use Export CSV to download.';
        renderQueryResultTable(columns, allRows, metaText);

        if (andExport) {
            exportQueryCsv('dish_cost_all');
        }
    } catch (err) {
        showErr(err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = prevText || 'Calculate cost (all dishes)';
        }
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = prevExportText || 'Calculate & export CSV';
        }
    }
}

async function upsertRawMaterialsCost() {
    const btn = document.getElementById('queryRmcUpsertBtn');
    const errBox = document.getElementById('queryError');
    const meta = document.getElementById('queryMeta');

    if (errBox) {
        errBox.className = '';
        errBox.style.display = 'none';
        errBox.textContent = '';
    }
    if (meta) meta.textContent = '';

    if (!canUseQueryApi()) {
        showErr('Set App server URL above (e.g. http://localhost:3050) or open at http://localhost:3050/recreateFromPgDump.html');
        return;
    }

    const prevText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Upserting…';
    }
    const t0 = Date.now();

    try {
        const res = await fetch(apiUrl('/api/raw-materials-cost/upsert-from-orders'), { method: 'POST' });
        const data = await readApiJson(res);
        if (!res.ok) {
            showErr(data.detail || data.error || res.statusText);
            return;
        }

        const elapsed = Date.now() - t0;
        const { columns = [], rows = [], upserted } = data;
        const editor = document.getElementById('queryInput');
        if (editor) {
            editor.value =
                '-- Upserted raw_materials_cost from order_items + scoop_config\n' +
                '-- Preview: latest last_updated_at first\n' +
                RAW_MATERIALS_COST_PREVIEW_SQL.trim();
        }
        renderQueryResultTable(
            columns,
            rows,
            `Upserted ${upserted != null ? upserted : '?'} row(s); showing ${rows.length} row(s), latest first (${elapsed} ms).`
        );
    } catch (err) {
        showErr(err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = prevText || 'Upsert raw_materials_cost';
        }
    }
}

function initQueryTab() {
    initQueryApiBase();
    initQueryImportTable();
    initQueryBrowseTable();
    setQueryExportEnabled(false);
    loadQueryDbTarget();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQueryTab);
} else {
    initQueryTab();
}

window.Query = {
    run,
    fetchStockMap,
    isServerMode,
    canUseQueryApi,
    getApiBase,
    saveApiBaseFromUi,
    upsertRawMaterialsCost,
    calculateAllDishCosts,
    calculateAllDishCostsAndExport: () => calculateAllDishCosts(true),
    pgDump,
    pgRestore,
    translateCsv,
    importCsvFile,
    importCsvAndRun,
    toggleImportSection,
    showTablesOrderByIdDesc,
    exportCsv: exportQueryCsv,
    currentStock: () => {
        if (!canUseQueryApi()) {
            showErr('Set App server URL above (e.g. http://localhost:3050) or open at http://localhost:3050/recreateFromPgDump.html');
            return;
        }
        document.getElementById("queryInput").value = STOCK_SQL;
        run();
    },
    clear: () => {
        document.getElementById("queryInput").value = "";
        document.getElementById("queryResult").innerHTML = "";
        document.getElementById("queryMeta").textContent = "";
        document.getElementById("queryError").className = "";
        queryLastResult = null;
        setQueryExportEnabled(false);
        const browse = document.getElementById("queryBrowseTable");
        if (browse) browse.value = "";
    }
};