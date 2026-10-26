
WITH lines AS (
    SELECT
        id,
        report_date,
        item_name,
        area,
        qty,
        price,
        discount,
        sub_total,
        final_total
    FROM public.item_report_lines
    WHERE report_date >= $1::date
      AND report_date <= $2::date
      AND (
          UPPER(TRIM($3)) = 'ALL'
          OR area ILIKE TRIM($3)
      )
),
lines_enriched AS (
    SELECT
        l.*,
        dm.dishcode,
        dm.price AS menu_price,
        dc.dish_cost
    FROM lines l
    LEFT JOIN LATERAL (
        SELECT
            m.dishcode,
            m.price
        FROM public.dinein_menu m
        WHERE (
            UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
            AND (
                (
                    TRIM(COALESCE(m.online_display_name, '')) <> ''
                    AND LOWER(TRIM(m.online_display_name)) = LOWER(TRIM(l.item_name))
                )
                OR LOWER(TRIM(m.dishname)) = LOWER(TRIM(l.item_name))
                OR public.normalize_pos_item_name(m.online_display_name)
                    = public.normalize_pos_item_name(l.item_name)
                OR public.normalize_pos_item_name(m.dishname)
                    = public.normalize_pos_item_name(l.item_name)
            )
        )
        OR (
            UPPER(TRIM(l.area)) NOT IN ('ZOMATO', 'SWIGGY')
            AND LOWER(TRIM(m.dishname)) = LOWER(TRIM(l.item_name))
        )
        ORDER BY
            CASE
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND TRIM(COALESCE(m.online_display_name, '')) <> ''
                 AND LOWER(TRIM(m.online_display_name)) = LOWER(TRIM(l.item_name))
                THEN 0
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND TRIM(COALESCE(m.online_display_name, '')) <> ''
                 AND public.normalize_pos_item_name(m.online_display_name)
                     = public.normalize_pos_item_name(l.item_name)
                THEN 1
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND LOWER(TRIM(m.dishname)) = LOWER(TRIM(l.item_name))
                THEN 2
                WHEN UPPER(TRIM(l.area)) IN ('ZOMATO', 'SWIGGY')
                 AND public.normalize_pos_item_name(m.dishname)
                     = public.normalize_pos_item_name(l.item_name)
                THEN 3
                ELSE 4
            END,
            m.version DESC,
            m.last_updated_at DESC,
            m.id DESC
        LIMIT 1
    ) dm ON TRUE
    LEFT JOIN LATERAL (
        SELECT d.dish_cost
        FROM public.dish_cost d
        WHERE UPPER(TRIM(d.dish_code)) = UPPER(TRIM(dm.dishcode))
          AND TRIM(COALESCE(dm.dishcode, '')) <> ''
        ORDER BY d.last_updated_at DESC, d.id DESC
        LIMIT 1
    ) dc ON TRUE
),
sales AS (
    SELECT
        MIN(report_date) AS min_date,
        MAX(report_date) AS max_date,
        item_name,
        SUM(qty) AS sum_qty,

        MAX(price) AS max_price,
        AVG(price) AS avg_price,

        MAX(discount) AS max_discount,
        AVG(discount) AS avg_discount,
        SUM(discount) AS total_discount,

        MAX(sub_total) AS max_sub_total,
        AVG(sub_total) AS avg_sub_total,
        SUM(sub_total) AS received_without_discount,

        MAX(final_total) AS max_final_total,
        AVG(final_total) AS avg_final_total,
        SUM(final_total) AS received_with_discount,

        (
            array_agg(dishcode ORDER BY qty DESC NULLS LAST, id DESC)
            FILTER (WHERE TRIM(COALESCE(dishcode, '')) <> '')
        )[1] AS picked_dishcode,
        (
            array_agg(dish_cost ORDER BY qty DESC NULLS LAST, id DESC)
            FILTER (WHERE dish_cost IS NOT NULL)
        )[1] AS picked_dish_cost,
        (
            array_agg(menu_price ORDER BY qty DESC NULLS LAST, id DESC)
            FILTER (WHERE menu_price IS NOT NULL)
        )[1] AS picked_menu_price

    FROM lines_enriched
    GROUP BY LOWER(TRIM(item_name)), item_name
),
report AS (
    SELECT
        s.*,
        COALESCE(NULLIF(TRIM(s.picked_dishcode), ''), '0') AS dish_code,
        COALESCE(s.picked_dish_cost, 0) AS dish_cost,
        COALESCE(s.picked_menu_price, 0) AS dinein_menu_price
    FROM sales s
)
SELECT
    min_date,
    max_date,
    dish_code,
    item_name,
    sum_qty,

    max_price,
    ROUND(avg_price, 2) AS avg_price,

    max_discount,
    ROUND(avg_discount, 2) AS avg_discount,
    COALESCE(total_discount, 0) AS total_discount,

    max_sub_total,
    ROUND(avg_sub_total, 2) AS avg_sub_total,
    COALESCE(received_without_discount, 0)
        AS received_without_discount,

    max_final_total,
    ROUND(avg_final_total, 2) AS avg_final_total,
    COALESCE(received_with_discount, 0)
        AS received_with_discount,

    dish_cost,
    dish_cost * sum_qty AS total_dish_cost,

    dinein_menu_price,
    dinein_menu_price * sum_qty AS total_dinein_menu_price,

    COALESCE(received_without_discount, 0)
        - (dish_cost * sum_qty)
        AS margin_before_discounts,

    COALESCE(received_with_discount, 0)
        - (dish_cost * sum_qty)
        AS margin_after_discounts

FROM report
ORDER BY item_name;
