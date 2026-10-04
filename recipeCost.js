// recipeCost.js — Recipe Maker cost section (server-backed dish_cost_cases.sql)
const RecipeCost = (function () {
    let lastResult = null;

    function isServerMode() {
        return location.protocol === 'http:' || location.protocol === 'https:';
    }

    function esc(v) {
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showErr(msg) {
        const errBox = document.getElementById('recipeCostError');
        if (!errBox) return;
        errBox.className = 'is-err';
        errBox.style.display = 'block';
        errBox.textContent = msg;
    }

    function clearErr() {
        const errBox = document.getElementById('recipeCostError');
        if (!errBox) return;
        errBox.className = '';
        errBox.style.display = 'none';
        errBox.textContent = '';
    }

    function clearWarn() {
        const box = document.getElementById('recipeCostWarn');
        if (!box) return;
        box.className = '';
        box.style.display = 'none';
        box.innerHTML = '';
    }

    function showUnpricedWarning(items) {
        const box = document.getElementById('recipeCostWarn');
        if (!box) return;
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
            clearWarn();
            return;
        }
        const lines = list.map(item => {
            const who = [
                item.itemName || '?',
                item.itemId ? 'pgNo ' + item.itemId : '',
                item.dishCode && item.dishCode !== (document.getElementById('recipeDishCode')?.value || '').trim().toUpperCase()
                    ? '(on ' + item.dishCode + ')' : ''
            ].filter(Boolean).join(' ');
            const detail = item.reason ? ' — ' + item.reason : '';
            return '<li><strong>' + esc(who) + '</strong>' + esc(detail) + '</li>';
        }).join('');
        box.className = 'is-warn';
        box.style.display = 'block';
        box.innerHTML =
            '<div><strong>Partial cost</strong> — these lines were excluded (priced subtotal uses all other lines):</div>'
            + '<ul>' + lines + '</ul>';
    }

    function renderSteps(steps) {
        const box = document.getElementById('recipeCostSteps');
        if (!box) return;
        const list = Array.isArray(steps) ? steps : [];
        if (!list.length) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }
        box.style.display = 'block';
        box.innerHTML = '<div style="font-weight:600; margin-bottom:4px;">Calculation so far</div><ol style="margin:0; padding-left:1.2em;">'
            + list.map(step => (
                '<li><strong>' + esc(step.action || '') + '</strong>'
                + (step.detail ? ' — ' + esc(step.detail) : '')
                + '</li>'
            )).join('')
            + '</ol>';
    }

    function formatFailedData(data) {
        if (!data || typeof data !== 'object') return '';
        const lines = Object.keys(data).map(key => {
            const value = data[key];
            const shown = value != null && typeof value === 'object'
                ? JSON.stringify(value)
                : (value == null ? '' : String(value));
            return key + ': ' + shown;
        });
        return lines.join('\n');
    }

    function currentDish() {
        const dishcode = (document.getElementById('recipeDishCode')?.value || '').trim();
        const dishname = (document.getElementById('recipeDishName')?.value || '').trim();
        return { dishcode, dishname };
    }

    function showLineBreakdown() {
        const el = document.getElementById('recipeCostShowLines');
        return !el || el.checked;
    }

    function formatCell(column, value) {
        if (value == null || value === '') return '';
        if (column === 'incomplete') return value === true || value === 't' ? 'yes' : 'no';
        if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
        const s = String(value);
        if (/^-?\d+\.\d+$/.test(s)) return Number(s).toFixed(4);
        return s;
    }

    function filterRowsForDisplay(rows, dishcode) {
        const code = (dishcode || '').trim().toUpperCase();
        let list = rows.slice();
        if (code) {
            list = list.filter(row => String(row.dish_code || '').toUpperCase() === code);
        }
        if (!showLineBreakdown()) {
            list = list.filter(row => row.row_kind === 'dish_total');
        }
        return list;
    }

    function renderTable(columns, rows) {
        const table = document.getElementById('recipeCostResult');
        if (!table) return;
        table.innerHTML = '';
        if (!columns.length) return;

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr>' + columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach(row => {
            const tr = document.createElement('tr');
            if (row.row_kind === 'dish_total') tr.style.fontWeight = '600';
            tr.innerHTML = columns.map(c => '<td>' + esc(formatCell(c, row[c])) + '</td>').join('');
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
    }

    async function readApiJson(res) {
        const text = await res.text();
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error('Server returned invalid JSON.');
        }
    }

    function formatMoney(value) {
        if (value == null || value === '') return '—';
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(4) : String(value);
    }

    function clear() {
        clearErr();
        clearWarn();
        renderSteps([]);
        lastResult = null;
        const meta = document.getElementById('recipeCostMeta');
        if (meta) meta.textContent = '';
        renderTable([], []);
        const btn = document.getElementById('recipeCostRunBtn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Calculate cost';
        }
    }

    async function calculate() {
        clearErr();
        clearWarn();
        renderSteps([]);
        lastResult = null;
        const meta = document.getElementById('recipeCostMeta');
        const btn = document.getElementById('recipeCostRunBtn');
        const { dishcode, dishname } = currentDish();

        if (!dishcode && !dishname) {
            showErr('Select a dish name (and dish code) in Recipe Maker first.');
            return;
        }
        if (!isServerMode()) {
            showErr('Cost calculation requires the app server (http://localhost:3050), not a local HTML file.');
            return;
        }

        const params = new URLSearchParams();
        if (dishcode) params.set('dishcode', dishcode);
        else params.set('dishname', dishname);

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Calculating…';
        }
        if (meta) meta.textContent = '';
        renderSteps([]);
        renderTable([], []);

        const t0 = Date.now();
        try {
            const res = await fetch('/api/recipes/dish-cost?' + params.toString());
            const data = await readApiJson(res);
            renderSteps(data.doneSoFar);
            if (!res.ok) {
                const failed = data.failedStep ? 'Failed at: ' + data.failedStep + '\n' : '';
                const detail = formatFailedData(data.data);
                showErr(
                    (data.error || data.detail || res.statusText)
                    + (failed || detail ? '\n\n' + failed + detail : '')
                );
                return;
            }

            const query = data.query || {};
            const columns = query.columns || [];
            const allRows = query.rows || [];
            const displayRows = filterRowsForDisplay(allRows, data.dishcode || dishcode);
            lastResult = { columns, rows: displayRows, allRows };
            renderTable(columns, displayRows);
            showUnpricedWarning(data.unpricedItems);

            const elapsed = Date.now() - t0;
            const unpricedN = (data.unpricedItems || []).length;
            const rateBit = data.ratePerDestinationUnit != null
                ? ' · Rate per ' + (data.destinationUnit || 'unit') + ': ' + formatMoney(data.ratePerDestinationUnit)
                : ' · Batch cost only (no per-unit rate yet)';
            const incompleteBit = data.incomplete
                ? (unpricedN
                    ? ' · Incomplete (' + unpricedN + ' line(s) without rates)'
                    : ' · Incomplete (missing rates on one or more lines)')
                : '';
            if (meta) {
                meta.textContent =
                    displayRows.length + ' row(s) shown, ' + allRows.length + ' from SQL in ' + elapsed + 'ms'
                    + ' · ' + (data.dishname || '') + ' (' + (data.dishcode || '') + ')'
                    + ' · Dish cost: ' + formatMoney(data.dishCost)
                    + rateBit
                    + incompleteBit;
            }
        } catch (err) {
            showErr(err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Calculate cost';
            }
        }
    }

    function init() {
        const showLines = document.getElementById('recipeCostShowLines');
        if (showLines) {
            showLines.addEventListener('change', () => {
                if (!lastResult) return;
                const { dishcode } = currentDish();
                const displayRows = filterRowsForDisplay(lastResult.allRows || lastResult.rows, dishcode);
                renderTable(lastResult.columns, displayRows);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        calculate,
        clear,
        currentDish
    };
})();

window.RecipeCost = RecipeCost;
