/* Raw Material Estimator tab */
(function (global) {
  'use strict';

  const API = '/api/raw-material-estimator';
  const DISH_LIST_API = '/api/recipes/cost-dish-list';
  const SAMPLE_CSV_URL =
    '/data/Item_Report_With_CustomerOrder_Details_2026_10_10_15_03_36_Report.csv';

  let dishList = [];
  let lastEstimateResult = null;
  let perDishBreakdownVisible = false;

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setMsg(text, kind) {
    const el = document.getElementById('rmeMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = kind || '';
  }

  function setExportEnabled(on) {
    const btn = document.getElementById('rmeExportBtn');
    if (!btn) return;
    btn.disabled = !on;
    btn.title = on ? 'Download all result CSVs in a ZIP (includes inputs)' : 'Run estimate first';
  }

  function setPerDishBreakdownVisible(visible) {
    perDishBreakdownVisible = !!visible;
    const wrap = document.getElementById('rmePerDishWrap');
    const btn = document.getElementById('rmeTogglePerDishBtn');
    if (wrap) wrap.hidden = !perDishBreakdownVisible;
    if (btn) {
      btn.setAttribute('aria-expanded', perDishBreakdownVisible ? 'true' : 'false');
      btn.textContent = perDishBreakdownVisible ? 'Hide per-dish breakdown' : 'Show per-dish breakdown';
    }
  }

  function clearEstimateResultsUi() {
    const host = document.getElementById('rmeDishSections');
    if (host) host.innerHTML = '';
    ['rmeGrandDirectBody', 'rmeGrandProcessedBody', 'rmeGrandAllBody'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    const grandWrap = document.getElementById('rmeGrandTotalsWrap');
    const toolbar = document.getElementById('rmePerDishToolbar');
    if (grandWrap) grandWrap.hidden = true;
    if (toolbar) toolbar.hidden = true;
    setPerDishBreakdownVisible(false);
  }

  function formatQty(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return String(Math.round(x * 10000) / 10000);
  }

  function readLinesFromDom() {
    const out = [];
    document.querySelectorAll('#rmeBody tr').forEach(tr => {
      const name = tr.querySelector('.rme-name')?.value.trim() || '';
      const qty = tr.querySelector('.rme-qty')?.value.trim() || '';
      const n = Number(qty);
      if (!name && !qty) return;
      out.push({ dishname: name, qty: n });
    });
    return out;
  }

  function addRow(data) {
    data = data || {};
    const tbody = document.getElementById('rmeBody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" class="rme-name" list="rmeDishList" placeholder="Dish name" value="' + escHtml(data.dishname || '') + '" /></td>' +
      '<td class="num"><input type="number" class="rme-qty" min="0" step="any" placeholder="Qty" value="' + escHtml(data.qty != null ? data.qty : '') + '" /></td>' +
      '<td style="text-align:center"><button type="button" class="danger rme-remove">&times;</button></td>';
    tbody.appendChild(tr);
    tr.querySelector('.rme-remove').addEventListener('click', () => tr.remove());
  }

  function clearRows() {
    const tbody = document.getElementById('rmeBody');
    if (tbody) tbody.innerHTML = '';
  }

  function loadRows(lines) {
    clearRows();
    (lines || []).forEach(l => addRow(l));
    if (!document.querySelectorAll('#rmeBody tr').length) addRow();
  }

  async function loadDishList() {
    try {
      const res = await fetch(DISH_LIST_API);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      dishList = data.dishes || [];
      const dl = document.getElementById('rmeDishList');
      if (dl) {
        dl.innerHTML = '';
        dishList.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.dishname;
          dl.appendChild(opt);
        });
      }
    } catch (e) {
      setMsg('Could not load dish list: ' + e.message, 'warn');
    }
  }

  function renderQtyTable(tbodyId, rows, columns) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    (rows || []).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = columns.map(c => {
        const cls = c.num ? ' class="num"' : '';
        const val = c.render ? c.render(r) : r[c.key];
        return '<td' + cls + '>' + escHtml(val) + '</td>';
      }).join('');
      tbody.appendChild(tr);
    });
  }

  function renderNotFound(notFound) {
    const wrap = document.getElementById('rmeNotFoundWrap');
    const tbody = document.getElementById('rmeNotFoundBody');
    if (!wrap || !tbody) return;
    tbody.innerHTML = '';
    if (!notFound || !notFound.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    notFound.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escHtml(r.dishname || r.dishcode || '') + '</td>' +
        '<td class="num">' + escHtml(formatQty(r.qty)) + '</td>';
      tbody.appendChild(tr);
    });
  }

  function renderDishSections(data) {
    const host = document.getElementById('rmeDishSections');
    if (!host) return;
    host.innerHTML = '';
    (data.dishes || []).forEach(d => {
      const block = document.createElement('div');
      block.className = 'item-details-section';
      block.innerHTML =
        '<h3>' + escHtml(d.dishname) + ' <span style="font-weight:normal;color:#666;">(' + escHtml(d.dishcode) + ') × ' + escHtml(formatQty(d.orderQty)) + '</span></h3>' +
        '<p class="hint" style="margin:0 0 8px;"><strong>1.</strong> Direct raw materials</p>' +
        '<table><thead><tr><th>Item</th><th>pgNo</th><th>Unit</th><th class="num">Qty</th></tr></thead><tbody class="rme-direct"></tbody></table>' +
        '<p class="hint" style="margin:12px 0 8px;"><strong>2.</strong> Processed items</p>' +
        '<table><thead><tr><th>Item</th><th>Code</th><th>Unit</th><th class="num">Qty</th></tr></thead><tbody class="rme-proc"></tbody></table>' +
        '<p class="hint" style="margin:12px 0 8px;"><strong>3.</strong> All raw materials (incl. processed expanded)</p>' +
        '<table><thead><tr><th>Item</th><th>pgNo</th><th>Unit</th><th class="num">Qty</th></tr></thead><tbody class="rme-all"></tbody></table>';
      host.appendChild(block);

      const directBody = block.querySelector('.rme-direct');
      (d.directRaw || []).forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escHtml(r.itemName) + '</td><td>' + escHtml(r.pgNo) + '</td><td>' + escHtml(r.unit) + '</td><td class="num">' + escHtml(formatQty(r.qty)) + '</td>';
        directBody.appendChild(tr);
      });
      const procBody = block.querySelector('.rme-proc');
      (d.processed || []).forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escHtml(r.itemName) + '</td><td>' + escHtml(r.dishcode) + '</td><td>' + escHtml(r.unit) + '</td><td class="num">' + escHtml(formatQty(r.qty)) + '</td>';
        procBody.appendChild(tr);
      });
      const allBody = block.querySelector('.rme-all');
      (d.allRaw || []).forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + escHtml(r.itemName) + '</td><td>' + escHtml(r.pgNo) + '</td><td>' + escHtml(r.unit) + '</td><td class="num">' + escHtml(formatQty(r.qty)) + '</td>';
        allBody.appendChild(tr);
      });
    });

    const gt = data.grandTotals || {};
    renderQtyTable('rmeGrandDirectBody', gt.directRaw, [
      { key: 'itemName' }, { key: 'pgNo' }, { key: 'unit' }, { key: 'qty', num: true, render: r => formatQty(r.qty) }
    ]);
    renderQtyTable('rmeGrandProcessedBody', gt.processed, [
      { key: 'itemName' }, { key: 'dishcode' }, { key: 'unit' }, { key: 'qty', num: true, render: r => formatQty(r.qty) }
    ]);
    renderQtyTable('rmeGrandAllBody', gt.allRaw, [
      { key: 'itemName' }, { key: 'pgNo' }, { key: 'unit' }, { key: 'qty', num: true, render: r => formatQty(r.qty) }
    ]);

    const grandWrap = document.getElementById('rmeGrandTotalsWrap');
    const toolbar = document.getElementById('rmePerDishToolbar');
    const hasDishes = (data.dishes || []).length > 0;
    if (grandWrap) grandWrap.hidden = !hasDishes;
    if (toolbar) toolbar.hidden = !hasDishes;
    setPerDishBreakdownVisible(false);
  }

  function renderWarnings(warnings) {
    const wrap = document.getElementById('rmeWarningsWrap');
    const ul = document.getElementById('rmeWarningsList');
    if (!wrap || !ul) return;
    ul.innerHTML = '';
    if (!warnings || !warnings.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    warnings.forEach(w => {
      const li = document.createElement('li');
      li.textContent = w;
      ul.appendChild(li);
    });
  }

  async function calculate() {
    const lines = readLinesFromDom().filter(l => l.dishname && Number.isFinite(l.qty) && l.qty > 0);
    if (!lines.length) {
      setMsg('Add at least one dish with a positive quantity.', 'err');
      return;
    }
    setMsg('Calculating…', 'hint');
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      lastEstimateResult = data;
      setExportEnabled(true);
      renderNotFound(data.notFound);
      renderDishSections(data);
      renderWarnings(data.warnings);
      const nf = (data.notFound || []).length;
      setMsg(
        'Estimated ' + (data.dishes || []).length + ' dish(es)'
        + (nf ? '; ' + nf + ' not found' : '') + '.',
        nf ? 'warn' : 'ok'
      );
      return data;
    } catch (e) {
      setMsg(e.message, 'err');
      return null;
    }
  }

  async function exportZip() {
    if (!global.RawMaterialEstimatorCsv || !global.RawMaterialEstimatorCsv.downloadEstimateZip) {
      setMsg('rawMaterialEstimatorCsv.js is not loaded.', 'err');
      return;
    }
    let data = lastEstimateResult;
    if (!data) {
      data = await calculate();
      if (!data) return;
    }
    const inputLines = readLinesFromDom().filter(l => l.dishname && Number.isFinite(l.qty) && l.qty > 0);
    setMsg('Building ZIP…', 'hint');
    try {
      const { fileCount } = await global.RawMaterialEstimatorCsv.downloadEstimateZip(data, inputLines);
      setMsg('Exported ' + fileCount + ' CSV file(s) in ZIP.', 'ok');
    } catch (e) {
      setMsg(e.message, 'err');
    }
  }

  async function importCsvText(text, label) {
    if (!global.RawMaterialEstimatorCsv) {
      setMsg('rawMaterialEstimatorCsv.js is not loaded.', 'err');
      return;
    }
    const parsed = global.RawMaterialEstimatorCsv.parseEstimatorCsv(text);
    if (!parsed.ok || !parsed.lines.length) {
      setMsg(parsed.message || 'No dish/qty rows found in CSV', 'err');
      return;
    }
    loadRows(parsed.lines);
    const parts = ['Loaded ' + parsed.lines.length + ' dish line(s) from ' + (label || 'CSV')];
    if (parsed.source) parts.push('(' + parsed.source + ')');
    if (parsed.failed && parsed.failed.length) parts.push(parsed.failed.length + ' row(s) skipped');
    setMsg(parts.join(' '), parsed.failed && parsed.failed.length ? 'warn' : 'ok');
    lastEstimateResult = null;
    setExportEnabled(false);
    clearEstimateResultsUi();
    renderNotFound([]);
  }

  function bindUi() {
    const fileInput = document.getElementById('rmeFile');
    const importBtn = document.getElementById('rmeImportBtn');
    const sampleBtn = document.getElementById('rmeSampleBtn');
    const calcBtn = document.getElementById('rmeCalculateBtn');
    const exportBtn = document.getElementById('rmeExportBtn');
    const perDishBtn = document.getElementById('rmeTogglePerDishBtn');
    const addBtn = document.getElementById('rmeAddRowBtn');

    if (addBtn) addBtn.addEventListener('click', () => addRow());
    if (perDishBtn) {
      perDishBtn.addEventListener('click', () => {
        setPerDishBreakdownVisible(!perDishBreakdownVisible);
      });
    }
    if (calcBtn) calcBtn.addEventListener('click', () => { calculate(); });
    if (exportBtn) exportBtn.addEventListener('click', exportZip);
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) return;
        const text = await f.text();
        await importCsvText(text, f.name);
      });
    }
    if (sampleBtn) {
      sampleBtn.addEventListener('click', async () => {
        setMsg('Loading sample CSV…', 'hint');
        try {
          const res = await fetch(SAMPLE_CSV_URL);
          if (!res.ok) throw new Error('Sample not found');
          await importCsvText(await res.text(), 'sample item report');
        } catch (e) {
          setMsg(e.message, 'err');
        }
      });
    }
  }

  function init() {
    bindUi();
    loadDishList();
    if (!document.querySelectorAll('#rmeBody tr').length) {
      addRow();
      addRow();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.RawMaterialEstimatorTab = { calculate, exportZip, loadRows, importCsvText };
})(typeof window !== 'undefined' ? window : global);
