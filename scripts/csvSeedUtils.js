'use strict';

const STANDARD_UNIT_SCOOP =
    /_(gm|ml|piece|kg|ltr|pkt)_(in|out|inventory|reciepe)$/i;

function isStandardUnitScoop(scoopName) {
    return STANDARD_UNIT_SCOOP.test(String(scoopName || '').trim());
}

function parseCsvLine(line) {
    const out = [];
    let i = 0;
    while (i < line.length) {
        if (line[i] === '"') {
            i++;
            let s = '';
            while (i < line.length) {
                if (line[i] === '"' && line[i + 1] === '"') {
                    s += '"';
                    i += 2;
                } else if (line[i] === '"') {
                    i++;
                    break;
                } else {
                    s += line[i++];
                }
            }
            out.push(s);
            if (line[i] === ',') i++;
        } else {
            let s = '';
            while (i < line.length && line[i] !== ',') s += line[i++];
            out.push(s);
            if (line[i] === ',') i++;
        }
    }
    return out;
}

function readCsv(filePath) {
    const fs = require('fs');
    const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
    const header = parseCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const cols = parseCsvLine(line);
        const row = {};
        header.forEach((h, idx) => {
            row[h] = cols[idx] != null ? cols[idx] : '';
        });
        return row;
    });
}

function sqlStr(value) {
    if (value == null || value === '') return 'NULL';
    return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlNumeric(value) {
    if (value == null || value === '' || String(value).toUpperCase() === 'NULL') {
        return 'NULL::numeric';
    }
    const n = Number(value);
    return Number.isFinite(n) ? String(n) + '::numeric' : 'NULL::numeric';
}

function sqlBool(value) {
    const v = String(value || '').trim().toLowerCase();
    return v === 'true' || v === 't' || v === '1' ? 'true' : 'false';
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function csvNullish(value) {
    if (value == null || value === '') return null;
    if (String(value).trim().toUpperCase() === 'NULL') return null;
    return value;
}

function scoopRowSql(r) {
    const chain = csvNullish(r.conversion_chain);
    return `(${sqlStr(r.scoop_item_name)}, ${sqlStr(r.scoop_item_id)}, ${sqlStr(r.destination_unit)}, ${sqlStr(r.scoop_name)}, ${sqlNumeric(r.factor)}, ${chain ? sqlStr(chain) : 'NULL'}, ${sqlNumeric(r.qty_in_grams)}, ${sqlNumeric(r.qty_in_ml)}, ${sqlNumeric(r.qty_in_piece)}, ${sqlBool(r.unused)})`;
}

const SCOOP_INSERT_PREFIX = `INSERT INTO public.scoop_config (scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
SELECT v.scoop_item_name, v.scoop_item_id, v.destination_unit, v.scoop_name, v.factor, v.conversion_chain, v.qty_in_grams, v.qty_in_ml, v.qty_in_piece, v.unused
FROM (VALUES
    `;

const SCOOP_INSERT_SUFFIX = `
) AS v(scoop_item_name, scoop_item_id, destination_unit, scoop_name, factor, conversion_chain, qty_in_grams, qty_in_ml, qty_in_piece, unused)
WHERE NOT EXISTS (
    SELECT 1 FROM public.scoop_config i WHERE i.scoop_name = v.scoop_name
);

`;

function appendScoopInserts(sqlParts, label, rows, batchSize) {
    if (!rows.length) return;
    sqlParts.push(`-- ${label} (${rows.length} rows)\n`);
    chunk(rows, batchSize).forEach(part => {
        const values = part.map(scoopRowSql).join(',\n    ');
        sqlParts.push(SCOOP_INSERT_PREFIX + values + SCOOP_INSERT_SUFFIX);
    });
}

module.exports = {
    STANDARD_UNIT_SCOOP,
    isStandardUnitScoop,
    readCsv,
    sqlStr,
    chunk,
    appendScoopInserts
};
