/* Static catalog data — fetch from API, cache in localStorage, fallback to catalog.js */
(function (global) {
  'use strict';

  const CACHE_KEY = 'inventory_static_data_v1';
  const CACHE_TS_KEY = 'inventory_static_data_ts_v1';
  const DEFAULT_TTL_MS = 5 * 60 * 1000;

  function parseBlock(text) {
    if (global.Csv && typeof global.Csv.parseBlock === 'function') {
      return global.Csv.parseBlock(text || '');
    }
    return String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const cols = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
        return cols.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      });
  }

  function buildFromCatalogJs() {
    const ALL_ITEMS = 'All';
    const warnings = [];

    const VENDORS = parseBlock(typeof VENDORS_CSV !== 'undefined' ? VENDORS_CSV : '')
      .reduce((acc, row) => acc.concat(row.filter(v => v !== '')), []);
    const CATEGORIES = parseBlock(typeof CATEGORIES_CSV !== 'undefined' ? CATEGORIES_CSV : '')
      .reduce((acc, row) => acc.concat(row.filter(v => v !== '')), []);
    const DISH_CATALOG = parseBlock(typeof DISHNAME_CSV !== 'undefined' ? DISHNAME_CSV : '').map((c, i) => {
      if (c.length < 2 || c[1] === '') warnings.push('DISHNAME_CSV line ' + (i + 1) + ': missing dishCode');
      return { dishName: c[0] || '', dishCode: c[1] || '' };
    }).filter(d => d.dishName);
    const DISHNAMES = DISH_CATALOG.map(d => d.dishName);

    const CATALOG = parseBlock(typeof CATALOG_CSV !== 'undefined' ? CATALOG_CSV : '').map((c, i) => {
      if (c.length < 2 || c[1] === '') warnings.push('CATALOG line ' + (i + 1) + ': missing pgNo');
      return { itemname: c[0] || '', pgNo: c[1] || '' };
    });

    const RECIPE_CATALOG = parseBlock(typeof RECIPE_CATALOG_CSV !== 'undefined' ? RECIPE_CATALOG_CSV : '').map((c, i) => {
      if (c.length < 2 || c[1] === '') warnings.push('RECIPE_CATALOG line ' + (i + 1) + ': missing pgNo');
      return { recipeItemName: c[0] || '', pgNo: c[1] || '' };
    });

    const SCOOP_IN_CATALOG = parseBlock(typeof SCOOP_IN_CSV !== 'undefined' ? SCOOP_IN_CSV : '').map(c => ({
      itemname: c[0], scoop_in: c[1], rate: isNaN(parseFloat(c[2])) ? 0 : parseFloat(c[2])
    }));

    const SCOOP_OUT_CATALOG = parseBlock(typeof SCOOP_OUT_CSV !== 'undefined' ? SCOOP_OUT_CSV : '').map(c => ({
      itemname: c[0], scoop_out: c[1], defaultQty: isNaN(parseFloat(c[2])) ? null : parseFloat(c[2])
    }));

    const RECIPE_SCOOP_CATALOG = parseBlock(typeof RECIPE_SCOOP_CSV !== 'undefined' ? RECIPE_SCOOP_CSV : '').map(c => ({
      recipeItemName: c[0], recipeScoop: c[1]
    }));

    const DISH_OUT_SCOOP_CATALOG = parseBlock(typeof DISH_OUT_SCOOP_CSV !== 'undefined' ? DISH_OUT_SCOOP_CSV : '').map(c => ({
      dishname: c[0], dish_out_scoop: c[1]
    }));

    const SCOOP_INVENTORY_CATALOG = {};
    parseBlock(typeof SCOOP_INVENTORY_CSV !== 'undefined' ? SCOOP_INVENTORY_CSV : '').forEach(c => {
      if (c[0]) SCOOP_INVENTORY_CATALOG[c[0]] = c[1] || '';
    });

    const VENDOR_ITEMS = {};
    parseBlock(typeof VENDOR_ITEMS_CSV !== 'undefined' ? VENDOR_ITEMS_CSV : '').forEach(c => {
      const items = c.slice(1).filter(item => item !== '');
      VENDOR_ITEMS[c[0]] = (items.length === 1 && items[0].toLowerCase() === ALL_ITEMS.toLowerCase()) ? ALL_ITEMS : items;
    });

    const CATEGORY_ITEMS = {};
    parseBlock(typeof CATEGORY_ITEMS_CSV !== 'undefined' ? CATEGORY_ITEMS_CSV : '').forEach(c => {
      const items = c.slice(1).filter(item => item !== '');
      CATEGORY_ITEMS[c[0]] = (items.length === 1 && items[0].toLowerCase() === ALL_ITEMS.toLowerCase()) ? ALL_ITEMS : items;
    });

    const UNIT_CONVERSION_CATALOG = parseBlock(typeof UNIT_CONVERSION_CSV !== 'undefined' ? UNIT_CONVERSION_CSV : '').map(c => ({
      itemname: (c[0] || '').trim(),
      from_unit: (c[1] || '').trim().toLowerCase(),
      from_label: (c[2] || c[1] || '').trim(),
      to_qty: parseFloat(c[3]) || 0,
      to_unit: (c[4] || '').trim().toLowerCase()
    }));

    return {
      source: 'catalog.js',
      fetchedAt: new Date().toISOString(),
      ALL_ITEMS,
      VENDORS,
      CATEGORIES,
      DISHNAMES,
      DISH_CATALOG,
      CATALOG,
      RECIPE_CATALOG,
      SCOOP_IN_CATALOG,
      SCOOP_OUT_CATALOG,
      RECIPE_SCOOP_CATALOG,
      DISH_OUT_SCOOP_CATALOG,
      SCOOP_INVENTORY_CATALOG,
      VENDOR_ITEMS,
      CATEGORY_ITEMS,
      UNIT_CONVERSION_CATALOG,
      warnings
    };
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
    } catch (e) {
      /* ignore quota errors */
    }
  }

  function isCacheFresh(ttlMs) {
    try {
      const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (!ts) return false;
      return Date.now() - ts < ttlMs;
    } catch (e) {
      return false;
    }
  }

  async function fetchFromApi() {
    const res = await fetch('/api/static-data');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
    return data;
  }

  function applyToWindow(data) {
    if (!data) return;
    global.ALL_ITEMS = data.ALL_ITEMS || 'All';
    global.VENDORS = data.VENDORS || [];
    global.CATEGORIES = data.CATEGORIES || [];
    global.DISHNAMES = data.DISHNAMES || [];
    global.DISH_CATALOG = data.DISH_CATALOG || (data.DISHNAMES || []).map((name, i) => ({
      dishName: name,
      dishCode: 'D' + String(i + 1).padStart(3, '0')
    }));
    global.CATALOG = data.CATALOG || [];
    global.RECIPE_CATALOG = data.RECIPE_CATALOG || [];
    global.SCOOP_IN_CATALOG = data.SCOOP_IN_CATALOG || [];
    global.SCOOP_OUT_CATALOG = data.SCOOP_OUT_CATALOG || [];
    global.RECIPE_SCOOP_CATALOG = data.RECIPE_SCOOP_CATALOG || [];
    global.DISH_OUT_SCOOP_CATALOG = data.DISH_OUT_SCOOP_CATALOG || [];
    global.SCOOP_INVENTORY_CATALOG = data.SCOOP_INVENTORY_CATALOG || {};
    global.VENDOR_ITEMS = data.VENDOR_ITEMS || {};
    global.CATEGORY_ITEMS = data.CATEGORY_ITEMS || {};
    global.UNIT_CONVERSION_CATALOG = data.UNIT_CONVERSION_CATALOG || [];
    global.staticDataSource = data.source || 'unknown';
    global.staticDataFetchedAt = data.fetchedAt || null;
  }

  /**
   * Load static catalog data.
   * @param {{ forceRefresh?: boolean, ttlMs?: number, isServerMode?: function }} opts
   */
  async function load(opts) {
    opts = opts || {};
    const ttlMs = opts.ttlMs != null ? opts.ttlMs : DEFAULT_TTL_MS;
    const isServerMode = opts.isServerMode || (() =>
      global.Query?.isServerMode ? global.Query.isServerMode() : (location.protocol === 'http:' || location.protocol === 'https:')
    );

    if (!opts.forceRefresh) {
      const cached = readCache();
      if (cached && isCacheFresh(ttlMs)) {
        applyToWindow(cached);
        return { data: cached, from: 'cache' };
      }
    }

    if (isServerMode()) {
      try {
        const data = await fetchFromApi();
        if (!data.UNIT_CONVERSION_CATALOG || !data.UNIT_CONVERSION_CATALOG.length) {
          const fb = buildFromCatalogJs();
          data.UNIT_CONVERSION_CATALOG = fb.UNIT_CONVERSION_CATALOG;
        }
        writeCache(data);
        applyToWindow(data);
        return { data: data, from: 'api' };
      } catch (e) {
        const cached = readCache();
        if (cached) {
          applyToWindow(cached);
          return { data: cached, from: 'cache-stale', error: e.message };
        }
      }
    }

    const fallback = buildFromCatalogJs();
    applyToWindow(fallback);
    return { data: fallback, from: 'catalog.js', warnings: fallback.warnings || [] };
  }

  global.StaticDataFetcher = {
    load: load,
    applyToWindow: applyToWindow,
    buildFromCatalogJs: buildFromCatalogJs,
    clearCache: function () {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TS_KEY);
    }
  };
})(typeof window !== 'undefined' ? window : global);
