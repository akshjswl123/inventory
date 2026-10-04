/* Static catalog data — fetch from API, cache in localStorage, fallback to catalog.js */
(function (global) {
  'use strict';

  const CACHE_KEY = 'inventory_static_data_v3';
  const CACHE_TS_KEY = 'inventory_static_data_ts_v1';
  const DEFAULT_TTL_MS = 5 * 60 * 1000;

  function parseBlock(text) {
    if (global.ScoopStaticBuilders && typeof global.ScoopStaticBuilders.parseCatalogBlock === 'function') {
      return global.ScoopStaticBuilders.parseCatalogBlock(text || '');
    }
    if (global.Csv && typeof global.Csv.parseBlock === 'function') {
      return global.Csv.parseBlock(text || '');
    }
    return String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const cols = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
        return cols
          .map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      });
  }

  function readCatalogCsv(name) {
    const fromWindow = readGlobalCsv(name);
    if (fromWindow.trim()) return fromWindow;
    try {
      if (global[name] != null && String(global[name]).length) return String(global[name]);
    } catch (e) {
      /* ignore */
    }
    return '';
  }

  function loadPrebuiltStaticSeed() {
    const raw = global.STATIC_SEED_CATALOG;
    if (raw && typeof raw === 'object') {
      return Object.assign({}, raw, {
        source: raw.source || 'static_seed_catalog.js',
        fetchedAt: new Date().toISOString(),
        warnings: []
      });
    }

    const core = global.STATIC_SEED_CORE;
    const materials = global.STATIC_SEED_MATERIALS;
    if (!core || typeof core !== 'object' || !materials || typeof materials !== 'object') {
      return null;
    }

    const ALL_ITEMS = core.ALL_ITEMS || 'All';
    const dishNames = core.DISHNAMES || [];
    const dishCatalog = core.DISH_CATALOG || [];
    const catalog = materials.CATALOG || [];
    const scoopData = buildScoopData(dishNames, []) || {};
    const builders = getScoopBuilders();
    const SCOOP_CONFIG_BY_DISH_NAME = builders && scoopData.SCOOP_CONFIG && scoopData.SCOOP_CONFIG.length
      ? builders.buildScoopConfigByDishName(scoopData.SCOOP_CONFIG, dishCatalog)
      : {};

    const vendorItemsCsv = readCatalogCsv('VENDOR_ITEMS_CSV') || '';
    const categoryItemsCsv = readCatalogCsv('CATEGORY_ITEMS_CSV') || '';

    return {
      source: 'static_seed_core.js+static_seed_materials.js',
      fetchedAt: new Date().toISOString(),
      ALL_ITEMS,
      VENDORS: core.VENDORS || [],
      CATEGORIES: core.CATEGORIES || [],
      DISHNAMES: dishNames,
      DISH_CATALOG: dishCatalog,
      CATALOG: catalog,
      RECIPE_CATALOG: materials.RECIPE_CATALOG || [],
      SCOOP_CONFIG: scoopData.SCOOP_CONFIG || [],
      SCOOP_IN_CATALOG: scoopData.SCOOP_IN_CATALOG || [],
      SCOOP_OUT_CATALOG: scoopData.SCOOP_OUT_CATALOG || [],
      RECIPE_SCOOP_CATALOG: scoopData.RECIPE_SCOOP_CATALOG || [],
      DISH_OUT_SCOOP_CATALOG: scoopData.DISH_OUT_SCOOP_CATALOG || [],
      SCOOP_INVENTORY_CATALOG: scoopData.SCOOP_INVENTORY_CATALOG || {},
      SCOOP_CONFIG_BY_DISH_NAME,
      USABLE_PROCESSED_DISH_CATALOG: [],
      VENDOR_ITEMS: buildVendorItemsOffline(vendorItemsCsv, core.VENDORS || [], catalog, ALL_ITEMS),
      CATEGORY_ITEMS: buildCategoryItemsOffline(categoryItemsCsv, core.CATEGORIES || [], catalog, ALL_ITEMS),
      warnings: []
    };
  }

  function buildVendorItemsOffline(vendorItemsCsv, vendors, catalog, allItemsLabel) {
    const itemNames = catalog.map(r => r.itemname).filter(Boolean);
    const out = {};
    parseBlock(vendorItemsCsv).forEach(c => {
      if (!c[0]) return;
      const items = c.slice(1).filter(item => item !== '');
      out[c[0]] = (items.length === 1 && items[0].toLowerCase() === allItemsLabel.toLowerCase())
        ? allItemsLabel
        : items;
    });
    vendors.forEach(vendor => {
      if (!out[vendor]) out[vendor] = allItemsLabel;
    });
    Object.keys(out).forEach(vendor => {
      if (Array.isArray(out[vendor])
        && out[vendor].length === itemNames.length
        && itemNames.length > 0) {
        out[vendor] = allItemsLabel;
      }
    });
    return out;
  }

  function buildCategoryItemsOffline(categoryItemsCsv, categories, catalog, allItemsLabel) {
    const itemNames = catalog.map(r => r.itemname).filter(Boolean);
    const out = {};
    parseBlock(categoryItemsCsv).forEach(c => {
      if (!c[0]) return;
      const items = c.slice(1).filter(item => item !== '');
      out[c[0]] = (items.length === 1 && items[0].toLowerCase() === allItemsLabel.toLowerCase())
        ? allItemsLabel
        : items;
    });
    categories.forEach(category => {
      if (!out[category]) out[category] = allItemsLabel;
    });
    Object.keys(out).forEach(category => {
      if (Array.isArray(out[category])
        && out[category].length === itemNames.length
        && itemNames.length > 0) {
        out[category] = allItemsLabel;
      }
    });
    return out;
  }

  function getScoopBuilders() {
    return global.ScoopStaticBuilders || null;
  }

  function isLocalFilePage() {
    try {
      return global.location && global.location.protocol === 'file:';
    } catch (e) {
      return false;
    }
  }

  /** Read catalog strings set by catalog.js / cataloghelper / scoop_config_catalog.js on window. */
  function readGlobalCsv(name) {
    if (global[name] != null && String(global[name]).length) return String(global[name]);
    return '';
  }

  function ensureComposedCatalogs() {
    if (readGlobalCsv('SCOOP_IN_CSV').trim()) return;
    const helper = global.CatalogHelper;
    if (helper && typeof helper.buildComposedCatalogs === 'function') {
      helper.buildComposedCatalogs(global);
    }
  }

  function readScoopConfigCsvText() {
    return readGlobalCsv('SCOOP_CONFIG_CSV');
  }

  function buildScoopDataFromLegacyCsv() {
    const SCOOP_IN_CATALOG = parseBlock(readGlobalCsv('SCOOP_IN_CSV')).map(c => ({
      itemname: c[0], scoop_in: c[1], rate: isNaN(parseFloat(c[2])) ? 0 : parseFloat(c[2])
    }));

    const SCOOP_OUT_CATALOG = parseBlock(readGlobalCsv('SCOOP_OUT_CSV')).map(c => ({
      itemname: c[0], scoop_out: c[1], defaultQty: isNaN(parseFloat(c[2])) ? null : parseFloat(c[2])
    }));

    const RECIPE_SCOOP_CATALOG = parseBlock(readGlobalCsv('RECIPE_SCOOP_CSV')).map(c => ({
      recipeItemName: c[0], recipeScoop: c[1]
    }));

    const DISH_OUT_SCOOP_CATALOG = parseBlock(readGlobalCsv('DISH_OUT_SCOOP_CSV')).map(c => ({
      dishname: c[0], dish_out_scoop: c[1]
    }));

    const SCOOP_INVENTORY_CATALOG = {};
    parseBlock(readGlobalCsv('SCOOP_INVENTORY_CSV')).forEach(c => {
      if (c[0]) SCOOP_INVENTORY_CATALOG[c[0]] = c[1] || '';
    });

    return {
      SCOOP_CONFIG: [],
      SCOOP_IN_CATALOG,
      SCOOP_OUT_CATALOG,
      RECIPE_SCOOP_CATALOG,
      DISH_OUT_SCOOP_CATALOG,
      SCOOP_INVENTORY_CATALOG
    };
  }

  function buildScoopDataFromConfigCsv(dishNames) {
    const builders = getScoopBuilders();
    const csv = readScoopConfigCsvText();
    if (!builders || !String(csv || '').trim()) return null;
    const rows = builders.parseScoopConfigCsv(csv);
    if (!rows.length) return null;
    return builders.buildScoopDerivedCatalogs(rows, dishNames);
  }

  function buildScoopData(dishNames, warnings) {
    ensureComposedCatalogs();
    const legacy = buildScoopDataFromLegacyCsv();
    const fromConfig = buildScoopDataFromConfigCsv(dishNames);

    if (!fromConfig) {
      if (!legacy.SCOOP_IN_CATALOG.length) {
        warnings.push('No scoop data: load scoop_config_catalog.js and cataloghelper.js before staticDataFetcher.js');
      }
      return legacy;
    }

    const useLegacyPickers =
      !fromConfig.SCOOP_IN_CATALOG.length &&
      !fromConfig.SCOOP_OUT_CATALOG.length &&
      legacy.SCOOP_IN_CATALOG.length;

    if (useLegacyPickers) {
      warnings.push('scoop_config catalog loaded but pickers use composed SCOOP_*_CSV from catalog.js');
      return {
        SCOOP_CONFIG: fromConfig.SCOOP_CONFIG,
        SCOOP_IN_CATALOG: legacy.SCOOP_IN_CATALOG,
        SCOOP_OUT_CATALOG: legacy.SCOOP_OUT_CATALOG,
        RECIPE_SCOOP_CATALOG: legacy.RECIPE_SCOOP_CATALOG,
        DISH_OUT_SCOOP_CATALOG: legacy.DISH_OUT_SCOOP_CATALOG.length
          ? legacy.DISH_OUT_SCOOP_CATALOG
          : fromConfig.DISH_OUT_SCOOP_CATALOG,
        SCOOP_INVENTORY_CATALOG: Object.keys(legacy.SCOOP_INVENTORY_CATALOG).length
          ? legacy.SCOOP_INVENTORY_CATALOG
          : fromConfig.SCOOP_INVENTORY_CATALOG
      };
    }

    if (!fromConfig.SCOOP_IN_CATALOG.length && legacy.SCOOP_IN_CATALOG.length) {
      return {
        SCOOP_CONFIG: fromConfig.SCOOP_CONFIG,
        SCOOP_IN_CATALOG: legacy.SCOOP_IN_CATALOG,
        SCOOP_OUT_CATALOG: fromConfig.SCOOP_OUT_CATALOG.length
          ? fromConfig.SCOOP_OUT_CATALOG
          : legacy.SCOOP_OUT_CATALOG,
        RECIPE_SCOOP_CATALOG: fromConfig.RECIPE_SCOOP_CATALOG.length
          ? fromConfig.RECIPE_SCOOP_CATALOG
          : legacy.RECIPE_SCOOP_CATALOG,
        DISH_OUT_SCOOP_CATALOG: fromConfig.DISH_OUT_SCOOP_CATALOG.length
          ? fromConfig.DISH_OUT_SCOOP_CATALOG
          : legacy.DISH_OUT_SCOOP_CATALOG,
        SCOOP_INVENTORY_CATALOG: fromConfig.SCOOP_INVENTORY_CATALOG
      };
    }

    return fromConfig;
  }

  function buildFromCatalogJs() {
    const prebuilt = loadPrebuiltStaticSeed();
    if (prebuilt) return prebuilt;

    const ALL_ITEMS = 'All';
    const warnings = [];

    const VENDORS = parseBlock(readCatalogCsv('VENDORS_CSV') || (typeof VENDORS_CSV !== 'undefined' ? VENDORS_CSV : ''))
      .reduce((acc, row) => acc.concat(row.filter(v => v !== '')), []);
    const CATEGORIES = parseBlock(readCatalogCsv('CATEGORIES_CSV') || (typeof CATEGORIES_CSV !== 'undefined' ? CATEGORIES_CSV : ''))
      .reduce((acc, row) => acc.concat(row.filter(v => v !== '')), []);
    const DISH_CATALOG = parseBlock(readCatalogCsv('DISHNAME_CSV') || (typeof DISHNAME_CSV !== 'undefined' ? DISHNAME_CSV : '')).map((c, i) => {
      if (c.length < 2 || c[1] === '') warnings.push('DISHNAME_CSV line ' + (i + 1) + ': missing dishCode');
      return { dishName: c[0] || '', dishCode: c[1] || '' };
    }).filter(d => d.dishName);
    const DISHNAMES = DISH_CATALOG.map(d => d.dishName);

    const CATALOG = parseBlock(readCatalogCsv('CATALOG_CSV') || (typeof CATALOG_CSV !== 'undefined' ? CATALOG_CSV : '')).map((c, i) => {
      if (c.length < 2 || c[1] === '') warnings.push('CATALOG line ' + (i + 1) + ': missing pgNo');
      return { itemname: c[0] || '', pgNo: c[1] || '' };
    });

    const RECIPE_CATALOG = parseBlock(readCatalogCsv('RECIPE_CATALOG_CSV') || (typeof RECIPE_CATALOG_CSV !== 'undefined' ? RECIPE_CATALOG_CSV : '')).map((c, i) => {
      if (c.length < 2 || c[1] === '') warnings.push('RECIPE_CATALOG line ' + (i + 1) + ': missing pgNo');
      return { recipeItemName: c[0] || '', pgNo: c[1] || '' };
    });

    const scoopData = buildScoopData(DISHNAMES, warnings);
    const builders = getScoopBuilders();
    const SCOOP_CONFIG_BY_DISH_NAME = builders && scoopData.SCOOP_CONFIG && scoopData.SCOOP_CONFIG.length
      ? builders.buildScoopConfigByDishName(scoopData.SCOOP_CONFIG)
      : {};

    const vendorItemsCsv = readCatalogCsv('VENDOR_ITEMS_CSV') || (typeof VENDOR_ITEMS_CSV !== 'undefined' ? VENDOR_ITEMS_CSV : '');
    const categoryItemsCsv = readCatalogCsv('CATEGORY_ITEMS_CSV') || (typeof CATEGORY_ITEMS_CSV !== 'undefined' ? CATEGORY_ITEMS_CSV : '');
    const VENDOR_ITEMS = buildVendorItemsOffline(vendorItemsCsv, VENDORS, CATALOG, ALL_ITEMS);
    const CATEGORY_ITEMS = buildCategoryItemsOffline(categoryItemsCsv, CATEGORIES, CATALOG, ALL_ITEMS);

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
      SCOOP_CONFIG: scoopData.SCOOP_CONFIG,
      SCOOP_IN_CATALOG: scoopData.SCOOP_IN_CATALOG,
      SCOOP_OUT_CATALOG: scoopData.SCOOP_OUT_CATALOG,
      RECIPE_SCOOP_CATALOG: scoopData.RECIPE_SCOOP_CATALOG,
      DISH_OUT_SCOOP_CATALOG: scoopData.DISH_OUT_SCOOP_CATALOG,
      SCOOP_INVENTORY_CATALOG: scoopData.SCOOP_INVENTORY_CATALOG,
      SCOOP_CONFIG_BY_DISH_NAME,
      USABLE_PROCESSED_DISH_CATALOG: [],
      VENDOR_ITEMS,
      CATEGORY_ITEMS,
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
    const scoopConfigRows = data.SCOOP_CONFIG || [];
    global.SCOOP_CONFIG = scoopConfigRows;
    if (global.ScoopConfigStore && typeof global.ScoopConfigStore.setRows === 'function') {
      global.ScoopConfigStore.setRows(scoopConfigRows);
    }
    global.SCOOP_IN_CATALOG = data.SCOOP_IN_CATALOG || [];
    global.SCOOP_OUT_CATALOG = data.SCOOP_OUT_CATALOG || [];
    global.RECIPE_SCOOP_CATALOG = data.RECIPE_SCOOP_CATALOG || [];
    global.DISH_OUT_SCOOP_CATALOG = data.DISH_OUT_SCOOP_CATALOG || [];
    global.SCOOP_INVENTORY_CATALOG = data.SCOOP_INVENTORY_CATALOG || {};
    global.SCOOP_CONFIG_BY_DISH_NAME = data.SCOOP_CONFIG_BY_DISH_NAME || {};
    global.USABLE_PROCESSED_DISH_CATALOG = data.USABLE_PROCESSED_DISH_CATALOG || [];
    global.VENDOR_ITEMS = data.VENDOR_ITEMS || {};
    global.CATEGORY_ITEMS = data.CATEGORY_ITEMS || {};
    global.staticDataSource = data.source || 'unknown';
    global.staticDataFetchedAt = data.fetchedAt || null;
  }

  /**
   * Load static catalog data.
   * @param {{ forceRefresh?: boolean, ttlMs?: number, isServerMode?: function }} opts
   * forceRefresh: skip localStorage cache, fetch /api/static-data (server) or rebuild from catalog.js
   */
  async function load(opts) {
    opts = opts || {};
    const ttlMs = opts.ttlMs != null ? opts.ttlMs : DEFAULT_TTL_MS;
    const isServerMode = opts.isServerMode || (() =>
      global.Query?.isServerMode ? global.Query.isServerMode() : (location.protocol === 'http:' || location.protocol === 'https:')
    );

    const useFileCatalog = isLocalFilePage() || !isServerMode();

    if (!opts.forceRefresh && !useFileCatalog) {
      const cached = readCache();
      if (cached && isCacheFresh(ttlMs)) {
        applyToWindow(cached);
        return { data: cached, from: 'cache' };
      }
    }

    if (isServerMode()) {
      try {
        const data = await fetchFromApi();
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
