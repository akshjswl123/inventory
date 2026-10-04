// csv.js — shared CSV parse, preview, export, and import helpers

const CSV_HEADER_BILL = ["Vendor", "dt", "billno", "itemname", "pgno", "scoopin", "qty", "rate", "itemtotal", "comments"];
const CSV_HEADER_INV = ["itemname", "pgNo", "qty", "dt", "billno", "scoop_inventory"];
const CSV_HEADER_OUT = ["category", "dt", "time", "itemname", "pgNo", "scoop_out", "qty", "comments"];
const CSV_HEADER_RECIPE = [
  "dishname", "dishcode", "reciepeItemname", "pgNo", "receipescoop", "qty", "inGm", "inML", "inPiece", "comments",
  "is_usable_in_other_dish", "usable_processed_scoop", "qtyOfScoops"
];
const RECIPE_ROW_EXTRA_EMPTY = ["", "", ""];

const RECIPE_META_ITEMS = {
  TOTAL_INGREDIENTS: "totalingredientsqty",
  TOTAL_PROCESSED: "totalprocessedqty",
  DISH_OUT: "dish_out"
};

function splitCsvLine(line) {
  const out = [];
  let cur = "", inQ = false, wasQuoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQ = true; wasQuoted = true;
    } else if (ch === ",") {
      out.push(wasQuoted ? cur : cur.trim());
      cur = ""; wasQuoted = false;
    } else cur += ch;
  }
  out.push(wasQuoted ? cur : cur.trim());
  return out;
}

function parseBlock(block) {
  if (!block) return [];
  return String(block).split("\n")
          .map(l => l.trim())
          .filter(l => l.length > 0 && l.charAt(0) !== "#")
          .map(splitCsvLine)
          .filter(cols => cols[0] !== "");
}

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function optionalNum(v) {
  const s = String(v == null ? "" : v).trim();
  if (s === "") return "";
  const n = parseFloat(s);
  return isNaN(n) ? "" : n;
}

function optionalNumOrNull(v) {
  const s = String(v == null ? "" : v).trim();
  if (s === "") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseBoolish(v) {
  const t = String(v == null ? "" : v).trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

function recipeRowExtraCols(isUsable, usableScoop, qtyOfScoops) {
  return [
    isUsable ? "true" : "false",
    isUsable ? (usableScoop || "") : "",
    isUsable && qtyOfScoops != null && qtyOfScoops !== "" ? qtyOfScoops : ""
  ];
}

function dishOutUsableInOtherOn() {
  const btn = document.getElementById("dishOutUsableInOther");
  if (!btn) return false;
  return btn.getAttribute("aria-pressed") === "true";
}

function setDishOutUsableInOther(on) {
  const btn = document.getElementById("dishOutUsableInOther");
  if (!btn) return;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  const label = document.getElementById("dishOutUsableLabel");
  if (label) label.textContent = on ? "On" : "Off";
}

function normUsableDestUnit(unit) {
  const t = String(unit == null ? "" : unit).trim().toLowerCase();
  if (t === "portion") return "piece";
  if (t === "kg" || t === "pkt" || t === "bag") return "gm";
  return t;
}

/** Processed usable dish_out: only gm, ml, or piece (portion → piece). */
function isAllowedUsableProcessedDestUnit(unit) {
  const d = normUsableDestUnit(unit);
  return d === "gm" || d === "ml" || d === "piece";
}

function validateUsableDishOutForm() {
  const scoop = document.getElementById("dishOutUsableProcessedScoop").value.trim();
  const qtyScoops = num(document.getElementById("dishOutQtyOfScoops").value);
  const dishName = document.getElementById("recipeDishName").value.trim();
  if (!scoop) return { ok: false, error: "Select a processed scoop for Dish Out." };
  if (qtyScoops <= 0) return { ok: false, error: "Enter qty of scoops for Dish Out (decimals allowed, e.g. 2.6)." };
  const scoopRow = resolveScoopConfigRow(scoop, dishName);
  if (!scoopRow) return { ok: false, error: "Scoop not found in scoop_config for this dish." };
  if (!isAllowedUsableProcessedDestUnit(scoopRow.destination_unit)) {
    return {
      ok: false,
      error: "Processed usable scoop must use destination unit gm, ml, or piece (portion ok)."
    };
  }
  return { ok: true, scoopRow, qtyScoops };
}

function unitsPerScoopFromConfigRow(row) {
  if (!row) return null;
  const dest = normUsableDestUnit(row.destination_unit);
  if (dest === "gm") {
    const n = num(row.qty_in_grams);
    if (n > 0) return n;
    const f = num(row.factor);
    return f > 0 ? f : 1;
  }
  if (dest === "ml") {
    const n = num(row.qty_in_ml);
    if (n > 0) return n;
    const f = num(row.factor);
    return f > 0 ? f : 1;
  }
  if (dest === "piece") {
    const n = num(row.qty_in_piece);
    if (n > 0) return n;
    const f = num(row.factor);
    return f > 0 ? f : 1;
  }
  return null;
}

function resolveScoopConfigRow(scoopName, dishName) {
  const sn = String(scoopName || "").trim();
  if (!sn) return null;
  const config = (typeof window !== "undefined" && window.SCOOP_CONFIG) || [];
  const fromAll = config.find(r => String(r.scoop_name || r.scoopName || "").trim() === sn);
  if (fromAll) {
    return {
      scoop_name: fromAll.scoop_name || fromAll.scoopName,
      destination_unit: fromAll.destination_unit || fromAll.destinationUnit || "",
      factor: fromAll.factor,
      qty_in_grams: fromAll.qty_in_grams != null ? fromAll.qty_in_grams : fromAll.qtyInGrams,
      qty_in_ml: fromAll.qty_in_ml != null ? fromAll.qty_in_ml : fromAll.qtyInMl,
      qty_in_piece: fromAll.qty_in_piece != null ? fromAll.qty_in_piece : fromAll.qtyInPiece
    };
  }
  const map = (typeof window !== "undefined" && window.SCOOP_CONFIG_BY_DISH_NAME) || {};
  const nameKey = String(dishName || "").trim().toLowerCase();
  const codeKey = String(getRecipeDishCode(dishName) || "").trim().toLowerCase();
  for (const key of [codeKey, nameKey]) {
    if (!key) continue;
    const rows = map[key] || [];
    const hit = rows.find(r => String(r.scoop_name || "").trim() === sn);
    if (hit) return hit;
  }
  return null;
}

/** inGm / inML / inPiece from qtyOfScoops × units_per_scoop (scoop_config). */
function computeUsableDishOutQtyCols(scoopRow, qtyScoops) {
  const dest = normUsableDestUnit(scoopRow && scoopRow.destination_unit);
  const ups = unitsPerScoopFromConfigRow(scoopRow);
  const q = qtyScoops > 0 ? qtyScoops : 0;
  let grams = null;
  let ml = null;
  let piece = null;

  if (q > 0 && ups) {
    if (dest === "gm") grams = q * ups;
    else if (dest === "ml") ml = q * ups;
    else if (dest === "piece") piece = q * ups;
  }

  return {
    qty_in_grams: grams,
    qty_in_ml: ml,
    qty_in_piece: piece
  };
}

function usableDishOutSavedFieldName(destUnit) {
  const d = normUsableDestUnit(destUnit);
  if (d === "ml") return "inML";
  if (d === "piece") return "inPiece";
  return "inGm";
}

function formatUsableDishOutResultQty(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value)) || Number(value) === 0) return "";
  const n = Number(value);
  if (Number.isInteger(n)) return String(n);
  return String(+n.toFixed(6).replace(/\.?0+$/, ""));
}

