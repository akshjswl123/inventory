/* Per-dish scoop_config from GET /api/scoop-config (dish code preferred; memory + offline fallback). */
(function (global) {
  'use strict';

  const cache = new Map();

  function normName(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function isServerMode() {
    return global.location
      && (global.location.protocol === 'http:' || global.location.protocol === 'https:');
  }

  function dishCodeForName(dishName) {
    const key = normName(dishName);
    if (!key) return '';
    const entry = (global.DISH_CATALOG || []).find(d =>
      normName(d.dishName || d.dishname) === key
    );
    return entry ? String(entry.dishCode || entry.dish_code || '').trim() : '';
  }

  function toPickerRow(r) {
    return {
      scoop_name: r.scoop_name || r.scoopName || '',
      destination_unit: r.destination_unit || r.destinationUnit || '',
      factor: r.factor != null ? r.factor : null,
      qty_in_grams: r.qty_in_grams != null ? r.qty_in_grams : (r.qtyInGrams != null ? r.qtyInGrams : null),
      qty_in_ml: r.qty_in_ml != null ? r.qty_in_ml : (r.qtyInMl != null ? r.qtyInMl : null),
      qty_in_piece: r.qty_in_piece != null ? r.qty_in_piece : (r.qtyInPiece != null ? r.qtyInPiece : null),
      scoop_item_name: r.scoop_item_name || r.scoopItemName || '',
      scoop_item_id: r.scoop_item_id != null ? r.scoop_item_id : r.scoopItemId,
      unused: !!(r.unused)
    };
  }

  function uniquePickerRows(pickerRows) {
    const seen = new Set();
    const out = [];
    (pickerRows || []).forEach(r => {
      const scoop = String(r.scoop_name || '').trim();
      if (!scoop || seen.has(scoop)) return;
      seen.add(scoop);
      out.push(r);
    });
    return out;
  }

  function rowsFromMap(dishName, dishCode) {
    const map = global.SCOOP_CONFIG_BY_DISH_NAME || {};
    const codeKey = normName(dishCode);
    const nameKey = normName(dishName);
    if (codeKey && map[codeKey] && map[codeKey].length) {
      return map[codeKey].map(toPickerRow);
    }
    if (nameKey && map[nameKey] && map[nameKey].length) {
      return map[nameKey].map(toPickerRow);
    }
    return [];
  }

  function scoopsFromMemory(dishName, dishCode) {
    const name = String(dishName || '').trim();
    const code = String(dishCode || dishCodeForName(name) || '').trim();
    if (!name && !code) return [];

    const store = global.ScoopConfigStore;
    if (store && typeof store.getRowsForScoopItem === 'function') {
      const fromStore = store.getRowsForScoopItem(name, code)
        .map(toPickerRow)
        .filter(r => r.scoop_name);
      if (fromStore.length) return fromStore;
    }

    const fromMap = rowsFromMap(name, code);
    if (fromMap.length) return fromMap;

    return [];
  }

  function mergeIntoScoopConfigStore(dishName, dishCode, apiRows) {
    if (!global.ScoopConfigStore || typeof global.ScoopConfigStore.setRows !== 'function') return;
    const code = normName(dishCode || dishCodeForName(dishName));
    const name = normName(dishName);
    const rest = global.ScoopConfigStore.getRows().filter(r => {
      const rid = normName(r.scoop_item_id != null ? r.scoop_item_id : r.scoopItemId);
      const n = normName(r.scoop_item_name || r.scoopItemName);
      if (code && rid === code) return false;
      if (name && n === name) return false;
      return true;
    });
    global.ScoopConfigStore.setRows(rest.concat(apiRows));
  }

  function updateScoopConfigByDishNameMap(dishName, dishCode, pickerRows) {
    if (!pickerRows.length) return;
    if (!global.SCOOP_CONFIG_BY_DISH_NAME) global.SCOOP_CONFIG_BY_DISH_NAME = {};
    const payload = pickerRows.map(r => ({
      scoop_name: r.scoop_name,
      destination_unit: r.destination_unit,
      factor: r.factor,
      qty_in_grams: r.qty_in_grams != null ? r.qty_in_grams : null,
      qty_in_ml: r.qty_in_ml != null ? r.qty_in_ml : null,
      qty_in_piece: r.qty_in_piece != null ? r.qty_in_piece : null,
      unused: !!r.unused
    }));
    const codeKey = normName(dishCode || dishCodeForName(dishName));
    const nameKey = normName(dishName);
    if (codeKey) global.SCOOP_CONFIG_BY_DISH_NAME[codeKey] = payload;
    if (nameKey) global.SCOOP_CONFIG_BY_DISH_NAME[nameKey] = payload;
  }

  function cacheKey(dishName, dishCode) {
    const code = dishCode || dishCodeForName(dishName);
    return code ? normName(code) : normName(dishName);
  }

  /**
   * @param {string} dishName dish name (for map keys + fallback query)
   * @param {boolean} [forceRefresh] when true, skip cache and fetch DB (server mode)
   * @param {string} [dishCode] optional dish code (P8); preferred for API when set
   * @returns {Promise<Array<{scoop_name, destination_unit, factor}>>}
   */
  async function getScoopsByDishName(dishName, forceRefresh, dishCode) {
    const name = String(dishName || '').trim();
    const code = String(dishCode || dishCodeForName(name) || '').trim();
    if (!name && !code) return [];

    const key = cacheKey(name, code);
    if (!forceRefresh && cache.has(key)) {
      return cache.get(key).rows;
    }

    if (!forceRefresh && !isServerMode()) {
      const mem = scoopsFromMemory(name, code);
      cache.set(key, { rows: mem, fetchedAt: Date.now() });
      return mem;
    }

    if (isServerMode()) {
      try {
        const url = code
          ? '/api/scoop-config/by-dishcode?dishcode=' + encodeURIComponent(code)
          : '/api/scoop-config?scoopItemName=' + encodeURIComponent(name);
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.rows)) {
          const apiRows = data.rows;
          const picker = uniquePickerRows(apiRows.map(toPickerRow).filter(r => r.scoop_name));
          cache.set(key, { rows: picker, fetchedAt: Date.now() });
          mergeIntoScoopConfigStore(name, code, apiRows);
          updateScoopConfigByDishNameMap(name, code, picker);
          return picker;
        }
      } catch (e) {
        /* use memory fallback */
      }
    }

    const mem = uniquePickerRows(scoopsFromMemory(name, code));
    cache.set(key, { rows: mem, fetchedAt: Date.now() });
    return mem;
  }

  function invalidateDish(dishName, dishCode) {
    cache.delete(cacheKey(dishName, dishCode));
  }

  function invalidateAll() {
    cache.clear();
  }

  global.ScoopDishLoader = {
    getScoopsByDishName,
    dishCodeForName,
    invalidateDish,
    invalidateAll,
    scoopsFromMemory
  };
})(typeof window !== 'undefined' ? window : global);
