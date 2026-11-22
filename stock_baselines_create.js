/* global StockQtyDisplay */
'use strict';

/**
 * Create-new-baseline UI for stock_baselines.html (depends on StockQtyDisplay + page API).
 */
const StockBaselineCreate = (function () {
    let deps = {};
    let groups = [];
    let unitFactorIndex = new Map();
    let packagingByPg = {};
    /** @type {Record<string, { scoopUsed?: string }>} */
    let defaultScoopsByPg = {};
    /** @type {Record<string, { qty_at_override?: string, qty_at_override_in_packaging?: string }>} */
    let systemStockByPg = {};

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function jsonToUnitIndex(json) {
        const byPg = new Map();
        for (const pg of Object.keys(json || {})) {
            const um = new Map();
            for (const [unit, meta] of Object.entries(json[pg])) {
                um.set(unit, meta);
            }
            byPg.set(pg, um);
        }
        return byPg;
    }

    /**
     * Default scoop unit for a pgNo (from API / raw_materials_default_scoop). May change server-side.
     * @param {string} pgNo
     * @returns {string}
     */
    function getDefaultScoopForPgNo(pgNo) {
        const pg = String(pgNo || '').trim();
        const row = defaultScoopsByPg[pg];
        return row && row.scoopUsed ? String(row.scoopUsed) : '';
    }

    /**
     * All scoopUsed choices for one row's pgNo + destination unit, highest factor first.
     * @param {{ pgno: string, destination_unit?: string }} group
     * @returns {{ scoopUsed: string, factor: number }[]}
     */
    function scoopUsedOptionsForGroup(group) {
        const pg = String(group.pgno || '').trim();
        const dest = String(group.destination_unit || 'gm')
            .trim()
            .toLowerCase();
        const um = unitFactorIndex.get(pg);
        if (!um) return [];
        const opts = [];
        for (const [scoopUsed, meta] of um.entries()) {
            const metaDest = String(meta.dest || '')
                .trim()
                .toLowerCase();
            if (metaDest && metaDest !== dest) continue;
            const factor = Number(meta.factor);
            if (!Number.isFinite(factor)) continue;
            opts.push({ scoopUsed, factor });
        }
        opts.sort((a, b) => b.factor - a.factor || a.scoopUsed.localeCompare(b.scoopUsed));
        return opts;
    }

    function renderScoopUsedSelect(gi, li, line, group) {
        const selected = String(line.scoopUsed ?? '').trim();
        const opts = scoopUsedOptionsForGroup(group);
        let html =
            '<select class="line-scoop-used" data-gi="' +
            gi +
            '" data-li="' +
            li +
            '">';
        if (!opts.length) {
            html += '<option value="">—</option>';
        } else {
            let hasSelected = false;
            for (const o of opts) {
                const sel = selected === o.scoopUsed;
                if (sel) hasSelected = true;
                html +=
                    '<option value="' +
                    escapeHtml(o.scoopUsed) +
                    '"' +
                    (sel ? ' selected' : '') +
                    '>' +
                    escapeHtml(o.scoopUsed) +
                    '</option>';
            }
            if (selected && !hasSelected) {
                html +=
                    '<option value="' +
                    escapeHtml(selected) +
                    '" selected>' +
                    escapeHtml(selected) +
                    '</option>';
            }
            if (!selected && !hasSelected) {
                const def = getDefaultScoopForPgNo(group.pgno);
                const pick = def || opts[0].scoopUsed;
                line.scoopUsed = pick;
            }
        }
        html += '</select>';
        return html;
    }

    function applyDefaultScoopUsedToGroups() {
        for (const g of groups) {
            const def = getDefaultScoopForPgNo(g.pgno);
            if (!def) continue;
            for (const line of g.lines) {
                if (!String(line.scoopUsed ?? '').trim()) line.scoopUsed = def;
            }
        }
    }

    function applySystemStockToGroups() {
        for (const g of groups) {
            const pg = String(g.pgno || '').trim();
            const st = systemStockByPg[pg];
            if (!st) continue;
            g.qty_at_override = st.qty_at_override || '';
            g.qty_at_override_in_packaging = st.qty_at_override_in_packaging || '';
        }
    }

    async function fetchMeta(pgList) {
        const q = new URLSearchParams({ pgnos: pgList.join(',') });
        const res = await fetch(deps.url('/api/stock-baselines-page/unit-factors?' + q));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
        unitFactorIndex = jsonToUnitIndex(data.unitFactors);
        packagingByPg = data.packaging || {};
        defaultScoopsByPg = data.defaultScoops || {};
        systemStockByPg = data.systemStock || {};
        applyDefaultScoopUsedToGroups();
        applySystemStockToGroups();
    }

    function computeGroupQty(group) {
        const D = StockQtyDisplay;
        const pg = group.pgno;
        const dest = group.destination_unit || 'gm';
        const totals = D.accumulateLinesToBaselineQty(group.lines, pg, dest, unitFactorIndex);
        if (totals.error) return { error: totals.error, qty_in_destination_unit: '' };
        const packList = packagingByPg[pg] || [];
        const packagingIndex = new Map([[pg, packList]]);
        const enriched = D.enrichQtyFields(
            { gm: totals.qty_gm, ml: totals.qty_ml, piece: totals.qty_piece, destinationUnit: dest, pgno: pg },
            packagingIndex
        );
        return {
            qty_in_destination_unit: enriched.qty,
            totals
        };
    }

    function syncSortButtons() {
        const mode = deps.getSortBy ? String(deps.getSortBy()).toLowerCase() : 'storage';
        const storageBtn = document.getElementById('createSortStorageBtn');
        const pgnoBtn = document.getElementById('createSortPgnoBtn');
        if (!storageBtn || !pgnoBtn) return;
        const byStorage = mode !== 'pgno';
        storageBtn.classList.toggle('toggle-active', byStorage);
        pgnoBtn.classList.toggle('toggle-active', !byStorage);
        storageBtn.classList.toggle('primary', byStorage);
        pgnoBtn.classList.toggle('primary', !byStorage);
    }

    function setSort(mode) {
        if (deps.setSortPreference) {
            deps.setSortPreference(mode);
        }
        sortGroupsLikeBrowse();
        renderTable();
        syncSortButtons();
    }

    function sortGroupsLikeBrowse() {
        const D = globalThis.StockQtyDisplay;
        if (!D || typeof D.enhancedOrderByCompare !== 'function') return;
        const mode = deps.getSortBy ? String(deps.getSortBy()).toLowerCase() : 'storage';
        if (mode === 'pgno') {
            groups.sort((a, b) => D.enhancedOrderByCompare(a.pgno, b.pgno));
            return;
        }
        groups.sort((a, b) => {
            const c = D.enhancedOrderByCompare(a.storage, b.storage);
            if (c !== 0) return c;
            return D.enhancedOrderByCompare(a.pgno, b.pgno);
        });
    }

    function prepopulateFromRows(rows) {
        groups = (rows || []).map((r) => ({
            storage: r.storage || '',
            pgno: r.pgno,
            itemnames: r.itemnames || '',
            destination_unit: r.destination_unit || 'gm',
            qty_at_override_in_packaging: '',
            qty_at_override: '',
            lines: [{ qty: '', scoopUsed: '' }]
        }));
        sortGroupsLikeBrowse();
    }

    function renderTable() {
        const tbody = document.getElementById('createTbody');
        if (!tbody) return;
        if (!groups.length) {
            tbody.innerHTML =
                '<tr><td colspan="8" class="hint">No rows — open Create new baseline to load the catalog.</td></tr>';
            return;
        }
        let html = '';
        groups.forEach((g, gi) => {
            const comp = computeGroupQty(g);
            const destQty = comp.error
                ? escapeHtml(comp.error)
                : escapeHtml(comp.qty_in_destination_unit || '');
            const lineCount = g.lines.length;
            g.lines.forEach((line, li) => {
                const isFirst = li === 0;
                html += '<tr data-gi="' + gi + '" data-li="' + li + '">';
                if (isFirst) {
                    html +=
                        '<td rowspan="' +
                        lineCount +
                        '">' +
                        escapeHtml(g.storage) +
                        '</td>' +
                        '<td rowspan="' +
                        lineCount +
                        '">' +
                        escapeHtml(g.pgno) +
                        '</td>' +
                        '<td rowspan="' +
                        lineCount +
                        '">' +
                        escapeHtml(g.itemnames) +
                        '</td>';
                }
                html +=
                    '<td class="num"><input type="text" class="line-qty" data-gi="' +
                    gi +
                    '" data-li="' +
                    li +
                    '" value="' +
                    escapeHtml(line.qty ?? '') +
                    '" placeholder="2" /></td>';
                html += '<td>' + renderScoopUsedSelect(gi, li, line, g) + '</td>';
                if (isFirst) {
                    html +=
                        '<td rowspan="' +
                        lineCount +
                        '" class="dest-qty" data-gi="' +
                        gi +
                        '">' +
                        destQty +
                        '</td>' +
                        '<td rowspan="' +
                        lineCount +
                        '">' +
                        escapeHtml(g.qty_at_override_in_packaging) +
                        '</td>' +
                        '<td rowspan="' +
                        lineCount +
                        '">' +
                        escapeHtml(g.qty_at_override) +
                        '</td>' +
                        '<td rowspan="' +
                        lineCount +
                        '">' +
                        '<button type="button" class="mini" data-add-line="' +
                        gi +
                        '">+ line</button>' +
                        '</td>';
                }
                html += '</tr>';
            });
        });
        tbody.innerHTML = html;
    }

    function onTableInput(ev) {
        const t = ev.target;
        if (!t || (!t.classList.contains('line-qty') && !t.classList.contains('line-scoop-used'))) return;
        const gi = Number(t.dataset.gi);
        const li = Number(t.dataset.li);
        if (!groups[gi] || !groups[gi].lines[li]) return;
        if (t.classList.contains('line-qty')) groups[gi].lines[li].qty = t.value;
        else groups[gi].lines[li].scoopUsed = t.value;
        const comp = computeGroupQty(groups[gi]);
        const cell = document.querySelector('td.dest-qty[data-gi="' + gi + '"]');
        if (cell) {
            cell.textContent = comp.error || comp.qty_in_destination_unit || '';
        }
    }

    function onTableClick(ev) {
        const btn = ev.target.closest('[data-add-line]');
        if (!btn) return;
        const gi = Number(btn.dataset.addLine);
        if (!groups[gi]) return;
        const def = getDefaultScoopForPgNo(groups[gi].pgno);
        groups[gi].lines.push({ qty: '', scoopUsed: def });
        renderTable();
    }

    async function openCreate() {
        deps.showErr('');
        const sortBy = deps.getSortBy ? String(deps.getSortBy()).toLowerCase() : 'storage';
        const browse = document.getElementById('browseSection');
        const create = document.getElementById('createSection');
        const current = document.getElementById('currentStockSection');
        if (browse) browse.style.display = 'none';
        if (current) current.style.display = 'none';
        if (create) create.style.display = 'block';
        const tbody = document.getElementById('createTbody');
        if (tbody) {
            tbody.innerHTML =
                '<tr><td colspan="8" class="hint">Loading catalog…</td></tr>';
        }
        try {
            const q = new URLSearchParams({ sortBy: sortBy === 'pgno' ? 'pgno' : 'storage' });
            const res = await fetch(deps.url('/api/stock-baselines-page/current-stock?' + q));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
            prepopulateFromRows(data.rows || []);
            if (!groups.length) {
                deps.showErr('No catalog rows found (raw_materials_destination_unit).');
                if (create) create.style.display = 'none';
                if (browse) browse.style.display = 'block';
                return;
            }
            const pgList = [...new Set(groups.map((g) => g.pgno))];
            await fetchMeta(pgList);
        } catch (e) {
            deps.showErr(e.message || String(e));
            if (create) create.style.display = 'none';
            if (browse) browse.style.display = 'block';
            return;
        }
        const dateEl = document.getElementById('createBaselineDate');
        const mainDate = document.getElementById('baselineDate');
        if (dateEl && mainDate && mainDate.value) dateEl.value = mainDate.value;
        syncSortButtons();
        renderTable();
    }

    function closeCreate() {
        const browse = document.getElementById('browseSection');
        const create = document.getElementById('createSection');
        if (browse) browse.style.display = 'block';
        if (create) create.style.display = 'none';
    }

    async function saveBatch() {
        const dateEl = document.getElementById('createBaselineDate');
        const verifierEl = document.getElementById('createVerifier');
        const baseline_date = dateEl && dateEl.value;
        const verified_by = verifierEl && verifierEl.value;
        if (!baseline_date) {
            deps.showErr('Baseline date is required.');
            return;
        }
        const rows = [];
        for (const g of groups) {
            const nonempty = g.lines.filter(
                (l) => String(l.qty ?? '').trim() && String(l.scoopUsed ?? '').trim()
            );
            if (!nonempty.length) continue;
            rows.push({ pgno: g.pgno, lines: nonempty });
        }
        if (!rows.length) {
            deps.showErr('Enter at least one qty + scoopUsed line.');
            return;
        }
        const btn = document.getElementById('saveCreateBtn');
        if (btn) btn.disabled = true;
        try {
            const res = await fetch(deps.url('/api/stock-baselines-page/create-batch'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseline_date, verified_by, rows })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
            if (data.failed && data.failed.length) {
                deps.showFailurePopup(
                    data.failed.map((f) => ({ id: f.pgno, error: f.error })),
                    data.createdCount || 0
                );
            }
            if (data.createdCount > 0) {
                closeCreate();
                if (deps.onSaved) await deps.onSaved(baseline_date);
            }
        } catch (e) {
            deps.showErr(e.message || String(e));
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function init(depsIn) {
        deps = depsIn || {};
        const tbody = document.getElementById('createTbody');
        if (tbody) {
            tbody.addEventListener('input', onTableInput);
            tbody.addEventListener('change', onTableInput);
            tbody.addEventListener('click', onTableClick);
        }
    }

    return { init, openCreate, closeCreate, saveBatch, setSort, syncSortButtons, getDefaultScoopForPgNo };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.StockBaselineCreate = StockBaselineCreate;
}