-- =============================================================================
-- Consumer recipe lines: use *_gm_reciepe for processed pgNo P4, P10, P11
-- =============================================================================
-- Updates receipescoop only on latest saved batch per dishcode (ingredient lines).
-- P4  → TOMATO GREAVY_gm_reciepe
-- P10 → PROCESSED MASALA OF TIKKA_gm_reciepe
-- P11 → PROCESSED GULAB JAMUN_gm_reciepe
--
-- Run:
--   docker exec -i poc_db psql -U poc -d poc -v ON_ERROR_STOP=1 \
--     -f scripts/useful_queries/update_consumer_processed_gm_reciepe_scoops.sql
-- =============================================================================

WITH latest_batch AS (
    SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
        UPPER(TRIM(dishcode)) AS dish_code,
        created_at AS saved_at
    FROM public.recipe_entries
    WHERE dishcode IS NOT NULL
      AND TRIM(dishcode) <> ''
    ORDER BY UPPER(TRIM(dishcode)), created_at DESC, id DESC
),
targets AS (
    SELECT re.id,
           CASE UPPER(TRIM(re."pgNo"))
               WHEN 'P4' THEN 'TOMATO GREAVY_gm_reciepe'
               WHEN 'P10' THEN 'PROCESSED MASALA OF TIKKA_gm_reciepe'
               WHEN 'P11' THEN 'PROCESSED GULAB JAMUN_gm_reciepe'
               WHEN 'P1' THEN 'PROCESSED RICE_gm_reciepe'
                WHEN 'P7' THEN 'PASTA PROCESSED_gm_reciepe'
                WHEN 'P5' THEN 'ONION GREAVY_gm_reciepe'
                WHEN 'P2' THEN 'PROCESSED DAL_gm_reciepe'
    WHEN 'D005'  THEN 'ONION PARATHA_gm_reciepe'
            WHEN 'D057' THEN 'ALOO GOBI MATAR_gm_reciepe'
            WHEN 'D059' THEN 'MIX veg_gm_reciepe'
            WHEN 'P1'  THEN 'PROCESSED RICE_gm_reciepe'
            WHEN 'P1'  THEN 'PROCESSED RICE_gm_reciepe'
            WHEN 'P2'  THEN 'PROCESSED DAL_gm_reciepe'
            WHEN 'P3'  THEN 'PROCESSED NOODLES_gm_reciepe'
            WHEN 'P5'  THEN 'ONION GREAVY_gm_reciepe'
            WHEN 'P6'  THEN 'KAJU MAGAJ GREAVY_gm_reciepe'
            WHEN 'P7'  THEN 'PASTA PROCESSED_gm_reciepe'
            WHEN 'P8'  THEN 'AATA PROCESSED_gm_reciepe'
            WHEN 'P9'  THEN 'MAIDA PROCESSED_gm_reciepe'
            WHEN 'P9'  THEN 'MAIDA PROCESSED_gm_reciepe'
           END AS new_scoop
    FROM public.recipe_entries re
    INNER JOIN latest_batch lb
        ON UPPER(TRIM(re.dishcode)) = lb.dish_code
       AND re.created_at >= lb.saved_at - interval '30 seconds'
    WHERE UPPER(TRIM(re."pgNo")) IN ('P4', 'P10', 'P11')
      AND LOWER(TRIM(re.reciepeitemname)) NOT IN (
              'dish_out', 'totalingredientsqty', 'totalprocessedqty'
          )
)
UPDATE public.recipe_entries re
SET receipescoop = t.new_scoop,
    last_updated_at = CURRENT_TIMESTAMP
FROM targets t
WHERE re.id = t.id
  AND t.new_scoop IS NOT NULL
  AND TRIM(COALESCE(re.receipescoop, '')) IS DISTINCT FROM t.new_scoop;

-- Preview (same connection; rows updated above)
WITH latest_batch AS (
    SELECT DISTINCT ON (UPPER(TRIM(dishcode)))
        UPPER(TRIM(dishcode)) AS dish_code,
        created_at AS saved_at
    FROM public.recipe_entries
    WHERE dishcode IS NOT NULL
      AND TRIM(dishcode) <> ''
    ORDER BY UPPER(TRIM(dishcode)), created_at DESC, id DESC
),
recipe_scope AS (
    SELECT re.*
    FROM public.recipe_entries re
    INNER JOIN latest_batch lb
        ON UPPER(TRIM(re.dishcode)) = lb.dish_code
       AND re.created_at >= lb.saved_at - interval '30 seconds'
)
SELECT UPPER(TRIM("pgNo")) AS pgno,
       TRIM(receipescoop) AS scoop,
       COUNT(*) AS lines
FROM recipe_scope
WHERE UPPER(TRIM("pgNo")) IN ('P4', 'P10', 'P11')
  AND LOWER(TRIM(reciepeitemname)) NOT IN (
          'dish_out', 'totalingredientsqty', 'totalprocessedqty'
      )
GROUP BY 1, 2
ORDER BY 1, 2;
