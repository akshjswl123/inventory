'use strict';

const fs = require('fs');
const path = require('path');

const QUERIES_DIR = path.join(__dirname, 'scripts', 'useful_queries');

// Matches default dish_filter placeholder (single- or multi-line SELECT).
const DISH_FILTER_RE = /dish_filter\s+AS\s*\(\s*SELECT[\s\S]*?NULL::text\s+AS\s+dishname\s*\)/i;

function sqlLiteral(value) {
    if (value == null || String(value).trim() === '') return 'NULL';
    return `'${String(value).trim().replace(/'/g, "''")}'`;
}

function injectDishFilter(sql, dishcode, dishname) {
    const block = `dish_filter AS (
    SELECT ${sqlLiteral(dishcode)}::text AS dishcode,
           ${sqlLiteral(dishname)}::text AS dishname
)`;
    if (!DISH_FILTER_RE.test(sql)) {
        throw new Error('dish_filter CTE not found in cost SQL');
    }
    return sql.replace(DISH_FILTER_RE, block);
}

function loadQueryFile(name) {
    const filePath = path.join(QUERIES_DIR, name);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Cost SQL file not found: ${name}`);
    }
    return fs.readFileSync(filePath, 'utf8');
}

function stripLeadingSqlComments(sql) {
    return sql.replace(/^(\s*--[^\n]*\n)+/, '');
}

function buildReceipePortionSql(dishcode, dishname) {
    let sql = stripLeadingSqlComments(loadQueryFile('receipe_portion.sql'));
    sql = injectDishFilter(sql, dishcode, dishname);
    return sql.trim();
}

function buildRecipeCostNoProcessedSql(dishcode, dishname, { breakdown = true } = {}) {
    let raw = loadQueryFile('recipe_cost_no_processed.sql');
    raw = injectDishFilter(raw, dishcode, dishname);

    const gMarker = '-- G. Portion only';
    const gIdx = raw.indexOf(gMarker);
    if (gIdx === -1) {
        throw new Error('recipe_cost_no_processed.sql: missing portion-only section');
    }

    let viewBody = raw.slice(0, gIdx);
    viewBody = viewBody.replace(/^[\s\S]*?DROP VIEW IF EXISTS recipe_cost_no_processed_report;\s*/i, '');
    viewBody = viewBody.replace(/CREATE TEMP VIEW recipe_cost_no_processed_report AS\s*/i, '');
    viewBody = viewBody.trim().replace(/;\s*$/, '');

    const fMarker = '-- F. Report rows';
    const fIdx = viewBody.indexOf(fMarker);
    if (fIdx === -1) {
        throw new Error('recipe_cost_no_processed.sql: missing report rows section');
    }

    const withAndCtes = viewBody.slice(0, fIdx).trim();
    let unionPart = viewBody.slice(fIdx);
    unionPart = unionPart.replace(/^[\s\S]*?-- F\.[^\n]*\n[\s\S]*?={3,}\s*\n/, '').trim();
    unionPart = unionPart.replace(/;\s*$/, '');

    const base = `${withAndCtes},
recipe_cost_no_processed_report AS (
${unionPart}
)`;

    if (breakdown) {
        return `${base}
SELECT *
FROM recipe_cost_no_processed_report
ORDER BY
    dish_code,
    result_set ASC,
    line_type NULLS LAST,
    itemname NULLS LAST`;
    }

    return `${base}
SELECT *
FROM recipe_cost_no_processed_report
WHERE result_set = 'dish_summary'
  AND line_type = 'portion'
ORDER BY dish_code`;
}

const HAS_PROCESSED_SQL = `
WITH recipe_current_version AS (
    SELECT iv.item_code AS dish_code, iv.version AS current_version
    FROM public.item_versions iv
    WHERE iv.item_type = 'dishes'
),
recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    WHERE re.dishcode IS NOT NULL
      AND TRIM(re.dishcode) <> ''
      AND re.version = COALESCE(
          (
              SELECT cv.current_version
              FROM recipe_current_version cv
              WHERE cv.dish_code = UPPER(TRIM(re.dishcode))
              LIMIT 1
          ),
          (
              SELECT MAX(sub.version)
              FROM public.recipe_entries sub
              WHERE UPPER(TRIM(sub.dishcode)) = UPPER(TRIM(re.dishcode))
          ),
          1
      )
),
all_recipe_dishes AS (
    SELECT DISTINCT ON (UPPER(TRIM(re.dishcode)))
        UPPER(TRIM(re.dishcode)) AS dish_code
    FROM recipe_scope re
    WHERE re.dishcode IS NOT NULL
      AND TRIM(re.dishcode) <> ''
    ORDER BY UPPER(TRIM(re.dishcode)), re.id DESC
),
ingredient_lines AS (
    SELECT DISTINCT ON (
        UPPER(TRIM(re.dishcode)),
        TRIM(re."pgNo"),
        LOWER(TRIM(re.reciepeitemname))
    )
        UPPER(TRIM(re.dishcode)) AS dish_code,
        TRIM(re."pgNo") AS item_id,
        TRIM(re.reciepeitemname) AS itemname
    FROM recipe_scope re
    WHERE LOWER(TRIM(re.reciepeitemname)) NOT IN (
              'totalingredientsqty',
              'totalprocessedqty',
              'dish_out'
          )
      AND re.qty IS NOT NULL
      AND re.qty > 0
    ORDER BY
        UPPER(TRIM(re.dishcode)),
        TRIM(re."pgNo"),
        LOWER(TRIM(re.reciepeitemname)),
        re.id DESC
)
SELECT EXISTS (
    SELECT 1
    FROM ingredient_lines il
    WHERE (
            ($1::text IS NOT NULL AND TRIM($1::text) <> ''
             AND il.dish_code = UPPER(TRIM($1::text)))
         OR ($2::text IS NOT NULL AND TRIM($2::text) <> ''
             AND EXISTS (
                 SELECT 1
                 FROM recipe_scope rs
                 WHERE il.dish_code = UPPER(TRIM(rs.dishcode))
                   AND LOWER(TRIM(rs.dishname)) = LOWER(TRIM($2::text))
             ))
          )
      AND NOT EXISTS (
          SELECT 1
          FROM public.raw_materials rm
          WHERE TRIM(rm."pgNo") = il.item_id
            AND LOWER(TRIM(rm.itemname)) = LOWER(TRIM(il.itemname))
      )
      AND EXISTS (
          SELECT 1
          FROM all_recipe_dishes d
          WHERE d.dish_code = UPPER(TRIM(il.item_id))
      )
) AS has_processed`;

async function resolveDishFilterInputs(pool, dishcode, dishname) {
    const code = dishcode ? String(dishcode).trim() : '';
    const name = dishname ? String(dishname).trim() : '';
    if (!code && !name) {
        return { dishcode: null, dishname: null };
    }

    const res = await pool.query(
        `
        SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
            UPPER(TRIM(dishcode)) AS dish_code,
            TRIM(dishname) AS dishname
        FROM public.recipe_entries
        WHERE dishcode IS NOT NULL
          AND TRIM(dishcode) <> ''
          AND (
                ($1::text IS NOT NULL AND TRIM($1::text) <> ''
                 AND UPPER(TRIM(dishcode)) = UPPER(TRIM($1::text)))
             OR ($2::text IS NOT NULL AND TRIM($2::text) <> ''
                 AND LOWER(TRIM(dishname)) = LOWER(TRIM($2::text)))
          )
        ORDER BY UPPER(TRIM(dishcode)), created_at DESC, id DESC
        `,
        [code || null, name || null]
    );

    if (res.rows[0]) {
        return {
            dishcode: res.rows[0].dish_code,
            dishname: null
        };
    }

    return {
        dishcode: code || null,
        dishname: name || null
    };
}

async function dishHasProcessedRecipeLines(pool, dishcode, dishname) {
    const res = await pool.query(HAS_PROCESSED_SQL, [
        dishcode || null,
        dishname || null
    ]);
    return !!res.rows[0]?.has_processed;
}

async function runRecipeCostQuery(pool, { dishcode, dishname, breakdown = true }) {
    const code = dishcode ? String(dishcode).trim() : '';
    const name = dishname ? String(dishname).trim() : '';
    if (!code && !name) {
        throw new Error('dishcode or dishname is required');
    }

    const filterInputs = await resolveDishFilterInputs(pool, code || null, name || null);
    const filterCode = filterInputs.dishcode;
    const filterName = filterInputs.dishname;

    const hasProcessed = await dishHasProcessedRecipeLines(
        pool,
        filterCode || code || null,
        filterName || name || null
    );
    let sql;
    let variant;

    if (hasProcessed) {
        variant = 'full_recipe';
        sql = buildReceipePortionSql(filterCode, filterName);
        if (!breakdown) {
            sql = `SELECT * FROM (${sql}) AS cost_report
WHERE result_set = 'dish_summary' AND line_type = 'portion'
ORDER BY dish_code`;
        }
    } else {
        variant = 'raw_only';
        sql = buildRecipeCostNoProcessedSql(filterCode, filterName, { breakdown });
    }

    const res = await pool.query(sql);
    return {
        columns: res.fields ? res.fields.map(f => f.name) : [],
        rows: res.rows || [],
        rowCount: res.rowCount,
        variant,
        hasProcessedIngredients: hasProcessed,
        breakdown,
        filterDishcode: filterCode,
        filterDishname: filterName
    };
}

module.exports = {
    buildReceipePortionSql,
    buildRecipeCostNoProcessedSql,
    injectDishFilter,
    resolveDishFilterInputs,
    dishHasProcessedRecipeLines,
    runRecipeCostQuery
};