/** Show one read-only total: inGm, inML, or inPiece per selected scoop. */
function updateUsableDishOutResultDisplay() {
  if (typeof document === "undefined") return;
  const wrap = document.getElementById("dishOutUsableResultWrap");
  const labelEl = document.getElementById("dishOutUsableResultLabel");
  const valEl = document.getElementById("dishOutUsableResultValue");
  if (!wrap || !labelEl || !valEl) return;

  if (!dishOutUsableInOtherOn()) {
    wrap.hidden = true;
    valEl.value = "";
    return;
  }

  const scoop = (document.getElementById("dishOutUsableProcessedScoop") || {}).value;
  const scoopTrim = String(scoop || "").trim();
  const dishName = (document.getElementById("recipeDishName") || {}).value;
  const dishTrim = String(dishName || "").trim();

  if (!scoopTrim) {
    wrap.hidden = true;
    valEl.value = "";
    return;
  }

  const scoopRow = resolveScoopConfigRow(scoopTrim, dishTrim);
  const field = usableDishOutSavedFieldName(scoopRow && scoopRow.destination_unit);
  labelEl.textContent = field;

  const qtyScoops = num((document.getElementById("dishOutQtyOfScoops") || {}).value);
  const cols = computeUsableDishOutQtyCols(scoopRow, qtyScoops);
  let total = null;
  if (field === "inML") total = cols.qty_in_ml;
  else if (field === "inPiece") total = cols.qty_in_piece;
  else total = cols.qty_in_grams;

  wrap.hidden = false;
  valEl.value = formatUsableDishOutResultQty(total);
}

/** Reload qtyOfScoops from DB/CSV when only inGm/inML/inPiece were stored. */
function qtyOfScoopsFromStoredDishOut(row, scoopName, dishName) {
  const direct = row.qtyofscoops != null && row.qtyofscoops !== ""
    ? row.qtyofscoops
    : (row.qty_of_scoops != null && row.qty_of_scoops !== "" ? row.qty_of_scoops : null);
  if (direct != null && direct !== "" && num(direct) > 0) return num(direct);
  const rowQty = row.qty != null && row.qty !== "" ? num(row.qty) : 0;
  if (rowQty > 0) return rowQty;

  const scoopRow = resolveScoopConfigRow(scoopName, dishName);
  const ups = unitsPerScoopFromConfigRow(scoopRow);
  if (!ups) return null;
  const dest = normUsableDestUnit(scoopRow && scoopRow.destination_unit);
  let total = null;
  if (dest === "gm" && row.ingm != null && row.ingm !== "") total = num(row.ingm);
  else if (dest === "ml" && row.inml != null && row.inml !== "") total = num(row.inml);
  else if (dest === "piece" && row.inpiece != null && row.inpiece !== "") total = num(row.inpiece);
  if (total == null || total <= 0) {
    if (row.ingm != null && row.ingm !== "" && num(row.ingm) > 0) total = num(row.ingm);
    else if (row.inml != null && row.inml !== "" && num(row.inml) > 0) total = num(row.inml);
    else if (row.inpiece != null && row.inpiece !== "" && num(row.inpiece) > 0) total = num(row.inpiece);
  }
  if (total > 0) return total / ups;
  return null;
}

function getDishOutFormState() {
  const dishOutCmt = document.getElementById("recipeDishOutCmt").value.trim();
  if (dishOutUsableInOtherOn()) {
    const scoop = document.getElementById("dishOutUsableProcessedScoop").value.trim();
    const qtyScoops = num(document.getElementById("dishOutQtyOfScoops").value);
    const dishName = document.getElementById("recipeDishName").value.trim();
    const scoopRow = resolveScoopConfigRow(scoop, dishName);
    const cols = computeUsableDishOutQtyCols(scoopRow, qtyScoops);
    const inGm = cols.qty_in_grams;
    const inML = cols.qty_in_ml;
    const inPiece = cols.qty_in_piece;
    return {
      usable: true,
      dishOutScoop: scoop,
      dishOutInGm: inGm != null && inGm !== "" ? inGm : "",
      dishOutInML: inML != null && inML !== "" ? inML : "",
      dishOutInPiece: inPiece != null && inPiece !== "" ? inPiece : "",
      dishOutCmt,
      isUsableInOtherDish: true,
      usableProcessedScoop: scoop,
      qtyOfScoops: qtyScoops > 0 ? qtyScoops : null,
      qtyForRow: qtyScoops > 0 ? qtyScoops : ""
    };
  }
  return {
    usable: false,
    dishOutScoop: document.getElementById("recipeDishOutScoop").value.trim(),
    dishOutInGm: num(document.getElementById("dishOutInGm").value),
    dishOutInML: num(document.getElementById("dishOutInML").value),
    dishOutInPiece: num(document.getElementById("dishOutInPiece").value),
    dishOutCmt,
    isUsableInOtherDish: false,
    usableProcessedScoop: "",
    qtyOfScoops: null,
    qtyForRow: ""
  };
}

function csvField(v) {
  return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
}

function rowsToCsv(header, rows) {
  return [header.map(csvField).join(",")].concat(rows.map(r => r.map(csvField).join(","))).join("\r\n");
}

function parseCsvText(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.length > 0 && l.charAt(0) !== "#");
  if (!lines.length) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  return { header, rows: lines.slice(1).map(splitCsvLine) };
}

function isHousekeepingCsvHeader(h) {
  const key = String(h || "").toLowerCase().replace(/_/g, "");
  return key === "id" || key === "createdat" || key === "lastupdatedat";
}

