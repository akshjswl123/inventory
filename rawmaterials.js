/* Raw Materials — pgNo, itemname, comments */
(function (global) {
  "use strict";

  const CSV_HEADER = ["pgNo", "itemname", "comments"];
  const STORAGE_KEY = "inventory_raw_materials";

  let catalog = [];
  let rows = [];

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

  function colIndex(header, names) {
    for (let i = 0; i < names.length; i++) {
      const idx = header.indexOf(names[i].toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function setMsg(text, kind) {
    const el = document.getElementById("rawMaterialsMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind || "";
  }

  function readRowsFromDom() {
    const out = [];
    document.querySelectorAll("#rawMaterialsBody tr").forEach(tr => {
      const pgNo = tr.querySelector(".rm-pg").value.trim();
      const itemname = tr.querySelector(".rm-name").value.trim();
      const comments = tr.querySelector(".rm-cmt").value.trim();
      if (!pgNo && !itemname && !comments) return;
      out.push({ pgNo: pgNo, itemname: itemname, comments: comments });
    });
    return out;
  }

  function toCsv(dataRows) {
    if (!dataRows.length) return "-- add rows to see preview --";
    const lines = [CSV_HEADER.map(csvQ).join(",")];
    dataRows.forEach(r => {
      lines.push([r.pgNo, r.itemname, r.comments].map(csvQ).join(","));
    });
    return lines.join("\r\n");
  }

  function renderPreview() {
    document.getElementById("rawMaterialsPreview").textContent = toCsv(readRowsFromDom());
  }

  function addRow(data) {
    data = data || {};
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input type="text" class="rm-pg" placeholder="pgNo" value="' + escHtml(data.pgNo || "") + '" /></td>' +
      '<td><input type="text" class="rm-name" placeholder="itemname (type manually)" value="' + escHtml(data.itemname || "") + '" /></td>' +
      '<td><input type="text" class="rm-cmt" placeholder="comments" value="' + escHtml(data.comments || "") + '" /></td>' +
      '<td style="text-align:center"><button type="button" class="danger rm-remove">&times;</button></td>';

    document.getElementById("rawMaterialsBody").appendChild(tr);

    tr.querySelector(".rm-remove").addEventListener("click", () => {
      tr.remove();
      renderPreview();
    });

    tr.querySelectorAll(".rm-pg, .rm-name, .rm-cmt").forEach(el => {
      el.addEventListener("input", renderPreview);
    });

    renderPreview();
  }

  function loadFromCatalog() {
    if (!catalog.length) {
      alert("No catalog data found.");
      return;
    }
    document.getElementById("rawMaterialsBody").innerHTML = "";
    catalog.forEach(c => {
      addRow({
        pgNo: c.pgNo || "",
        itemname: c.itemname || "",
        comments: ""
      });
    });
    if (!document.querySelectorAll("#rawMaterialsBody tr").length) addRow();
    setMsg("Loaded " + catalog.length + " item(s) from catalog", "ok");
    renderPreview();
  }

  function exportCsv() {
    const dataRows = readRowsFromDom();
    if (!dataRows.length) { alert("Nothing to export."); return; }
    const blob = new Blob(["\uFEFF" + toCsv(dataRows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "raw_materials.csv";
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
          const splitLine = (global.Csv && global.Csv.splitCsvLine) || function (line) {
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
          };
          const header = splitLine(lines[0]).map(h => h.toLowerCase());
          const pgIdx = colIndex(header, ["pgno", "pg_no"]);
          const nameIdx = colIndex(header, ["itemname", "item_name", "item name"]);
          const cmtIdx = colIndex(header, ["comments", "comment"]);
          const imported = [];
          for (let i = 1; i < lines.length; i++) {
            const vals = splitLine(lines[i]);
            const row = {
              pgNo: pgIdx >= 0 ? (vals[pgIdx] || "") : (vals[0] || ""),
              itemname: nameIdx >= 0 ? (vals[nameIdx] || "") : (vals[1] || ""),
              comments: cmtIdx >= 0 ? (vals[cmtIdx] || "") : (vals[2] || "")
            };
            if (!row.pgNo && !row.itemname) continue;
            imported.push(row);
          }
          document.getElementById("rawMaterialsBody").innerHTML = "";
          imported.forEach(r => addRow(r));
          if (!imported.length) addRow();
          setMsg("Imported " + imported.length + " row(s)", "ok");
          renderPreview();
        } catch (e) {
          alert("Import failed: " + e.message);
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(readRowsFromDom()));
      setMsg("Saved to browser storage", "ok");
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setMsg("Nothing in browser storage", "err"); return; }
      rows = JSON.parse(raw);
      document.getElementById("rawMaterialsBody").innerHTML = "";
      rows.forEach(r => addRow(r));
      if (!rows.length) addRow();
      setMsg("Loaded from browser storage", "ok");
      renderPreview();
    } catch (e) {
      alert("Load failed: " + e.message);
    }
  }

  async function saveToDB(postJSON) {
    const dataRows = readRowsFromDom();
    if (!dataRows.length) { alert("Add at least one row."); return; }
    try {
      const d = await postJSON("/api/raw-materials", { rows: dataRows });
      setMsg("Saved " + d.count + " row(s) to database", "ok");
    } catch (e) {
      alert("Save to DB failed: " + e.message);
    }
  }

  function resetTable() {
    document.getElementById("rawMaterialsBody").innerHTML = "";
    addRow();
    addRow();
    setMsg("", "");
    renderPreview();
  }

  function init(opts) {
    catalog = opts.catalog || [];
    const postJSON = opts.postJSON;
    const isServerMode = opts.isServerMode || (() => false);

    document.getElementById("rawMaterialsAddRowBtn").addEventListener("click", () => addRow());
    document.getElementById("rawMaterialsLoadCatalogBtn").addEventListener("click", loadFromCatalog);
    document.getElementById("rawMaterialsImportBtn").addEventListener("click", importCsv);
    document.getElementById("rawMaterialsExportBtn").addEventListener("click", exportCsv);
    document.getElementById("rawMaterialsSaveLocalBtn").addEventListener("click", saveLocal);
    document.getElementById("rawMaterialsLoadLocalBtn").addEventListener("click", loadLocal);
    document.getElementById("rawMaterialsResetBtn").addEventListener("click", resetTable);
    document.getElementById("rawMaterialsSaveDbBtn").addEventListener("click", () => {
      if (!postJSON) return;
      saveToDB(postJSON);
    });

    resetTable();

    if (!isServerMode()) {
      const hint = document.getElementById("rawMaterialsDbHint");
      if (hint) hint.textContent = "Save to DB requires the app server (docker compose up → http://localhost:3050).";
    }
  }

  global.RawMaterials = { init: init, toCsv: toCsv, readRowsFromDom: readRowsFromDom };
})(typeof window !== "undefined" ? window : global);
