-- Marts. These are the questions people actually ask.
-- Everything reads through v_rank so a screen can show measured (GSC) or
-- estimated (imported) data without the two ever being averaged together.

-- Expected CTR by position. Used to score "ranking well but under-clicked".
CREATE TABLE IF NOT EXISTS ref_ctr_curve (
    position SMALLINT PRIMARY KEY,
    exp_ctr  NUMERIC(6,4) NOT NULL
);
INSERT INTO ref_ctr_curve (position, exp_ctr) VALUES
 (1,0.2750),(2,0.1510),(3,0.1010),(4,0.0700),(5,0.0510),
 (6,0.0400),(7,0.0320),(8,0.0260),(9,0.0220),(10,0.0190),
 (11,0.0160),(12,0.0140),(13,0.0125),(14,0.0112),(15,0.0100),
 (16,0.0092),(17,0.0085),(18,0.0078),(19,0.0072),(20,0.0067)
ON CONFLICT (position) DO NOTHING;

-- ------------------------------------------------------------------ v_rank
-- Unified rank surface. source = 'gsc' is measured; anything else is estimated.
CREATE OR REPLACE VIEW v_rank AS
SELECT
    g.date            AS as_of,
    g.site_id,
    g.page_id,
    g.keyword_id,
    g.device,
    g.position,
    g.clicks,
    g.impressions,
    g.ctr,
    NULL::NUMERIC     AS traffic_pct,
    'gsc'::TEXT       AS source
FROM fact_gsc_daily g
UNION ALL
SELECT
    r.snapshot_date,
    (SELECT site_id FROM dim_site ORDER BY site_id LIMIT 1),
    r.page_id,
    r.keyword_id,
    r.device,
    r.position::NUMERIC,
    NULL::INT,
    NULL::INT,
    NULL::NUMERIC,
    r.traffic_pct,
    r.source
FROM fact_rank_external r;

-- --------------------------------------------------------- cannibalization
-- More than one of our URLs competing for the same query on the same day.
CREATE OR REPLACE VIEW mart_cannibalization AS
WITH ranked AS (
    SELECT as_of, source, device, keyword_id, page_id, position,
           COALESCE(clicks, 0) AS clicks,
           ROW_NUMBER() OVER (
               PARTITION BY as_of, source, device, keyword_id
               ORDER BY position ASC
           ) AS slot
    FROM v_rank
    WHERE page_id IS NOT NULL
),
agg AS (
    SELECT as_of, source, device, keyword_id,
           COUNT(*)                       AS competing_urls,
           MIN(position)                  AS best_position,
           MAX(position)                  AS worst_position,
           SUM(clicks)                    AS total_clicks,
           ARRAY_AGG(position ORDER BY position) AS positions,
           ARRAY_AGG(page_id  ORDER BY position) AS page_ids
    FROM ranked
    GROUP BY as_of, source, device, keyword_id
    HAVING COUNT(*) > 1
)
SELECT
    a.*,
    k.keyword_raw,
    k.is_brand,
    m.volume,
    -- wasted slots weighted by how much traffic the term could carry
    ROUND(((a.competing_urls - 1) * COALESCE(m.volume, 0))::NUMERIC, 0) AS dilution_score
FROM agg a
JOIN dim_keyword k ON k.keyword_id = a.keyword_id
LEFT JOIN LATERAL (
    SELECT volume FROM dim_keyword_metrics
    WHERE keyword_id = a.keyword_id
    ORDER BY snapshot_date DESC LIMIT 1
) m ON TRUE;

