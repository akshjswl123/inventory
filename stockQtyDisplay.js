'use strict';

/**
 * Stock quantity display helpers (destination units + largest-scoop packaging).
 * Usable from Node (require) or browser (<script src="stockQtyDisplay.js"> → global StockQtyDisplay).
 *
 * Typical server flow:
 *   const { buildPackagingIndex, enrichQtyFields } = require('./stockQtyDisplay');
 *   const index = buildPackagingIndex(scoopConfigRows);
 *   const view = enrichQtyFields({ gm, ml, piece, destinationUnit, pgno }, index);
 *
 * Override columns: pass qty_gm / qty_ml / qty_piece from override fields with same opts.
 */

/** @typedef {{ factor: number, pack_unit: string, dest: string }} PackMeta */

const SCOOP_SUFFIX_RE = /_([^_]+)_(?:in|out|reciepe|inventory)$/i;

const stockQtyDisplay = {
    /**
     * Format numeric for display (trim trailing decimals when integer).
     * @param {*} v
     * @returns {string|null}
     */
    formatQtyNum(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
        return String(Number(n.toFixed(4)));
    },

    qtyIsSet(v) {
        return v !== null && v !== undefined && v !== '';
    },

    /**
     * Combined qty string with unit labels (e.g. "78000 gm" or "100 gm, 5 piece").
     * @param {*} gm
     * @param {*} ml
     * @param {*} piece
     * @returns {string}
     */
    formatQtyDisplay(gm, ml, piece) {
        const parts = [];
        const g = stockQtyDisplay.formatQtyNum(gm);
        const m = stockQtyDisplay.formatQtyNum(ml);
        const p = stockQtyDisplay.formatQtyNum(piece);
        if (g !== null) parts.push(`${g} gm`);
        if (m !== null) parts.push(`${m} ml`);
        if (p !== null) parts.push(`${p} piece`);
        return parts.join(', ');
    },

    /**
     * Parse editable qty cell back into stock_baselines columns.
     * Accepts "78000 gm", "78000", or "100 gm, 50 ml". Bare number uses destinationUnit.
     * @param {string} qtyStr
     * @param {string} [destinationUnit]
     * @returns {{ qty_gm: number|null, qty_ml: number|null, qty_piece: number|null, error?: string }}
     */
    parseQtyDisplay(qtyStr, destinationUnit) {
        const out = { qty_gm: null, qty_ml: null, qty_piece: null };
        const s = String(qtyStr || '').trim();
        if (!s) return { ...out, error: 'qty is empty' };
        const dest = String(destinationUnit || '')
            .trim()
            .toLowerCase();
        const segments = s.split(',').map((x) => x.trim()).filter(Boolean);
        const unitRe = /^([\d.]+)\s*(gm|ml|piece)?\s*$/i;

        const apply = (val, unit) => {
            const u = String(unit || dest || 'gm').toLowerCase();
            if (u === 'gm') out.qty_gm = val;
            else if (u === 'ml') out.qty_ml = val;
            else if (u === 'piece') out.qty_piece = val;
            else return false;
            return true;
        };

        for (const seg of segments) {
            const m = seg.match(unitRe);
            if (!m) return { ...out, error: `cannot parse qty segment: ${seg}` };
            const val = Number(m[1]);
            if (!Number.isFinite(val)) return { ...out, error: `invalid number in: ${seg}` };
            const unit = m[2] ? m[2].toLowerCase() : segments.length === 1 ? dest || 'gm' : null;
            if (!unit) return { ...out, error: `unit required in multi-part qty: ${seg}` };
            if (!apply(val, unit)) return { ...out, error: `unknown unit in: ${seg}` };
        }
        if (out.qty_gm === null && out.qty_ml === null && out.qty_piece === null) {
            return { ...out, error: 'no qty values parsed' };
        }
        return out;
    },

    /**
     * Single total in the row's destination unit (for packaging math).
     * @param {*} gm
     * @param {*} ml
     * @param {*} piece
     * @param {string} [destinationUnit]
     * @returns {number|null}
     */
    destTotal(gm, ml, piece, destinationUnit) {
        const dest = String(destinationUnit || '')
            .trim()
            .toLowerCase();
        const has = stockQtyDisplay.qtyIsSet;
        if (dest === 'gm' && has(gm)) return Number(gm);
        if (dest === 'ml' && has(ml)) return Number(ml);
        if (dest === 'piece' && has(piece)) return Number(piece);
        if (has(gm) && !has(ml) && !has(piece)) return Number(gm);
        if (has(ml) && !has(gm) && !has(piece)) return Number(ml);
        if (has(piece) && !has(gm) && !has(ml)) return Number(piece);
        return null;
    },

    /**
     * Extract purchase/pack unit from scoop_name (e.g. "aata_bag_in" → "bag").
     * @param {string} scoopName
     * @returns {string}
     */
    packUnitFromScoopName(scoopName) {
        const m = String(scoopName || '').match(SCOOP_SUFFIX_RE);
        return m ? String(m[1]).toLowerCase() : '';
    },

    /**
     * Build packaging meta list from scoop_config query rows.
     * Each row: { scoop_item_id|pgno, scoop_name, factor, destination_unit, unused? }
     * @param {object[]} scoopRows
     * @returns {Map<string, PackMeta[]>} pgno → metas (may include multiple dest)
     */
    buildPackagingIndex(scoopRows) {
        const byPg = new Map();
        for (const r of scoopRows || []) {
            if (r.unused === true) continue;
            const factor = Number(r.factor);
            if (!Number.isFinite(factor) || factor <= 1) continue;
            const scoopName = r.scoop_name || '';
            if (!SCOOP_SUFFIX_RE.test(scoopName)) continue;
            const pg = String(r.scoop_item_id ?? r.pgno ?? '')
                .trim();
            if (!pg) continue;
            const pack_unit = stockQtyDisplay.packUnitFromScoopName(scoopName);
            if (!pack_unit) continue;
            const dest = String(r.destination_unit || '')
                .trim()
                .toLowerCase();
            const meta = { factor, pack_unit, dest };
            if (!byPg.has(pg)) byPg.set(pg, []);
            const list = byPg.get(pg);
            const dup = list.find(
                (x) => x.pack_unit === meta.pack_unit && x.dest === meta.dest && x.factor === meta.factor
            );
            if (!dup) list.push(meta);
        }
        for (const list of byPg.values()) {
            list.sort((a, b) => b.factor - a.factor);
        }
        return byPg;
    },

    /**
     * Pick largest factor scoop for pgno + destination (e.g. bag over kg for gm dest).
     * @param {Map<string, PackMeta[]>|Record<string, PackMeta[]>} packagingByPg
     * @param {string} pgno
     * @param {string} [destinationUnit]
     * @returns {PackMeta|null}
     */
    pickPackMeta(packagingByPg, pgno, destinationUnit) {
        const dest = String(destinationUnit || '')
            .trim()
            .toLowerCase();
        const pg = String(pgno).trim();
        let list;
        if (packagingByPg instanceof Map) list = packagingByPg.get(pg) || [];
        else list = (packagingByPg && packagingByPg[pg]) || [];
        const forDest = dest ? list.filter((x) => x.dest === dest) : list;
        const pool = forDest.length ? forDest : list;
        if (!pool.length) return null;
        return pool.reduce((a, b) => (b.factor > a.factor ? b : a));
    },

    /**
     * Largest scoop factor → "3 bag" or "2 bag 2000 gm".
     * @param {number|null} total
     * @param {PackMeta|null} packMeta
     * @param {string} [destinationUnit]
     * @returns {string}
     */
    formatPackaging(total, packMeta, destinationUnit) {
        if (total === null || !Number.isFinite(total)) return '';
        const dest = String(destinationUnit || packMeta?.dest || '')
            .trim()
            .toLowerCase();
        if (!packMeta || !packMeta.factor || packMeta.factor <= 1) return '';
        if (packMeta.dest && dest && packMeta.dest !== dest) return '';
        const factor = Number(packMeta.factor);
        const packUnit = packMeta.pack_unit;
        const whole = Math.floor(total / factor);
        let rem = total - whole * factor;
        if (Math.abs(rem) < 1e-6) rem = 0;
        const remStr = stockQtyDisplay.formatQtyNum(rem);
        if (whole > 0 && rem <= 0) return `${whole} ${packUnit}`;
        if (whole > 0 && rem > 0) return `${whole} ${packUnit} ${remStr} ${dest}`;
        if (whole <= 0 && rem > 0) return `${remStr} ${dest}`;
        return '';
    },

    /**
     * Display + packaging fields for one qty triple (baseline or override).
     * @param {{ gm?: *, ml?: *, piece?: *, destinationUnit?: string, pgno?: string }} qty
     * @param {Map<string, PackMeta[]>|Record<string, PackMeta[]>} [packagingByPg]
     * @returns {{ qty: string, qty_in_packaging: string, total: number|null, packMeta: PackMeta|null }}
     */
    enrichQtyFields(qty, packagingByPg) {
        const dest = qty.destinationUnit;
        const packMeta =
            qty.pgno && packagingByPg
                ? stockQtyDisplay.pickPackMeta(packagingByPg, qty.pgno, dest)
                : null;
        const total = stockQtyDisplay.destTotal(qty.gm, qty.ml, qty.piece, dest);
        return {
            qty: stockQtyDisplay.formatQtyDisplay(qty.gm, qty.ml, qty.piece),
            qty_in_packaging: stockQtyDisplay.formatPackaging(total, packMeta, dest),
            total,
            packMeta
        };
    },

    /**
     * Stock baseline row (DB shape) → display qty columns.
     * @param {object} row
     * @param {Map<string, PackMeta[]>} packagingByPg
     * @returns {{ qty: string, qty_in_packaging: string, qty_at_override: string, qty_at_override_in_packaging: string }}
     */
    normPurchaseUnit(u) {
        const s = String(u || '')
            .trim()
            .toLowerCase();
        if (!s) return '';
        const head = s.split(/[\s/]/)[0];
        const map = {
            g: 'gm',
            gm: 'gm',
            kg: 'kg',
            l: 'ltr',
            ltr: 'ltr',
            liter: 'ltr',
            litre: 'ltr',
            ml: 'ml',
            pc: 'piece',
            pcs: 'piece',
            piece: 'piece',
            packet: 'pkt',
            pkt: 'pkt',
            superpacket: 'superpkt',
            superpkt: 'superpkt',
            tin: 'tin',
            bag: 'bag',
            bottle: 'bottle',
            box: 'box',
            loose: 'loose',
            gallon: 'gallon',
            peti: 'peti'
        };
        return map[head] || head;
    },

    /**
     * pgno → unit → { factor, dest } (max factor per unit from scoop_config rows).
     * @param {object[]} scoopRows
     * @returns {Map<string, Map<string, {factor:number, dest:string}>>}
     */
    buildUnitFactorIndex(scoopRows) {
        const byPg = new Map();
        for (const r of scoopRows || []) {
            if (r.unused === true) continue;
            const factor = Number(r.factor);
            if (!Number.isFinite(factor) || factor <= 0) continue;
            const scoopName = r.scoop_name || '';
            const m = scoopName.match(SCOOP_SUFFIX_RE);
            if (!m) continue;
            const unit = stockQtyDisplay.normPurchaseUnit(m[1]);
            const pg = String(r.scoop_item_id ?? r.pgno ?? '').trim();
            if (!pg || !unit) continue;
            const dest = String(r.destination_unit || '')
                .trim()
                .toLowerCase();
            if (!byPg.has(pg)) byPg.set(pg, new Map());
            const um = byPg.get(pg);
            const prev = um.get(unit);
            if (!prev || factor >= prev.factor) um.set(unit, { factor, dest });
        }
        return byPg;
    },

    /**
     * One purchase line → gm/ml/piece delta.
     * @returns {{ gm?: number, ml?: number, piece?: number, error?: string }}
     */
    convertPurchaseLine(qty, unit, destinationUnit, unitFactorsForPg) {
        const q = Number(qty);
        if (!Number.isFinite(q)) return { error: 'invalid qty' };
        const u = stockQtyDisplay.normPurchaseUnit(unit);
        const dest = String(destinationUnit || 'gm')
            .trim()
            .toLowerCase();
        if (!u) return { error: 'unit required' };
        if (u === 'kg' && dest === 'gm') return { gm: q * 1000 };
        if (u === 'gm' && dest === 'gm') return { gm: q };
        if (u === 'ltr' && dest === 'ml') return { ml: q * 1000 };
        if (u === 'ml' && dest === 'ml') return { ml: q };
        if (u === 'piece' && dest === 'piece') return { piece: q };
        const hit = unitFactorsForPg && unitFactorsForPg.get(u);
        if (!hit) return { error: `no scoop factor for unit=${u}` };
        const v = q * hit.factor;
        if (hit.dest === 'gm' || dest === 'gm') return { gm: v };
        if (hit.dest === 'ml' || dest === 'ml') return { ml: v };
        if (hit.dest === 'piece' || dest === 'piece') return { piece: v };
        return { error: `unsupported dest for unit=${u}` };
    },

    /**
     * Sum multiple qty+unit lines into baseline columns.
     * @param {{qty, scoopUsed?, unit?}[]} lines
     */
    accumulateLinesToBaselineQty(lines, pgno, destinationUnit, unitFactorIndex) {
        const totals = { qty_gm: null, qty_ml: null, qty_piece: null };
        const pgFactors = unitFactorIndex.get(String(pgno).trim());
        let any = false;
        for (const line of lines || []) {
            const qtyRaw = line && line.qty;
            if (qtyRaw === '' || qtyRaw === null || qtyRaw === undefined) continue;
            any = true;
            const scoopUsed = line.scoopUsed != null ? line.scoopUsed : line.unit;
            const part = stockQtyDisplay.convertPurchaseLine(
                qtyRaw,
                scoopUsed,
                destinationUnit,
                pgFactors
            );
            if (part.error) return { ...totals, error: part.error };
            if (part.gm) totals.qty_gm = (totals.qty_gm || 0) + part.gm;
            if (part.ml) totals.qty_ml = (totals.qty_ml || 0) + part.ml;
            if (part.piece) totals.qty_piece = (totals.qty_piece || 0) + part.piece;
        }
        if (!any) return { ...totals, error: 'no qty lines' };
        return totals;
    },

    enrichBaselineRowQty(row, packagingByPg) {
        const dest = row.destination_unit;
        const pgno = row.pgno;
        const base = stockQtyDisplay.enrichQtyFields(
            { gm: row.qty_gm, ml: row.qty_ml, piece: row.qty_piece, destinationUnit: dest, pgno },
            packagingByPg
        );
        const ovr = stockQtyDisplay.enrichQtyFields(
            {
                gm: row.qty_gm_calculated_at_time_of_override,
                ml: row.qty_ml_calculated_at_time_of_override,
                piece: row.qty_piece_calculated_at_time_of_override,
                destinationUnit: dest,
                pgno
            },
            packagingByPg
        );
        return {
            qty: base.qty,
            qty_in_packaging: base.qty_in_packaging,
            qty_at_override: ovr.qty,
            qty_at_override_in_packaging: ovr.qty_in_packaging
        };
    }
};