function rowToObj(header, cols) {
  const obj = {};
  header.forEach((h, i) => {
    if (isHousekeepingCsvHeader(h)) return;
    obj[h] = cols[i] !== undefined ? cols[i] : "";
  });
  return obj;
}

function pickCsvFile(onLoad) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,text/csv";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onLoad(ev.target.result);
    reader.readAsText(file);
  };
  input.click();
}

function downloadCsvBlob(text, filename) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function findCatalogIndex(itemname, pgNo) {
  const catalog = window.CATALOG || [];
  if (itemname) {
    const i = catalog.findIndex(e => e.itemname.toLowerCase() === itemname.toLowerCase());
    if (i >= 0) return i;
  }
  if (pgNo) {
    const i = catalog.findIndex(e => e.pgNo.toLowerCase() === pgNo.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function findRecipeCatalogIndex(itemname, pgNo) {
  const catalog = window.RECIPE_CATALOG || [];
  if (itemname) {
    const i = catalog.findIndex(e => e.recipeItemName.toLowerCase() === itemname.toLowerCase());
    if (i >= 0) return i;
  }
  if (pgNo) {
    const i = catalog.findIndex(e => e.pgNo.toLowerCase() === pgNo.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function findDishCatalogIndex(dishName, dishCode) {
  const catalog = window.DISH_CATALOG || [];
  if (dishName) {
    const i = catalog.findIndex(e => e.dishName.toLowerCase() === dishName.toLowerCase());
    if (i >= 0) return i;
  }
  if (dishCode) {
    const i = catalog.findIndex(e => (e.dishCode || '').toLowerCase() === dishCode.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function isProcessedRecipeRow(itemname) {
  const name = (itemname || '').trim();
  if (!name) return false;
  if (findRecipeCatalogIndex(name, '') >= 0) return false;
  return findDishCatalogIndex(name, '') >= 0;
}

function isRecipeMetaItem(itemname) {
  const key = String(itemname || "").trim().toLowerCase();
  return key === RECIPE_META_ITEMS.TOTAL_INGREDIENTS
    || key === RECIPE_META_ITEMS.TOTAL_PROCESSED
    || key === RECIPE_META_ITEMS.DISH_OUT;
}

function normalizeRecipeRow(row) {
  if (!row) return {};
  const out = {};
  Object.keys(row).forEach(k => { out[k.toLowerCase()] = row[k]; });
  return out;
}

function defaultDishOutScoop(dishName) {
  const matches = (window.DISH_OUT_SCOOP_CATALOG || []).filter(s =>
    String(s.dishname || "").toLowerCase() === String(dishName || "").toLowerCase()
  );
  if (matches.length) return matches[0].dish_out_scoop;
  return dishName ? dishName + "_1_portion" : "";
}

function lookupRecipeDishCode(dishName) {
  const entry = (window.DISH_CATALOG || []).find(d =>
    String(d.dishName || d.dishname || "").toLowerCase() === String(dishName || "").toLowerCase()
  );
  return entry ? String(entry.dishCode || entry.dish_code || "") : "";
}

function getRecipeDishCode(dishName) {
  const el = document.getElementById("recipeDishCode");
  if (el && el.value.trim()) return el.value.trim();
  return lookupRecipeDishCode(dishName);
}

function setRecipeDishCode(dishCode, dishName) {
  const el = document.getElementById("recipeDishCode");
  if (!el) return;
  el.value = dishCode || lookupRecipeDishCode(dishName) || "";
}

function buildInBillPreview(vendor, dt, billno, billRows, billTotal, totalCmt) {
  const rows = billRows.slice();
  if (rows.length) rows.push([vendor, dt, billno, "billtotal", "", "", "", "", billTotal, totalCmt]);
  return rows.length ? rowsToCsv(CSV_HEADER_BILL, rows) : null;
}

function buildInInvPreview(invRows) {
  return invRows.length ? rowsToCsv(CSV_HEADER_INV, invRows) : null;
}

function buildOutPreview(outRows, cat, dt, tm, totalQty, totalCmt) {
  const rows = outRows.slice();
  if (rows.length) rows.push([cat, dt, tm, "totalqty", "", "", totalQty, totalCmt]);
  return rows.length ? rowsToCsv(CSV_HEADER_OUT, rows) : null;
}

function isoDateToDdMmYyyy(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  if (p.length !== 3 || p[0].length !== 4) return String(iso);
  return `${p[2]}-${p[1]}-${p[0]}`;
}

function formatOutQtyForShare(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return String(q ?? "");
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(n);
}

function scoopNameForWhatsAppShare(scoop) {
  const s = String(scoop ?? "");
  return s.endsWith("_out") ? s.slice(0, -4) : s;
}

/** WhatsApp requirement list: date on line 1, then "N. pgNo scoop qty comments". */
function buildOutRequirementShare(outRows, dt) {
  if (!outRows.length) return null;
  const displayDt = isoDateToDdMmYyyy(dt);
  const lines = outRows.map((row, i) => {
    const pgNo = row[4];
    const scoop = scoopNameForWhatsAppShare(row[5]);
    const qty = formatOutQtyForShare(row[6]);
    const cmt = String(row[7] || "").trim();
    let line = `${i + 1}. ${pgNo} ${scoop} ${qty}`;
    if (cmt) line += ` ${cmt}`;
    return line;
  });
  return [displayDt, ...lines].join("\n");
}

function buildRecipePreview(recipeRows) {
  return recipeRows.length ? rowsToCsv(CSV_HEADER_RECIPE, recipeRows) : null;
}

function sumInBillLineTotals() {
  let sum = 0;
  document.querySelectorAll("#inBody tr").forEach(tr => {
    const ci = tr.dataset.cat;
    if (ci === "" || !(window.CATALOG || [])[+ci]) return;
    sum += num(tr.querySelector(".i-total").value);
  });
  return sum;
}

function exportInCSV() {
  const vendor = document.getElementById("inVendor").value.trim();
  const dt = document.getElementById("inDt").value;
  const billno = document.getElementById("inBillNo").value.trim();
  const totalCmt = document.getElementById("inBillTotalCmt").value.trim();

  if (!vendor || !dt || !billno) { alert("Please complete Vendor, Date, and Bill No."); return; }

  const billRows = [], invRows = [];
  document.querySelectorAll("#inBody tr").forEach(tr => {
    const ci = tr.dataset.cat; if (ci === "") return;
    const e = window.CATALOG[+ci];
    const qty = num(tr.querySelector(".i-qty").value);
    const scoopInv = (window.SCOOP_INVENTORY_CATALOG || {})[e.itemname] || "";

    billRows.push([vendor, dt, billno, e.itemname, e.pgNo, tr.dataset.scoop, qty, optionalNum(tr.querySelector(".i-rate").value), num(tr.querySelector(".i-total").value), tr.querySelector(".i-cmt").value.trim()]);
    invRows.push([e.itemname, e.pgNo, qty, dt, billno, scoopInv]);
  });

  if (!billRows.length) { alert("Please add at least one item."); return; }

  const billTotal = sumInBillLineTotals();
  if (!window.isManualBillTotal && document.getElementById("inBillTotal")) {
    document.getElementById("inBillTotal").value = billTotal;
  }
  downloadCsvBlob(buildInBillPreview(vendor, dt, billno, billRows, billTotal, totalCmt), "bill_addition_" + vendor + "_" + billno + ".csv");
  setTimeout(() => {
    downloadCsvBlob(buildInInvPreview(invRows), "inventory_in_" + vendor + "_" + billno + "_" + dt + ".csv");
  }, 300);
}

function applyOrderToInForm(order) {
  if (!order) return { ok: false, skipped: 0 };

  document.getElementById("inBody").innerHTML = "";
  window.isManualBillTotal = false;

  if (order.vendor) document.getElementById("inVendor").value = order.vendor;
  if (order.dt) document.getElementById("inDt").value = String(order.dt).slice(0, 10);
  if (order.billNo) document.getElementById("inBillNo").value = order.billNo;
  if (typeof onInVendorChange === "function") onInVendorChange();

  const items = order.items || [];
  let skipped = 0;
  items.forEach(item => {
    addInRow();
    const tr = document.querySelector("#inBody tr:last-child");
    const row = {
      itemname: item.itemname,
      pgno: item.pgNo || item.pgno,
      scoopin: item.scoopIn || item.scoopin,
      qty: item.qty != null && item.qty !== "" ? item.qty : "",
      rate: item.rate != null && item.rate !== "" ? item.rate : "",
      itemtotal: item.itemTotal != null && item.itemTotal !== "" ? item.itemTotal : item.itemtotal,
      comments: item.comments || ""
    };
    if (!populateInRow(tr, row)) {
      tr.remove();
      skipped++;
    }
  });

  if (!document.querySelectorAll("#inBody tr").length) addInRow();

  window.isManualBillTotal = false;
  document.getElementById("inBillTotalCmt").value = "";
  refreshIn();
  return { ok: true, skipped };
}

function populateInRow(tr, row) {
  const ci = findCatalogIndex(row.itemname, row.pgno || row.pgNo);
  if (ci < 0) return false;

  tr.dataset.cat = String(ci);
  tr.querySelector(".i-name").value = window.CATALOG[ci].itemname;
  tr.querySelector(".i-pg").value = window.CATALOG[ci].pgNo;

  const scoopIn = tr.querySelector(".i-scoop");
  const scoopVal = row.scoopin || row.scoop_in || "";
  const scoops = (window.SCOOP_IN_CATALOG || []).filter(s => s.itemname === window.CATALOG[ci].itemname);
  scoopIn.disabled = scoops.length === 0;

  if (scoopVal) {
    tr.dataset.scoop = scoopVal;
    scoopIn.value = scoopVal;
  } else if (scoops.length === 1) {
    tr.dataset.scoop = scoops[0].scoop_in;
    scoopIn.value = scoops[0].scoop_in;
  }

  if (row.qty !== "") tr.querySelector(".i-qty").value = row.qty;
  if (row.rate !== "") tr.querySelector(".i-rate").value = row.rate;
  if (row.itemtotal !== "") {
    tr.querySelector(".i-total").value = row.itemtotal;
    if (typeof window.syncInRowAmounts === "function") window.syncInRowAmounts(tr, "total");
  } else if (row.rate !== "" && row.qty !== "") {
    if (typeof window.syncInRowAmounts === "function") window.syncInRowAmounts(tr, "rate");
  }
  tr.querySelector(".i-cmt").value = row.comments || "";
  applyInVendorState(tr);
  if (window.updateRowStock) window.updateRowStock(tr);
  return true;
}

function importInCSV() {
  pickCsvFile(text => {
    const parsed = parseCsvText(text);
    if (!parsed.rows.length) { alert("CSV is empty or invalid."); return; }

    const hdr = parsed.header;
    const isBill = hdr.includes("vendor") && hdr.includes("billno");
    const isInv = hdr.includes("scoop_inventory");

    if (!isBill && !isInv) {
      alert("Unrecognized CSV format. Import a Bill Additions or Inventory In export.");
      return;
    }

    document.getElementById("inBody").innerHTML = "";
    window.isManualBillTotal = false;

    let vendor = "", dt = "", billno = "";
    const itemRows = [];

    parsed.rows.forEach(cols => {
      if (isBill) {
        const row = rowToObj(hdr, cols);
        vendor = row.vendor || vendor;
        dt = row.dt || dt;
        billno = row.billno || billno;

        if ((row.itemname || "").toLowerCase() === "billtotal") {
          window.isManualBillTotal = true;
          document.getElementById("inBillTotal").value = row.itemtotal || "0";
          document.getElementById("inBillTotalCmt").value = row.comments || "";
          return;
        }
        itemRows.push(row);
      } else {
        dt = cols[3] || dt;
        billno = cols[4] || billno;
        itemRows.push({
          itemname: cols[0],
          pgNo: cols[1],
          qty: cols[2],
          scoopin: cols[5] || "",
          rate: "",
          itemtotal: "",
          comments: ""
        });
      }
    });

    if (vendor) document.getElementById("inVendor").value = vendor;
    if (dt) document.getElementById("inDt").value = dt;
    if (billno) document.getElementById("inBillNo").value = billno;
    onInVendorChange();

    if (!itemRows.length) {
      addInRow();
      refreshIn();
      alert("Imported header fields only. No item rows found.");
      return;
    }

    let skipped = 0;
    itemRows.forEach(row => {
      addInRow();
      const tr = document.querySelector("#inBody tr:last-child");
      if (!populateInRow(tr, row)) {
        tr.remove();
        skipped++;
      }
    });

    if (!document.querySelectorAll("#inBody tr").length) addInRow();
    refreshIn();
    if (skipped) alert("Imported with " + skipped + " unrecognized item(s) skipped.");
  });
}

function exportOutCSV() {
  const cat = document.getElementById("outCategory").value.trim();
  const dt = document.getElementById("outDt").value;
  const tm = document.getElementById("outTm").value;
  const totalCmt = document.getElementById("outTotalCmt").value.trim();

  if (!cat || !dt) { alert("Please select Category and Date."); return; }

  const outRows = [];
  document.querySelectorAll("#outBody tr").forEach(tr => {
    const ci = tr.dataset.cat; if (ci === "") return;
    const e = window.CATALOG[+ci];
    outRows.push([cat, dt, tm, e.itemname, e.pgNo, tr.dataset.scoop, num(tr.querySelector(".i-qty").value), tr.querySelector(".i-cmt").value.trim()]);
  });

  if (!outRows.length) { alert("Please select at least one item."); return; }

  const txt = buildOutPreview(outRows, cat, dt, tm, num(document.getElementById("outTotalQty").value), totalCmt);
  const tmPart = tm ? "_" + tm.replace(":", "") : "";
  downloadCsvBlob(txt, "inventory_out_" + cat + "_" + dt + tmPart + ".csv");
}

function populateOutRow(tr, row) {
  const ci = findCatalogIndex(row.itemname, row.pgno || row.pgNo);
  if (ci < 0) return false;

  tr.dataset.cat = String(ci);
  tr.querySelector(".i-name").value = window.CATALOG[ci].itemname;
  tr.querySelector(".i-pg").value = window.CATALOG[ci].pgNo;

  const scoopIn = tr.querySelector(".i-scoop");
  const scoopVal = row.scoop_out || row.scoopout || "";
  const scoops = (window.SCOOP_OUT_CATALOG || []).filter(s => s.itemname === window.CATALOG[ci].itemname);
  scoopIn.disabled = scoops.length === 0;

  if (scoopVal) {
    tr.dataset.scoop = scoopVal;
    scoopIn.value = scoopVal;
  } else if (scoops.length === 1) {
    tr.dataset.scoop = scoops[0].scoop_out;
    scoopIn.value = scoops[0].scoop_out;
  }

  if (row.qty !== "") tr.querySelector(".i-qty").value = row.qty;
  tr.querySelector(".i-cmt").value = row.comments || "";
  applyOutCategoryState(tr);
  if (window.updateRowStock) window.updateRowStock(tr);
  return true;
}

function importOutCSV() {
  pickCsvFile(text => {
    const parsed = parseCsvText(text);
    if (!parsed.rows.length) { alert("CSV is empty or invalid."); return; }

    const hdr = parsed.header;
    if (!hdr.includes("category") || !hdr.includes("itemname")) {
      alert("Unrecognized CSV format. Import an Inventory Out export.");
      return;
    }

    document.getElementById("outBody").innerHTML = "";

    let category = "", dt = "", time = "";
    const itemRows = [];

    parsed.rows.forEach(cols => {
      const row = rowToObj(hdr, cols);
      category = row.category || category;
      dt = row.dt || dt;
      time = row.time || time;

      if ((row.itemname || "").toLowerCase() === "totalqty") {
        document.getElementById("outTotalQty").value = row.qty || "0";
        document.getElementById("outTotalCmt").value = row.comments || "";
        return;
      }
      itemRows.push(row);
    });

    if (category) document.getElementById("outCategory").value = category;
    if (dt) document.getElementById("outDt").value = dt;
    document.getElementById("outTm").value = time || "";
    onOutCategoryChange();

    if (!itemRows.length) {
      addOutRow();
      refreshOut();
      alert("Imported header fields only. No item rows found.");
      return;
    }

    let skipped = 0;
    itemRows.forEach(row => {
      addOutRow();
      const tr = document.querySelector("#outBody tr:last-child");
      if (!populateOutRow(tr, row)) {
        tr.remove();
        skipped++;
      }
    });

    if (!document.querySelectorAll("#outBody tr").length) addOutRow();
    refreshOut();
    if (skipped) alert("Imported with " + skipped + " unrecognized item(s) skipped.");
  });
}

function exportRecipeCSV() {
  const dishName = document.getElementById("recipeDishName").value.trim();
  const totalCmt = document.getElementById("recipeTotalCmt").value.trim();
  const processedTotalCmt = document.getElementById("processedTotalCmt").value.trim();

  if (!dishName) { alert("Please select or enter a Dish Name."); return; }

  const dishCode = getRecipeDishCode(dishName);
  const recipeRows = collectRecipeRows(dishName, dishCode, totalCmt, processedTotalCmt);
  if (!recipeRows.length) { alert("Please select at least one recipe item."); return; }

  const dishOut = getDishOutFormState();
  if (dishOut.usable) {
    const check = validateUsableDishOutForm();
    if (!check.ok) { alert(check.error); return; }
  }

  const sanitizedDishName = dishName.toLowerCase().replace(/[^a-z0-9]/gi, "_");
  downloadCsvBlob(buildRecipePreview(recipeRows), "recipe_" + sanitizedDishName + ".csv");
}

function collectRecipeRows(dishName, dishCode, totalCmt, processedTotalCmt) {
  const code = dishCode || getRecipeDishCode(dishName);
  const dishOut = typeof document !== "undefined" ? getDishOutFormState() : {
    usable: false,
    dishOutScoop: "",
    dishOutInGm: "",
    dishOutInML: "",
    dishOutInPiece: "",
    dishOutCmt: "",
    isUsableInOtherDish: false,
    usableProcessedScoop: "",
    qtyOfScoops: null,
    qtyForRow: ""
  };
  const recipeRows = [];
  document.querySelectorAll("#recipeBody tr").forEach(tr => {
    const ci = tr.dataset.cat; if (ci === "") return;
    const e = window.RECIPE_CATALOG[+ci];
    recipeRows.push([
      dishName,
      code,
      e.recipeItemName,
      e.pgNo,
      tr.dataset.scoop || tr.querySelector(".i-scoop").value,
      num(tr.querySelector(".i-qty").value),
      "",
      "",
      "",
      tr.querySelector(".i-cmt").value.trim(),
      ...RECIPE_ROW_EXTRA_EMPTY
    ]);
  });

  document.querySelectorAll("#processedBody tr").forEach(tr => {
    const di = tr.dataset.dish; if (di === "") return;
    const e = (window.DISH_CATALOG || [])[+di];
    if (!e) return;
    recipeRows.push([
      dishName,
      code,
      e.dishName,
      e.dishCode || "",
      tr.dataset.scoop || tr.querySelector(".i-scoop").value,
      num(tr.querySelector(".i-qty").value),
      "",
      "",
      "",
      tr.querySelector(".i-cmt").value.trim(),
      ...RECIPE_ROW_EXTRA_EMPTY
    ]);
  });

  const hasRows = recipeRows.length > 0;
  if (hasRows) {
    recipeRows.push([
      dishName,
      code,
      "totalingredientsqty",
      "",
      "",
      num(document.getElementById("recipeTotalQty").value),
      "",
      "",
      "",
      totalCmt,
      ...RECIPE_ROW_EXTRA_EMPTY
    ]);
    recipeRows.push([
      dishName,
      code,
      "totalprocessedqty",
      "",
      "",
      num(document.getElementById("processedTotalQty").value),
      "",
      "",
      "",
      processedTotalCmt || "",
      ...RECIPE_ROW_EXTRA_EMPTY
    ]);
    recipeRows.push([
      dishName,
      code,
      "dish_out",
      "",
      dishOut.dishOutScoop,
      dishOut.usable ? dishOut.qtyForRow : "",
      dishOut.dishOutInGm,
      dishOut.dishOutInML,
      dishOut.dishOutInPiece,
      dishOut.dishOutCmt,
      ...recipeRowExtraCols(dishOut.isUsableInOtherDish, dishOut.usableProcessedScoop, dishOut.qtyOfScoops)
    ]);
  }

  return recipeRows;
}

/** Map collectRecipeRows output to objects matching CSV / DB columns */
function recipeRowsToPayload(recipeRows) {
  return recipeRows.map(r => {
    const itemKey = String(r[2] || "").toLowerCase();
    const isDishOut = itemKey === RECIPE_META_ITEMS.DISH_OUT;
    const isUsable = isDishOut && (r.length > 10 ? parseBoolish(r[10]) : false);
    const usableScoop = r.length > 11 ? (r[11] || "") : "";
    const qtyOfScoops = r.length > 12 && r[12] !== "" && r[12] != null ? num(r[12]) : null;
    return {
      dishname: r[0],
      dishcode: r[1] || null,
      reciepeItemname: r[2],
      pgNo: r[3],
      receipescoop: r[4],
      qty: r[5] === "" || r[5] == null ? null : r[5],
      inGm: r[6] === "" || r[6] == null ? null : r[6],
      inML: r[7] === "" || r[7] == null ? null : r[7],
      inPiece: r[8] === "" || r[8] == null ? null : r[8],
      isUsableInOtherDish: isUsable,
      usableProcessedScoop: isUsable ? (usableScoop || null) : null,
      qtyOfScoops: isUsable ? qtyOfScoops : null,
      comments: r[9] || ""
    };
  });
}

function collectRecipePayloadFromForm() {
  const dishName = document.getElementById("recipeDishName").value.trim();
  const dishCode = getRecipeDishCode(dishName);
  const totalCmt = document.getElementById("recipeTotalCmt").value.trim();
  const processedTotalCmt = document.getElementById("processedTotalCmt").value.trim();
  const rows = collectRecipeRows(dishName, dishCode, totalCmt, processedTotalCmt);
  return { dishname: dishName, dishcode: dishCode, rows: recipeRowsToPayload(rows), csvRows: rows };
}

function populateProcessedRow(tr, row) {
  const dishName = row.reciepeitemname || row.recipeitemname || row.dishname || "";
  const di = findDishCatalogIndex(dishName, row.pgno || row.pgNo || row.dishcode || row.dish_code || "");
  if (di < 0) return false;

  tr.dataset.dish = String(di);
  tr.querySelector(".i-dish").value = window.DISH_CATALOG[di].dishName;
  tr.querySelector(".i-code").value = window.DISH_CATALOG[di].dishCode || "";

  const scoopIn = tr.querySelector(".i-scoop");
  const scoopVal = row.receipescoop || row.recipescoop || "";
  const dishLabel = window.DISH_CATALOG[di].dishName;
  const key = dishLabel.trim().toLowerCase();
  const configRows = (window.SCOOP_CONFIG_BY_DISH_NAME && window.SCOOP_CONFIG_BY_DISH_NAME[key]) || [];
  let scoops = configRows.map(s => ({ dishname: dishLabel, dish_out_scoop: s.scoop_name }));
  if (!scoops.length) {
    scoops = (window.DISH_OUT_SCOOP_CATALOG || []).filter(s =>
      String(s.dishname || "").toLowerCase() === key
    );
  }
  scoopIn.disabled = scoops.length === 0;

  if (scoopVal) {
    tr.dataset.scoop = scoopVal;
    scoopIn.value = scoopVal;
  } else {
    const catalogEntry = (window.USABLE_PROCESSED_DISH_CATALOG || []).find(d =>
      String(d.dishName || d.dishname || "").toLowerCase() === key
    );
    const preferred = catalogEntry && catalogEntry.usableProcessedScoop ? catalogEntry.usableProcessedScoop : "";
    const def = (preferred && scoops.some(s => s.dish_out_scoop === preferred))
      ? preferred
      : (scoops.length === 1 ? scoops[0].dish_out_scoop : "");
    if (def) {
      tr.dataset.scoop = def;
      scoopIn.value = def;
    }
  }

  if (row.qty !== "") tr.querySelector(".i-qty").value = row.qty;
  tr.querySelector(".i-cmt").value = row.comments || "";
  if (typeof applyProcessedDishState === "function") applyProcessedDishState(tr);
  return true;
}

function populateRecipeRow(tr, row) {
  const itemname = row.reciepeitemname || row.recipeitemname || row.itemname || "";
  const ci = findRecipeCatalogIndex(itemname, row.pgno || row.pgNo);
  if (ci < 0) return false;

  tr.dataset.cat = String(ci);
  tr.querySelector(".i-name").value = window.RECIPE_CATALOG[ci].recipeItemName;
  tr.querySelector(".i-pg").value = window.RECIPE_CATALOG[ci].pgNo;

  const scoopIn = tr.querySelector(".i-scoop");
  const scoopVal = row.receipescoop || row.recipescoop || "";
  const scoops = (window.RECIPE_SCOOP_CATALOG || []).filter(s => s.recipeItemName === window.RECIPE_CATALOG[ci].recipeItemName);
  scoopIn.disabled = scoops.length === 0;

  if (scoopVal) {
    tr.dataset.scoop = scoopVal;
    scoopIn.value = scoopVal;
  } else if (scoops.length === 1) {
    tr.dataset.scoop = scoops[0].recipeScoop;
    scoopIn.value = scoops[0].recipeScoop;
  }

  if (row.qty !== "") tr.querySelector(".i-qty").value = row.qty;
  tr.querySelector(".i-cmt").value = row.comments || "";
  applyRecipeDishState(tr);
  return true;
}

function populateRecipeFromRows(rows, opts) {
  opts = opts || {};
  const keepDishName = !!opts.keepDishName;
  const targetDishName = opts.targetDishName || document.getElementById("recipeDishName").value.trim();
  const remapDishOutScoop = opts.remapDishOutScoop !== false;

  document.getElementById("recipeBody").innerHTML = "";
  document.getElementById("processedBody").innerHTML = "";
  document.getElementById("recipeTotalQty").value = "0";
  document.getElementById("recipeTotalCmt").value = "";
  document.getElementById("processedTotalQty").value = "0";
  document.getElementById("processedTotalCmt").value = "";
  document.getElementById("recipeDishOutScoop").value = "";
  document.getElementById("dishOutInGm").value = "";
  document.getElementById("dishOutInML").value = "";
  document.getElementById("dishOutInPiece").value = "";
  document.getElementById("recipeDishOutCmt").value = "";
  setDishOutUsableInOther(false);
  const usableScoopEl = document.getElementById("dishOutUsableProcessedScoop");
  if (usableScoopEl) usableScoopEl.value = "";
  const qtyScoopsEl = document.getElementById("dishOutQtyOfScoops");
  if (qtyScoopsEl) qtyScoopsEl.value = "";
  if (typeof window.toggleDishOutUsableUI === "function") window.toggleDishOutUsableUI();

  let sourceDishName = "";
  let sourceDishCode = "";
  const itemRows = [];
  const processedRows = [];

  rows.forEach(raw => {
    const row = normalizeRecipeRow(raw);
    sourceDishName = row.dishname || sourceDishName;
    if (row.dishcode) sourceDishCode = row.dishcode;
    const recipeItem = row.reciepeitemname || row.recipeitemname || "";
    const key = recipeItem.toLowerCase();

    if (key === RECIPE_META_ITEMS.TOTAL_INGREDIENTS) {
      document.getElementById("recipeTotalQty").value = row.qty != null && row.qty !== "" ? row.qty : "0";
      document.getElementById("recipeTotalCmt").value = row.comments || "";
      return;
    }
    if (key === RECIPE_META_ITEMS.TOTAL_PROCESSED) {
      document.getElementById("processedTotalQty").value = row.qty != null && row.qty !== "" ? row.qty : "0";
      document.getElementById("processedTotalCmt").value = row.comments || "";
      return;
    }
    if (key === RECIPE_META_ITEMS.DISH_OUT) {
      const isUsable = parseBoolish(row.is_usable_in_other_dish);
      setDishOutUsableInOther(isUsable);
      if (isUsable) {
        const scoop = row.usable_processed_scoop || row.receipescoop || row.recipescoop || "";
        const usableEl = document.getElementById("dishOutUsableProcessedScoop");
        if (usableEl) usableEl.value = scoop;
        const dishForScoop = sourceDishName || row.dishname || "";
        const qScoops = qtyOfScoopsFromStoredDishOut(row, scoop, dishForScoop);
        const qtyEl = document.getElementById("dishOutQtyOfScoops");
        if (qtyEl) qtyEl.value = qScoops != null && qScoops !== "" ? qScoops : "";
        document.getElementById("recipeDishOutScoop").value = "";
        document.getElementById("dishOutInGm").value = "";
        document.getElementById("dishOutInML").value = "";
        document.getElementById("dishOutInPiece").value = "";
      } else {
        let scoop = row.receipescoop || row.recipescoop || "";
        if (remapDishOutScoop && targetDishName) scoop = defaultDishOutScoop(targetDishName);
        document.getElementById("recipeDishOutScoop").value = scoop;
        document.getElementById("dishOutInGm").value = row.ingm != null && row.ingm !== "" ? row.ingm : "";
        document.getElementById("dishOutInML").value = row.inml != null && row.inml !== "" ? row.inml : "";
        document.getElementById("dishOutInPiece").value = row.inpiece != null && row.inpiece !== "" ? row.inpiece : "";
        const usableEl = document.getElementById("dishOutUsableProcessedScoop");
        if (usableEl) usableEl.value = "";
        const qtyEl = document.getElementById("dishOutQtyOfScoops");
        if (qtyEl) qtyEl.value = "";
      }
      document.getElementById("recipeDishOutCmt").value = row.comments || "";
      if (typeof window.toggleDishOutUsableUI === "function") window.toggleDishOutUsableUI();
      return;
    }
    if (isProcessedRecipeRow(recipeItem)) processedRows.push(row);
    else if (!isRecipeMetaItem(recipeItem)) itemRows.push(row);
  });

  if (!keepDishName && sourceDishName) {
    document.getElementById("recipeDishName").value = sourceDishName;
  }
  if (typeof onRecipeDishChange === "function") onRecipeDishChange();
  if (sourceDishCode) {
    const codeEl = document.getElementById("recipeDishCode");
    if (codeEl) codeEl.value = sourceDishCode;
  }
  if (keepDishName) {
    setRecipeDishCode("", targetDishName);
  } else if (sourceDishCode) {
    document.getElementById("recipeDishCode").value = sourceDishCode;
  }

  let skipped = 0;
  itemRows.forEach(row => {
    addRecipeRow();
    const tr = document.querySelector("#recipeBody tr:last-child");
    if (!populateRecipeRow(tr, row)) {
      tr.remove();
      skipped++;
    }
  });

  processedRows.forEach(row => {
    addProcessedRow();
    const tr = document.querySelector("#processedBody tr:last-child");
    if (!populateProcessedRow(tr, row)) {
      tr.remove();
      skipped++;
    }
  });

  if (!document.querySelectorAll("#recipeBody tr").length) addRecipeRow();
  if (!document.querySelectorAll("#processedBody tr").length) addProcessedRow();
  if (typeof refreshRecipe === "function") refreshRecipe();

  return {
    skipped,
    itemCount: itemRows.length,
    processedCount: processedRows.length
  };
}

function isRecipeServerAvailable() {
  return typeof window !== "undefined"
    && window.location
    && (window.location.protocol === "http:" || window.location.protocol === "https:");
}

async function fetchRecipeByDishname(dishname) {
  const name = String(dishname || "").trim();
  if (!name) return { ok: false, error: "No dish name", rows: [] };
  if (!isRecipeServerAvailable()) {
    return { ok: false, error: "offline", rows: [] };
  }
  try {
    const res = await fetch("/api/recipes/" + encodeURIComponent(name));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data.detail || data.error || res.statusText || "Request failed",
        rows: []
      };
    }
    return {
      ok: true,
      dishname: data.dishname || name,
      dishcode: data.rows && data.rows[0] ? data.rows[0].dishcode : "",
      rows: Array.isArray(data.rows) ? data.rows : []
    };
  } catch (e) {
    return { ok: false, error: e.message || "Network error", rows: [] };
  }
}

async function fetchRecipeByDishcode(dishcode) {
  const code = String(dishcode || "").trim();
  if (!code) return { ok: false, error: "No dish code", rows: [] };
  if (!isRecipeServerAvailable()) {
    return { ok: false, error: "offline", rows: [] };
  }
  try {
    const res = await fetch("/api/recipes/by-dishcode/" + encodeURIComponent(code));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data.detail || data.error || res.statusText || "Request failed",
        rows: []
      };
    }
    return {
      ok: true,
      dishcode: data.dishcode || code,
      dishname: data.dishname || "",
      rows: Array.isArray(data.rows) ? data.rows : []
    };
  } catch (e) {
    return { ok: false, error: e.message || "Network error", rows: [] };
  }
}

function lookupDishByCode(dishcode) {
  const code = String(dishcode || "").trim().toLowerCase();
  if (!code) return null;
  return (window.DISH_CATALOG || []).find(d =>
    String(d.dishCode || d.dish_code || "").toLowerCase() === code
  ) || null;
}

async function loadRecipeFromDbForCurrentDish() {
  const dishName = document.getElementById("recipeDishName").value.trim();
  const dishCode = document.getElementById("recipeDishCode").value.trim();
  if (!dishName && !dishCode) {
    return { ok: false, error: "Select or enter a Dish Name (and dish code if available)." };
  }
  if (!isRecipeServerAvailable()) {
    return {
      ok: false,
      error: "Load from DB requires the app server (docker compose up → http://localhost:3050)."
    };
  }

  const fetched = dishCode
    ? await fetchRecipeByDishcode(dishCode)
    : await fetchRecipeByDishname(dishName);

  if (!fetched.ok) {
    const offlineMsg = "Load from DB needs the server. Use Import CSV offline.";
    return {
      ok: false,
      error: fetched.error === "offline" ? offlineMsg : (fetched.error || "Could not load recipe.")
    };
  }
  if (!fetched.rows.length) {
    const key = dishCode || dishName;
    return { ok: false, error: 'No saved recipe found for "' + key + '".' };
  }

  const result = populateRecipeFromRows(fetched.rows, {
    keepDishName: false,
    remapDishOutScoop: false
  });

  const label = fetched.dishname || dishName;
  const code = fetched.dishcode || dishCode;
  let msg = 'Loaded latest recipe for "' + label + '"' + (code ? ' (' + code + ')' : '') + '.';
  if (result.skipped) msg += " " + result.skipped + " unrecognized row(s) skipped.";
  return { ok: true, message: msg, ...result };
}

async function cloneRecipeFromDishcode(sourceDishcode) {
  const code = String(sourceDishcode || "").trim();
  const targetDish = document.getElementById("recipeDishName").value.trim();
  const sourceEntry = lookupDishByCode(code);
  const sourceName = sourceEntry ? sourceEntry.dishName : code;

  if (!code) {
    return { ok: false, error: "Select a source dish to clone from." };
  }
  if (!targetDish) {
    return { ok: false, error: "Select the target dish first (Dish Name)." };
  }
  if (sourceEntry && sourceEntry.dishName.toLowerCase() === targetDish.toLowerCase()) {
    return { ok: false, error: "Source and target dish are the same." };
  }

  const fetched = await fetchRecipeByDishcode(code);
  if (!fetched.ok) {
    const offlineMsg = "Clone needs the server (or saved recipe in DB). Use Import CSV offline.";
    return {
      ok: false,
      error: fetched.error === "offline" ? offlineMsg : (fetched.error || "Could not load recipe.")
    };
  }
  if (!fetched.rows.length) {
    return { ok: false, error: 'No saved recipe for dish code "' + code + '".' };
  }

  const result = populateRecipeFromRows(fetched.rows, {
    keepDishName: true,
    targetDishName: targetDish,
    remapDishOutScoop: true
  });

  let msg = 'Cloned from "' + (fetched.dishname || sourceName) + '" (' + code + ') into "' + targetDish + '".';
  if (result.skipped) msg += " " + result.skipped + " unrecognized row(s) skipped.";
  return { ok: true, message: msg, ...result };
}

async function cloneRecipeFromDish(sourceDish) {
  const entry = (window.DISH_CATALOG || []).find(d =>
    String(d.dishName || "").toLowerCase() === String(sourceDish || "").toLowerCase()
  );
  const code = entry ? (entry.dishCode || entry.dish_code || "") : "";
  if (!code) {
    return { ok: false, error: 'Could not resolve dish code for "' + sourceDish + '".' };
  }
  return cloneRecipeFromDishcode(code);
}

function importRecipeCSV() {
  pickCsvFile(text => {
    const parsed = parseCsvText(text);
    if (!parsed.rows.length) { alert("CSV is empty or invalid."); return; }

    const hdr = parsed.header;
    if (!hdr.includes("dishname")) {
      alert("Unrecognized CSV format. Import a Recipe Maker export.");
      return;
    }

    const rows = parsed.rows.map(cols => rowToObj(hdr, cols));
    const result = populateRecipeFromRows(rows, { keepDishName: false, remapDishOutScoop: false });

    if (!result.itemCount && !result.processedCount) {
      alert("Imported header fields only. No item rows found.");
      return;
    }
    if (result.skipped) alert("Imported with " + result.skipped + " unrecognized item(s) skipped.");
  });
}

window.Csv = {
  HEADER_BILL: CSV_HEADER_BILL,
  HEADER_INV: CSV_HEADER_INV,
  HEADER_OUT: CSV_HEADER_OUT,
  HEADER_RECIPE: CSV_HEADER_RECIPE,
  RECIPE_META_ITEMS,
  splitCsvLine,
  parseBlock,
  field: csvField,
  rowsToCsv,
  parseText: parseCsvText,
  rowToObj,
  isHousekeepingCsvHeader,
  pickFile: pickCsvFile,
  download: downloadCsvBlob,
  buildInBillPreview,
  buildInInvPreview,
  buildOutPreview,
  buildOutRequirementShare,
  buildRecipePreview,
  collectRecipeRows,
  recipeRowsToPayload,
  collectRecipePayloadFromForm,
  getDishOutFormState,
  dishOutUsableInOtherOn,
  setDishOutUsableInOther,
  resolveScoopConfigRow,
  computeUsableDishOutQtyCols,
  qtyOfScoopsFromStoredDishOut,
  isAllowedUsableProcessedDestUnit,
  validateUsableDishOutForm,
  updateUsableDishOutResultDisplay,
  exportInCSV,
  importInCSV,
  applyOrderToInForm,
  exportOutCSV,
  importOutCSV,
  exportRecipeCSV,
  importRecipeCSV,
  populateRecipeFromRows,
  fetchRecipeByDishname,
  fetchRecipeByDishcode,
  loadRecipeFromDbForCurrentDish,
  cloneRecipeFromDishcode,
  cloneRecipeFromDish
};
