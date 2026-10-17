/**
 * CSV import for Raw Material Estimator — dish name + qty (case-insensitive headers).
 * Also aggregates POS Item Report exports via ItemReportCsv when present.
 */
(function (global) {
  'use strict';

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

  function textToGrid(text) {
    const raw = String(text).replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    const grid = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      grid.push({ lineNo: i + 1, cols: splitLine(line) });
    }
    return grid;
  }

  function findSimpleHeader(grid) {
    for (let i = 0; i < Math.min(grid.length, 20); i++) {
      const row = grid[i].cols;
      const norm = row.map(normalizeHeader);
      let nameIdx = -1;
      let qtyIdx = -1;
      norm.forEach((h, idx) => {
        if (nameIdx < 0 && (h === 'dishname' || h === 'dish name' || h === 'dish' || h === 'item name' || h === 'itemname' || h === 'item')) {
          nameIdx = idx;
        }
        if (qtyIdx < 0 && (h === 'qty' || h === 'qty.' || h === 'quantity')) {
          qtyIdx = idx;
        }
      });
      if (nameIdx >= 0 && qtyIdx >= 0) {
        return { headerIndex: i, nameIdx, qtyIdx };
      }
    }
    return null;
  }

  function parseNumber(value) {
    if (value == null || value === '') return null;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }

  function parseSimpleDishQtyCsv(csvText) {
    const grid = textToGrid(csvText);
    if (!grid.length) {
      return { ok: false, message: 'Empty file', lines: [], failed: [] };
    }
    const header = findSimpleHeader(grid);
    if (!header) {
      return { ok: false, message: 'Need columns dishname (or item name) and qty', lines: [], failed: [] };
    }

    const lines = [];
    const failed = [];
    const merge = new Map();

    for (let i = header.headerIndex + 1; i < grid.length; i++) {
      const { cols, lineNo } = grid[i];
      const name = String(cols[header.nameIdx] == null ? '' : cols[header.nameIdx]).trim();
      const qty = parseNumber(cols[header.qtyIdx]);
      if (!name) continue;
      if (/^total$/i.test(name)) continue;
      if (qty == null || qty <= 0) {
        failed.push({ csv_row: lineNo, dishname: name, qty: cols[header.qtyIdx], reason: 'Invalid qty' });
        continue;
      }
      const key = name.toLowerCase();
      const prev = merge.get(key);
      if (prev) {
        prev.qty += qty;
      } else {
        merge.set(key, { dishname: name, qty });
      }
    }

    merge.forEach(v => lines.push({ dishname: v.dishname, qty: v.qty }));
    return { ok: true, lines, failed, source: 'simple' };
  }

  function parseItemReportAggregate(csvText) {
    if (!global.ItemReportCsv || !global.ItemReportCsv.parseItemReportCsv) {
      return null;
    }
    const parsed = global.ItemReportCsv.parseItemReportCsv(csvText);
    if (!parsed.ok) return { ok: false, message: parsed.message || 'Item report parse failed', lines: [], failed: parsed.failed || [] };

    const merge = new Map();
    (parsed.rows || []).forEach(r => {
      const name = String(r.item_name || '').trim();
      const qty = parseNumber(r.qty);
      if (!name || qty == null || qty <= 0) return;
      const key = name.toLowerCase();
      const prev = merge.get(key);
      if (prev) prev.qty += qty;
      else merge.set(key, { dishname: name, qty });
    });

    const lines = [];
    merge.forEach(v => lines.push({ dishname: v.dishname, qty: v.qty }));
    return {
      ok: true,
      lines,
      failed: parsed.failed || [],
      skipped: parsed.skipped,
      source: 'item_report'
    };
  }

  /**
   * @param {string} csvText
   */
  function parseEstimatorCsv(csvText) {
    const itemReport = parseItemReportAggregate(csvText);
    if (itemReport && itemReport.ok && itemReport.lines.length) {
      return itemReport;
    }
    const simple = parseSimpleDishQtyCsv(csvText);
    if (simple.ok && simple.lines.length) return simple;
    if (itemReport && itemReport.ok) return itemReport;
    return simple;
  }

  function rowsToCsv(header, dataRows) {
    const C = global.Csv;
    if (C && C.rowsToCsv) {
      return C.rowsToCsv(header, dataRows);
    }
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return [header.map(esc).join(',')]
      .concat(dataRows.map(r => r.map(esc).join(',')))
      .join('\r\n');
  }

  function safeFilePart(s) {
    return String(s == null ? '' : s)
      .trim()
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'unknown';
  }

  function qtyCell(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    return String(Math.round(x * 10000) / 10000);
  }

  /**
   * @param {object} estimateData API response from /api/raw-material-estimator
   * @param {Array<{dishname:string, qty:number}>} inputLines rows from the form
   * @returns {Array<{path:string, text:string}>}
   */
  function buildExportFiles(estimateData, inputLines) {
    const files = [];
    const inputs = (inputLines || []).filter(l => l.dishname && Number.isFinite(l.qty) && l.qty > 0);
    files.push({
      path: 'inputs_dish_qty.csv',
      text: rowsToCsv(
        ['dishname', 'qty'],
        inputs.map(l => [l.dishname, qtyCell(l.qty)])
      )
    });

    const notFound = estimateData.notFound || [];
    if (notFound.length) {
      files.push({
        path: 'dishes_not_found.csv',
        text: rowsToCsv(
          ['dishname', 'dishcode', 'qty'],
          notFound.map(r => [r.dishname || '', r.dishcode || '', qtyCell(r.qty)])
        )
      });
    }

    const warnings = estimateData.warnings || [];
    if (warnings.length) {
      files.push({
        path: 'warnings.csv',
        text: rowsToCsv(['warning'], warnings.map(w => [w]))
      });
    }

    const gt = estimateData.grandTotals || {};
    if ((gt.directRaw || []).length) {
      files.push({
        path: 'grand_totals_direct_raw.csv',
        text: rowsToCsv(
          ['itemName', 'pgNo', 'unit', 'qty'],
          gt.directRaw.map(r => [r.itemName, r.pgNo, r.unit, qtyCell(r.qty)])
        )
      });
    }
    if ((gt.processed || []).length) {
      files.push({
        path: 'grand_totals_processed.csv',
        text: rowsToCsv(
          ['itemName', 'dishcode', 'unit', 'qty'],
          gt.processed.map(r => [r.itemName, r.dishcode, r.unit, qtyCell(r.qty)])
        )
      });
    }
    if ((gt.allRaw || []).length) {
      files.push({
        path: 'grand_totals_all_raw.csv',
        text: rowsToCsv(
          ['itemName', 'pgNo', 'unit', 'qty'],
          gt.allRaw.map(r => [r.itemName, r.pgNo, r.unit, qtyCell(r.qty)])
        )
      });
    }

    (estimateData.dishes || []).forEach(d => {
      const prefix = 'by_dish/' + safeFilePart(d.dishcode || d.dishname);
      const dishCols = [d.dishname, d.dishcode, qtyCell(d.orderQty)];
      if ((d.directRaw || []).length) {
        files.push({
          path: prefix + '_direct_raw.csv',
          text: rowsToCsv(
            ['dishname', 'dishcode', 'orderQty', 'itemName', 'pgNo', 'unit', 'qty'],
            d.directRaw.map(r => dishCols.concat([r.itemName, r.pgNo, r.unit, qtyCell(r.qty)]))
          )
        });
      }
      if ((d.processed || []).length) {
        files.push({
          path: prefix + '_processed.csv',
          text: rowsToCsv(
            ['dishname', 'dishcode', 'orderQty', 'itemName', 'processedDishcode', 'unit', 'qty'],
            d.processed.map(r => dishCols.concat([r.itemName, r.dishcode, r.unit, qtyCell(r.qty)]))
          )
        });
      }
      if ((d.allRaw || []).length) {
        files.push({
          path: prefix + '_all_raw.csv',
          text: rowsToCsv(
            ['dishname', 'dishcode', 'orderQty', 'itemName', 'pgNo', 'unit', 'qty'],
            d.allRaw.map(r => dishCols.concat([r.itemName, r.pgNo, r.unit, qtyCell(r.qty)]))
          )
        });
      }
    });

    return files;
  }

  async function downloadEstimateZip(estimateData, inputLines) {
    if (!global.JSZip) {
      throw new Error('JSZip is not loaded.');
    }
    const files = buildExportFiles(estimateData, inputLines);
    if (!files.length) {
      throw new Error('Nothing to export.');
    }
    const zip = new global.JSZip();
    files.forEach(f => {
      zip.file(f.path, '\uFEFF' + f.text);
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'raw_material_estimate_' + stamp + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return { fileCount: files.length };
  }

  global.RawMaterialEstimatorCsv = {
    parseEstimatorCsv,
    parseSimpleDishQtyCsv,
    buildExportFiles,
    downloadEstimateZip
  };
})(typeof window !== 'undefined' ? window : global);
