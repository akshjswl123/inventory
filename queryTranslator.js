// queryTranslator.js — CSV / tabular data → table-specific INSERT SQL for the Query tab
'use strict';

const TABLE_OPTIONS = [
  { id: 'auto', label: 'Auto-detect (pgAdmin or app CSV)' },
  { id: 'recipe_entries', label: 'recipe_entries' },
  { id: 'raw_materials', label: 'raw_materials' },
  { id: 'dishes', label: 'dishes' },
  { id: 'scoop_config', label: 'scoop_config' },
  { id: 'orders', label: 'orders' },
  { id: 'order_items', label: 'order_items' },
  { id: 'order_entries', label: 'order_entries (flat bill rows)' },
  { id: 'orders_normalized', label: 'orders + order_items (from app bill CSV)' },
  { id: 'inventory_out', label: 'inventory_out' },
  { id: 'inventory_out_items', label: 'inventory_out_items' },
  { id: 'order_out', label: 'order_out' },
  { id: 'inventory_out_normalized', label: 'inventory_out + items (app CSV)' },
  { id: 'vendors', label: 'vendors' },
  { id: 'categories', label: 'categories' }
];

const RECIPE_META = new Set(['totalingredientsqty', 'totalprocessedqty', 'dish_out']);

function normKey(h) {
  return String(h || '').toLowerCase().replace(/[\s_]/g, '');
}

function headerSet(header) {
  const s = new Set();
  header.forEach(h => s.add(normKey(h)));
  return s;
}

function has(hset, ...keys) {
  return keys.some(k => hset.has(normKey(k)));
}

function pick(row, ...names) {
  for (const n of names) {
    const k = normKey(n);
    for (const key of Object.keys(row)) {
      if (normKey(key) !== k) continue;
      const v = row[key];
      if (v === undefined) continue;
      if (v === '' && !isPgNull(v)) continue;
      return v;
    }
  }
  return '';
}

function rawVal(row, colName) {
  for (const key of Object.keys(row)) {
    if (normKey(key) === normKey(colName)) return row[key];
  }
  return undefined;
}

function isPgNull(val) {
  if (val == null || val === '') return true;
  return String(val).trim().toUpperCase() === 'NULL';
}