-- ------------------------------------------------------------- opportunity
-- Ranking 4-20 with real impressions and CTR below the curve = cheap upside.
CREATE OR REPLACE VIEW mart_opportunity AS
WITH latest AS (
    SELECT DISTINCT ON (keyword_id, page_id, device)
           as_of, keyword_id, page_id, device, position, clicks, impressions, ctr, source
    FROM v_rank
    WHERE source = 'gsc'
    ORDER BY keyword_id, page_id, device, as_of DESC
)
SELECT
    l.*,
    k.keyword_raw,
    p.url_norm,
    c.exp_ctr,
    ROUND((l.impressions * c.exp_ctr) - l.clicks, 1) AS clicks_left_on_table,
    ROUND((((l.impressions * c.exp_ctr) - l.clicks)
           * (21 - l.position) / 20.0)::NUMERIC, 1)  AS opportunity_score
FROM latest l
JOIN dim_keyword k ON k.keyword_id = l.keyword_id
JOIN dim_page    p ON p.page_id    = l.page_id
JOIN ref_ctr_curve c ON c.position = LEAST(20, GREATEST(1, ROUND(l.position)))
WHERE l.position BETWEEN 4 AND 20
  AND l.impressions >= 50
  AND l.ctr < c.exp_ctr;

-- ------------------------------------------------------------------ decay
-- Rolling 28d vs the prior 28d. Catches pages sliding before anyone notices.
CREATE OR REPLACE VIEW mart_decay AS
WITH bounds AS (SELECT MAX(date) AS max_d FROM fact_gsc_daily),
windows AS (
    SELECT
        g.page_id,
        SUM(CASE WHEN g.date >  b.max_d - INTERVAL '28 days' THEN g.clicks ELSE 0 END) AS clicks_now,
        SUM(CASE WHEN g.date <= b.max_d - INTERVAL '28 days'
                  AND g.date >  b.max_d - INTERVAL '56 days' THEN g.clicks ELSE 0 END) AS clicks_prev
    FROM fact_gsc_daily g CROSS JOIN bounds b
    WHERE g.date > b.max_d - INTERVAL '56 days'
    GROUP BY g.page_id
)
SELECT
    w.page_id, p.url_norm, w.clicks_now, w.clicks_prev,
    (w.clicks_now - w.clicks_prev) AS delta,
    CASE WHEN w.clicks_prev = 0 THEN NULL
         ELSE ROUND(100.0 * (w.clicks_now - w.clicks_prev) / w.clicks_prev, 1)
    END AS pct_change
FROM windows w
JOIN dim_page p ON p.page_id = w.page_id
WHERE w.clicks_prev > 0;

-- ---------------------------------------------------------- city coverage
-- Which service-area cities have a page, rank, and produce leads.
CREATE OR REPLACE VIEW mart_city_coverage AS
SELECT
    c.city_id, c.name, c.county, c.priority, c.in_service_area,
    p.page_id,
    (p.page_id IS NOT NULL)                       AS has_page,
    r.best_position,
    COALESCE(l.lead_count, 0)                     AS leads,
    COALESCE(l.deal_value, 0)                     AS deal_value
FROM dim_city c
LEFT JOIN dim_page p ON p.city_id = c.city_id AND p.is_active
LEFT JOIN LATERAL (
    SELECT MIN(position) AS best_position
    FROM v_rank v WHERE v.page_id = p.page_id
) r ON TRUE
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS lead_count, SUM(deal_value) AS deal_value
    FROM fact_lead f WHERE f.landing_page_id = p.page_id
) l ON TRUE;

-- ------------------------------------------------------- keyword -> revenue
-- The join no vendor can sell you.
CREATE OR REPLACE VIEW mart_keyword_revenue AS
SELECT
    k.keyword_id,
    k.keyword_raw,
    COUNT(DISTINCT f.lead_id)                              AS leads,
    COUNT(DISTINCT f.lead_id) FILTER (WHERE f.closed_at IS NOT NULL) AS closed,
    COALESCE(SUM(f.deal_value) FILTER (WHERE f.closed_at IS NOT NULL), 0) AS revenue
FROM dim_keyword k
LEFT JOIN fact_lead f ON f.first_keyword_id = k.keyword_id
GROUP BY k.keyword_id, k.keyword_raw;
