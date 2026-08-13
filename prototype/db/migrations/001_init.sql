-- THB Search Intelligence — core schema
-- One site, first-party data. Raw -> staging -> marts.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- dimensions

CREATE TABLE IF NOT EXISTS dim_site (
    site_id      SERIAL PRIMARY KEY,
    domain       TEXT NOT NULL UNIQUE,
    gsc_property TEXT,                       -- sc-domain:twinhomebuyer.com
    ga4_property TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_city (
    city_id          SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    county           TEXT,
    state            TEXT NOT NULL DEFAULT 'CA',
    in_service_area  BOOLEAN NOT NULL DEFAULT TRUE,
    priority         SMALLINT NOT NULL DEFAULT 3,   -- 1 highest
    UNIQUE (name, state)
);

CREATE TABLE IF NOT EXISTS dim_page (
    page_id     SERIAL PRIMARY KEY,
    site_id     INT NOT NULL REFERENCES dim_site(site_id),
    url_norm    TEXT NOT NULL,               -- canonical form, see api/app/normalize.py
    path        TEXT NOT NULL,
    page_type   TEXT,                        -- home | city | service | guide | about | other
    city_id     INT REFERENCES dim_city(city_id),
    wp_post_id  INT,
    template    TEXT,
    first_seen  DATE NOT NULL DEFAULT CURRENT_DATE,
    last_seen   DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (site_id, url_norm)
);
CREATE INDEX IF NOT EXISTS idx_page_type ON dim_page(page_type);
CREATE INDEX IF NOT EXISTS idx_page_city ON dim_page(city_id);

CREATE TABLE IF NOT EXISTS dim_keyword (
    keyword_id   SERIAL PRIMARY KEY,
    keyword_norm TEXT NOT NULL UNIQUE,       -- lowercased, collapsed whitespace
    keyword_raw  TEXT NOT NULL,
    cluster_id   INT,
    intent       TEXT,                       -- I | N | C | T  (Semrush convention)
    is_brand     BOOLEAN NOT NULL DEFAULT FALSE,
    is_local     BOOLEAN NOT NULL DEFAULT FALSE,
    city_id      INT REFERENCES dim_city(city_id),
    in_footprint BOOLEAN                     -- NULL = not geo-scoped
);
CREATE INDEX IF NOT EXISTS idx_kw_trgm ON dim_keyword USING gin (keyword_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_kw_cluster ON dim_keyword(cluster_id);

CREATE TABLE IF NOT EXISTS dim_cluster (
    cluster_id SERIAL PRIMARY KEY,
    label      TEXT NOT NULL UNIQUE,
    head_term  TEXT
);

-- ------------------------------------------------------------- the spine
-- One row per query x page x device x date. This is what GSC gives us and
-- it is strictly better than any third-party rank estimate for our own site.

CREATE TABLE IF NOT EXISTS fact_gsc_daily (
    date        DATE NOT NULL,
    site_id     INT  NOT NULL REFERENCES dim_site(site_id),
    page_id     INT  NOT NULL REFERENCES dim_page(page_id),
    keyword_id  INT  NOT NULL REFERENCES dim_keyword(keyword_id),
    device      TEXT NOT NULL,               -- DESKTOP | MOBILE | TABLET
    country     TEXT NOT NULL DEFAULT 'usa',
    clicks      INT     NOT NULL DEFAULT 0,
    impressions INT     NOT NULL DEFAULT 0,
    ctr         NUMERIC(8,6) NOT NULL DEFAULT 0,
    position    NUMERIC(6,2) NOT NULL,
    PRIMARY KEY (date, page_id, keyword_id, device, country)
);
CREATE INDEX IF NOT EXISTS idx_gsc_date ON fact_gsc_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_kw   ON fact_gsc_daily(keyword_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_page ON fact_gsc_daily(page_id, date DESC);

-- External keyword metrics (DataForSEO / imported Semrush). Snapshot, not daily.
CREATE TABLE IF NOT EXISTS dim_keyword_metrics (
    keyword_id    INT NOT NULL REFERENCES dim_keyword(keyword_id),
    snapshot_date DATE NOT NULL,
    volume        INT,
    difficulty    NUMERIC(5,2),
    cpc_usd       NUMERIC(10,2),
    competition   NUMERIC(4,2),
    results       BIGINT,
    source        TEXT NOT NULL DEFAULT 'semrush_import',
    PRIMARY KEY (keyword_id, snapshot_date, source)
);

-- Imported third-party rank rows (the Semrush PDF/CSV export). Kept separate
-- from GSC so we never mix an estimate with a measurement.
CREATE TABLE IF NOT EXISTS fact_rank_external (
    snapshot_date DATE NOT NULL,
    keyword_id    INT  NOT NULL REFERENCES dim_keyword(keyword_id),
    page_id       INT  REFERENCES dim_page(page_id),
    device        TEXT NOT NULL DEFAULT 'DESKTOP',
    position      INT  NOT NULL,
    traffic_pct   NUMERIC(6,2),
    costs_pct     NUMERIC(6,2),
    source        TEXT NOT NULL DEFAULT 'semrush',
    PRIMARY KEY (snapshot_date, keyword_id, position, device, source)
);

-- ------------------------------------------------------------- site state

CREATE TABLE IF NOT EXISTS fact_crawl (
    crawl_id      BIGSERIAL PRIMARY KEY,
    run_id        UUID NOT NULL,
    page_id       INT NOT NULL REFERENCES dim_page(page_id),
    crawled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_code   INT,
    redirect_to   TEXT,
    title         TEXT,
    meta_desc     TEXT,
    h1            TEXT,
    word_count    INT,
    canonical_url TEXT,
    robots        TEXT,
    schema_types  TEXT[],
    load_ms       INT
);
CREATE INDEX IF NOT EXISTS idx_crawl_run  ON fact_crawl(run_id);
CREATE INDEX IF NOT EXISTS idx_crawl_page ON fact_crawl(page_id, crawled_at DESC);

CREATE TABLE IF NOT EXISTS fact_link (
    run_id       UUID NOT NULL,
    from_page_id INT NOT NULL REFERENCES dim_page(page_id),
    to_page_id   INT NOT NULL REFERENCES dim_page(page_id),
    anchor_text  TEXT,
    rel          TEXT,
    is_nav       BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (run_id, from_page_id, to_page_id, anchor_text)
);

CREATE TABLE IF NOT EXISTS fact_issue (
    issue_id   BIGSERIAL PRIMARY KEY,
    run_id     UUID NOT NULL,
    page_id    INT REFERENCES dim_page(page_id),
    rule_id    TEXT NOT NULL,
    severity   TEXT NOT NULL,               -- error | warning | notice
    detail     JSONB,
    found_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_run ON fact_issue(run_id, severity);

-- ------------------------------------------------------------- revenue loop

CREATE TABLE IF NOT EXISTS fact_ga4_daily (
    date             DATE NOT NULL,
    page_id          INT NOT NULL REFERENCES dim_page(page_id),
    sessions         INT NOT NULL DEFAULT 0,
    engaged_sessions INT NOT NULL DEFAULT 0,
    conversions      INT NOT NULL DEFAULT 0,
    conversion_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (date, page_id)
);

CREATE TABLE IF NOT EXISTS fact_lead (
    lead_id          TEXT PRIMARY KEY,        -- REI Blackbook id
    created_at       TIMESTAMPTZ NOT NULL,
    landing_page_id  INT REFERENCES dim_page(page_id),
    first_keyword_id INT REFERENCES dim_keyword(keyword_id),
    source           TEXT,
    medium           TEXT,
    stage            TEXT,
    deal_value       NUMERIC(12,2),
    closed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_page ON fact_lead(landing_page_id);
CREATE INDEX IF NOT EXISTS idx_lead_created ON fact_lead(created_at DESC);

-- ------------------------------------------------------------- ingest health
-- A silently dead pipeline is worse than no pipeline.

CREATE TABLE IF NOT EXISTS ingest_run (
    run_id      UUID PRIMARY KEY,
    source      TEXT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status      TEXT NOT NULL DEFAULT 'running',   -- running | ok | failed
    rows_written INT NOT NULL DEFAULT 0,
    window_start DATE,
    window_end   DATE,
    error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_src ON ingest_run(source, started_at DESC);
