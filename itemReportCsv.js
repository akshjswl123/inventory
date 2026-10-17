/**
 * POS Item Report CSV parser (browser). Skips leading/trailing metadata rows.
 * Requires csv.js (Csv.splitCsvLine) loaded first.
 */
(function (global) {
  'use strict';

  const HEADER_ALIASES = {
    report_date: ['date'],
    event_timestamp: ['timestamp'],
    invoice_no: ['invoice no.', 'invoice no', 'invoiceno', 'invoice #', 'invoice'],
    payment_type: ['payment type', 'paymenttype'],
    order_type: ['order type', 'ordertype'],
    area: ['area'],
    item_name: ['item name', 'itemname', 'item'],
    price: ['price'],
    qty: ['qty.', 'qty', 'quantity'],
    sub_total: ['sub total', 'subtotal'],
    discount: ['discount'],
    tax: ['tax'],
    final_total: ['final total', 'finaltotal'],
    status: ['status'],
    table_no: ['table no.', 'table no', 'tableno'],
    server_name: ['server name', 'servername'],
    covers: ['covers'],
    variation: ['variation'],
    category: ['category'],
    group_name: ['group name', 'groupname'],
    hsn: ['hsn'],
    phone: ['phone'],
    customer_name: ['name'],
    address: ['address'],
    gst: ['gst'],
    assign_to: ['assign to', 'assignto'],
    non_taxable: ['non taxable', 'nontaxable'],
    line_total: ['total']
  };

  function splitLine(line) {
    if (global.Csv && global.Csv.splitCsvLine) return global.Csv.splitCsvLine(line);
    return String(line).split(',');
  }

  function normalizeHeader(cell) {
    return String(cell == null ? '' : cell)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function buildColumnMap(headerRow) {
    const map = {};
    const normalized = headerRow.map(normalizeHeader);
    Object.keys(HEADER_ALIASES).forEach(field => {
      const aliases = HEADER_ALIASES[field];
      for (let i = 0; i < normalized.length; i++) {
        const h = normalized[i];
        if (!h) continue;
        if (aliases.indexOf(h) >= 0) {
          map[field] = i;
          break;
        }
      }
    });
    return map;
  }

  function findHeaderRowIndex(grid) {
    for (let i = 0; i < Math.min(grid.length, 40); i++) {
      const row = grid[i];
      if (!row || !row.length) continue;
      const map = buildColumnMap(row);
      if (
        map.report_date != null
        && map.item_name != null
        && map.area != null
        && map.qty != null
        && map.invoice_no != null
      ) {
        return i;
      }
    }
    return -1;
  }

  function parseDateOnly(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim();
    if (/^date:/i.test(s)) return null;
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      const mm = String(dmy[2]).padStart(2, '0');
      const dd = String(dmy[1]).padStart(2, '0');
      return dmy[3] + '-' + mm + '-' + dd;
    }
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
  }

  function parseTimestamp(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim();
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    return null;
  }

  function parseNumber(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }

  function cell(row, colIndex) {
    if (colIndex == null || colIndex < 0) return null;
    return row[colIndex];
  }

  function trimOrNull(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  function isMetadataOrSummaryRow(row, colMap) {
    const first = String(cell(row, colMap.report_date) == null ? '' : cell(row, colMap.report_date)).trim();
    if (/^total$/i.test(first)) return true;
    if (/^date:$/i.test(first)) return true;
    const itemVal = cell(row, colMap.item_name);
    const invoiceVal = cell(row, colMap.invoice_no);
    const itemStr = String(itemVal == null ? '' : itemVal).trim();
    const invoiceStr = String(invoiceVal == null ? '' : invoiceVal).trim();
    if (!parseDateOnly(first) && !invoiceStr && !itemStr) return true;
    if (!itemStr && !invoiceStr) return true;
    return false;
  }

  function mapRowToRecord(row, colMap, csvRowNumber) {
    const reportDate = parseDateOnly(cell(row, colMap.report_date));
    const invoiceRaw = cell(row, colMap.invoice_no);
    const invoiceNo = invoiceRaw == null ? '' : String(invoiceRaw).trim();
    const itemName = String(cell(row, colMap.item_name) == null ? '' : cell(row, colMap.item_name)).trim();
    const area = String(cell(row, colMap.area) == null ? '' : cell(row, colMap.area)).trim();
    const qty = parseNumber(cell(row, colMap.qty));

    return {
      csv_row: csvRowNumber,
      report_date: reportDate,
      invoice_no: invoiceNo,
      item_name: itemName,
      area: area,
      qty: qty,
      event_timestamp: parseTimestamp(cell(row, colMap.event_timestamp)),
      payment_type: trimOrNull(cell(row, colMap.payment_type)),
      order_type: trimOrNull(cell(row, colMap.order_type)),
      price: parseNumber(cell(row, colMap.price)),
      sub_total: parseNumber(cell(row, colMap.sub_total)),
      discount: parseNumber(cell(row, colMap.discount)),
      tax: parseNumber(cell(row, colMap.tax)),
      final_total: parseNumber(cell(row, colMap.final_total)),
      status: trimOrNull(cell(row, colMap.status)),
      table_no: trimOrNull(cell(row, colMap.table_no)),
      server_name: trimOrNull(cell(row, colMap.server_name)),
      covers: parseNumber(cell(row, colMap.covers)),
      variation: trimOrNull(cell(row, colMap.variation)),
      category: trimOrNull(cell(row, colMap.category)),
      group_name: trimOrNull(cell(row, colMap.group_name)),
      hsn: trimOrNull(cell(row, colMap.hsn)),
      phone: trimOrNull(cell(row, colMap.phone)),
      customer_name: trimOrNull(cell(row, colMap.customer_name)),
      address: trimOrNull(cell(row, colMap.address)),
      gst: trimOrNull(cell(row, colMap.gst)),
      assign_to: trimOrNull(cell(row, colMap.assign_to)),
      non_taxable: parseNumber(cell(row, colMap.non_taxable)),
      line_total: parseNumber(cell(row, colMap.line_total))
    };
  }

  function validateRecord(record) {
    const issues = [];
    if (!record.report_date) issues.push('Date is missing or invalid');
    if (!record.invoice_no) issues.push('Invoice No. is missing');
    if (!record.item_name) issues.push('Item Name is missing');
    if (!record.area) issues.push('Area is missing');
    if (record.qty == null) issues.push('Qty is missing or invalid');
    return issues;
  }

  function textToGrid(text) {
    const raw = String(text).replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    const grid = [];
    let lineNo = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      lineNo = i + 1;
      grid.push({ lineNo, cols: splitLine(line) });
    }
    return grid;
  }

  /**
   * @param {string} csvText
   * @returns {{ ok: boolean, headerRowIndex: number, rows: object[], failed: object[], skipped: number, message?: string }}
   */
  function parseItemReportCsv(csvText) {
    const gridEntries = textToGrid(csvText);
    const grid = gridEntries.map(g => g.cols);
    const headerRowIndex = findHeaderRowIndex(grid);
    if (headerRowIndex < 0) {
      return {
        ok: false,
        headerRowIndex: -1,
        rows: [],
        failed: [],
        skipped: 0,
        message: 'Could not find header row (need Date, Invoice No., Area, Item Name, Qty.)'
      };
    }

    const colMap = buildColumnMap(grid[headerRowIndex]);
    const rows = [];
    const failed = [];
    let skipped = 0;

    for (let i = headerRowIndex + 1; i < grid.length; i++) {
      const row = grid[i];
      const csvRow = gridEntries[i].lineNo;
      if (!row || row.every(c => String(c == null ? '' : c).trim() === '')) {
        skipped += 1;
        continue;
      }
      if (isMetadataOrSummaryRow(row, colMap)) {
        skipped += 1;
        continue;
      }
      const record = mapRowToRecord(row, colMap, csvRow);
      const issues = validateRecord(record);
      if (issues.length) {
        failed.push({
          csv_row: csvRow,
          report_date: record.report_date,
          invoice_no: record.invoice_no,
          item_name: record.item_name,
          area: record.area,
          qty: record.qty,
          reason: issues.join('; ')
        });
        continue;
      }
      rows.push(record);
    }

    return { ok: true, headerRowIndex, rows, failed, skipped };
  }

  global.ItemReportCsv = {
    parseItemReportCsv: parseItemReportCsv,
    validateRecord: validateRecord
  };
})(typeof window !== 'undefined' ? window : global);
