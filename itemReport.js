/* Item Report tab — CSV import via itemReportCsv.js, upsert via API. */
(function (global) {
  'use strict';

  const API = '/api/item-report';
  const SUMMARY_API = '/api/item-report/summary';
  const SAMPLE_CSV_URL =
    '/data/Item_Report_With_CustomerOrder_Details_2026_10_10_15_03_36_Report.csv';
  const LINES_HIDDEN_KEY = 'itemReportLinesHidden';

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setMsg(text, kind) {
    const el = document.getElementById('itemReportMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = kind || '';
  }

  function renderFailed(failed) {
    const tbody = document.getElementById('itemReportFailedBody');
    const wrap = document.getElementById('itemReportFailedWrap');
    if (!tbody || !wrap) return;
    tbody.innerHTML = '';
    if (!failed || !failed.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    failed.forEach(row => {
      const tr = document.createElement('tr');
      const rowLabel = row.csv_row != null ? row.csv_row : row.excel_row;
      tr.innerHTML =
        '<td>' + escHtml(rowLabel) + '</td>' +
        '<td>' + escHtml(row.report_date) + '</td>' +
        '<td>' + escHtml(row.invoice_no) + '</td>' +
        '<td>' + escHtml(row.item_name) + '</td>' +
        '<td>' + escHtml(row.area) + '</td>' +
        '<td class="num">' + escHtml(row.qty) + '</td>' +
        '<td>' + escHtml(row.reason) + '</td>';
      tbody.appendChild(tr);
    });
  }

  function formatNum(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '0';
    return String(Math.round(x * 10000) / 10000);
  }

  function getChannel() {
    const sel = document.getElementById('itemReportChannel');
    return sel ? sel.value : 'swiggy';
  }

  function setLinesHidden(hidden) {
    const table = document.getElementById('itemReportLinesTable');
    const btn = document.getElementById('itemReportToggleLinesBtn');
    if (table) table.hidden = hidden;
    if (btn) btn.textContent = hidden ? 'Show lines' : 'Hide lines';
    try {
      localStorage.setItem(LINES_HIDDEN_KEY, hidden ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  function applyLinesHiddenFromStorage() {
    let hidden = false;
    try {
      hidden = localStorage.getItem(LINES_HIDDEN_KEY) === '1';
    } catch (e) { /* ignore */ }
    setLinesHidden(hidden);
  }

  function renderSummary(data) {
    const tbody = document.getElementById('itemReportSummaryBody');
    const meta = document.getElementById('itemReportSummaryMeta');
    const totalQty = document.getElementById('itemReportSummaryTotalQty');
    const totalCost = document.getElementById('itemReportSummaryTotalCost');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rows = (data && data.rows) || [];
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escHtml(r.report_date) + '</td>' +
        '<td>' + escHtml(r.item_name) + '</td>' +
        '<td class="num">' + escHtml(formatNum(r.sum_qty)) + '</td>' +
        '<td class="num">' + escHtml(formatNum(r.dish_cost)) + '</td>' +
        '<td class="num">' + escHtml(formatNum(r.total_dish_cost)) + '</td>';
      tbody.appendChild(tr);
    });
    if (meta) {
      meta.textContent = (data && data.channel_label ? data.channel_label : 'Channel')
        + ' — ' + rows.length + ' row(s). Dish cost from dish_cost (name match) or 0.';
    }
    if (totalQty && data && data.totals) {
      totalQty.textContent = formatNum(data.totals.sum_qty);
    }
    if (totalCost && data && data.totals) {
      totalCost.textContent = formatNum(data.totals.total_dish_cost);
    }
  }

  async function loadSummary() {
    const ch = getChannel();
    try {
      const res = await fetch(SUMMARY_API + '?channel=' + encodeURIComponent(ch));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      renderSummary(data);
    } catch (e) {
      const meta = document.getElementById('itemReportSummaryMeta');
      if (meta) meta.textContent = e.message;
    }
  }

  function renderRows(rows) {
    const tbody = document.getElementById('itemReportBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    (rows || []).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escHtml(r.id) + '</td>' +
        '<td>' + escHtml(r.report_date) + '</td>' +
        '<td>' + escHtml(r.invoice_no) + '</td>' +
        '<td>' + escHtml(r.item_name) + '</td>' +
        '<td>' + escHtml(r.area) + '</td>' +
        '<td class="num">' + escHtml(r.qty) + '</td>' +
        '<td>' + escHtml(r.payment_type) + '</td>' +
        '<td>' + escHtml(r.order_type) + '</td>' +
        '<td class="num">' + escHtml(r.price) + '</td>' +
        '<td>' + escHtml(r.category) + '</td>' +
        '<td>' + escHtml(r.status) + '</td>';
      tbody.appendChild(tr);
    });
  }

  async function loadFromDb() {
    setMsg('Loading…', 'hint');
    try {
      const res = await fetch(API + '?limit=500');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      renderRows(data.rows);
      const meta = document.getElementById('itemReportMeta');
      if (meta) {
        meta.textContent = 'Showing ' + (data.rows ? data.rows.length : 0)
          + ' of ' + (data.total || 0) + ' rows. Upsert key: invoice + date + item + area.';
      }
      setMsg('', '');
      await loadSummary();
    } catch (e) {
      setMsg(e.message, 'err');
    }
  }

  async function uploadParsed(parsed) {
    const res = await fetch(API + '/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: parsed.rows,
        skipped: parsed.skipped,
        failed: parsed.failed
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
    const allFailed = (parsed.failed || []).concat(data.failed || []);
    renderFailed(allFailed);
    const parts = [
      'Parsed ' + parsed.rows.length + ' line(s)',
      'inserted ' + (data.inserted || 0),
      'updated ' + (data.updated || 0),
      'skipped ' + (parsed.skipped || 0) + ' meta/summary row(s)'
    ];
    if (allFailed.length) parts.push(allFailed.length + ' failed');
    setMsg(parts.join(', ') + '.', allFailed.length ? 'warn' : 'ok');
    if (!allFailed.length && parsed.rows.length) {
      setLinesHidden(true);
    }
    await loadFromDb();
  }

  async function importCsvText(text, label) {
    if (!global.ItemReportCsv) {
      setMsg('itemReportCsv.js is not loaded.', 'err');
      return;
    }
    setMsg('Parsing ' + (label || 'CSV') + '…', 'hint');
    renderFailed([]);
    const parsed = global.ItemReportCsv.parseItemReportCsv(text);
    if (!parsed.ok) {
      renderFailed(parsed.failed || []);
      setMsg(parsed.message || 'Parse failed', 'err');
      return;
    }
    await uploadParsed(parsed);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  async function importCsvFile(file) {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      await importCsvText(text, file.name);
    } catch (e) {
      setMsg(e.message, 'err');
    }
  }

  function bindUi() {
    const fileInput = document.getElementById('itemReportFile');
    const importBtn = document.getElementById('itemReportImportBtn');
    const refreshBtn = document.getElementById('itemReportRefreshBtn');
    const sampleBtn = document.getElementById('itemReportSampleBtn');
    const summaryRefreshBtn = document.getElementById('itemReportSummaryRefreshBtn');
    const channelSel = document.getElementById('itemReportChannel');
    const toggleLinesBtn = document.getElementById('itemReportToggleLinesBtn');

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (f) importCsvFile(f);
        fileInput.value = '';
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadFromDb();
      });
    }
    if (summaryRefreshBtn) summaryRefreshBtn.addEventListener('click', loadSummary);
    if (channelSel) channelSel.addEventListener('change', loadSummary);
    if (toggleLinesBtn) {
      toggleLinesBtn.addEventListener('click', () => {
        const table = document.getElementById('itemReportLinesTable');
        setLinesHidden(!(table && table.hidden));
      });
    }
    if (sampleBtn) {
      sampleBtn.addEventListener('click', async () => {
        setMsg('Loading sample CSV…', 'hint');
        try {
          const res = await fetch(SAMPLE_CSV_URL);
          if (!res.ok) throw new Error('Sample not found (' + SAMPLE_CSV_URL + ')');
          const text = await res.text();
          await importCsvText(text, 'sample');
        } catch (e) {
          setMsg(e.message, 'err');
        }
      });
    }
  }

  function init() {
    bindUi();
    applyLinesHiddenFromStorage();
    loadFromDb();
    loadSummary();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ItemReport = { loadFromDb, loadSummary, importCsvFile, importCsvText };
})(typeof window !== 'undefined' ? window : global);
