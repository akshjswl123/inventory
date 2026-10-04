/* Derive tab UI lists (IN/OUT/recipe scoops) from common scoop_config rows (browser + Node). */
(function (global) {
  'use strict';

  const ALL_ITEMS = 'All';

  function endsWithSuffix(value, suffix) {
    const v = String(value || '');
    const s = String(suffix || '');
    return v.length >= s.length && v.slice(-s.length).toLowerCase() === s.toLowerCase();
  }

  function parseNumOrNull(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parseBool(value) {
    const t = String(value == null ? '' : value).trim().toLowerCase();
    return t === 'true' || t === '1' || t === 'yes';
  }

  function splitCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  function parseCatalogBlock(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => splitCsvLine(line).map(cell => cell.trim()));
  }

  /** Parse SCOOP_CONFIG_CSV lines (10 fixed columns; quoted fields allowed). */
  function parseScoopConfigCsv(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const c = splitCsvLine(line);
        while (c.length < 10) c.push('');
        if (!c[0] && !c[3]) return null;
        return {
          scoop_item_name: c[0] || '',
          scoop_item_id: c[1] || '',
          destination_unit: c[2] || '',
          scoop_name: c[3] || '',
          factor: parseNumOrNull(c[4]),
          conversion_chain: c[5] ? c[5] : null,
          qty_in_grams: parseNumOrNull(c[6]),
          qty_in_ml: parseNumOrNull(c[7]),
          qty_in_piece: parseNumOrNull(c[8]),
          unused: parseBool(c[9])
        };
      })
      .filter(Boolean);
  }

  function normalizeScoopRow(r) {
    return {
      scoop_item_name: r.scoop_item_name || r.scoopItemName || '',
      scoop_item_id: r.scoop_item_id != null ? String(r.scoop_item_id) : (r.scoopItemId != null ? String(r.scoopItemId) : ''),
      destination_unit: r.destination_unit || r.destinationUnit || '',
      scoop_name: r.scoop_name || r.scoopName || '',
      factor: r.factor != null ? Number(r.factor) : null,
      conversion_chain: r.conversion_chain != null ? r.conversion_chain : (r.conversionChain != null ? r.conversionChain : null),
      qty_in_grams: r.qty_in_grams != null ? Number(r.qty_in_grams) : (r.qtyInGrams != null ? Number(r.qtyInGrams) : null),
      qty_in_ml: r.qty_in_ml != null ? Number(r.qty_in_ml) : (r.qtyInMl != null ? Number(r.qtyInMl) : null),
      qty_in_piece: r.qty_in_piece != null ? Number(r.qty_in_piece) : (r.qtyInPiece != null ? Number(r.qtyInPiece) : null),
      unused: !!r.unused
    };
  }

  function buildScoopCatalog(rows, suffix, scoopField) {
    return rows
      .filter(r => endsWithSuffix(r.scoop_name, suffix))
      .map(r => ({
        itemname: r.scoop_item_name || '',
        [scoopField]: r.scoop_name,
        factor: r.factor != null ? Number(r.factor) : null
      }));
  }

  function buildRecipeScoopCatalog(rows) {
    return rows
      .filter(r => endsWithSuffix(r.scoop_name, '_reciepe') || endsWithSuffix(r.scoop_name, '_recipe'))
      .map(r => ({
        recipeItemName: r.scoop_item_name || '',
        recipeScoop: r.scoop_name
      }));
  }

  function buildInventoryCatalog(rows) {
    const out = {};
    rows
      .filter(r => endsWithSuffix(r.scoop_name, '_inventory'))
      .forEach(r => {
        if (r.scoop_item_name) out[r.scoop_item_name] = r.scoop_name;
      });
    return out;
  }

  function dishNameFromScoopRow(r, dishCatalog) {
    const rawName = String(r.scoop_item_name || '').trim();
    const rawId = String(r.scoop_item_id != null ? r.scoop_item_id : '').trim();
    const byCode = new Map();
    (dishCatalog || []).forEach(d => {
      const code = String(d.dishCode || d.dish_code || '').trim().toLowerCase();
      const name = String(d.dishName || d.dishname || '').trim();
      if (code) byCode.set(code, name);
    });
    if (rawName && !byCode.has(rawName.toLowerCase())) return rawName;
    if (rawId && byCode.has(rawId.toLowerCase())) return byCode.get(rawId.toLowerCase());
    if (rawName && byCode.has(rawName.toLowerCase())) return byCode.get(rawName.toLowerCase());
    return rawName || rawId;
  }

  /** Scoops valid for Recipe Maker “Dish Out” (excludes purchase/inventory; keeps portion, recipe, custom e.g. _peda). */
  function isDishOutPickerScoop(scoopName) {
    const s = String(scoopName || '').toLowerCase();
    if (!s) return false;
    if (endsWithSuffix(s, '_in') || endsWithSuffix(s, '_inventory')) return false;
    if (endsWithSuffix(s, '_out') && !endsWithSuffix(s, '_1_portion')) return false;
    return true;
  }

  /** Map lowercased dish name / dish code → scoop_config rows for that dish. */
  function buildScoopConfigByDishName(scoopRows, dishCatalog) {
    const out = {};
    const nameByCode = new Map();
    (dishCatalog || []).forEach(d => {
      const code = String(d.dishCode || d.dish_code || '').trim().toLowerCase();
      const name = String(d.dishName || d.dishname || '').trim();
      if (code && name) nameByCode.set(code, name);
    });

    function addKey(key, picker) {
      const k = String(key || '').trim().toLowerCase();
      if (!k) return;
      if (!out[k]) out[k] = [];
      if (out[k].some(x => x.scoop_name === picker.scoop_name)) return;
      out[k].push(picker);
    }

    (scoopRows || []).map(normalizeScoopRow).filter(r => r.scoop_name && !r.unused).forEach(r => {
      const picker = {
        scoop_name: r.scoop_name,
        destination_unit: r.destination_unit || '',
        factor: r.factor != null ? Number(r.factor) : null,
        qty_in_grams: r.qty_in_grams != null ? Number(r.qty_in_grams) : null,
        qty_in_ml: r.qty_in_ml != null ? Number(r.qty_in_ml) : null,
        qty_in_piece: r.qty_in_piece != null ? Number(r.qty_in_piece) : null
      };
      const itemName = String(r.scoop_item_name || '').trim();
      const itemId = String(r.scoop_item_id != null ? r.scoop_item_id : '').trim();
      addKey(itemName, picker);
      addKey(itemId, picker);
      const resolved = nameByCode.get(itemName.toLowerCase()) || nameByCode.get(itemId.toLowerCase());
      if (resolved) addKey(resolved, picker);
    });
    return out;
  }

  function buildDishOutScoopCatalog(rows, dishNames, dishCatalog) {
    const fromScoops = rows
      .filter(r => isDishOutPickerScoop(r.scoop_name))
      .map(r => ({
        dishname: dishNameFromScoopRow(r, dishCatalog),
        dish_out_scoop: r.scoop_name
      }))
      .filter(e => e.dishname && e.dish_out_scoop);

    if (fromScoops.length) return fromScoops;

    return (dishNames || []).map(name => ({
      dishname: name,
      dish_out_scoop: name + '_1_portion'
    }));
  }

  /** @param {object[]} scoopRows normalized scoop_config rows */
  function buildScoopDerivedCatalogs(scoopRows, dishNames, dishCatalog) {
    const rows = (scoopRows || []).map(normalizeScoopRow).filter(r => r.scoop_name);
    const catalog = dishCatalog || (dishNames || []).map(name => ({ dishName: name, dishCode: '' }));
    const scoopOutCatalog = buildScoopCatalog(rows, '_out', 'scoop_out');
    return {
      SCOOP_CONFIG: rows,
      SCOOP_IN_CATALOG: buildScoopCatalog(rows, '_in', 'scoop_in'),
      SCOOP_OUT_CATALOG: scoopOutCatalog.map(r => ({
        itemname: r.itemname,
        scoop_out: r.scoop_out,
        defaultQty: r.factor
      })),
      RECIPE_SCOOP_CATALOG: buildRecipeScoopCatalog(rows),
      DISH_OUT_SCOOP_CATALOG: buildDishOutScoopCatalog(rows, dishNames, catalog),
      SCOOP_INVENTORY_CATALOG: buildInventoryCatalog(rows)
    };
  }

  const api = {
    ALL_ITEMS,
    endsWithSuffix,
    splitCsvLine,
    parseCatalogBlock,
    parseScoopConfigCsv,
    normalizeScoopRow,
    buildScoopDerivedCatalogs,
    buildScoopCatalog,
    buildRecipeScoopCatalog,
    buildInventoryCatalog,
    buildDishOutScoopCatalog,
    buildScoopConfigByDishName,
    isDishOutPickerScoop,
    dishNameFromScoopRow
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ScoopStaticBuilders = api;
  }
})(typeof window !== 'undefined' ? window : global);
