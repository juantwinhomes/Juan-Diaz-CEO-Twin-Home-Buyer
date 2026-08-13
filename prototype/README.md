# Plat — prototype (parked)

Early scaffold for an in-house search platform for twinhomebuyer.com. **Parked
at the wireframe stage** — the product design is still being settled, so nothing
here is load-bearing yet and none of it is wired together.

Committed rather than deleted because the container this was built in is
ephemeral, and the two pieces below are worth keeping.

## What's actually here and verified

| Path | Status |
|---|---|
| `db/migrations/001_init.sql` | Applies clean on Postgres 16. Dimensions, GSC fact table, crawl/issue tables, CRM lead table, ingest-health table. |
| `db/migrations/002_marts.sql` | Applies clean. Six views: cannibalization, opportunity, decay, city coverage, keyword→revenue, plus `v_rank`. |
| `api/app/normalize.py` | URL + keyword normalization, service-area and stray-geography classification. |
| `api/tests/test_normalize.py` | 34 tests, all passing (`python3 -m pytest tests/ -q`). |

That is the whole of it — four files. There is no ingest code, no API and no
frontend.

## Verification actually performed

Both migrations were applied to a real Postgres 16 instance, then seeded with
ten real ranking rows from the 4 Aug 2026 Semrush export.
`mart_cannibalization` independently reproduced the finding from the PDF audit:

```
   keyword_raw   | volume | competing_urls |   positions   | dilution_score
-----------------+--------+----------------+---------------+----------------
 cash buyers     |   4400 |              2 | {6,8}         |           4400
 cash buyer      |    880 |              2 | {4,16}        |            880
 twin home buyer |    210 |              5 | {1,8,9,12,19} |            840
```

`mart_opportunity` and `mart_decay` return zero rows by design until real
Search Console data lands — they filter on `source = 'gsc'`.
`mart_city_coverage` returns zero rows until `dim_city` is seeded.

## Two design decisions worth keeping

**Measured and estimated rank data never mix.** `fact_gsc_daily` holds
measured Search Console data; `fact_rank_external` holds third-party
estimates. The `v_rank` view unions them but keeps a `source` column, so no
query can silently average a measurement with an estimate.

**Normalization is a pure, tested function.** `url_norm()` collapses the
`http`/`https`, `www`, trailing-slash, case, UTM, `?replytocom`, AMP and feed
variants that otherwise fragment one page into six rows. This is where SEO
warehouses usually die. Note that `keyword_norm()` deliberately does *not* stem
or de-pluralize — `cash buyer` and `cash buyers` have different SERPs and must
stay distinct rows.

## Reproducing the check

```bash
# tests
cd api && python3 -m pytest tests/ -q

# migrations against a throwaway Postgres
initdb -D /tmp/pgdata -A trust
pg_ctl -D /tmp/pgdata -o '-p 55432 -k /tmp' start
psql -h /tmp -p 55432 -U postgres -c 'CREATE DATABASE plat;'
psql -h /tmp -p 55432 -U postgres -d plat -v ON_ERROR_STOP=1 \
  -f db/migrations/001_init.sql -f db/migrations/002_marts.sql
```

## Not started

Ingest (Search Console, GA4, crawler, REI Blackbook), the API layer, and the
entire frontend. See the wireframes for the intended screen set and build order.
