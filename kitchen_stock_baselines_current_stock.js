'use strict';

/**
 * Current-stock panel for kitchen_stock_baselines.html.
 */
const KitchenStockBaselineCurrentStock = (function () {
    let deps = {};
    let lastRows = [];

    const API = '/api/kitchen-stock-baselines-page';

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setPanelVisible(which) {
        const browse = document.getElementById('browseSection');
        const create = document.getElementById('createSection');
        const current = document.getElementById('currentStockSection');
        if (browse) browse.style.display = which === 'browse' ? 'block' : 'none';
        if (create) create.style.display = which === 'create' ? 'block' : 'none';
        if (current) current.style.display = which === 'current' ? 'block' : 'none';
    }

    async function fetchRows() {
        const res = await fetch(deps.url(API + '/current-stock'));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
        return data.rows || [];
    }

    function renderTable(rows) {
        const tbody = document.getElementById('currentStockTbody');
        const meta = document.getElementById('currentStockMeta');
        if (!tbody) return;
        lastRows = rows || [];
        if (meta) {
            meta.textContent = lastRows.length
                ? `${lastRows.length} item(s) — system stock from current_stock_by_pgno`
                : '';
        }
        if (!lastRows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="hint">No rows.</td></tr>';
            return;
        }
        tbody.innerHTML = lastRows
            .map(
                (r) =>
                    '<tr>' +
                    '<td>' +
                    escapeHtml(r.pgno) +
                    '</td>' +
                    '<td>' +
                    escapeHtml(r.itemnames || '') +
                    '</td>' +
                    '<td>' +
                    escapeHtml(r.destination_unit || '') +
                    '</td>' +
                    '<td class="num">' +
                    escapeHtml(r.qty || '') +
                    '</td>' +
                    '<td>' +
                    escapeHtml(r.qty_in_packaging || '') +
                    '</td>' +
                    '<td>' +
                    escapeHtml(r.active_baseline_date || '') +
                    '</td>' +
                    '</tr>'
            )
            .join('');
    }

    async function showCurrentStock() {
        deps.showErr('');
        const btn = document.getElementById('showCurrentStockBtn');
        if (btn) btn.disabled = true;
        try {
            const rows = await fetchRows();
            renderTable(rows);
            setPanelVisible('current');
        } catch (e) {
            deps.showErr(e.message || String(e));
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function closeCurrentStock() {
        setPanelVisible('browse');
    }

    function csvEscape(v) {
        const s = v == null ? '' : String(v);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    function rowsToCsv(rows) {
        const cols = [
            'pgno',
            'itemnames',
            'destination_unit',
            'qty',
            'qty_in_packaging',
            'qty_gm',
            'qty_ml',
            'qty_piece',
            'active_baseline_date'
        ];
        const lines = [cols.join(',')];
        for (const r of rows) {
            lines.push(cols.map((c) => csvEscape(r[c])).join(','));
        }
        return '\uFEFF' + lines.join('\n');
    }

    function triggerDownload(csvText) {
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = URL.createObjectURL(blob);
        a.download = 'kitchen_current_stock_' + stamp + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function downloadCurrentStock() {
        deps.showErr('');
        const btn = document.getElementById('downloadCurrentStockBtn');
        if (btn) btn.disabled = true;
        try {
            let rows = lastRows;
            const panel = document.getElementById('currentStockSection');
            if (!panel || panel.style.display === 'none' || !rows.length) {
                rows = await fetchRows();
            }
            if (!rows.length) {
                deps.showErr('No current stock rows to export.');
                return;
            }
            triggerDownload(rowsToCsv(rows));
        } catch (e) {
            deps.showErr(e.message || String(e));
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function init(depsIn) {
        deps = depsIn || {};
    }

    return { init, showCurrentStock, closeCurrentStock, downloadCurrentStock };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.KitchenStockBaselineCurrentStock = KitchenStockBaselineCurrentStock;
}