/**
 * Split code into alternating non-digit / digit segments (natural sort keys).
 * e.g. R10 → [{a:R},{n:10}]; 16 A → [{n:16},{a: a}]
 * @param {*} raw
 * @returns {{ type: 'a'|'n', value: string|number }[]}
 */
stockQtyDisplay.enhancedOrderByParts = function enhancedOrderByParts(raw) {
    const t = String(raw ?? '').trim();
    const parts = [];
    if (!t) return parts;
    const re = /(\d+|\D+)/g;
    let m;
    while ((m = re.exec(t))) {
        const seg = m[1];
        if (/^\d+$/.test(seg)) parts.push({ type: 'n', value: Number(seg) });
        else parts.push({ type: 'a', value: seg.toLowerCase() });
    }
    return parts;
};

/**
 * Compare two codes (R1, R2, R10 not R1, R10, R2).
 * @param {*} a
 * @param {*} b
 * @returns {number}
 */
stockQtyDisplay.enhancedOrderByCompare = function enhancedOrderByCompare(a, b) {
    const pa = stockQtyDisplay.enhancedOrderByParts(a);
    const pb = stockQtyDisplay.enhancedOrderByParts(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const xa = pa[i];
        const xb = pb[i];
        if (!xa) return -1;
        if (!xb) return 1;
        if (xa.type !== xb.type) {
            return xa.type === 'a' ? -1 : 1;
        }
        if (xa.type === 'n') {
            if (xa.value !== xb.value) return xa.value - xb.value;
        } else if (xa.value < xb.value) return -1;
        else if (xa.value > xb.value) return 1;
    }
    return 0;
};

