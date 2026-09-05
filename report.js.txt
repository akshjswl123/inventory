// report.js
async function run() {
    const sql = document.getElementById("queryInput").value.trim();
    const errBox = document.getElementById("queryError");
    const meta = document.getElementById("queryMeta");
    const table = document.getElementById("queryResult");
    const btn = document.getElementById("queryRunBtn");

    errBox.className = ""; errBox.style.display = "none"; errBox.textContent = "";
    meta.textContent = ""; table.innerHTML = "";
    if (!sql) { showErr('Please enter a SQL query.'); return; }

    btn.disabled = true; btn.textContent = 'Running...';
    const t0 = Date.now();

    try {
        const res = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });
        const data = await res.json();
        if (!res.ok) { showErr(data.error || res.statusText); return; }

        const elapsed = Date.now() - t0;
        const { columns = [], rows = [] } = data;
        if (!columns.length) {
            meta.textContent = `Query executed successfully (${elapsed} ms). No rows returned.`;
            return;
        }

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr>' + columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = columns.map(c => '<td>' + esc(row[c] == null ? '' : row[c]) + '</td>').join('');
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        meta.textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''} in ${elapsed}ms`;
    } catch (err) {
        showErr(err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Run Query';
    }
}

function showErr(msg) {
    const errBox = document.getElementById('queryError');
    errBox.className = 'is-err';
    errBox.textContent = msg;
}

function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.Query = {
    run,
    clear: () => {
        document.getElementById("queryInput").value = "";
        document.getElementById("queryResult").innerHTML = "";
        document.getElementById("queryMeta").textContent = "";
        document.getElementById("queryError").className = "";
    }
};