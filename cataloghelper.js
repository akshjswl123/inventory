/* Composes enriched scoop CSV strings from raw catalog.js data blocks. */
(function (root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        const api = factory();
        root.CatalogHelper = api;
        api.buildComposedCatalogs(root);
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this), function () {
    'use strict';

    function parseCatalogCsvLine(line) {
        const cols = String(line || '').trim().match(/("([^"]|"")*"|[^,]*)/g) || [];
        return cols
            .map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
            .filter(v => v !== '');
    }

    function quoteCatalogCsv(value) {
        return '"' + String(value).replace(/"/g, '""') + '"';
    }

    function deriveScoopOutCsv(inCsv, inSuffix, outSuffix, defaultQty) {
        return String(inCsv || '')
            .trim()
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const cols = parseCatalogCsvLine(line);
                if (cols.length < 2) return null;
                const item = cols[0];
                const scoop = cols[1];
                if (!scoop.endsWith(inSuffix)) return null;
                const scoopOut = scoop.slice(0, -inSuffix.length) + outSuffix;
                if (defaultQty != null && defaultQty !== '') {
                    return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoopOut) + ',' + defaultQty;
                }
                return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoopOut);
            })
            .filter(Boolean)
            .join('\n');
    }

    function enrichScoopInCsv(inCsv) {
        return String(inCsv || '')
            .trim()
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const cols = parseCatalogCsvLine(line);
                if (cols.length < 2) return line;
                const item = cols[0];
                const scoop = cols[1];
                if (cols.length >= 3 && cols[2] !== '') return line;
                if (scoop.endsWith('_pkt_in')) return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoop) + ',500';
                if (scoop.endsWith('_kg_in')) return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoop) + ',1000';
                if (scoop.endsWith('_gm_in') || scoop.endsWith('_ml_in') || scoop.endsWith('_piece_in')) {
                    return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoop) + ',1';
                }
                return line;
            })
            .join('\n');
    }

    function enrichRecipeScoopCsv(recipeCsv) {
        return String(recipeCsv || '')
            .trim()
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const cols = parseCatalogCsvLine(line);
                if (cols.length < 2) return line;
                const item = cols[0];
                const scoop = cols[1];
                if (cols.length >= 3 && cols[2] !== '') return line;
                if (scoop.endsWith('_gm_reciepe') || scoop.endsWith('_gm_recipe')) {
                    return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoop) + ',1';
                }
                return line;
            })
            .join('\n');
    }

    function enrichScoopOutCsv(outCsv) {
        return String(outCsv || '')
            .trim()
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const cols = parseCatalogCsvLine(line);
                if (cols.length < 2) return line;
                const item = cols[0];
                const scoop = cols[1];
                if (cols.length >= 3 && cols[2] !== '') return line;
                if (scoop.endsWith('_pkt_out')) return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoop) + ',500';
                if (scoop.endsWith('_kg_out')) return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoop) + ',500';
                if (scoop.endsWith('_gm_out') || scoop.endsWith('_ml_out') || scoop.endsWith('_piece_out')) {
                    return quoteCatalogCsv(item) + ',' + quoteCatalogCsv(scoop) + ',1';
                }
                return line;
            })
            .join('\n');
    }

    function buildComposedCatalogs(ctx) {
        const c = ctx || (typeof window !== 'undefined' ? window : global);

        c.SCOOP_IN_CSV = enrichScoopInCsv(
            c.SCOOP_IN_GM_CSV.trim() + '\n' + c.SCOOP_IN_ML_CSV.trim() + '\n'
                + c.SCOOP_IN_PIECE_CSV.trim() + '\n' + c.SCOOP_IN_PKT_CSV.trim() + '\n'
                + c.SCOOP_IN_OTHER_CSV.trim() + '\n' + c.SCOOP_IN_KG_CSV.trim()
        );

        c.SCOOP_OUT_ML_CSV = deriveScoopOutCsv(c.SCOOP_IN_ML_CSV, '_ml_in', '_ml_out', 1);
        c.SCOOP_OUT_PIECE_CSV = deriveScoopOutCsv(c.SCOOP_IN_PIECE_CSV, '_piece_in', '_piece_out', 1);
        c.SCOOP_OUT_PKT_CSV = deriveScoopOutCsv(c.SCOOP_IN_PKT_CSV, '_pkt_in', '_pkt_out', 500);
        c.SCOOP_OUT_KG_CSV = deriveScoopOutCsv(c.SCOOP_IN_KG_CSV, '_kg_in', '_kg_out', 500);

        c.SCOOP_OUT_CSV = enrichScoopOutCsv(
            c.SCOOP_OUT_GM_CSV.trim() + '\n'
                + c.SCOOP_OUT_ML_CSV + '\n'
                + c.SCOOP_OUT_PIECE_CSV + '\n'
                + c.SCOOP_OUT_PKT_CSV + '\n'
                + c.SCOOP_OUT_KG_CSV
        );

        c.RECIPE_SCOOP_CSV = enrichRecipeScoopCsv(
            c.RECIPE_SCOOP_CSV_ACTUAL.trim() + '\n' + c.RECIPE_SCOOP_CSV_OTHER.trim()
        );

        return c;
    }

    return {
        parseCatalogCsvLine,
        quoteCatalogCsv,
        deriveScoopOutCsv,
        enrichScoopInCsv,
        enrichScoopOutCsv,
        enrichRecipeScoopCsv,
        buildComposedCatalogs
    };
});
