/* Requirement tab — category-filtered items (like Inventory Out); upsert key = date only */
(function (global) {
  "use strict";

  const CSV_HEADER_LEGACY = ["category", "orderer", "dt", "itemname", "pgno", "scoopin", "qty", "comments"];

  let sourceRequirementIds = null;

  function setMsg(text, kind) {
    const el = document.getElementById("reqMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind || "";
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function getReqCategory() {
    const el = document.getElementById("reqCategory");
    return el ? el.value.trim() : "";
  }

  /** Same rules as Inventory Out `allowedOutItems` — uses CATEGORY_ITEMS from static / DB catalog. */
  function allowedReqItems(category) {
    const catalog = global.CATALOG || [];
    const cat = (category || "").trim();
    if (!cat || cat === "ALL") {
      return catalog.map(e => e.itemname);
    }
    const allItems = global.ALL_ITEMS != null ? global.ALL_ITEMS : "All";
    const cfg = (global.CATEGORY_ITEMS || {})[cat];
    if (cfg === undefined || cfg === allItems) {
      return catalog.map(e => e.itemname);
    }
    return cfg.filter(n => catalog.some(e => e.itemname === n));
  }

  function filterReqCatalog(term) {
    const allowed = allowedReqItems(getReqCategory());
    const catalog = global.CATALOG || [];
    const q = (term || "").trim().toLowerCase();
    return catalog
      .map((e, i) => i)
      .filter(i => allowed.indexOf(catalog[i].itemname) >= 0)
      .filter(i =>
        catalog[i].itemname.toLowerCase().includes(q)
        || String(catalog[i].pgNo || "").toLowerCase().includes(q)
      );
  }

  function findCatalogIndex(itemname, pgno) {
    const C = global.Csv;
    if (C && typeof C.findCatalogIndex === "function") {
      return C.findCatalogIndex(itemname, pgno);
    }
    const catalog = global.CATALOG || [];
    const name = String(itemname || "").trim().toLowerCase();
    const pg = String(pgno || "").trim().toLowerCase();
    for (let i = 0; i < catalog.length; i++) {
      const e = catalog[i];
      if (name && e.itemname.toLowerCase() === name) return i;
      if (pg && String(e.pgNo || "").toLowerCase() === pg) return i;
    }
    return -1;
  }

  function applyReqCategoryState(tr) {
    const enabled = !!getReqCategory();
    const nameIn = tr.querySelector(".r-name");
    const pgIn = tr.querySelector(".r-pg");
    if (!nameIn || !pgIn) return;
    nameIn.disabled = pgIn.disabled = !enabled;
    nameIn.placeholder = enabled ? "search item..." : "select category first";
  }

  function onReqCategoryChange() {
    const c = getReqCategory();
    const hint = document.getElementById("reqCategoryHint");
    if (hint) {
      hint.textContent = !c
        ? "Search & select category to load items"
        : (c === "ALL" ? "Merged load — all catalog items" : "Items loaded for " + c);
    }
    document.querySelectorAll("#reqBody tr").forEach(applyReqCategoryState);
    refreshReq();
  }

  function bindCategoryCombo(categories) {
    const el = document.getElementById("reqCategory");
    if (!el || typeof global.attachHeaderCombo !== "function") return;
    global.attachHeaderCombo(el, categories || global.CATEGORIES || [], onReqCategoryChange);
    onReqCategoryChange();
  }

  function mapScoopInFromOut(itemname, scoopOut) {
    const inCat = global.SCOOP_IN_CATALOG || [];
    const outVal = scoopOut != null ? String(scoopOut).trim() : "";
    const name = itemname || "";
    if (outVal) {
      const sameName = inCat.find(s => s.itemname === name && s.scoop_in === outVal);
      if (sameName) return outVal;
    }
    const forItem = inCat.filter(s => s.itemname === name);
    if (forItem.length === 1) return forItem[0].scoop_in;
    return outVal;
  }

  function populateReqRow(tr, row) {
    const ci = findCatalogIndex(row.itemname, row.pgno || row.pgNo);
    if (ci < 0) return false;
    const catalog = global.CATALOG || [];
    const itemName = catalog[ci].itemname;
    const scoops = (global.SCOOP_IN_CATALOG || []).filter(s => s.itemname === itemName);
    tr.dataset.cat = String(ci);
    tr.querySelector(".r-name").value = itemName;
    tr.querySelector(".r-pg").value = row.pgno || row.pgNo || catalog[ci].pgNo || "";
    const scoopIn = row.scoopin || row.scoopIn
      || mapScoopInFromOut(itemName, row.scoop_out || row.scoopOut || "");
    const scoopEl = tr.querySelector(".r-scoop");
    if (scoopIn) {
      tr.dataset.scoop = scoopIn;
      scoopEl.value = scoopIn;
    } else if (scoops.length === 1) {
      tr.dataset.scoop = scoops[0].scoop_in;
      scoopEl.value = scoops[0].scoop_in;
    }
    scoopEl.disabled = scoops.length === 0;
    tr.querySelector(".r-qty").value = row.qty != null && row.qty !== "" ? row.qty : "";
    tr.querySelector(".r-cmt").value = row.comments || "";
    applyReqCategoryState(tr);
    if (typeof global.updateRowStock === "function") global.updateRowStock(tr);
    return true;
  }

  function attachRowCombos(tr) {
    const attach = global.attachCombo;
    if (typeof attach !== "function") return;

    const nameIn = tr.querySelector(".r-name");
    const pgIn = tr.querySelector(".r-pg");
    const scoopIn = tr.querySelector(".r-scoop");
    const catalog = () => global.CATALOG || [];
    const scoopInCatalog = () => global.SCOOP_IN_CATALOG || [];

    const resolve = ci => {
      if (ci === null || catalog()[ci] === undefined) {
        tr.dataset.cat = "";
        nameIn.value = "";
        pgIn.value = "";
        scoopIn.disabled = true;
        scoopIn.value = "";
        tr.dataset.scoop = "";
      } else {
        tr.dataset.cat = String(ci);
        nameIn.value = catalog()[ci].itemname;
        pgIn.value = catalog()[ci].pgNo;
        const scoops = scoopInCatalog().filter(s => s.itemname === catalog()[ci].itemname);
        scoopIn.disabled = scoops.length === 0;
        if (scoops.length === 1) {
          tr.dataset.scoop = scoops[0].scoop_in;
          scoopIn.value = scoops[0].scoop_in;
        }
      }
      if (typeof global.updateRowStock === "function") global.updateRowStock(tr);
      refreshReq();
    };

    attach(
      nameIn,
      term => filterReqCatalog(term).map(i => ({
        key: i,
        label: catalog()[i].itemname,
        sec: catalog()[i].pgNo
      })),
      resolve
    );
    attach(
      pgIn,
      term => filterReqCatalog(term).map(i => ({
        key: i,
        label: catalog()[i].pgNo,
        sec: catalog()[i].itemname
      })),
      resolve
    );
    attach(
      scoopIn,
      term => {
        const ci = tr.dataset.cat;
        if (!ci) return [];
        return scoopInCatalog()
          .filter(s => s.itemname === catalog()[+ci].itemname
            && s.scoop_in.toLowerCase().includes((term || "").toLowerCase()))
          .map(s => ({
            key: s.scoop_in,
            label: s.scoop_in,
            sec: s.factor != null ? "factor: " + s.factor : ""
          }));
      },
      key => {
        const ci = tr.dataset.cat;
        const entry = scoopInCatalog().find(
          s => s.itemname === catalog()[+ci].itemname && s.scoop_in === key
        );
        if (entry) {
          tr.dataset.scoop = key;
          scoopIn.value = key;
        }
        refreshReq();
      }
    );
  }

  function addReqRow() {
    const tr = document.createElement("tr");
    tr.dataset.cat = "";
    tr.dataset.scoop = "";
    tr.innerHTML = `
    <td class="idx"></td>
    <td><div class="combo"><input type="text" class="r-name" placeholder="select category first" autocomplete="off" disabled /></div></td>
    <td><div class="combo"><input type="text" class="r-pg" placeholder="-" autocomplete="off" disabled /></div></td>
    <td><div class="combo"><input type="text" class="r-scoop" placeholder="pick item first" autocomplete="off" disabled /></div></td>
    <td class="num"><input type="number" class="r-qty" min="0" step="any" /></td>
    <td><input type="text" class="r-cmt" /></td>
    <td class="i-stock num">—</td>
    <td style="text-align:center"><button type="button" class="danger r-remove">&times;</button></td>`;
    document.getElementById("reqBody").appendChild(tr);

    attachRowCombos(tr);

    tr.querySelector(".r-qty").addEventListener("input", refreshReq);
    tr.querySelector(".r-cmt").addEventListener("input", refreshReq);
    tr.querySelector(".r-remove").addEventListener("click", () => {
      tr.remove();
      refreshReq();
    });
    applyReqCategoryState(tr);
    if (typeof global.updateRowStock === "function") global.updateRowStock(tr);
    refreshReq();
  }

  function collectItemsFromDom() {
    const items = [];
    document.querySelectorAll("#reqBody tr").forEach(tr => {
      const ci = tr.dataset.cat;
      const catalog = global.CATALOG || [];
      if (ci === "" || !catalog[+ci]) return;
      const e = catalog[+ci];
      items.push({
        itemname: e.itemname,
        pgNo: tr.querySelector(".r-pg").value.trim() || e.pgNo || "",
        scoopIn: tr.dataset.scoop || tr.querySelector(".r-scoop").value.trim(),
        qty: num(tr.querySelector(".r-qty").value),
        comments: tr.querySelector(".r-cmt").value.trim()
      });
    });
    return items;
  }

  function refreshReq() {
    let i = 0;
    document.querySelectorAll("#reqBody tr").forEach(tr => {
      tr.querySelector(".idx").textContent = String(++i);
    });
    renderPreview();
  }

  function collectBillRowsForExport() {
    const orderer = document.getElementById("reqOrderer").value.trim();
    const dt = document.getElementById("reqDt").value;
    const C = global.Csv || {};
    const billno = C.requirementBillNo
      ? C.requirementBillNo(orderer, dt)
      : ("REQ-" + (dt || "nodate"));
    const billRows = [];
    document.querySelectorAll("#reqBody tr").forEach(tr => {
      const ci = tr.dataset.cat;
      const catalog = global.CATALOG || [];
      if (ci === "" || !catalog[+ci]) return;
      const e = catalog[+ci];
      billRows.push([
        orderer,
        dt,
        billno,
        e.itemname,
        tr.querySelector(".r-pg").value.trim() || e.pgNo,
        tr.dataset.scoop || tr.querySelector(".r-scoop").value.trim(),
        num(tr.querySelector(".r-qty").value),
        "",
        "",
        tr.querySelector(".r-cmt").value.trim()
      ]);
    });
    return { orderer, dt, billno, billRows };
  }

  function renderPreview() {
    const el = document.getElementById("reqPreview");
    if (!el || !global.Csv) return;
    const { billRows } = collectBillRowsForExport();
    const text = global.Csv.buildInBillItemRowsCsv
      ? global.Csv.buildInBillItemRowsCsv(billRows)
      : null;
    el.textContent = text || "-- add items to see preview --";
  }

  function resetReq() {
    document.getElementById("reqBody").innerHTML = "";
    document.getElementById("reqOrderer").value = "";
    sourceRequirementIds = null;
    addReqRow();
    addReqRow();
    onReqCategoryChange();
    setMsg("");
    refreshReq();
  }

  function applyRequirementToForm(req) {
    document.getElementById("reqBody").innerHTML = "";
    if (req.category && req.category !== "ALL") {
      document.getElementById("reqCategory").value = req.category;
    } else if (req.category === "ALL") {
      document.getElementById("reqCategory").value = "ALL";
    }
    if (req.orderer && req.orderer !== "ALL") {
      document.getElementById("reqOrderer").value = req.orderer;
    } else if (req.orderer === "ALL") {
      document.getElementById("reqOrderer").value = "";
    }
    if (req.dt) document.getElementById("reqDt").value = String(req.dt).slice(0, 10);
    onReqCategoryChange();

    let skipped = 0;
    (req.items || []).forEach(item => {
      addReqRow();
      const tr = document.querySelector("#reqBody tr:last-child");
      if (!populateReqRow(tr, item)) {
        tr.remove();
        skipped++;
      }
    });
    if (!document.querySelectorAll("#reqBody tr").length) addReqRow();
    refreshReq();
    return { skipped };
  }

  function exportReqCSV() {
    const C = global.Csv;
    if (!C || !C.download) return;
    const text = document.getElementById("reqPreview").textContent;
    if (!text || text.startsWith("--")) {
      alert("Add at least one item to export.");
      return;
    }
    const { billno, dt } = collectBillRowsForExport();
    C.download(text, "requirement_" + (billno || dt || "export") + ".csv");
  }

  function importReqCSV() {
    const C = global.Csv;
    if (!C || !C.parseText) return;
    C.pickFile(text => {
      const parsed = C.parseText(text);
      if (!parsed.rows.length) {
        alert("CSV is empty or invalid.");
        return;
      }
      const hdr = parsed.header;
      const isBill = hdr.includes("vendor") && hdr.includes("billno");
      const isLegacy = hdr.includes("itemname") && hdr.includes("dt") && !isBill;

      if (!isBill && !isLegacy) {
        alert("Unrecognized CSV. Use Bill Additions export or legacy requirement columns.");
        return;
      }

      let orderer = "";
      let category = "";
      let dt = "";
      const itemRows = [];

      parsed.rows.forEach(cols => {
        const row = C.rowToObj(hdr, cols);
        if (isBill) {
          if (row.vendor) orderer = row.vendor;
          if (row.dt) dt = row.dt;
          if ((row.itemname || "").toLowerCase() === "billtotal") return;
          if (!row.itemname) return;
          itemRows.push({
            itemname: row.itemname,
            pgno: row.pgno || row.pgNo,
            scoopin: row.scoopin,
            qty: row.qty,
            comments: row.comments || ""
          });
        } else {
          if (row.category) category = row.category;
          if (row.orderer) orderer = row.orderer;
          if (row.dt) dt = row.dt;
          if (!row.itemname) return;
          itemRows.push(row);
        }
      });

      if (category && category !== "ALL") document.getElementById("reqCategory").value = category;
      if (orderer && orderer !== "ALL") document.getElementById("reqOrderer").value = orderer;
      if (dt) document.getElementById("reqDt").value = String(dt).slice(0, 10);
      sourceRequirementIds = null;
      onReqCategoryChange();

      document.getElementById("reqBody").innerHTML = "";
      let skipped = 0;
      itemRows.forEach(row => {
        addReqRow();
        const tr = document.querySelector("#reqBody tr:last-child");
        if (!populateReqRow(tr, row)) {
          tr.remove();
          skipped++;
        }
      });
      if (!document.querySelectorAll("#reqBody tr").length) addReqRow();
      refreshReq();
      if (skipped) alert("Imported with " + skipped + " unrecognized item(s) skipped.");
      if (typeof global.loadStockMap === "function") global.loadStockMap().catch(() => {});
    });
  }

  function applyInventoryOutToForm(out) {
    document.getElementById("reqBody").innerHTML = "";
    sourceRequirementIds = null;
    if (out.category && out.category !== "ALL") {
      document.getElementById("reqCategory").value = out.category;
    } else if (out.category === "ALL") {
      document.getElementById("reqCategory").value = "ALL";
    }
    if (out.dt) document.getElementById("reqDt").value = String(out.dt).slice(0, 10);
    onReqCategoryChange();

    let skipped = 0;
    (out.items || []).forEach(item => {
      addReqRow();
      const tr = document.querySelector("#reqBody tr:last-child");
      if (!populateReqRow(tr, item)) {
        tr.remove();
        skipped++;
      }
    });
    if (!document.querySelectorAll("#reqBody tr").length) addReqRow();
    refreshReq();
    return { skipped };
  }

  async function loadFromInventoryOut() {
    const dt = document.getElementById("reqDt").value.trim();
    if (!dt) {
      alert("Enter Date (same as Inventory Out) to load.");
      return;
    }
    if (!global.isServerMode || !global.isServerMode()) {
      alert("Load requires the app server (http://localhost:3050).");
      return;
    }
    try {
      const res = await fetch("/api/inventory-out?dt=" + encodeURIComponent(dt));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
      const applied = applyInventoryOutToForm(data.inventoryOut || {});
      let msg = "Loaded Inventory Out for " + dt
        + " (" + (data.inventoryOut?.items?.length || 0) + " line(s)).";
      if (data.mergedInventoryOut) {
        msg += " Merged " + data.matchCount + " out record(s).";
      }
      if (data.inventoryOut?.category === "ALL") {
        msg += " Category ALL (multiple categories on this date).";
      }
      if (applied.skipped) msg += " " + applied.skipped + " line(s) skipped (not in catalog).";
      setMsg(msg, "ok");
      if (typeof global.loadStockMap === "function") await global.loadStockMap();
    } catch (e) {
      alert("Load from Inventory Out failed: " + e.message);
    }
  }

  async function loadFromDB() {
    const dt = document.getElementById("reqDt").value.trim();
    if (!dt) {
      alert("Enter Date to load.");
      return;
    }
    if (!global.isServerMode || !global.isServerMode()) {
      alert("Load from DB requires the app server (http://localhost:3050).");
      return;
    }
    try {
      const res = await fetch("/api/requirements?dt=" + encodeURIComponent(dt));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
      sourceRequirementIds = data.sourceRequirementIds || null;
      const applied = applyRequirementToForm(data.requirement || {});
      let msg = "Loaded requirements for " + dt + " (" + (data.requirement?.items?.length || 0) + " line(s)).";
      if (data.mergedRequirements) {
        msg += " Merged " + data.matchCount + " row(s) for this date.";
      }
      if (data.requirement?.orderer === "ALL" || data.requirement?.category === "ALL") {
        msg += " Orderer/category ALL = mixed values on this date.";
      }
      if (applied.skipped) msg += " " + applied.skipped + " line(s) skipped (not in catalog).";
      setMsg(msg, "ok");
      if (typeof global.loadStockMap === "function") await global.loadStockMap();
    } catch (e) {
      alert("Load from DB failed: " + e.message);
    }
  }

  async function saveToDB() {
    const categoryRaw = getReqCategory();
    const ordererRaw = document.getElementById("reqOrderer").value.trim();
    const dt = document.getElementById("reqDt").value.trim();
    if (!dt) {
      alert("Date is required.");
      return;
    }
    const items = collectItemsFromDom();
    if (!items.length) {
      alert("Please select at least one item.");
      return;
    }
    const category = categoryRaw
      ? (categoryRaw.toUpperCase() === "ALL" ? "ALL" : categoryRaw)
      : null;
    const orderer = ordererRaw
      ? (ordererRaw.toUpperCase() === "ALL" ? "ALL" : ordererRaw)
      : null;
    const payload = {
      category,
      orderer,
      dt,
      items
    };
    if (sourceRequirementIds && sourceRequirementIds.length) {
      payload.consolidateRequirementIds = sourceRequirementIds;
    }
    try {
      if (!global.postJSON) throw new Error("Server not available");
      const d = await global.postJSON("/api/requirements", payload);
      sourceRequirementIds = null;
      let msg = "Requirement " + (d.updated ? "updated" : "saved") + " in DB. ID: " + d.id;
      if (d.removedDuplicates) msg += " | removed " + d.removedDuplicates + " duplicate row(s)";
      setMsg(msg, "ok");
    } catch (e) {
      alert("Save to DB failed: " + e.message);
    }
  }

  function init() {
    const dtEl = document.getElementById("reqDt");
    if (dtEl && !dtEl.value) dtEl.valueAsDate = new Date();
    ["reqOrderer", "reqDt"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", refreshReq);
    });
    if (!document.querySelectorAll("#reqBody tr").length) {
      addReqRow();
      addReqRow();
    }
  }

  global.Requirements = {
    init,
    bindCategoryCombo,
    onReqCategoryChange,
    addReqRow,
    refreshReq,
    resetReq,
    exportReqCSV,
    importReqCSV,
    loadFromDB,
    loadFromInventoryOut,
    saveToDB,
    CSV_HEADER_LEGACY
  };
})(window);