function sqlQuote(str) {
  if (isPgNull(str)) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function sqlNum(val) {
  if (isPgNull(val)) return 'NULL';
  const n = parseFloat(String(val).replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : 'NULL';
}

function sqlBool(val) {
  if (isPgNull(val)) return 'NULL';
  const s = String(val).toLowerCase();
  if (s === 'true' || s === 't' || s === '1' || s === 'yes') return 'true';
  if (s === 'false' || s === 'f' || s === '0' || s === 'no') return 'false';
  return 'false';
}

function sqlDate(val) {
  if (isPgNull(val)) return 'NULL';
  const s = String(val).trim();
  return sqlQuote(s);
}

function sqlTimestamp(val) {
  if (isPgNull(val)) return 'NULL';
  const s = String(val).trim();
  return sqlQuote(s) + '::timestamptz';
}

function sqlIdent(col) {
  const k = normKey(col);
  const map = {
    pgno: '"pgNo"',
    ingm: '"inGm"',
    inml: '"inML"',
    inpiece: '"inPiece"',
    time: '"time"'
  };
  return map[k] || String(col).toLowerCase();
}

const NUMERIC_HEADERS = new Set([
  'qty', 'rate', 'itemtotal', 'billtotal', 'totalqty', 'factor',
  'ingm', 'inml', 'inpiece', 'qtyingrams', 'qtyinml', 'qtyinpiece'
].map(normKey));

const BOOL_HEADERS = new Set(['unused'].map(normKey));
const DATE_HEADERS = new Set(['dt'].map(normKey));
const TS_HEADERS = new Set(['createdat', 'lastupdatedat']);
const INT_HEADERS = new Set(['id', 'orderid', 'inventoryoutid', 'order_id', 'inventory_out_id'].map(normKey));

function cellToSql(val, headerName) {
  const k = normKey(headerName);
  if (INT_HEADERS.has(k)) return sqlNum(val);
  if (TS_HEADERS.has(k)) return sqlTimestamp(val);
  if (DATE_HEADERS.has(k)) return sqlDate(val);
  if (BOOL_HEADERS.has(k)) return sqlBool(val);
  if (NUMERIC_HEADERS.has(k)) return sqlNum(val);
  return sqlQuote(val);
}

function isPgAdminExport(header) {
  return headerSet(header).has('id');
}

/** pgAdmin "Download as CSV" column signatures (headers may be lowercased by parser). */
const PGADMIN_TABLE_SIGNATURES = [
  { table: 'recipe_entries', required: ['id', 'dishname', 'reciepeitemname'] },
  { table: 'raw_materials', required: ['id', 'itemname', 'pgno'], forbidden: ['dishname', 'vendor'] },
  { table: 'dishes', required: ['id', 'dishname'], forbidden: ['reciepeitemname', 'itemname', 'vendor'] },
  { table: 'scoop_config', required: ['id', 'scoopitemname', 'scoopname'] },
  { table: 'order_entries', required: ['id', 'vendor', 'billno', 'itemname'] },
  { table: 'order_out', required: ['id', 'category', 'itemname', 'scoopout'] },
  { table: 'orders', required: ['id', 'vendor', 'billno'], forbidden: ['itemname', 'reciepeitemname'] },
  { table: 'order_items', required: ['id', 'orderid', 'itemname'] },
  { table: 'inventory_out', required: ['id', 'category', 'commontag'], forbidden: ['itemname'] },
  { table: 'inventory_out_items', required: ['id', 'inventoryoutid', 'itemname'] },
  { table: 'vendors', required: ['id', 'vendorname'] },
  { table: 'categories', required: ['id', 'categoryname'] }
];

function detectPgAdminTable(header) {
  const h = headerSet(header);
  if (!h.has('id')) return null;
  for (const sig of PGADMIN_TABLE_SIGNATURES) {
    if (sig.forbidden && sig.forbidden.some(f => h.has(normKey(f)))) continue;
    if (!sig.required.every(r => h.has(normKey(r)))) continue;
    if (sig.altRequired) {
      const ok = sig.altRequired.every(group => group.some(alt => h.has(normKey(alt))));
      if (!ok) continue;
    }
    return sig.table;
  }
  return null;
}

function parseInputToRows(text) {
  const Csv = window.Csv;
  if (!Csv || !Csv.parseText) throw new Error('csv.js must be loaded before queryTranslator.js');
  const parsed = Csv.parseText(text);
  if (!parsed.header.length) return { header: [], rows: [] };
  // Keep every pgAdmin export column (id, timestamps, etc.) for INSERT generation.
  const rows = parsed.rows.map(cols => {
    const obj = {};
    parsed.header.forEach((h, i) => {
      obj[h] = cols[i] !== undefined ? cols[i] : '';
    });
    return obj;
  });
  return { header: parsed.header, rows };
}

function getTranslatorOptions() {
  const keepIds = document.getElementById('queryKeepIds');
  const keepTs = document.getElementById('queryKeepTimestamps');
  const skipMeta = document.getElementById('querySkipRecipeMeta');
  const skipDup = document.getElementById('querySkipDuplicates');
  return {
    keepIds: keepIds ? keepIds.checked : false,
    keepTimestamps: keepTs ? keepTs.checked : false,
    skipRecipeMeta: skipMeta ? skipMeta.checked : false,
    skipDuplicates: skipDup ? skipDup.checked : true
  };
}

function detectTable(header, rows) {
  const pgTable = detectPgAdminTable(header);
  if (pgTable) return pgTable;

  const h = headerSet(header);

  if (has(h, 'dishname') && (has(h, 'reciepeitemname', 'recipeitemname', 'reciepeItemname'))) {
    return 'recipe_entries';
  }
  if (has(h, 'vendor', 'billno') && has(h, 'scoopin', 'scoop_in')) {
    return 'order_entries';
  }
  if (has(h, 'category') && has(h, 'scoop_out', 'scoopout')) {
    return 'order_out';
  }
  if (has(h, 'dishcode', 'dish_code') && has(h, 'dishname', 'dish_name') && !has(h, 'reciepeitemname', 'recipeitemname')) {
    return 'dishes';
  }
  if (
    has(h, 'scoop_item_name', 'scoopitemname') ||
    (has(h, 'itemname', 'item name') && has(h, 'scoop_name', 'savedas', 'saved as'))
  ) {
    return 'scoop_config';
  }
  if (has(h, 'itemname', 'item name') && has(h, 'pgno', 'pg no') && has(h, 'destinationunit', 'destination unit', 'savedas', 'saved as', 'factor')) {
    return 'scoop_config';
  }
  if (has(h, 'pgno', 'pg no') && has(h, 'itemname', 'item name') && !has(h, 'dishname', 'vendor', 'category')) {
    return 'raw_materials';
  }
  if (has(h, 'vendor_name', 'vendorname') && header.length <= 2) return 'vendors';
  if (has(h, 'category_name', 'categoryname') && header.length <= 2) return 'categories';

  if (rows.length && header.length === 1) {
    const sample = normKey(rows[0][header[0]] || '');
    if (sample && rows.every(r => !pick(r, header[0]).includes(','))) {
      return 'vendors';
    }
  }

  return null;
}

function filterRecipeRows(rows, skipMeta) {
  if (!skipMeta) return rows;
  return rows.filter(r => {
    const item = pick(r, 'reciepeitemname', 'recipeitemname', 'reciepeItemname');
    const key = String(item).toLowerCase().replace(/\s/g, '');
    if (!item || isPgNull(item)) return false;
    if (RECIPE_META.has(key)) return false;
    if (String(item).toLowerCase() === 'billtotal') return false;
    return true;
  });
}

function applyRowFilter(table, rows, opts) {
  if (table === 'recipe_entries') return filterRecipeRows(rows, opts.skipRecipeMeta);
  if (table === 'order_entries') return filterOrderEntryRows(rows);
  if (table === 'order_out') return filterOrderOutRows(rows);
  return rows;
}

function filterOrderEntryRows(rows) {
  return rows.filter(r => {
    const name = String(pick(r, 'itemname')).toLowerCase();
    return name && name !== 'billtotal';
  });
}

function filterOrderOutRows(rows) {
  return rows.filter(r => {
    const name = String(pick(r, 'itemname')).toLowerCase();
    return name && name !== 'totalqty';
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Per-table duplicate handling for pgAdmin re-imports (seed data may already exist). */
const TABLE_ON_CONFLICT = {
  dishes: 'ON CONFLICT (dish_name) DO NOTHING',
  vendors: 'ON CONFLICT (vendor_name) DO NOTHING',
  categories: 'ON CONFLICT (category_name) DO NOTHING',
  raw_materials: 'ON CONFLICT (itemname) DO NOTHING',
  order_entries: 'ON CONFLICT ON CONSTRAINT unique_order_row DO NOTHING',
  order_out: 'ON CONFLICT ON CONSTRAINT unique_order_out DO NOTHING'
};

function onConflictClause(table, opts) {
  if (!opts || !opts.skipDuplicates) return '';
  return TABLE_ON_CONFLICT[table] || '';
}

function insertStatement(table, sqlColumns, valueTuples, opts) {
  if (!valueTuples.length) return '';
  const cols = sqlColumns.join(', ');
  const lines = valueTuples.map(t => `    (${t})`);
  const overriding = opts && opts.overridingSystemValue ? '\nOVERRIDING SYSTEM VALUE' : '';
  const conflict = opts && opts.onConflict ? '\n' + opts.onConflict : '';
  return `INSERT INTO public.${table} (${cols})${overriding}\nVALUES\n${lines.join(',\n')}${conflict};\n`;
}

function insertOptsForTable(table, opts, extra) {
  return Object.assign({
    onConflict: onConflictClause(table, opts)
  }, extra || {});
}

/** Map pgAdmin export headers → INSERT column names (only where DB name differs). */
function normalizePgAdminHeader(h, table) {
  const k = normKey(h);
  if (table === 'dishes') {
    if (k === 'dishname') return 'dish_name';
    if (k === 'dishcode') return 'dish_code';
  }
  if (k === 'orderid') return 'order_id';
  if (k === 'inventoryoutid') return 'inventory_out_id';
  return h;
}

function buildPgAdminInsert(table, header, rows, opts) {
  const filtered = applyRowFilter(table, rows, opts);
  let cols = header.slice();

  if (!opts.keepIds) {
    cols = cols.filter(h => normKey(h) !== 'id');
  }
  if (!opts.keepTimestamps) {
    cols = cols.filter(h => !TS_HEADERS.has(normKey(h)));
  }

  if (!cols.length) throw new Error('No columns left to insert after options (id / timestamps).');

  const sqlCols = cols.map(h => sqlIdent(normalizePgAdminHeader(h, table)));
  const tuples = filtered.map(row =>
    cols.map(h => cellToSql(rawVal(row, h), h)).join(', ')
  );

  const insertOpts = insertOptsForTable(table, opts, {
    overridingSystemValue: opts.keepIds && cols.some(h => normKey(h) === 'id')
  });

  return chunk(tuples, 60).map(t => insertStatement(table, sqlCols, t, insertOpts)).join('\n');
}

function buildRecipeEntries(rows, opts) {
  const filtered = filterRecipeRows(rows, opts ? opts.skipRecipeMeta : false);
  const cols = [
    'dishname', 'dishcode', 'reciepeitemname', '"pgNo"', 'receipescoop',
    'qty', '"inGm"', '"inML"', '"inPiece"', 'comments'
  ];
  const tuples = filtered.map(r => [
    sqlQuote(pick(r, 'dishname')),
    sqlQuote(pick(r, 'dishcode')),
    sqlQuote(pick(r, 'reciepeitemname', 'recipeitemname', 'reciepeItemname')),
    sqlQuote(pick(r, 'pgno', 'pgNo')),
    sqlQuote(pick(r, 'receipescoop', 'recipescoop')),
    sqlNum(pick(r, 'qty')),
    sqlNum(pick(r, 'ingm', 'inGm')),
    sqlNum(pick(r, 'inml', 'inML')),
    sqlNum(pick(r, 'inpiece', 'inPiece')),
    sqlQuote(pick(r, 'comments'))
  ].join(', '));
  const io = insertOptsForTable('recipe_entries', opts);
  return chunk(tuples, 80).map(t => insertStatement('recipe_entries', cols, t, io)).join('\n');
}

function buildRawMaterials(rows, opts) {
  const cols = ['"pgNo"', 'itemname', 'comments'];
  const filtered = rows.filter(r => pick(r, 'pgno', 'pgNo') || pick(r, 'itemname', 'item name'));
  const t2 = filtered.map(r => [
    sqlQuote(pick(r, 'pgno', 'pgNo')),
    sqlQuote(pick(r, 'itemname', 'item name')),
    sqlQuote(pick(r, 'comments', 'comment'))
  ].join(', '));
  const io = insertOptsForTable('raw_materials', opts || { skipDuplicates: true });
  return chunk(t2, 100).map(t => insertStatement('raw_materials', cols, t, io)).join('\n');
}

function buildDishes(rows, opts) {
  const cols = ['dish_code', 'dish_name'];
  const filtered = rows.filter(r => pick(r, 'dishcode', 'dish_code') || pick(r, 'dishname', 'dish_name'));
  const tuples = filtered.map(r => [
    sqlQuote(pick(r, 'dishcode', 'dish_code')),
    sqlQuote(pick(r, 'dishname', 'dish_name'))
  ].join(', '));
  const io = insertOptsForTable('dishes', opts || { skipDuplicates: true });
  return chunk(tuples, 100).map(t => insertStatement('dishes', cols, t, io)).join('\n');
}

function buildScoopConfig(rows, opts) {
  const cols = [
    'scoop_item_name', 'scoop_item_id', 'destination_unit', 'scoop_name', 'factor',
    'conversion_chain', 'qty_in_grams', 'qty_in_ml', 'qty_in_piece', 'unused'
  ];
  const mapped = rows.map(r => {
    const item = pick(r, 'scoop_item_name', 'scoopitemname', 'itemname', 'item name');
    const pg = pick(r, 'scoop_item_id', 'scoopitemid', 'pgno', 'pg no');
    const dest = pick(r, 'destination_unit', 'destinationunit', 'destination unit', 'base_unit');
    const scoop = pick(r, 'scoop_name', 'scoopname', 'saved', 'saved as', 'savedas');
    const factor = pick(r, 'factor');
    const chain = pick(r, 'conversion_chain', 'conversionchain', 'chain', 'conversion_chain');
    const g = pick(r, 'qty_in_grams', 'qtyingrams');
    const ml = pick(r, 'qty_in_ml', 'qtyinml');
    const pc = pick(r, 'qty_in_piece', 'qtyinpiece');
    const unused = pick(r, 'unused');
    if (!item && !scoop) return null;
    return [
      sqlQuote(item),
      sqlQuote(pg),
      sqlQuote(dest),
      sqlQuote(scoop),
      sqlNum(factor),
      sqlQuote(chain),
      sqlNum(g),
      sqlNum(ml),
      sqlNum(pc),
      sqlBool(unused)
    ].join(', ');
  }).filter(Boolean);
  const io = insertOptsForTable('scoop_config', opts || {});
  return chunk(mapped, 80).map(t => insertStatement('scoop_config', cols, t, io)).join('\n');
}

function buildOrderEntries(rows, opts) {
  const filtered = filterOrderEntryRows(rows);
  const cols = ['vendor', 'dt', 'billno', 'itemname', 'pgno', 'scoopin', 'qty', 'rate', 'itemtotal', 'comments'];
  const tuples = filtered.map(r => [
    sqlQuote(pick(r, 'vendor')),
    sqlDate(pick(r, 'dt')),
    sqlQuote(pick(r, 'billno', 'bill_no')),
    sqlQuote(pick(r, 'itemname')),
    sqlQuote(pick(r, 'pgno', 'pgNo')),
    sqlQuote(pick(r, 'scoopin', 'scoop_in')),
    sqlNum(pick(r, 'qty')),
    sqlNum(pick(r, 'rate')),
    sqlNum(pick(r, 'itemtotal', 'item_total')),
    sqlQuote(pick(r, 'comments'))
  ].join(', '));
  const io = insertOptsForTable('order_entries', opts || { skipDuplicates: true });
  return chunk(tuples, 80).map(t => insertStatement('order_entries', cols, t, io)).join('\n');
}

function buildOrderOut(rows, opts) {
  const filtered = filterOrderOutRows(rows);
  const cols = ['category', 'dt', '"time"', 'itemname', '"pgNo"', 'scoop_out', 'qty', 'comments'];
  const tuples = filtered.map(r => [
    sqlQuote(pick(r, 'category')),
    sqlDate(pick(r, 'dt')),
    sqlQuote(pick(r, 'time')),
    sqlQuote(pick(r, 'itemname')),
    sqlQuote(pick(r, 'pgno', 'pgNo')),
    sqlQuote(pick(r, 'scoop_out', 'scoopout')),
    sqlNum(pick(r, 'qty')),
    sqlQuote(pick(r, 'comments'))
  ].join(', '));
  const io = insertOptsForTable('order_out', opts || { skipDuplicates: true });
  return chunk(tuples, 80).map(t => insertStatement('order_out', cols, t, io)).join('\n');
}

function buildVendors(rows, header, opts) {
  const cols = ['vendor_name'];
  const tuples = [];
  rows.forEach(r => {
    const name = pick(r, 'vendor_name', 'vendorname', 'vendor') ||
      (header.length === 1 ? pick(r, header[0]) : '');
    if (!name) return;
    tuples.push(sqlQuote(name));
  });
  const io = insertOptsForTable('vendors', opts || { skipDuplicates: true });
  return chunk(tuples, 100).map(t => insertStatement('vendors', cols, t, io)).join('\n');
}

function buildCategories(rows, header, opts) {
  const cols = ['category_name'];
  const tuples = [];
  rows.forEach(r => {
    const name = pick(r, 'category_name', 'categoryname', 'category') ||
      (header.length === 1 ? pick(r, header[0]) : '');
    if (!name) return;
    tuples.push(sqlQuote(name));
  });
  const io = insertOptsForTable('categories', opts || { skipDuplicates: true });
  return chunk(tuples, 100).map(t => insertStatement('categories', cols, t, io)).join('\n');
}

function groupByBill(rows) {
  const filtered = filterOrderEntryRows(rows);
  const groups = new Map();
  filtered.forEach(r => {
    const vendor = pick(r, 'vendor');
    const dt = pick(r, 'dt');
    const billno = pick(r, 'billno');
    const key = `${vendor}\0${dt}\0${billno}`;
    if (!groups.has(key)) {
      groups.set(key, { vendor, dt, billno, billtotal: null, billcomments: '', items: [] });
    }
    const g = groups.get(key);
    g.items.push(r);
  });
  rows.forEach(r => {
    if (String(pick(r, 'itemname')).toLowerCase() === 'billtotal') {
      const key = `${pick(r, 'vendor')}\0${pick(r, 'dt')}\0${pick(r, 'billno')}`;
      const g = groups.get(key);
      if (g) {
        g.billtotal = pick(r, 'itemtotal', 'rate', 'qty');
        g.billcomments = pick(r, 'comments');
      }
    }
  });
  return groups;
}

function buildOrdersNormalized(rows) {
  const groups = groupByBill(rows);
  if (!groups.size) return '';
  const parts = ['BEGIN;\n'];
  groups.forEach(g => {
    if (!g.items.length) return;
    const billTotal = g.billtotal != null && g.billtotal !== '' ? sqlNum(g.billtotal) : 'NULL';
    parts.push(`WITH new_order AS (
  INSERT INTO public.orders (vendor, dt, billno, customer, billtotal, billcomments)
  VALUES (${sqlQuote(g.vendor)}, ${sqlDate(g.dt)}, ${sqlQuote(g.billno)}, NULL, ${billTotal}, ${sqlQuote(g.billcomments)})
  RETURNING id
)
INSERT INTO public.order_items (order_id, itemname, pgno, scoopin, qty, rate, itemtotal, comments)
SELECT o.id, v.itemname, v.pgno, v.scoopin, v.qty::numeric, v.rate::numeric, v.itemtotal::numeric, v.comments
FROM new_order o
CROSS JOIN (VALUES\n`);
    const itemLines = g.items.map(r => {
      return `  (${sqlQuote(pick(r, 'itemname'))}, ${sqlQuote(pick(r, 'pgno', 'pgNo'))}, ${sqlQuote(pick(r, 'scoopin', 'scoop_in'))}, ${sqlNum(pick(r, 'qty'))}, ${sqlNum(pick(r, 'rate'))}, ${sqlNum(pick(r, 'itemtotal'))}, ${sqlQuote(pick(r, 'comments'))})`;
    });
    parts.push(itemLines.join(',\n'));
    parts.push(`) AS v(itemname, pgno, scoopin, qty, rate, itemtotal, comments);\n`);
  });
  parts.push('COMMIT;\n');
  return parts.join('');
}

function groupInventoryOut(rows) {
  const filtered = filterOrderOutRows(rows);
  const groups = new Map();
  filtered.forEach(r => {
    const category = pick(r, 'category');
    const dt = pick(r, 'dt');
    const time = pick(r, 'time');
    const key = `${category}\0${dt}\0${time}`;
    if (!groups.has(key)) {
      groups.set(key, { category, dt, time, totalqty: null, commontag: '', items: [] });
    }
    groups.get(key).items.push(r);
  });
  rows.forEach(r => {
    if (String(pick(r, 'itemname')).toLowerCase() === 'totalqty') {
      const key = `${pick(r, 'category')}\0${pick(r, 'dt')}\0${pick(r, 'time')}`;
      const g = groups.get(key);
      if (g) {
        g.totalqty = pick(r, 'qty');
        g.commontag = pick(r, 'comments') || `out_${pick(r, 'category')}_${pick(r, 'dt')}_${pick(r, 'time')}`;
      }
    }
  });
  groups.forEach(g => {
    if (!g.commontag) {
      g.commontag = `out_${g.category}_${g.dt}_${g.time || 'notime'}`.replace(/\s+/g, '_');
    }
    if (g.totalqty == null || g.totalqty === '') {
      g.totalqty = g.items.reduce((s, r) => s + (parseFloat(pick(r, 'qty')) || 0), 0);
    }
  });
  return groups;
}

function buildInventoryOutNormalized(rows) {
  const groups = groupInventoryOut(rows);
  if (!groups.size) return '';
  const parts = ['BEGIN;\n'];
  groups.forEach(g => {
    if (!g.items.length) return;
    parts.push(`WITH new_hdr AS (
  INSERT INTO public.inventory_out (category, dt, tm, issuedto, commontag, totalqty)
  VALUES (${sqlQuote(g.category)}, ${sqlDate(g.dt)}, ${sqlQuote(g.time)}, '', ${sqlQuote(g.commontag)}, ${sqlNum(g.totalqty)})
  RETURNING id
)
INSERT INTO public.inventory_out_items (inventory_out_id, itemname, pgno, scoop_out, qty, comments)
SELECT h.id, v.itemname, v.pgno, v.scoop_out, v.qty::numeric, v.comments
FROM new_hdr h
CROSS JOIN (VALUES\n`);
    const itemLines = g.items.map(r => {
      return `  (${sqlQuote(pick(r, 'itemname'))}, ${sqlQuote(pick(r, 'pgno', 'pgNo'))}, ${sqlQuote(pick(r, 'scoop_out', 'scoopout'))}, ${sqlNum(pick(r, 'qty'))}, ${sqlQuote(pick(r, 'comments'))})`;
    });
    parts.push(itemLines.join(',\n'));
    parts.push(`) AS v(itemname, pgno, scoop_out, qty, comments);\n`);
  });
  parts.push('COMMIT;\n');
  return parts.join('');
}

function looksLikeSql(text) {
  return /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|BEGIN|CREATE|ALTER|DROP|TRUNCATE)\s/i.test(text);
}

function looksLikeCsv(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return false;
  if (looksLikeSql(text)) return false;
  return lines[0].includes(',');
}

function csvTextToInsertSql(text, tableId, options) {
  const opts = Object.assign({
    keepIds: false,
    keepTimestamps: false,
    skipRecipeMeta: false,
    skipDuplicates: true
  }, options || {});
  const { header, rows } = parseInputToRows(text);
  if (!rows.length) throw new Error('No data rows found in CSV.');

  let table = tableId === 'auto' ? detectTable(header, rows) : tableId;
  if (!table) {
    throw new Error(
      'Could not detect target table from CSV headers. Choose a table manually.\n' +
      'Headers: ' + header.join(', ')
    );
  }

  const pgAdmin = isPgAdminExport(header);
  let sql = '';

  if (pgAdmin && table !== 'orders_normalized' && table !== 'inventory_out_normalized') {
    sql = buildPgAdminInsert(table, header, rows, opts);
  } else {
    switch (table) {
      case 'recipe_entries': sql = buildRecipeEntries(rows, opts); break;
      case 'raw_materials': sql = buildRawMaterials(rows, opts); break;
      case 'dishes': sql = buildDishes(rows, opts); break;
      case 'scoop_config': sql = buildScoopConfig(rows, opts); break;
      case 'order_entries': sql = buildOrderEntries(rows, opts); break;
      case 'orders_normalized': sql = buildOrdersNormalized(rows); break;
      case 'order_out': sql = buildOrderOut(rows, opts); break;
      case 'inventory_out_normalized': sql = buildInventoryOutNormalized(rows); break;
      case 'vendors': sql = buildVendors(rows, header, opts); break;
      case 'categories': sql = buildCategories(rows, header, opts); break;
      default:
        throw new Error('Unsupported table: ' + table);
    }
  }

  if (!sql.trim()) throw new Error('No insertable rows after filtering (meta/summary rows may have been skipped).');

  const mode = pgAdmin ? 'pgAdmin CSV export' : 'app CSV';
  const tsNote = opts.keepTimestamps && header.some(h => TS_HEADERS.has(normKey(h)))
    ? '-- timestamps from file where listed\n'
    : '-- created_at / last_updated_at use DB defaults when omitted\n';
  const banner = `-- Generated INSERT for public.${table} (${rows.length} row(s), ${mode})\n${tsNote}\n`;
  return banner + sql.trim() + '\n';
}

function translateQueryInput(tableId, options) {
  const el = document.getElementById('queryInput');
  const text = el.value.trim();
  if (!text) throw new Error('Paste CSV or load a file first.');
  if (looksLikeSql(text) && !looksLikeCsv(text)) {
    throw new Error('Input looks like SQL already. Clear or paste CSV tabular data.');
  }
  const opts = Object.assign({}, getTranslatorOptions(), options || {});
  const sql = csvTextToInsertSql(text, tableId || 'auto', opts);
  el.value = sql;
  return { table: tableId, sql };
}

function importCsvFile(tableId, options) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { reject(new Error('No file selected')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const opts = Object.assign({}, getTranslatorOptions(), options || {});
          const sql = csvTextToInsertSql(String(reader.result || ''), tableId || 'auto', opts);
          document.getElementById('queryInput').value = sql;
          resolve({ filename: file.name, sql });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

window.QueryTranslator = {
  TABLE_OPTIONS,
  detectTable,
  detectPgAdminTable,
  isPgAdminExport,
  csvTextToInsertSql,
  translateQueryInput,
  importCsvFile,
  getTranslatorOptions,
  looksLikeCsv,
  looksLikeSql
};
