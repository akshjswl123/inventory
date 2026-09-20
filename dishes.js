/* Dishes — dishcode, dishname */
(function (global) {
  "use strict";

  const CSV_HEADER = ["dishcode", "dishname"];
  const STORAGE_KEY = "inventory_dishes";

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
    const el = document.getElementById("dishesMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind || "";
  }

  function readRowsFromDom() {
    const out = [];
    document.querySelectorAll("#dishesBody tr").forEach(tr => {
      const dishcode = tr.querySelector(".d-code").value.trim();
      const dishname = tr.querySelector(".d-name").value.trim();
      if (!dishcode && !dishname) return;
      out.push({ dishcode: dishcode, dishname: dishname });
    });
    return out;
  }

  function toCsv(dataRows) {
    if (!dataRows.length) return "-- add rows to see preview --";
    const lines = [CSV_HEADER.map(csvQ).join(",")];
    dataRows.forEach(r => {
      lines.push([r.dishcode, r.dishname].map(csvQ).join(","));
    });
    return lines.join("\r\n");
  }

  function renderPreview() {
    document.getElementById("dishesPreview").textContent = toCsv(readRowsFromDom());
  }

  function addRow(data) {
    data = data || {};
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input type="text" class="d-code" placeholder="dishcode" value="' + escHtml(data.dishcode || "") + '" /></td>' +
      '<td><input type="text" class="d-name" placeholder="dishname (type manually)" value="' + escHtml(data.dishname || "") + '" /></td>' +
      '<td style="text-align:center"><button type="button" class="danger d-remove">&times;</button></td>';

    document.getElementById("dishesBody").appendChild(tr);

    tr.querySelector(".d-remove").addEventListener("click", () => {
      tr.remove();
      renderPreview();
    });

    tr.querySelectorAll(".d-code, .d-name").forEach(el => {
      el.addEventListener("input", renderPreview);
    });

    renderPreview();
  }

  function loadFromCatalog() {
    if (!catalog.length) {
      alert("No catalog data found.");
      return;
    }
    document.getElementById("dishesBody").innerHTML = "";
    catalog.forEach(c => {
      addRow({
        dishcode: c.dishCode || c.dishcode || "",
        dishname: c.dishName || c.dishname || ""
      });
    });
    if (!document.querySelectorAll("#dishesBody tr").length) addRow();
    setMsg("Loaded " + catalog.length + " dish(es) from catalog", "ok");
    renderPreview();
  }

  function exportCsv() {
    const dataRows = readRowsFromDom();
    if (!dataRows.length) { alert("Nothing to export."); return; }
    const blob = new Blob(["\uFEFF" + toCsv(dataRows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dishes.csv";
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
          const codeIdx = colIndex(header, ["dishcode", "dish_code", "dish code"]);
          const nameIdx = colIndex(header, ["dishname", "dish_name", "dish name"]);
          const imported = [];
          for (let i = 1; i < lines.length; i++) {
            const vals = splitLine(lines[i]);
            const row = {
              dishcode: codeIdx >= 0 ? (vals[codeIdx] || "") : (vals[0] || ""),
              dishname: nameIdx >= 0 ? (vals[nameIdx] || "") : (vals[1] || "")
            };
            if (!row.dishcode && !row.dishname) continue;
            imported.push(row);
          }
          document.getElementById("dishesBody").innerHTML = "";
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
      document.getElementById("dishesBody").innerHTML = "";
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
      const d = await postJSON("/api/dishes", { rows: dataRows });
      setMsg("Saved " + d.count + " row(s) to database", "ok");
    } catch (e) {
      alert("Save to DB failed: " + e.message);
    }
  }

  function resetTable() {
    document.getElementById("dishesBody").innerHTML = "";
    addRow();
    addRow();
    setMsg("", "");
    renderPreview();
  }

  function init(opts) {
    catalog = opts.catalog || [];
    const postJSON = opts.postJSON;
    const isServerMode = opts.isServerMode || (() => false);

    document.getElementById("dishesAddRowBtn").addEventListener("click", () => addRow());
    document.getElementById("dishesLoadCatalogBtn").addEventListener("click", loadFromCatalog);
    document.getElementById("dishesImportBtn").addEventListener("click", importCsv);
    document.getElementById("dishesExportBtn").addEventListener("click", exportCsv);
    document.getElementById("dishesSaveLocalBtn").addEventListener("click", saveLocal);
    document.getElementById("dishesLoadLocalBtn").addEventListener("click", loadLocal);
    document.getElementById("dishesResetBtn").addEventListener("click", resetTable);
    document.getElementById("dishesSaveDbBtn").addEventListener("click", () => {
      if (!postJSON) return;
      saveToDB(postJSON);
    });

    resetTable();

    if (!isServerMode()) {
      const hint = document.getElementById("dishesDbHint");
      if (hint) hint.textContent = "Save to DB requires the app server (docker compose up → http://localhost:3050).";
    }
  }

  global.Dishes = { init: init, toCsv: toCsv, readRowsFromDom: readRowsFromDom };
})(typeof window !== "undefined" ? window : global);