/**
 * @template T
 * @param {T[]} array
 * @param {(row: T) => *} [getKey]
 * @returns {T[]}
 */
stockQtyDisplay.enhancedOrderBySort = function enhancedOrderBySort(array, getKey) {
    const keyFn = typeof getKey === 'function' ? getKey : (x) => x;
    return [...(array || [])].sort((x, y) =>
        stockQtyDisplay.enhancedOrderByCompare(keyFn(x), keyFn(y))
    );
};

/**
 * SQL ORDER BY expressions: alpha prefix, first digit run, remainder (R1,R2,R10 natural).
 * @param {string} columnSql e.g. sb.pgno
 * @returns {string} comma-separated ORDER BY keys (no ORDER BY prefix)
 */
stockQtyDisplay.enhancedOrderByClause = function enhancedOrderByClause(columnSql) {
    const col = String(columnSql || '').trim();
    const alpha = `LOWER(regexp_replace(TRIM(${col}), '[0-9].*$', '', 'g'))`;
    const num = `COALESCE(NULLIF(substring(TRIM(${col}) FROM '([0-9]+)'), '')::bigint, 0)`;
    const rest = `LOWER(regexp_replace(TRIM(${col}), '^[^0-9]*[0-9]+', '', 'g'))`;
    const raw = `LOWER(TRIM(${col}))`;
    return `${alpha}, ${num}, ${rest}, ${raw}`;
};

