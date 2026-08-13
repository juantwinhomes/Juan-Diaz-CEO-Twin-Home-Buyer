# Twin Home Buyer — Plat

An in-house search platform for `twinhomebuyer.com`, intended to replace a
Semrush subscription and to add the thing no subscription can provide: which
search keyword produced a closed deal.

**Status: design stage.** There is no application yet. What exists is a
database schema and one tested Python module, both under `prototype/`.

---

## If you just want to look

Browse the files on GitHub — nothing to install:

<https://github.com/juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer/tree/claude/google-drive-access-nc8gqy/prototype>

## If you want to run it

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/)
installed and running. Then:

```bash
git clone https://github.com/juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer.git
cd Juan-Diaz-CEO-Twin-Home-Buyer
git checkout claude/google-drive-access-nc8gqy
cd prototype

make up
```

That starts Postgres, applies all three migrations, and prints the tables it
created. `make` on its own lists every command.

| Command | What it does |
|---|---|
| `make up` | Start the database, apply migrations, list tables |
| `make psql` | Open a SQL prompt so you can poke at it |
| `make views` | List the marts |
| `make test` | Run the normalization tests — **no Docker needed** |
| `make reset` | Wipe and re-apply migrations from scratch |
| `make down` | Stop the database, keep the data |

Migrations only run the first time the data volume is created. After editing
one, use `make reset`.

**Fair warning:** the tables come up empty. There is no ingest code yet, so
running this proves the schema is valid and not much else. `make test` is the
part that does something meaningful today.

---

## What's actually here

| Path | What it is |
|---|---|
| `db/migrations/001_init.sql` | Dimensions, the Search Console fact table, crawl and issue tables, CRM leads, ingest health |
| `db/migrations/002_marts.sql` | Six views — cannibalization, opportunity, decay, city coverage, keyword revenue |
| `db/migrations/003_local.sql` | Google Business Profile: locations, daily metrics, map-pack keywords, reviews, local rank |
| `api/app/normalize.py` | URL and keyword normalization, service-area and stray-geography classification |
| `api/tests/test_normalize.py` | 34 tests |

Not started: ingest (Search Console, GA4, crawler, REI Blackbook), the API
layer, and the entire frontend.

## Two decisions worth knowing about

**Measured and estimated data never mix.** Search Console rows live in
`fact_gsc_daily`; third-party estimates live in `fact_rank_external`. The
`v_rank` view unions them but keeps a `source` column, so no query can quietly
average a measurement together with an estimate.

**`keyword_norm()` does not de-pluralize.** `cash buyer` and `cash buyers`
return different SERPs and stay separate rows. Collapsing them in
normalization would hide the exact cannibalization problem we are trying to
surface. Grouping them is the clustering layer's job.

## Verification

Everything claimed above has been run:

- 34 tests pass
- All three migrations apply clean on Postgres 16, and every view resolves
- Seeded with ten real ranking rows from the 4 Aug 2026 Semrush export,
  `mart_cannibalization` independently reproduced the audit finding —
  `cash buyers` at #6/#8, `cash buyer` at #4/#16, `twin home buyer` across
  five positions

The Docker setup in `prototype/docker-compose.yml` is the one thing not yet
exercised end to end; the migrations were validated against Postgres 16
directly instead. If `make up` misbehaves, that's the first place to look.
