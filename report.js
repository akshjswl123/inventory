// report.js
function isServerMode() {
    return location.protocol === 'http:' || location.protocol === 'https:';
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
    if (!sql) { showErr('Please enter a SQL query.'); return; }
    if (!isServerMode()) { showErr('Query requires the app server. Use http://localhost:3050 instead of opening the HTML file directly.'); return; }

    btn.disabled = true; btn.textContent = 'Running...';
    const t0 = Date.now();

    try {
        const res = await fetch('/api/query', {
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

async function pgDump() {
    const btn = document.getElementById('pgDumpButton');
    const meta = document.getElementById('queryMeta');
    const errBox = document.getElementById('queryError');

    errBox.className = '';
    errBox.style.display = 'none';
    errBox.textContent = '';

    if (!isServerMode()) {
        showErr('PG Dump requires the app server. Use http://localhost:3050 instead of opening the HTML file directly.');
        return;
    }

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = 'Dumping...';

    try {
        const res = await fetch('/api/pgdump');
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQueryImportTable);
} else {
    initQueryImportTable();
}

window.Query = {
    run,
    fetchStockMap,
    isServerMode,
    pgDump,
    translateCsv,
    importCsvFile,
    importCsvAndRun,
    toggleImportSection,
    currentStock: () => {
        if (!isServerMode()) {
            showErr('Current stock requires the app server. Use http://localhost:3050 instead of opening the HTML file directly.');
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
    }
};