-- Google Business Profile.
--
-- For a cash-buyer business this is not a "local" side-module. A seller who
-- searches on a phone, sees the map pack and taps Call never loads the website:
-- Search Console never sees the query and GA4 never sees the session. That lead
-- exists in exactly one dataset, and it is this one.

-- ------------------------------------------------------------------ location
-- accounts/{account}/locations/{location} in the API. There may be several --
-- enumerate them rather than assuming one.
CREATE TABLE IF NOT EXISTS dim_gbp_location (
    location_id     TEXT PRIMARY KEY,          -- "locations/12345678901234567890"
    account_id      TEXT NOT NULL,
    site_id         INT REFERENCES dim_site(site_id),
    title           TEXT NOT NULL,
    primary_category   TEXT,
    additional_categories TEXT[],
    address_lines   TEXT[],
    locality        TEXT,
    region          TEXT,
    postal_code     TEXT,
    latitude        NUMERIC(9,6),
    longitude       NUMERIC(9,6),
    phone           TEXT,
    website_uri     TEXT,
    -- The service-area list IS the row set for the City Coverage screen.
    -- Seed dim_city from this rather than typing it twice.
    service_area_places TEXT[],
    is_verified     BOOLEAN,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------- daily metrics
-- Long format, matching getDailyMetricsTimeSeries. Adding a metric later is an
-- INSERT, not a migration.
CREATE TABLE IF NOT EXISTS fact_gbp_daily (
    date        DATE NOT NULL,
    location_id TEXT NOT NULL REFERENCES dim_gbp_location(location_id),
    metric      TEXT NOT NULL,                 -- CALL_CLICKS, WEBSITE_CLICKS, ...
    value       BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (date, location_id, metric)
);
CREATE INDEX IF NOT EXISTS idx_gbp_daily_metric ON fact_gbp_daily(metric, date DESC);

-- The metrics worth pulling. The three food/booking ones in the enum are for
-- restaurants and are deliberately absent.
CREATE TABLE IF NOT EXISTS ref_gbp_metric (
    metric      TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    is_conversion BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO ref_gbp_metric (metric, label, is_conversion) VALUES
 ('BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'Impressions — mobile search', FALSE),
 ('BUSINESS_IMPRESSIONS_MOBILE_MAPS',   'Impressions — mobile maps',   FALSE),
 ('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH','Impressions — desktop search',FALSE),
 ('BUSINESS_IMPRESSIONS_DESKTOP_MAPS',  'Impressions — desktop maps',  FALSE),
 ('CALL_CLICKS',                        'Calls',                       TRUE),
 ('BUSINESS_CONVERSATIONS',             'Messages',                    TRUE),
 ('BUSINESS_DIRECTION_REQUESTS',        'Direction requests',          TRUE),
 ('WEBSITE_CLICKS',                     'Website clicks',              FALSE)
ON CONFLICT (metric) DO NOTHING;

-- --------------------------------------------------------- search keywords
-- The GBP analogue of Search Console's query report, and the only place the
-- map-pack queries exist. Monthly granularity only.
--
-- Low-volume keywords come back as a *threshold* ("fewer than 15") rather than
-- an exact count. Storing that distinction matters: summing thresholds as if
-- they were values silently inflates every total built on this table.
CREATE TABLE IF NOT EXISTS fact_gbp_keyword_monthly (
    month        DATE NOT NULL,                -- first of month
    location_id  TEXT NOT NULL REFERENCES dim_gbp_location(location_id),
    keyword_id   INT  NOT NULL REFERENCES dim_keyword(keyword_id),
    impressions  BIGINT NOT NULL,
    is_threshold BOOLEAN NOT NULL DEFAULT FALSE,  -- true => "fewer than <impressions>"
    PRIMARY KEY (month, location_id, keyword_id)
);
CREATE INDEX IF NOT EXISTS idx_gbp_kw_month ON fact_gbp_keyword_monthly(month DESC);

-- ------------------------------------------------------------------ reviews
-- Still served by the legacy mybusiness.googleapis.com/v4 surface.
-- Velocity and reply rate both feed map-pack ranking, so both are stored.
CREATE TABLE IF NOT EXISTS fact_gbp_review (
    review_id    TEXT PRIMARY KEY,
    location_id  TEXT NOT NULL REFERENCES dim_gbp_location(location_id),
    reviewer     TEXT,
    star_rating  SMALLINT,                     -- 1..5, normalized from the enum
    comment      TEXT,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ,
    reply_comment TEXT,
    replied_at   TIMESTAMPTZ,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gbp_review_created ON fact_gbp_review(location_id, created_at DESC);

-- --------------------------------------------------------------- posts & Q&A
CREATE TABLE IF NOT EXISTS fact_gbp_post (
    post_id     TEXT PRIMARY KEY,
    location_id TEXT NOT NULL REFERENCES dim_gbp_location(location_id),
    topic_type  TEXT,
    summary     TEXT,
    cta_type    TEXT,
    cta_url     TEXT,
    created_at  TIMESTAMPTZ,
    state       TEXT
);

CREATE TABLE IF NOT EXISTS fact_gbp_question (
    question_id  TEXT PRIMARY KEY,
    location_id  TEXT NOT NULL REFERENCES dim_gbp_location(location_id),
    text         TEXT,
    author_type  TEXT,
    created_at   TIMESTAMPTZ,
    upvote_count INT,
    answer_count INT,
    top_answer   TEXT
);

-- ------------------------------------------------------- map-pack rank
-- NOT from GBP. Google does not report your own local ranking anywhere.
-- This must come from geo-located SERP checks (DataForSEO or equivalent),
-- one per city x keyword, using the city's lat/lng.
CREATE TABLE IF NOT EXISTS fact_local_rank (
    check_date  DATE NOT NULL,
    location_id TEXT NOT NULL REFERENCES dim_gbp_location(location_id),
    city_id     INT  NOT NULL REFERENCES dim_city(city_id),
    keyword_id  INT  NOT NULL REFERENCES dim_keyword(keyword_id),
    map_position SMALLINT,                     -- NULL = not in the pack
    source      TEXT NOT NULL DEFAULT 'dataforseo',
    PRIMARY KEY (check_date, location_id, city_id, keyword_id, source)
);

-- ------------------------------------------------------------------- marts

-- Calls, messages and direction requests are leads that never touch the site.
CREATE OR REPLACE VIEW mart_gbp_conversions AS
SELECT
    d.date,
    d.location_id,
    SUM(d.value) FILTER (WHERE d.metric = 'CALL_CLICKS')               AS calls,
    SUM(d.value) FILTER (WHERE d.metric = 'BUSINESS_CONVERSATIONS')    AS messages,
    SUM(d.value) FILTER (WHERE d.metric = 'BUSINESS_DIRECTION_REQUESTS') AS directions,
    SUM(d.value) FILTER (WHERE d.metric = 'WEBSITE_CLICKS')            AS website_clicks,
    SUM(d.value) FILTER (WHERE d.metric LIKE 'BUSINESS_IMPRESSIONS%')  AS impressions
FROM fact_gbp_daily d
GROUP BY d.date, d.location_id;

-- Review velocity and reply rate, monthly.
CREATE OR REPLACE VIEW mart_gbp_review_velocity AS
SELECT
    date_trunc('month', created_at)::DATE AS month,
    location_id,
    COUNT(*)                                      AS reviews,
    ROUND(AVG(star_rating), 2)                    AS avg_rating,
    COUNT(*) FILTER (WHERE reply_comment IS NOT NULL) AS replied,
    ROUND(100.0 * COUNT(*) FILTER (WHERE reply_comment IS NOT NULL)
          / NULLIF(COUNT(*), 0), 1)               AS reply_rate_pct
FROM fact_gbp_review
GROUP BY 1, 2;

-- Map-pack queries that the website never sees. The gap is the point: these
-- are demand Search Console cannot show you.
CREATE OR REPLACE VIEW mart_local_only_keywords AS
SELECT
    k.keyword_id,
    k.keyword_raw,
    SUM(g.impressions)                    AS gbp_impressions,
    BOOL_OR(g.is_threshold)               AS any_threshold,
    COALESCE(SUM(s.impressions), 0)       AS gsc_impressions
FROM fact_gbp_keyword_monthly g
JOIN dim_keyword k ON k.keyword_id = g.keyword_id
LEFT JOIN fact_gsc_daily s ON s.keyword_id = g.keyword_id
GROUP BY k.keyword_id, k.keyword_raw
HAVING COALESCE(SUM(s.impressions), 0) = 0;
