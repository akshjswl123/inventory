/* Item Report tab — CSV import via itemReportCsv.js, upsert via API. */
(function (global) {
  'use strict';

  const API = '/api/item-report';
  const ANALYSIS_API = '/api/item-report/analysis';
  const DATE_BOUNDS_API = '/api/item-report/date-bounds';
  const SAMPLE_CSV_URL =
    '/data/Item_Report_With_CustomerOrder_Details_2026_10_10_15_03_36_Report.csv';
  const LINES_HIDDEN_KEY = 'itemReportLinesHidden';

  const ANALYSIS_COLUMNS = [
    { key: 'min_date', label: 'Min date' },
    { key: 'max_date', label: 'Max date' },
    { key: 'dish_code', label: 'Dish code' },
    { key: 'item_name', label: 'Item name' },
    { key: 'sum_qty', label: 'Sum qty', numeric: true },
    { key: 'max_price', label: 'Max price', numeric: true },
    { key: 'avg_price', label: 'Avg price', numeric: true },
    { key: 'max_discount', label: 'Max discount', numeric: true },
    { key: 'avg_discount', label: 'Avg discount', numeric: true },
    { key: 'total_discount', label: 'Total discount', numeric: true },
    { key: 'max_sub_total', label: 'Max sub total', numeric: true },
    { key: 'avg_sub_total', label: 'Avg sub total', numeric: true },
    { key: 'received_without_discount', label: 'Received w/o discount', numeric: true, editable: true },
    { key: 'max_final_total', label: 'Max final total', numeric: true },
    { key: 'avg_final_total', label: 'Avg final total', numeric: true },
    { key: 'received_with_discount', label: 'Received w/ discount', numeric: true, editable: true },
    { key: 'dish_cost', label: 'Dish cost', numeric: true, editable: true },
    { key: 'total_dish_cost', label: 'Total dish cost', numeric: true, editable: true },
    { key: 'dinein_menu_price', label: 'Dine-in menu price', numeric: true, editable: true },
    { key: 'total_dinein_menu_price', label: 'Total dine-in menu price', numeric: true },
    { key: 'margin_before_discounts', label: 'Margin before discounts', numeric: true },
    { key: 'margin_after_discounts', label: 'Margin after discounts', numeric: true }
  ];

  /** @type {object[]} */
  let analysisRows = [];
  let analysisMeta = {};

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

  function round4(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 10000) / 10000;
  }

  function formatNum(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    return String(round4(x));
  }

  function parseNumInput(v) {
    if (v == null || v === '') return 0;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeAnalysisRow(row) {
    const r = Object.assign({}, row);
    ANALYSIS_COLUMNS.forEach(col => {
      if (col.numeric && r[col.key] != null && r[col.key] !== '') {
        r[col.key] = Number(r[col.key]);
      }
    });
    return recalculateDerived(r);
  }

  function recalculateDerived(row) {
    const qty = Number(row.sum_qty) || 0;
    if (row._autoTotalDishCost) {
      row.total_dish_cost = round4((Number(row.dish_cost) || 0) * qty);
    }
    if (row._autoDineinTotal) {
      row.total_dinein_menu_price = round4((Number(row.dinein_menu_price) || 0) * qty);
    }
    const totalDish = Number(row.total_dish_cost) || 0;
    row.margin_before_discounts = round4(
      (Number(row.received_without_discount) || 0) - totalDish
    );
    row.margin_after_discounts = round4(
      (Number(row.received_with_discount) || 0) - totalDish
    );
    return row;
  }

  function onEditableChange(rowIndex, key, rawValue) {
    const row = analysisRows[rowIndex];
    if (!row) return;
    const val = parseNumInput(rawValue);
    row[key] = val;
    if (key === 'dish_cost') {
      row._autoTotalDishCost = true;
    } else if (key === 'total_dish_cost') {
      row._autoTotalDishCost = false;
    } else if (key === 'dinein_menu_price') {
      row._autoDineinTotal = true;
    }
    recalculateDerived(row);
    renderAnalysisTable();
  }

  function computeTotalsRow(rows) {
    const totals = {};
    ANALYSIS_COLUMNS.forEach(col => {
      if (!col.numeric) {
        totals[col.key] = '';
        return;
      }
      totals[col.key] = round4(
        rows.reduce((sum, r) => sum + (Number(r[col.key]) || 0), 0)
      );
    });
    totals.item_name = 'Totals';
    totals.min_date = '';
    totals.max_date = '';
    totals.dish_code = '';
    return totals;
  }

  function analysisColumnLabelsRow(cellTag) {
    const tag = cellTag === 'th' ? 'th' : 'td';
    return (
      '<tr>' +
      ANALYSIS_COLUMNS.map(col => {
        const cls = col.numeric ? ' class="num"' : '';
        const scope = tag === 'th' ? ' scope="col"' : '';
        return '<' + tag + scope + cls + '>' + escHtml(col.label) + '</' + tag + '>';
      }).join('') +
      '</tr>'
    );
  }

  function renderAnalysisHead() {
    const head = document.getElementById('itemReportAnalysisHead');
    if (!head) return;
    head.innerHTML = analysisColumnLabelsRow('th');
  }

  function analysisTotalsRowHtml(totals) {
    return (
      '<tr>' +
      ANALYSIS_COLUMNS.map(col => {
        const cls = col.numeric ? ' class="num"' : '';
        if (col.key === 'item_name') {
          return '<td' + cls + ' style="text-align:right;font-weight:600;">Totals</td>';
        }
        if (!col.numeric) return '<td></td>';
        return '<td' + cls + '>' + escHtml(formatNum(totals[col.key])) + '</td>';
      }).join('') +
      '</tr>'
    );
  }

  function cellContent(row, col, rowIndex) {
    const val = row[col.key];
    if (col.editable) {
      const v = val == null || val === '' ? '' : formatNum(val);
      return (
        '<input type="text" class="item-report-edit" data-row="' + rowIndex +
        '" data-key="' + escHtml(col.key) + '" value="' + escHtml(v) + '" />'
      );
    }
    if (col.numeric) return escHtml(formatNum(val));
    if (val == null) return '';
    if (val instanceof Date) return escHtml(String(val).slice(0, 10));
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return escHtml(s.slice(0, 10));
    return escHtml(s);
  }

  function renderAnalysisTable() {
    const tbody = document.getElementById('itemReportSummaryBody');
    const tfoot = document.getElementById('itemReportAnalysisFoot');
    const meta = document.getElementById('itemReportSummaryMeta');
    if (!tbody || !tfoot) return;

    tbody.innerHTML = '';
    analysisRows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      tr.innerHTML = ANALYSIS_COLUMNS.map(col => {
        const cls = col.numeric ? ' class="num"' : '';
        return '<td' + cls + '>' + cellContent(row, col, rowIndex) + '</td>';
      }).join('');
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('input.item-report-edit').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.getAttribute('data-row'));
        const key = input.getAttribute('data-key');
        onEditableChange(idx, key, input.value);
      });
    });

    const totals = computeTotalsRow(analysisRows);
    tfoot.innerHTML =
      analysisColumnLabelsRow('th') + analysisTotalsRowHtml(totals);

    if (meta && analysisMeta.channel_label) {
      meta.textContent =
        analysisMeta.channel_label +
        ' — ' + (analysisMeta.start_date || '') + ' to ' + (analysisMeta.end_date || '') +
        ' — ' + analysisRows.length + ' item(s).';
    }
  }

  function getFilterParams() {
    const startEl = document.getElementById('itemReportStartDate');
    const endEl = document.getElementById('itemReportEndDate');
    const ch = document.getElementById('itemReportChannel');
    return {
      startDate: startEl ? startEl.value : '',
      endDate: endEl ? endEl.value : '',
      channel: ch ? ch.value : 'zomato'
    };
  }

  async function ensureDateBounds() {
    const startEl = document.getElementById('itemReportStartDate');
    const endEl = document.getElementById('itemReportEndDate');
    if (!startEl || !endEl) return;
    if (startEl.value && endEl.value) return;
    try {
      const res = await fetch(DATE_BOUNDS_API);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      if (data.min_date) startEl.value = data.min_date;
      if (data.max_date) endEl.value = data.max_date;
    } catch (e) {
      /* ignore — user can set dates manually */
    }
  }

  async function loadAnalysis() {
    await ensureDateBounds();
    const params = getFilterParams();
    if (!params.startDate || !params.endDate) {
      const meta = document.getElementById('itemReportSummaryMeta');
      if (meta) meta.textContent = 'Set start and end date, then click Run report.';
      return;
    }
    const meta = document.getElementById('itemReportSummaryMeta');
    if (meta) meta.textContent = 'Loading…';
    try {
      const qs =
        'startDate=' + encodeURIComponent(params.startDate) +
        '&endDate=' + encodeURIComponent(params.endDate) +
        '&channel=' + encodeURIComponent(params.channel);
      const res = await fetch(ANALYSIS_API + '?' + qs);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || res.statusText);
      analysisMeta = {
        channel_label: data.channel_label,
        start_date: data.start_date,
        end_date: data.end_date
      };
      analysisRows = (data.rows || []).map(r => {
        const row = normalizeAnalysisRow(r);
        row._autoTotalDishCost = true;
        row._autoDineinTotal = true;
        return recalculateDerived(row);
      });
      renderAnalysisTable();
    } catch (e) {
      if (meta) meta.textContent = e.message;
    }
  }

  function exportAnalysisCsv() {
    const C = global.Csv;
    if (!C || !C.rowsToCsv || !C.download) {
      setMsg('csv.js is not loaded.', 'err');
      return;
    }
    if (!analysisRows.length) {
      setMsg('No rows to export. Run report first.', 'warn');
      return;
    }
    const headers = ANALYSIS_COLUMNS.map(c => c.label);
    const dataRows = analysisRows.map(row =>
      ANALYSIS_COLUMNS.map(col => {
        const v = row[col.key];
        if (col.numeric) return formatNum(v);
        if (v == null) return '';
        const s = String(v);
        if (col.key === 'min_date' || col.key === 'max_date') {
          return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
        }
        return s;
      })
    );
    const totals = computeTotalsRow(analysisRows);
    const totalRow = ANALYSIS_COLUMNS.map(col => {
      if (col.key === 'item_name') return 'Totals';
      if (!col.numeric) return '';
      return formatNum(totals[col.key]);
    });
    dataRows.push(totalRow);
    const text = C.rowsToCsv(headers, dataRows);
    const stamp = new Date().toISOString().slice(0, 10);
    C.download(text, 'item_report_summary_' + stamp + '.csv');
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
      await loadAnalysis();
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
    const exportBtn = document.getElementById('itemReportExportBtn');
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
    if (summaryRefreshBtn) summaryRefreshBtn.addEventListener('click', loadAnalysis);
    if (exportBtn) exportBtn.addEventListener('click', exportAnalysisCsv);
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

  async function init() {
    renderAnalysisHead();
    bindUi();
    applyLinesHiddenFromStorage();
    await ensureDateBounds();
    await loadFromDb();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ItemReport = {
    loadFromDb,
    loadAnalysis,
    importCsvFile,
    importCsvText,
    exportAnalysisCsv
  };
})(typeof window !== 'undefined' ? window : global);
