/* Raw material pgNo → scoop name picker (chiplets + save unused aliases) */
(function () {
  "use strict";

  /** @type {Array<{pgNo:string, chips:string[], selected:string, allItems:object[], removedNames:string[]}>} */
  let state = [];

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setMsg(text, kind) {
    const el = document.getElementById("rmsMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind || "";
  }

  function rowFromApi(r) {
    const allItems = r.items || [];
    const chips = allItems
      .filter(i => String(i.comments || "").trim().toLowerCase() !== "unused")
      .map(i => i.itemname)
      .filter(Boolean);
    if (!chips.length && (r.itemnames || []).length) {
      chips.push(...r.itemnames);
    }
    let selected = r.itemnameSelectedForScoop || "";
    if (selected && !chips.some(n => n.toLowerCase() === selected.toLowerCase())) {
      chips.push(selected);
    }
    if (!selected && chips.length) selected = chips[0];
    return {
      pgNo: r.pgNo || "",
      chips: chips,
      selected: selected,
      allItems: r.items || [],
      removedNames: []
    };
  }

  function syncSelectOptions(rowIdx) {
    const row = state[rowIdx];
    if (!row) return;
    const sel = document.querySelector('select.rms-select[data-idx="' + rowIdx + '"]');
    if (!sel) return;
    const prev = row.selected;
    sel.innerHTML = "";
    row.chips.forEach(name => {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      if (name === row.selected) o.selected = true;
      sel.appendChild(o);
    });
    if (row.chips.length && !row.chips.includes(prev)) {
      row.selected = row.chips[0];
    }
  }

  function render() {
    const tbody = document.getElementById("rmsBody");
    if (!tbody) return;
    if (!state.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">No raw_materials rows with pgNo.</td></tr>';
      return;
    }

    let html = "";
    state.forEach((row, idx) => {
      const chipsHtml = row.chips.length
        ? row.chips.map((name, chipIdx) => (
          '<span class="chip">' +
          escHtml(name) +
          '<button type="button" title="Remove alias (marks unused on save)" data-remove-chip="' + idx + '" data-chip-idx="' + chipIdx + '"' +
          (row.chips.length <= 1 ? " disabled" : "") + ">&times;</button></span>"
        )).join("")
        : '<span class="empty">No active names</span>';

      const options = row.chips.map(name =>
        '<option value="' + escHtml(name) + '"' + (name === row.selected ? " selected" : "") + ">" +
        escHtml(name) + "</option>"
      ).join("");

      html +=
        "<tr data-pg=\"" + escHtml(row.pgNo) + "\">" +
        "<td><code>" + escHtml(row.pgNo) + "</code></td>" +
        '<td><div class="chip-wrap">' + chipsHtml + "</div></td>" +
        '<td><select class="rms-select" data-idx="' + idx + '">' + options + "</select></td>" +
        "</tr>";
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll("[data-remove-chip]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = +btn.getAttribute("data-remove-chip");
        const chipIdx = +btn.getAttribute("data-chip-idx");
        const row = state[idx];
        const name = row && row.chips[chipIdx];
        removeChip(idx, name);
      });
    });

    tbody.querySelectorAll("select.rms-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const idx = +sel.getAttribute("data-idx");
        const row = state[idx];
        if (!row) return;
        row.selected = sel.value;
        upsertSelected(row.pgNo, row.selected);
      });
    });
  }

  function removeChip(rowIdx, name) {
    const row = state[rowIdx];
    if (!row || row.chips.length <= 1) {
      alert("Each pgNo must keep at least one name until you save.");
      return;
    }
    row.chips = row.chips.filter(n => n !== name);
    if (!row.removedNames) row.removedNames = [];
    if (name && !row.removedNames.some(n => n.toLowerCase() === name.toLowerCase())) {
      row.removedNames.push(name);
    }
    if (row.selected === name) {
      row.selected = row.chips[0] || "";
    }
    render();
  }

  async function upsertSelected(pgNo, itemnameSelectedForScoop) {
    if (!pgNo || !itemnameSelectedForScoop) return;
    try {
      const res = await fetch("/api/raw-materials/scoop-names/selected", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgNo, itemnameSelectedForScoop })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("Selected scoop upsert failed:", data.detail || data.error || res.statusText);
      }
    } catch (e) {
      console.warn("Selected scoop upsert failed:", e.message);
    }
  }

  async function loadFromDb() {
    setMsg("Loading…", "");
    try {
      const res = await fetch("/api/raw-materials/scoop-names");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
      state = (data.rows || []).map(rowFromApi);
      render();
      setMsg("Loaded " + state.length + " pgNo group(s)", "ok");
    } catch (e) {
      setMsg("", "");
      alert("Load failed: " + e.message);
    }
  }

  async function saveToDb() {
    if (!state.length) {
      alert("Nothing to save.");
      return;
    }
    const rows = [];
    for (let i = 0; i < state.length; i++) {
      const row = state[i];
      if (!row.pgNo) continue;
      if (!row.chips.length || !row.selected) {
        alert("pgNo " + row.pgNo + ": pick at least one name.");
        return;
      }
      if (!row.chips.includes(row.selected)) {
        alert("pgNo " + row.pgNo + ": selected name must be one of the chiplets.");
        return;
      }
      rows.push({
        pgNo: row.pgNo,
        itemnameSelectedForScoop: row.selected,
        itemnames: row.chips.slice(),
        removedItemnames: (row.removedNames || []).slice()
      });
    }

    try {
      const res = await fetch("/api/raw-materials/scoop-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
      setMsg(
        (data.message || "Saved") + " (" + (data.updated || 0) + " row(s) touched)",
        "ok"
      );
      await loadFromDb();
      if (typeof window.opener !== "undefined" && window.opener && typeof window.opener.refreshStaticData === "function") {
        try { await window.opener.refreshStaticData(); } catch (_e) { /* ignore */ }
      }
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  }

  function init() {
    document.getElementById("rmsReloadBtn").addEventListener("click", loadFromDb);
    document.getElementById("rmsSaveBtn").addEventListener("click", saveToDb);
    loadFromDb();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();