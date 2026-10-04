/* Build scoop_config rows from SCOOP_UNIT_DEFAULTS_CSV (catalog.js) + naming convention. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ScoopUnitDefaultsBuilder = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global, function () {
  'use strict';

  function parseBlockFixed(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split(',').map(c => c.trim()));
  }

  function parseNumOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parseUnitDefaultRow(row) {
    if (!row || !row[0]) return null;
    return {
      unit: String(row[0]).trim().toLowerCase(),
      factor: parseNumOrNull(row[1]),
      conversion_chain: row[2] ? String(row[2]).trim() : null,
      qty_in_grams: parseNumOrNull(row[3]),
      qty_in_ml: parseNumOrNull(row[4]),
      qty_in_piece: parseNumOrNull(row[5]),
      destination_unit: row[6] ? String(row[6]).trim() : null
    };
  }

  function buildScoopUnitDefaultsMaps(csvText) {
    const byUnit = new Map();
    parseBlockFixed(csvText).forEach(row => {
      const def = parseUnitDefaultRow(row);
      if (def) byUnit.set(def.unit, def);
    });
    return { byUnit };
  }

  function scoopUnitFromName(scoopName) {
    const s = String(scoopName || '').toLowerCase();
    const reciepe = s.match(/_(gm|kg|ml|piece|pkt|ltr)_reciepe$/);
    if (reciepe) return reciepe[1];
    const recipe = s.match(/_(gm|kg|ml|piece|pkt|ltr)_recipe$/);
    if (recipe) return recipe[1];
    const rules = [
      ['_gm_inventory', 'gm'],
      ['_gm_in', 'gm'],
      ['_gm_out', 'gm'],
      ['_ml_in', 'ml'],
      ['_ml_out', 'ml'],
      ['_piece_in', 'piece'],
      ['_piece_out', 'piece'],
      ['_pkt_in', 'pkt'],
      ['_pkt_out', 'pkt'],
      ['_kg_in', 'kg'],
      ['_kg_out', 'kg'],
      ['_bag_in', 'bag'],
      ['_other_in', 'other'],
      ['_1_portion', 'portion'],
      ['_portion_reciepe', 'portion']
    ];
    for (const [suffix, unit] of rules) {
      if (s.endsWith(suffix)) return unit;
    }
    return null;
  }

  function destUnitFromScoop(scoopName) {
    const unit = scoopUnitFromName(scoopName);
    if (unit === 'gm' || unit === 'ml' || unit === 'piece') return unit;
    if (unit === 'kg' || unit === 'pkt' || unit === 'bag') return 'gm';
    if (unit === 'portion') return 'portion';
    if (unit === 'other') return 'other';
    return null;
  }

  function applyScoopDefaults(cfg, defaultsMaps) {
    const maps = defaultsMaps || { byUnit: new Map() };
    const unit = scoopUnitFromName(cfg.scoop_name);
    if (unit === 'portion') {
      if (!cfg.destination_unit) cfg.destination_unit = 'portion';
      if (cfg.factor == null) cfg.factor = 1;
      if (cfg.qty_in_piece == null) cfg.qty_in_piece = 1;
      return cfg;
    }
    if (unit === 'other') {
      if (!cfg.destination_unit) cfg.destination_unit = 'other';
      if (cfg.factor == null) cfg.factor = 1;
      if (cfg.qty_in_piece == null) cfg.qty_in_piece = 1;
      return cfg;
    }
    if (!unit) {
      if (!cfg.destination_unit) cfg.destination_unit = destUnitFromScoop(cfg.scoop_name);
      return cfg;
    }

    const def = maps.byUnit.get(unit);
    if (!def) {
      if (!cfg.destination_unit) cfg.destination_unit = destUnitFromScoop(cfg.scoop_name);
      return cfg;
    }

    if (def.destination_unit) cfg.destination_unit = def.destination_unit;
    if (def.conversion_chain) cfg.conversion_chain = def.conversion_chain;
    if (def.qty_in_grams != null) cfg.qty_in_grams = def.qty_in_grams;
    if (def.qty_in_ml != null) cfg.qty_in_ml = def.qty_in_ml;
    if (def.qty_in_piece != null) cfg.qty_in_piece = def.qty_in_piece;

    const isOut = /_out$/i.test(String(cfg.scoop_name || ''));
    if (!isOut && def.factor != null) {
      cfg.factor = def.factor;
    } else if (cfg.factor == null && def.factor != null) {
      cfg.factor = def.factor;
    }

    return cfg;
  }

  function scoopKindSuffix(kind) {
    if (kind === 'recipe') return 'reciepe';
    return kind;
  }

  /** {itemname}_{unit}_{in|out|reciepe} — same as itemdetails.js scoopComputedName */
  function scoopComputedName(itemName, kind, unitSlug) {
    const unit = String(unitSlug || '').trim().toLowerCase();
    if (!itemName || !unit) return '';
    return String(itemName).trim() + '_' + unit + '_' + scoopKindSuffix(kind);
  }

  function defaultsCsvText() {
    if (typeof globalThis !== 'undefined' && globalThis.SCOOP_UNIT_DEFAULTS_CSV) {
      return String(globalThis.SCOOP_UNIT_DEFAULTS_CSV);
    }
    try {
      const { loadCatalog } = require('./scripts/catalogLoader');
      const ctx = loadCatalog();
      return ctx.SCOOP_UNIT_DEFAULTS_CSV || '';
    } catch (e) {
      return '';
    }
  }

  function unitSlugsFromDefaults(csvText) {
    const slugs = [];
    parseBlockFixed(csvText).forEach(row => {
      if (row[0]) slugs.push(String(row[0]).trim().toLowerCase());
    });
    return slugs;
  }

  function kindsForUnit(unit) {
    const u = String(unit || '').trim().toLowerCase();
    const kinds = ['in', 'out'];
    if (u === 'gm') kinds.push('inventory');
    kinds.push('recipe');
    return kinds;
  }

  /**
   * @param {string} entityName scoop_item_name (raw material itemname or dish name)
   * @param {string} entityId scoop_item_id (pgNo or dishcode)
   * @param {{ includePortion?: boolean, csvText?: string, units?: string[] }} [opts]
   * @returns {object[]}
   */
  function buildDefaultScoopConfigRows(entityName, entityId, opts) {
    opts = opts || {};
    const name = String(entityName || '').trim();
    const id = entityId != null ? String(entityId).trim() : '';
    if (!name) return [];

    if (opts.includePortion) {
      try {
        const { buildDishScoopConfigRows } = require('./scripts/dishScoopTemplate');
        return buildDishScoopConfigRows(name, id);
      } catch (e) {
        /* fall through to legacy portion-only */
      }
    }

    const csvText = opts.csvText != null ? opts.csvText : defaultsCsvText();
    const defaultsMaps = buildScoopUnitDefaultsMaps(csvText);
    // Dishes / processed: gm in/out/recipe + portion only (see scripts/06_processed_seed.sql).
    const units = opts.units
      ? opts.units.map(u => String(u).trim().toLowerCase()).filter(Boolean)
      : (opts.includePortion ? ['gm'] : unitSlugsFromDefaults(csvText));
    const rows = [];

    units.forEach(unit => {
      kindsForUnit(unit).forEach(kind => {
        const scoop_name = scoopComputedName(name, kind, unit);
        const cfg = {
          scoop_item_name: name,
          scoop_item_id: id || null,
          destination_unit: null,
          scoop_name,
          factor: null,
          conversion_chain: null,
          qty_in_grams: null,
          qty_in_ml: null,
          qty_in_piece: null,
          unused: false
        };
        applyScoopDefaults(cfg, defaultsMaps);
        rows.push(cfg);
      });
    });

    if (opts.includePortion) {
      const portionCfg = {
        scoop_item_name: name,
        scoop_item_id: id || null,
        destination_unit: 'portion',
        scoop_name: name + '_1_portion',
        factor: null,
        conversion_chain: null,
        qty_in_grams: null,
        qty_in_ml: null,
        qty_in_piece: null,
        unused: false
      };
      applyScoopDefaults(portionCfg, defaultsMaps);
      rows.push(portionCfg);
    }

    return rows;
  }

  function mergeRowsIntoScoopConfigStore(newRows) {
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    const store = g.ScoopConfigStore;
    if (!store || typeof store.getRows !== 'function' || typeof store.setRows !== 'function') {
      return 0;
    }
    const existing = store.getRows();
    const byName = new Map();
    existing.forEach(r => {
      const key = String(r.scoop_name || r.scoopName || '').trim().toLowerCase();
      if (key) byName.set(key, r);
    });
    let added = 0;
    (newRows || []).forEach(r => {
      const key = String(r.scoop_name || '').trim().toLowerCase();
      if (!key || byName.has(key)) return;
      byName.set(key, r);
      added++;
    });
    store.setRows(Array.from(byName.values()));
    return added;
  }

  return {
    buildDefaultScoopConfigRows,
    mergeRowsIntoScoopConfigStore,
    applyScoopDefaults,
    buildScoopUnitDefaultsMaps,
    scoopComputedName
  };
});