/** @deprecated use enhancedOrderByClause('sb.pgno') */
stockQtyDisplay.enhancedOrderBySql = function enhancedOrderBySql(columnSql) {
    return stockQtyDisplay.enhancedOrderByClause(columnSql);
};

/** @deprecated use enhancedOrderByClause('sb.pgno') */
stockQtyDisplay.PGNO_NUMERIC_ORDER_SQL = stockQtyDisplay.enhancedOrderByClause('sb.pgno');

/**
 * ORDER BY for stock baseline lists. sortBy: 'storage' (default) | 'pgno'
 * @param {string} [sortBy]
 * @returns {string}
 */
stockQtyDisplay.baselineOrderByClause = function baselineOrderByClause(sortBy) {
    return stockQtyDisplay.catalogOrderByClause(sortBy, 'sb.pgno', 'rms.storage');
};

/**
 * ORDER BY storage / pgNo for catalog-style lists (destination_unit, current stock, etc.).
 * @param {string} [sortBy]
 * @param {string} [pgColumnSql]
 * @param {string} [storageColumnSql]
 * @returns {string}
 */
stockQtyDisplay.catalogOrderByClause = function catalogOrderByClause(
    sortBy,
    pgColumnSql,
    storageColumnSql
) {
    const mode = String(sortBy || 'storage').trim().toLowerCase();
    const pgSort = stockQtyDisplay.enhancedOrderByClause(pgColumnSql || 'sb.pgno');
    if (mode === 'pgno') {
        return `ORDER BY ${pgSort}`;
    }
    const storageSort = stockQtyDisplay.enhancedOrderByClause(storageColumnSql || 'rms.storage');
    return `ORDER BY ${storageSort} NULLS LAST, ${pgSort}`;
};

/** SQL fragment for loading scoop rows into buildPackagingIndex (parameter: pgno text[]). */
stockQtyDisplay.UNIT_FACTOR_SCOOP_SQL = `
SELECT TRIM(scoop_item_id) AS scoop_item_id, scoop_name, factor::double precision AS factor,
       destination_unit, COALESCE(unused, false) AS unused
FROM public.scoop_config
WHERE COALESCE(unused, false) = false
  AND TRIM(scoop_item_id) = ANY($1::text[])
`;

stockQtyDisplay.PACKAGING_SCOOP_SQL = `
SELECT
    TRIM(scoop_item_id) AS scoop_item_id,
    scoop_name,
    factor::double precision AS factor,
    destination_unit,
    COALESCE(unused, false) AS unused
FROM public.scoop_config
WHERE COALESCE(unused, false) = false
  AND factor > 1
  AND scoop_name ~ '_(in|out|reciepe|inventory)$'
  AND TRIM(scoop_item_id) = ANY($1::text[])
ORDER BY TRIM(scoop_item_id), LOWER(TRIM(destination_unit)), factor DESC
`;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = stockQtyDisplay;
}

if (typeof globalThis !== 'undefined') {
    globalThis.StockQtyDisplay = stockQtyDisplay;
}