/* Item Details — scoops + conversion chains (multiple chains per item) */
(function (global) {
  "use strict";

  const INTERNAL_KEYS = [
    "itemname", "base_unit", "scoop_in", "scoop_in_factor",
    "scoop_out", "scoop_out_factor", "scoop_recipe", "scoop_recipe_factor",
    "conversion_chain"
  ];
  const EXPORT_CSV_HEADER = [
    "Item Name", "Pg No", "Destination Unit", "Saved as", "factor", "Chain",
    "qty_in_grams", "qty_in_ml", "qty_in_piece"
  ];
  const STORAGE_KEY = "inventory_scoop_config";
  const CHAIN_SEP = ";;";

  let catalog = [];
  let dishCatalog = [];
  let entityType = "item";
  let unitConversions = [];
  let attachComboFn = null;
  let isServerModeFn = () => false;
  let postJSONFn = null;

  /** @type {{ rows: {thisUnit:string,qty:string,next:string}[], done: boolean }[]} */
  let chains = [];
  let activeChainIdx = -1;
  let destUnit = "";
  let listRows = [];

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function csvQ(v) {
    return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  }

  function getItem() {
    return document.getElementById("itemDetailsName").value.trim();
  }

  function getEntityId() {
    return document.getElementById("itemDetailsPgNo").value.trim();
  }

  function isDishMode() {
    return entityType === "dish";
  }

  function getDestUnit() {
    return document.getElementById("itemDetailsDestUnit").value;
  }

  function setMsg(text, kind) {
    const el = document.getElementById("itemDetailsMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind || "";
  }

  function normUnit(u) {
    const t = String(u || "").trim().toLowerCase();
    if (!t) return "";
    if (t === "g" || t === "gm" || t === "gms" || t === "gram" || t === "grams") return "gm";
    if (t === "kg" || t === "kgs" || t === "kilo" || t === "kilos" || t === "kilogram" || t === "kilograms") return "kg";
    if (t === "ml" || t === "mls" || t === "millilitre" || t === "milliliter") return "ml";
    if (t === "l" || t === "lt" || t === "ltr" || t === "litre" || t === "liter") return "l";
    if (t === "pc" || t === "pcs" || t === "piece" || t === "pieces") return "piece";
    return t;
  }

  function unitsMatch(a, b) {
    const na = normUnit(a);
    return !!na && na === normUnit(b);
  }

  function unitToScoopSlug(unitLabel, itemname) {
    const t = normUnit(unitLabel) || String(unitLabel || "").trim().toLowerCase();
    if (!t) return "";
    if (t === "gm" || t === "ml" || t === "piece") return t;
    for (const c of unitConversions) {
      if (c.itemname && c.itemname !== itemname) continue;
      if (c.from_unit === t || String(c.from_label).toLowerCase() === t) return c.from_unit;
      if (c.to_unit === t) return c.to_unit;
    }
    return t.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  }

  function scoopKindSuffix(kind) {
    if (kind === "stock") return "inventory";
    if (kind === "recipe") return "reciepe";
    return kind;
  }

  function scoopComputedName(item, kind, unitLabel) {
    if (!item || !unitLabel) return "";
    const slug = unitToScoopSlug(unitLabel, item);
    return item + "_" + slug + "_" + scoopKindSuffix(kind);
  }

  /** Unit-only scoop name for chain roots not yet assigned IN/OUT/RECIPE (no suffix). */
  function scoopUnitOnlyName(item, unitLabel) {
    if (!item || !unitLabel) return "";
    const slug = unitToScoopSlug(unitLabel, item);
    return item + "_" + slug;
  }

  /** Backward compat: older saves used scoop_stock / _inventory. */
  function normalizeConfigRow(r) {
    if (!r.scoop_recipe && r.scoop_stock) {
      r.scoop_recipe = r.scoop_stock;
      r.scoop_recipe_factor = r.scoop_stock_factor;
      r.scoop_recipe_saved = r.scoop_stock_saved;
    }
    return r;
  }

  function chainsToString(chainList) {
    const list = chainList || completedChains();
    return list.map(chain =>
      chain.rows.map(r => r.thisUnit + ":" + r.qty + ":" + r.next).join("|")
    ).join(CHAIN_SEP);
  }

  function parseChainStrings(conversionChain) {
    if (!conversionChain) return [];
    return String(conversionChain).split(CHAIN_SEP).filter(Boolean).map(s => {
      const rows = s.split("|").map(part => {
        const p = part.split(":");
        return { thisUnit: p[0] || "", qty: p[1] || "", next: p[2] || "" };
      }).filter(r => r.thisUnit);
      return { rows, done: true };
    });
  }

  function chainToString(chain) {
    return chain.rows.map(r => r.thisUnit + ":" + r.qty + ":" + r.next).join("|");
  }

  function factorForUnit(unit, chainRows, dest) {
    if (!unit) return null;
    if (unitsMatch(unit, dest)) return 1;
    const idx = chainRows.findIndex(r => unitsMatch(r.thisUnit, unit) || r.thisUnit === unit);
    if (idx < 0) return null;
    let f = 1;
    for (let i = idx; i < chainRows.length; i++) {
      const step = parseFloat(chainRows[i].qty);
      if (isNaN(step) || step <= 0) return null;
      f *= step;
    }
    return f;
  }

  function chainForUnit(unit, parsedChains, dest, fullChain) {
    if (unitsMatch(unit, dest)) return fullChain;
    for (let i = 0; i < parsedChains.length; i++) {
      const chain = parsedChains[i];
      if (chain.rows.some(r => unitsMatch(r.thisUnit, unit) || r.thisUnit === unit)) {
        return chainToString(chain);
      }
    }
    return fullChain;
  }

  function unitSelectedAsScoop(unit, r) {
    return [r.scoop_in, r.scoop_out, r.scoop_recipe].some(u =>
      u && (unitsMatch(u, unit) || u === unit)
    );
  }

  /** Flat display/export rows: 3 selected scoops + auto rows for unused chain roots. */
  function expandConfigToDisplayRows(r) {
    normalizeConfigRow(r);
    const fullChain = r.conversion_chain || "";
    const parsed = parseChainStrings(fullChain);
    const dest = r.base_unit || "";
    const rows = [];

    [
      {
        unit: r.scoop_in,
        saved: r.scoop_in_saved || scoopComputedName(r.itemname, "in", r.scoop_in),
        factor: r.scoop_in_factor
      },
      {
        unit: r.scoop_out,
        saved: r.scoop_out_saved || scoopComputedName(r.itemname, "out", r.scoop_out),
        factor: r.scoop_out_factor
      },
      {
        unit: r.scoop_recipe,
        saved: r.scoop_recipe_saved || scoopComputedName(r.itemname, "recipe", r.scoop_recipe),
        factor: r.scoop_recipe_factor
      }
    ].forEach(sc => {
      if (!sc.unit) return;
      rows.push({
        itemname: r.itemname,
        pgNo: r.pgNo || resolveEntityId(r.itemname, ""),
        base_unit: dest,
        saved: sc.saved,
        factor: sc.factor,
        chain: chainForUnit(sc.unit, parsed, dest, fullChain),
        unused: false
      });
    });

    parsed.forEach(chain => {
      const root = chain.rows[0] && chain.rows[0].thisUnit;
      if (!root || unitsMatch(root, dest) || unitSelectedAsScoop(root, r)) return;
      const factor = factorForUnit(root, chain.rows, dest);
      if (factor == null) return;
      rows.push({
        itemname: r.itemname,
        pgNo: r.pgNo || resolveEntityId(r.itemname, ""),
        base_unit: dest,
        saved: scoopUnitOnlyName(r.itemname, root),
        factor: factor,
        chain: chainToString(chain),
        unused: true
      });
    });

    return rows;
  }

  function completedChains() {
    return chains.filter(c => c.done);
  }

  function chainUnits() {
    const units = [];
    chains.forEach(chain => {
      chain.rows.forEach(r => {
        if (r.thisUnit && !units.includes(r.thisUnit)) units.push(r.thisUnit);
      });
    });
    if (destUnit && !units.includes(destUnit)) units.push(destUnit);
    return units;
  }

  function factorFor(scoopName) {
    if (!scoopName) return null;
    if (unitsMatch(scoopName, destUnit)) return 1;

    for (const chain of completedChains()) {
      const rows = chain.rows;
      const idx = rows.findIndex(r => unitsMatch(r.thisUnit, scoopName) || r.thisUnit === scoopName);
      if (idx < 0) continue;
      let f = 1;
      for (let i = idx; i < rows.length; i++) {
        const step = parseFloat(rows[i].qty);
        if (isNaN(step) || step <= 0) return null;
        f *= step;
      }
      return f;
    }
    return null;
  }

  function chainsToStringFromLive() {
    return chainsToString(completedChains());
  }

  function lookupPgNo(itemname) {
    const entry = catalog.find(e => e.itemname === itemname);
    return entry ? String(entry.pgNo || entry.pg_no || "") : "";
  }

  function lookupDishCode(dishName) {
    const entry = dishCatalog.find(e => (e.dishName || e.dishname) === dishName);
    return entry ? String(entry.dishCode || entry.dish_code || "") : "";
  }

  function resolveEntityId(name, pgNoOnRow) {
    if (pgNoOnRow) return pgNoOnRow;
    return lookupDishCode(name) || lookupPgNo(name);
  }

  function qtyColsForDest(destUnit, factor) {
    const d = normUnit(destUnit);
    const f = factor != null && factor !== "" ? factor : "";
    if (d === "gm") return { qty_in_grams: f, qty_in_ml: "", qty_in_piece: "" };
    if (d === "ml") return { qty_in_grams: "", qty_in_ml: f, qty_in_piece: "" };
    if (d === "piece") return { qty_in_grams: "", qty_in_ml: "", qty_in_piece: f };
    return { qty_in_grams: "", qty_in_ml: "", qty_in_piece: "" };
  }

  function parseCsvLine(line) {
    const cols = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
    return cols.map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
  }

  function savedAsKind(saved) {
    const s = String(saved || "");
    if (/_in$/i.test(s)) return "in";
    if (/_out$/i.test(s)) return "out";
    if (/_reciepe$/i.test(s)) return "recipe";
    if (/_inventory$/i.test(s)) return "recipe";
    return "";
  }

  function isUnusedScoopName(saved, itemname) {
    if (!saved || savedAsKind(saved)) return false;
    const prefix = itemname + "_";
    return saved.startsWith(prefix) && saved.length > prefix.length;
  }

  function isFlatListRow(r) {
    return !!(r && r.saved != null && r.chain != null && r.scoop_in == null && r.conversion_chain == null);
  }

  function flattenListRows(rows) {
    const out = [];
    (rows || []).forEach(r => {
      normalizeConfigRow(r);
      if (isFlatListRow(r)) {
        out.push({
          itemname: r.itemname,
          pgNo: r.pgNo || resolveEntityId(r.itemname, ""),
          base_unit: r.base_unit,
          saved: r.saved,
          factor: r.factor,
          chain: r.chain,
          unused: !!r.unused || isUnusedScoopName(r.saved, r.itemname)
        });
      } else if (r.scoop_in || r.conversion_chain) {
        expandConfigToDisplayRows(r).forEach(row => out.push(row));
      }
    });
    return out;
  }

  function buildConfigFromForm(item, destUnit, si, so, sr, sif, sof, srf) {
    return {
      itemname: item,
      pgNo: getEntityId(),
      base_unit: destUnit,
      scoop_in: si,
      scoop_in_factor: sif,
      scoop_out: so,
      scoop_out_factor: sof,
      scoop_recipe: sr,
      scoop_recipe_factor: srf,
      conversion_chain: chainsToString(),
      scoop_in_saved: scoopComputedName(item, "in", si),
      scoop_out_saved: scoopComputedName(item, "out", so),
      scoop_recipe_saved: scoopComputedName(item, "recipe", sr)
    };
  }

  function unitFromSavedAs(saved, itemname, kind) {
    const suffix = "_" + scoopKindSuffix(kind);
    const s = String(saved || "");
    if (!s.endsWith(suffix)) return "";
    const prefix = itemname + "_";
    if (!s.startsWith(prefix)) return "";
    return s.slice(prefix.length, -suffix.length);
  }

  function flatRowToExportCsvRow(r) {
    const pg = resolveEntityId(r.itemname, r.pgNo);
    const qty = qtyColsForDest(r.base_unit, r.factor);
    return [
      r.itemname,
      pg,
      r.base_unit,
      r.saved,
      r.factor,
      r.chain,
      qty.qty_in_grams,
      qty.qty_in_ml,
      qty.qty_in_piece
    ];
  }

  function toCsv() {
    if (!listRows.length) return "-- add items to see preview --";
    const lines = [EXPORT_CSV_HEADER.map(csvQ).join(",")];
    listRows.forEach(r => {
      lines.push(flatRowToExportCsvRow(r).map(csvQ).join(","));
    });
    return lines.join("\r\n");
  }

  function importFromExportCsv(lines, header) {
    const hi = name => header.indexOf(name);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i]);
      if (!vals.length) continue;
      const itemname = vals[hi("Item Name")] != null ? vals[hi("Item Name")] : vals[0];
      if (!itemname) continue;
      const dest = vals[hi("Destination Unit")] != null ? vals[hi("Destination Unit")] : vals[2];
      const saved = vals[hi("Saved as")] != null ? vals[hi("Saved as")] : vals[3];
      const factor = parseFloat(vals[hi("factor")] != null ? vals[hi("factor")] : vals[4]) || 0;
      const chain = vals[hi("Chain")] != null ? vals[hi("Chain")] : vals[5];
      rows.push({
        itemname: itemname,
        base_unit: dest,
        saved: saved,
        factor: factor,
        chain: chain,
        unused: isUnusedScoopName(saved, itemname)
      });
    }
    return rows;
  }

  function importFromInternalCsv(lines, header) {
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i]);
      const row = {};
      INTERNAL_KEYS.forEach((k, j) => {
        const hi = header.indexOf(k);
        row[k] = hi >= 0 && vals[hi] != null ? vals[hi] : (vals[j] || "");
      });
      if (header.indexOf("scoop_stock") >= 0 && !row.scoop_recipe) {
        const hi = header.indexOf("scoop_stock");
        row.scoop_recipe = vals[hi] != null ? vals[hi] : "";
        const hf = header.indexOf("scoop_stock_factor");
        if (hf >= 0) row.scoop_recipe_factor = vals[hf] != null ? vals[hf] : "";
      }
      if (!row.itemname) continue;
      if (row.scoop_stock && !row.scoop_recipe) {
        row.scoop_recipe = row.scoop_stock;
        row.scoop_recipe_factor = row.scoop_stock_factor;
      }
      row.scoop_in_factor = parseFloat(row.scoop_in_factor) || 0;
      row.scoop_out_factor = parseFloat(row.scoop_out_factor) || 0;
      row.scoop_recipe_factor = parseFloat(row.scoop_recipe_factor) || 0;
      row.scoop_in_saved = row.scoop_in_saved || scoopComputedName(row.itemname, "in", row.scoop_in);
      row.scoop_out_saved = row.scoop_out_saved || scoopComputedName(row.itemname, "out", row.scoop_out);
      row.scoop_recipe_saved = row.scoop_recipe_saved || scoopComputedName(row.itemname, "recipe", row.scoop_recipe);
      expandConfigToDisplayRows(row).forEach(flat => rows.push(flat));
    }
    return rows;
  }

  function syncRowFromDom(chainIdx, rowIdx) {
    const wrap = document.querySelector(
      '.chain-row[data-chain-idx="' + chainIdx + '"][data-row-idx="' + rowIdx + '"]'
    );
    if (!wrap || !chains[chainIdx] || !chains[chainIdx].rows[rowIdx]) return;
    const row = chains[chainIdx].rows[rowIdx];
    const thisEl = wrap.querySelector(".c-this");
    if (thisEl && !thisEl.readOnly) row.thisUnit = thisEl.value.trim();
    row.qty = wrap.querySelector(".c-qty").value.trim();
    row.next = wrap.querySelector(".c-next").value.trim();
  }

  function updateChainButtons() {
    const ready = !!(getItem() && getDestUnit());
    const active = activeChainIdx >= 0 ? chains[activeChainIdx] : null;
    const activeInProgress = !!(active && !active.done);
    const canAddStep = ready && (activeChainIdx < 0 || activeInProgress);
    const canAddChain = ready && completedChains().length > 0 && !activeInProgress;

    document.getElementById("itemDetailsAddStepBtn").disabled = !canAddStep;
    document.getElementById("itemDetailsNewChainBtn").disabled = !canAddChain;
  }

  function updateEntityTypeUi() {
    const dish = isDishMode();
    document.getElementById("itemDetailsNameLabel").textContent = dish ? "Dish Name *" : "Item Name *";
    document.getElementById("itemDetailsPgNoLabel").textContent = dish ? "Dish Code" : "Pg No";
    document.getElementById("itemDetailsName").placeholder = dish ? "Search dish..." : "Search item...";
  }

  function onEntityTypeChange() {
    entityType = document.getElementById("itemDetailsEntityType").value || "item";
    document.getElementById("itemDetailsName").value = "";
    document.getElementById("itemDetailsPgNo").value = "";
    updateEntityTypeUi();
    onItemOrDestChange();
  }

  function onItemOrDestChange() {
    destUnit = getDestUnit();
    const item = getItem();
    if (isDishMode()) {
      const entry = dishCatalog.find(e => (e.dishName || e.dishname) === item);
      document.getElementById("itemDetailsPgNo").value = entry ? (entry.dishCode || entry.dish_code || "") : "";
      document.getElementById("itemDetailsHint").textContent = !item
        ? "Search & select a dish to begin"
        : destUnit
          ? "Each chain must end at: " + destUnit + " — use + Add Chain for another path (Bag, packet, …)"
          : "Select destination unit";
    } else {
      const entry = catalog.find(e => e.itemname === item);
      document.getElementById("itemDetailsPgNo").value = entry ? (entry.pgNo || entry.pg_no || "") : "";
      document.getElementById("itemDetailsHint").textContent = !item
        ? "Search & select a raw material to begin"
        : destUnit
          ? "Each chain must end at: " + destUnit + " — use + Add Chain for another path (Bag, packet, …)"
          : "Select destination unit";
    }
    resetChains();
  }

  function resetChains() {
    chains = [];
    activeChainIdx = -1;
    document.getElementById("itemDetailsChainRows").innerHTML = "";
    destUnit = getDestUnit();
    const ready = !!(getItem() && destUnit);

    document.getElementById("itemDetailsScoopPanel").style.display = ready ? "block" : "none";
    document.getElementById("itemDetailsChainSection").style.display = ready ? "block" : "none";

    ["itemDetailsScoopInName", "itemDetailsScoopOutName", "itemDetailsScoopRecipeName"].forEach(id => {
      document.getElementById(id).textContent = "\u00a0";
    });
    ["itemDetailsScoopIn", "itemDetailsScoopOut", "itemDetailsScoopRecipe"].forEach(id => {
      const sel = document.getElementById(id);
      sel.innerHTML = '<option value="">-- pick --</option>';
      sel.value = "";
    });

    updateChainButtons();
    if (ready) buildScoopOptions(destUnit, destUnit, destUnit);
  }

  function startNewChain() {
    chains.push({ rows: [], done: false });
    activeChainIdx = chains.length - 1;
  }

  function addNewChain() {
    if (activeChainIdx >= 0 && !chains[activeChainIdx].done) return;
    startNewChain();
    addChainRow();
  }

  function ensureActiveChain() {
    if (activeChainIdx < 0 || chains[activeChainIdx].done) startNewChain();
    return activeChainIdx;
  }

  function renderAllChains(focusTarget) {
    const container = document.getElementById("itemDetailsChainRows");
    container.innerHTML = "";

    chains.forEach((chain, chainIdx) => {
      const group = document.createElement("div");
      group.className = "chain-group";
      group.dataset.chainIdx = String(chainIdx);

      const head = document.createElement("div");
      head.className = "chain-group-head";
      head.innerHTML =
        "<strong>Chain " + (chainIdx + 1) + "</strong>" +
        (chain.done
          ? '<span class="chain-done-badge">&#10003; complete</span>'
          : '<span class="chain-open-badge">in progress</span>') +
        '<button type="button" class="danger mini chain-delete">Remove</button>';
      group.appendChild(head);

      chain.rows.forEach((row, rowIdx) => {
        if (rowIdx > 0) {
          const arr = document.createElement("div");
          arr.className = "chain-arrow";
          arr.textContent = "\u2193";
          group.appendChild(arr);
        }

        const thisEditable = rowIdx === 0;
        const isDest = unitsMatch(row.next, destUnit);
        const wrap = document.createElement("div");
        wrap.className = "chain-row";
        wrap.dataset.chainIdx = String(chainIdx);
        wrap.dataset.rowIdx = String(rowIdx);
        wrap.innerHTML =
          '<span class="lbl">1</span>' +
          '<input type="text" class="c-this' + (thisEditable ? "" : " readonly-this") + '" value="' + escHtml(row.thisUnit) + '" placeholder="' + (thisEditable ? "e.g. Bag" : "") + '"' + (thisEditable ? "" : " readonly") + " />" +
          '<span class="contains"> contains </span>' +
          '<input type="text" class="c-qty" inputmode="decimal" placeholder="e.g. 25" value="' + escHtml(row.qty) + '" />' +
          '<input type="text" class="c-next" placeholder="' + escHtml(destUnit) + '" value="' + escHtml(row.next) + '" />' +
          (isDest ? '<span class="base-badge">&#10003; ' + escHtml(destUnit) + "</span>" : "") +
          '<button type="button" class="danger chain-remove">&times;</button>';

        if (thisEditable) {
          wrap.querySelector(".c-this").addEventListener("input", () => {
            syncRowFromDom(chainIdx, rowIdx);
            buildScoopOptions();
          });
        }
        wrap.querySelector(".c-qty").addEventListener("input", () => onQtyOrNextEdit(chainIdx, rowIdx, "qty"));
        wrap.querySelector(".c-next").addEventListener("input", () => onQtyOrNextEdit(chainIdx, rowIdx, "next"));
        wrap.querySelector(".chain-remove").addEventListener("click", () => removeChainRow(chainIdx, rowIdx));

        group.appendChild(wrap);
      });

      head.querySelector(".chain-delete").addEventListener("click", () => removeWholeChain(chainIdx));
      container.appendChild(group);
    });

    if (focusTarget) {
      const el = document.querySelector(
        '.chain-row[data-chain-idx="' + focusTarget.chainIdx + '"][data-row-idx="' + focusTarget.rowIdx + '"] .' + focusTarget.cls
      );
      if (el) {
        el.focus();
        const len = el.value.length;
        try { el.setSelectionRange(len, len); } catch (e) { /* ignore */ }
      }
    }
  }

  /** Avoid full re-render on every qty keystroke so typing 25 / 1000 works. */
  function onQtyOrNextEdit(chainIdx, rowIdx, field) {
    syncRowFromDom(chainIdx, rowIdx);
    const chain = chains[chainIdx];
    const row = chain.rows[rowIdx];
    if (!row) return;

    const reachesDest = unitsMatch(row.next, destUnit);
    const wasDone = chain.done;
    const hasTrailing = chain.rows.length > rowIdx + 1;

    if (reachesDest) {
      if (hasTrailing) {
        chain.rows = chain.rows.slice(0, rowIdx + 1);
        chain.done = true;
        renderAllChains({ chainIdx: chainIdx, rowIdx: rowIdx, cls: "c-" + field });
      } else if (!wasDone) {
        chain.done = true;
        updateRowDestBadge(chainIdx, rowIdx, true);
        updateChainHead(chainIdx);
      }
      updateChainButtons();
      buildScoopOptions();
      return;
    }

    if (wasDone || hasTrailing) {
      chain.done = false;
      chain.rows = chain.rows.slice(0, rowIdx + 1);
      renderAllChains({ chainIdx: chainIdx, rowIdx: rowIdx, cls: "c-" + field });
      updateChainButtons();
      buildScoopOptions();
    } else {
      updateRowDestBadge(chainIdx, rowIdx, false);
      updateChainButtons();
      buildScoopOptions();
    }
  }

  function updateRowDestBadge(chainIdx, rowIdx, show) {
    const wrap = document.querySelector(
      '.chain-row[data-chain-idx="' + chainIdx + '"][data-row-idx="' + rowIdx + '"]'
    );
    if (!wrap) return;
    let badge = wrap.querySelector(".base-badge");
    if (show && !badge) {
      badge = document.createElement("span");
      badge.className = "base-badge";
      badge.innerHTML = "&#10003; " + escHtml(destUnit);
      wrap.querySelector(".chain-remove").before(badge);
    } else if (!show && badge) {
      badge.remove();
    }
  }

  function updateChainHead(chainIdx) {
    const group = document.querySelector('.chain-group[data-chain-idx="' + chainIdx + '"]');
    if (!group) return;
    const head = group.querySelector(".chain-group-head");
    if (!head) return;
    const chain = chains[chainIdx];
    head.innerHTML =
      "<strong>Chain " + (chainIdx + 1) + "</strong>" +
      (chain.done
        ? '<span class="chain-done-badge">&#10003; complete</span>'
        : '<span class="chain-open-badge">in progress</span>') +
      '<button type="button" class="danger mini chain-delete">Remove</button>';
    head.querySelector(".chain-delete").addEventListener("click", () => removeWholeChain(chainIdx));
  }

  function addChainRow(d) {
    d = d || {};
    const chainIdx = ensureActiveChain();
    const chain = chains[chainIdx];
    const rowIdx = chain.rows.length;
    const prefillThis = rowIdx === 0 ? (d.thisUnit || "") : (chain.rows[rowIdx - 1].next || "");

    chain.rows.push({
      thisUnit: prefillThis,
      qty: d.qty != null ? String(d.qty) : "",
      next: d.next || ""
    });
    if (d.next && unitsMatch(d.next, destUnit)) chain.done = true;

    renderAllChains({
      chainIdx: chainIdx,
      rowIdx: rowIdx,
      cls: rowIdx === 0 ? "c-this" : "c-qty"
    });
    updateChainButtons();
    buildScoopOptions();
  }

  function removeChainRow(chainIdx, rowIdx) {
    const chain = chains[chainIdx];
    if (!chain) return;
    chain.rows = chain.rows.slice(0, rowIdx);
    chain.done = false;
    if (!chain.rows.length) {
      if (chains.length > 1) {
        removeWholeChain(chainIdx);
        return;
      }
      activeChainIdx = chainIdx;
    } else {
      activeChainIdx = chainIdx;
    }
    renderAllChains();
    updateChainButtons();
    buildScoopOptions();
  }

  function removeWholeChain(chainIdx) {
    chains.splice(chainIdx, 1);
    if (activeChainIdx === chainIdx) {
      activeChainIdx = chains.length ? Math.min(chainIdx, chains.length - 1) : -1;
    } else if (activeChainIdx > chainIdx) {
      activeChainIdx--;
    }
    if (chains.length && activeChainIdx < 0) activeChainIdx = chains.length - 1;
    renderAllChains();
    updateChainButtons();
    buildScoopOptions();
  }

  function buildScoopOptions(defIn, defOut, defRecipe) {
    const units = chainUnits();
    const defs = {
      itemDetailsScoopIn: defIn,
      itemDetailsScoopOut: defOut,
      itemDetailsScoopRecipe: defRecipe
    };

    ["itemDetailsScoopIn", "itemDetailsScoopOut", "itemDetailsScoopRecipe"].forEach(id => {
      const sel = document.getElementById(id);
      let cur = sel.value;
      if (!units.includes(cur)) cur = defs[id] || destUnit || "";
      sel.innerHTML = '<option value="">-- pick --</option>';
      units.forEach(u => {
        const o = document.createElement("option");
        o.value = u;
        o.textContent = u;
        if (u === cur) o.selected = true;
        sel.appendChild(o);
      });
    });
    onScoopChange();
  }

  function onScoopChange() {
    const item = getItem();
    const si = document.getElementById("itemDetailsScoopIn").value;
    const so = document.getElementById("itemDetailsScoopOut").value;
    const sr = document.getElementById("itemDetailsScoopRecipe").value;

    document.getElementById("itemDetailsScoopInName").textContent =
      si ? scoopComputedName(item, "in", si) : "\u00a0";
    document.getElementById("itemDetailsScoopOutName").textContent =
      so ? scoopComputedName(item, "out", so) : "\u00a0";
    document.getElementById("itemDetailsScoopRecipeName").textContent =
      sr ? scoopComputedName(item, "recipe", sr) : "\u00a0";
    renderPreview();
  }

  function refreshDoneFlags() {
    chains.forEach((chain, ci) => {
      chain.rows.forEach((_, ri) => syncRowFromDom(ci, ri));
      const last = chain.rows[chain.rows.length - 1];
      chain.done = !!(
        last &&
        unitsMatch(last.next, destUnit) &&
        chain.rows.every(r => r.thisUnit && r.next && parseFloat(r.qty) > 0)
      );
    });
  }

  function addToList() {
    const item = getItem();
    destUnit = getDestUnit();
    if (!item) { alert(isDishMode() ? "Select a dish." : "Select a raw material."); return; }
    if (!destUnit) { alert("Select destination unit."); return; }

    // Drop blank unfinished chains (e.g. user clicked + Add Chain then didn't fill it)
    for (let i = chains.length - 1; i >= 0; i--) {
      const c = chains[i];
      const blank = !c.rows.length || c.rows.every(r => !r.thisUnit && !r.qty && !r.next);
      if (!c.done && blank) {
        chains.splice(i, 1);
        if (activeChainIdx >= i) activeChainIdx = Math.max(activeChainIdx - 1, chains.length - 1);
      }
    }

    refreshDoneFlags();

    const done = completedChains();
    if (!done.length) {
      alert(
        "Complete at least one conversion chain until NEXT reaches " + destUnit + ".\n" +
        "Example:\n  1 Bag contains 25 kg\n  1 kg contains 1000 gm"
      );
      updateChainButtons();
      renderAllChains();
      return;
    }

    const incomplete = chains.filter(c => !c.done && c.rows.length);
    if (incomplete.length) {
      alert(
        "Finish or remove incomplete chain(s) before adding.\n" +
        "Completed: " + done.length + ", incomplete: " + incomplete.length
      );
      return;
    }

    // Re-point active chain to last completed one
    activeChainIdx = chains.length - 1;
    updateChainButtons();
    renderAllChains();
    buildScoopOptions();

    const si = document.getElementById("itemDetailsScoopIn").value;
    const so = document.getElementById("itemDetailsScoopOut").value;
    const sr = document.getElementById("itemDetailsScoopRecipe").value;
    const units = chainUnits();

    if (!si || !units.includes(si)) { alert("Pick Scoop IN from the chain units."); return; }
    if (!so || !units.includes(so)) { alert("Pick Scoop OUT from the chain units."); return; }
    if (!sr || !units.includes(sr)) { alert("Pick Scoop RECIPE from the chain units."); return; }

    const sif = factorFor(si);
    const sof = factorFor(so);
    const srf = factorFor(sr);
    if (sif == null) { alert("Cannot compute IN factor for \"" + si + "\"."); return; }
    if (sof == null) { alert("Cannot compute OUT factor for \"" + so + "\"."); return; }
    if (srf == null) { alert("Cannot compute RECIPE factor for \"" + sr + "\"."); return; }

    const addedRows = expandConfigToDisplayRows(buildConfigFromForm(item, destUnit, si, so, sr, sif, sof, srf));
    addedRows.forEach(row => listRows.push(row));

    renderList();
    renderPreview();
    setMsg("Added " + addedRows.length + " row(s) for " + item, "ok");
  }

  function removeListRow(idx) {
    listRows.splice(idx, 1);
    renderList();
    renderPreview();
  }

  function renderList() {
    const tbody = document.getElementById("itemDetailsListBody");
    if (!tbody) return;
    if (!listRows.length) {
      tbody.innerHTML =
        '<tr id="itemDetailsEmptyRow"><td colspan="7" class="item-details-empty">No items added yet</td></tr>';
      return;
    }

    const chainCellStyle = "font-size:11px;color:#555;max-width:260px;word-break:break-all";
    let html = "";
    listRows.forEach((row, idx) => {
      html +=
        "<tr" + (row.unused ? ' class="item-details-unused"' : "") + ">" +
        "<td>" + (idx + 1) + "</td>" +
        "<td>" + escHtml(row.itemname) + "</td>" +
        "<td>" + escHtml(row.base_unit) + "</td>" +
        '<td class="scoop-name">' + escHtml(row.saved) + "</td>" +
        '<td class="num">' + row.factor + "</td>" +
        '<td style="' + chainCellStyle + '">' + escHtml(row.chain) + "</td>" +
        '<td><button type="button" class="danger" data-remove-idx="' + idx + '">&times;</button></td>' +
        "</tr>";
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll("[data-remove-idx]").forEach(btn => {
      btn.addEventListener("click", () => removeListRow(+btn.dataset.removeIdx));
    });
  }

  function renderPreview() {
    document.getElementById("itemDetailsPreview").textContent = toCsv();
  }

  function exportCsv() {
    if (!listRows.length) { alert("Nothing to export."); return; }
    const blob = new Blob(["\uFEFF" + toCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scoop_config.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Exported CSV", "ok");
  }

  function importCsv() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".csv,text/csv";
    inp.onchange = () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result || "").replace(/^\uFEFF/, "");
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (lines.length < 2) { alert("CSV has no data rows."); return; }
          const header = parseCsvLine(lines[0]);
          const isExportFormat = header.indexOf("Saved as") >= 0 || header.indexOf("Item Name") >= 0;
          const rows = isExportFormat
            ? importFromExportCsv(lines, header)
            : importFromInternalCsv(lines, header);
          if (!rows.length) { alert("No valid rows found in CSV."); return; }
          listRows = flattenListRows(rows);
          renderList();
          renderPreview();
          setMsg("Imported " + listRows.length + " row(s)", "ok");
        } catch (e) {
          alert("Import failed: " + e.message);
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  function listRowsForApi() {
    return listRows.map(r => {
      const qty = qtyColsForDest(r.base_unit, r.factor);
      return {
        scoopItemName: r.itemname,
        scoopItemId: resolveEntityId(r.itemname, r.pgNo),
        destinationUnit: r.base_unit,
        scoopName: r.saved,
        factor: r.factor,
        chain: r.chain,
        qtyInGrams: qty.qty_in_grams === "" ? null : qty.qty_in_grams,
        qtyInMl: qty.qty_in_ml === "" ? null : qty.qty_in_ml,
        qtyInPiece: qty.qty_in_piece === "" ? null : qty.qty_in_piece,
        unused: !!r.unused
      };
    });
  }

  function listRowsFromApiRows(apiRows) {
    return (apiRows || []).map(r => ({
      itemname: r.scoop_item_name || r.scoopItemName || r.itemname || "",
      pgNo: r.scoop_item_id || r.scoopItemId || r.pgNo || "",
      base_unit: r.destination_unit || r.destinationUnit || "",
      saved: r.scoop_name || r.scoopName || "",
      factor: parseFloat(r.factor) || 0,
      chain: r.conversion_chain || r.chain || "",
      unused: !!r.unused
    }));
  }

  async function saveDB() {
    if (!listRows.length) { alert("Nothing to save."); return; }

    if (isServerModeFn() && postJSONFn) {
      try {
        const d = await postJSONFn("/api/scoop-config", { rows: listRowsForApi() });
        setMsg("Saved " + d.count + " row(s) to database", "ok");
      } catch (e) {
        alert("Save to DB failed: " + e.message);
      }
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(listRows));
      setMsg("Saved " + listRows.length + " row(s) to browser storage", "ok");
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  }

  async function loadDB() {
    if (isServerModeFn()) {
      try {
        const res = await fetch("/api/scoop-config");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
        listRows = listRowsFromApiRows(data.rows);
        renderList();
        renderPreview();
        setMsg("Loaded " + listRows.length + " row(s) from database", "ok");
      } catch (e) {
        alert("Load from DB failed: " + e.message);
      }
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setMsg("Nothing saved in browser storage", "err"); return; }
      listRows = flattenListRows(JSON.parse(raw));
      renderList();
      renderPreview();
      setMsg("Loaded " + listRows.length + " row(s)", "ok");
    } catch (e) {
      alert("Load failed: " + e.message);
    }
  }

  function clearList() {
    listRows = [];
    renderList();
    renderPreview();
    setMsg("", "");
  }

  function filterItems(term) {
    const q = (term || "").trim().toLowerCase();
    return catalog.map((e, i) => i).filter(i => {
      const name = (catalog[i].itemname || "").toLowerCase();
      const pg = String(catalog[i].pgNo || catalog[i].pg_no || "").toLowerCase();
      return name.includes(q) || pg.includes(q);
    });
  }

  function filterDishes(term) {
    const q = (term || "").trim().toLowerCase();
    return dishCatalog.map((e, i) => i).filter(i => {
      const name = (dishCatalog[i].dishName || dishCatalog[i].dishname || "").toLowerCase();
      const code = String(dishCatalog[i].dishCode || dishCatalog[i].dish_code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }

  function init(opts) {
    catalog = opts.catalog || [];
    dishCatalog = opts.dishCatalog || [];
    unitConversions = opts.unitConversions || [];
    attachComboFn = opts.attachCombo || null;
    isServerModeFn = opts.isServerMode || isServerModeFn;
    postJSONFn = opts.postJSON || null;

    document.getElementById("itemDetailsEntityType").addEventListener("change", onEntityTypeChange);
    document.getElementById("itemDetailsDestUnit").addEventListener("change", onItemOrDestChange);
    updateEntityTypeUi();
    document.getElementById("itemDetailsAddStepBtn").addEventListener("click", () => addChainRow());
    document.getElementById("itemDetailsNewChainBtn").addEventListener("click", addNewChain);
    document.getElementById("itemDetailsAddToListBtn").addEventListener("click", addToList);
    document.getElementById("itemDetailsExportBtn").addEventListener("click", exportCsv);
    document.getElementById("itemDetailsImportBtn").addEventListener("click", importCsv);
    document.getElementById("itemDetailsSaveBtn").addEventListener("click", saveDB);
    document.getElementById("itemDetailsLoadBtn").addEventListener("click", loadDB);
    document.getElementById("itemDetailsClearBtn").addEventListener("click", clearList);

    ["itemDetailsScoopIn", "itemDetailsScoopOut", "itemDetailsScoopRecipe"].forEach(id => {
      document.getElementById(id).addEventListener("change", onScoopChange);
    });

    if (attachComboFn) {
      attachComboFn(
        document.getElementById("itemDetailsName"),
        term => {
          if (isDishMode()) {
            return filterDishes(term).map(i => ({
              key: i,
              label: dishCatalog[i].dishName || dishCatalog[i].dishname,
              sec: String(dishCatalog[i].dishCode || dishCatalog[i].dish_code || "")
            }));
          }
          return filterItems(term).map(i => ({
            key: i,
            label: catalog[i].itemname,
            sec: String(catalog[i].pgNo || catalog[i].pg_no || "")
          }));
        },
        ci => {
          if (ci === null) {
            document.getElementById("itemDetailsName").value = "";
          } else if (isDishMode()) {
            if (dishCatalog[ci] === undefined) {
              document.getElementById("itemDetailsName").value = "";
            } else {
              document.getElementById("itemDetailsName").value =
                dishCatalog[ci].dishName || dishCatalog[ci].dishname;
            }
          } else if (catalog[ci] === undefined) {
            document.getElementById("itemDetailsName").value = "";
          } else {
            document.getElementById("itemDetailsName").value = catalog[ci].itemname;
          }
          onItemOrDestChange();
        }
      );
      document.getElementById("itemDetailsName").addEventListener("input", () => {
        const val = document.getElementById("itemDetailsName").value.trim();
        if (!val) {
          onItemOrDestChange();
          return;
        }
        if (isDishMode()) {
          if (dishCatalog.some(e => (e.dishName || e.dishname) === val)) onItemOrDestChange();
        } else if (catalog.some(e => e.itemname === val)) {
          onItemOrDestChange();
        }
      });
    }

    renderList();
    renderPreview();

    if (!isServerModeFn()) {
      const hint = document.getElementById("itemDetailsDbHint");
      if (hint) hint.textContent = "Save/Load uses browser localStorage offline. Save to DB requires the app server (docker compose up → http://localhost:3050).";
    }
  }

  global.ItemDetails = {
    init: init,
    scoopComputedName: scoopComputedName,
    factorFor: factorFor,
    chainUnits: chainUnits,
    chainsToString: chainsToStringFromLive,
    expandConfigToDisplayRows: expandConfigToDisplayRows
  };
})(typeof window !== "undefined" ? window : global);
