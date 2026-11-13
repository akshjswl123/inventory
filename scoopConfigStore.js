/* Common in-memory scoop_config — same data for all tabs (offline catalog, DB API, refresh). */
(function (global) {
  'use strict';

  /** @type {object[]} full scoop_config rows (data columns; id/timestamps optional) */
  let rows = [];

  function normalizeName(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function setRows(nextRows) {
    rows = Array.isArray(nextRows) ? nextRows.slice() : [];
    global.SCOOP_CONFIG = rows;
  }

  function getRows() {
    return rows;
  }

  function filterUnused(rows, options) {
    if (options && options.includeUnused) return rows;
    const B = global.ScoopStaticBuilders;
    if (B && typeof B.filterScoopRows === 'function') {
      return B.filterScoopRows(rows, options);
    }
    return (rows || []).filter(r => !r.unused);
  }

  /** Match scoop_item_name and/or scoop_item_id (e.g. dish name + dish code P8). */
  function getRowsForScoopItem(scoopItemName, scoopItemId, options) {
    const q = normalizeName(scoopItemName);
    const id = normalizeName(scoopItemId);
    if (!q && !id) return [];
    const matched = rows.filter(r => {
      const n = normalizeName(r.scoop_item_name || r.scoopItemName);
      const rid = normalizeName(r.scoop_item_id != null ? r.scoop_item_id : r.scoopItemId);
      if (q && n === q) return true;
      if (id && rid === id) return true;
      if (q && rid === q) return true;
      if (id && n === id) return true;
      return false;
    });
    return filterUnused(matched, options);
  }

  function findByScoopName(scoopName) {
    const q = normalizeName(scoopName);
    if (!q) return null;
    return rows.find(r => normalizeName(r.scoop_name) === q) || null;
  }

  global.ScoopConfigStore = {
    setRows: setRows,
    getRows: getRows,
    getRowsForScoopItem: getRowsForScoopItem,
    findByScoopName: findByScoopName
  };
})(typeof window !== 'undefined' ? window : global);
