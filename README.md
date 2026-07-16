# Twin Deal Hunter

An acquisition intelligence system for **Twin Home Buyer**. It searches licensed
property-data sources for listings that match Twin Home Buyer's winning pattern —
structurally sound single-family homes in strong Bay Area resale neighborhoods,
priced well below renovated value, with distress or motivation signals in the
listing — then proves each opportunity with deal math and a transparent
100-point score.

The reference case is **864 Kathryne Ave, San Mateo** — listed at $898K, sold at
$1.2M, needing major renovation, with nearby renovated sales of $1.48M–$1.85M.
The system is tuned to find the next Kathryne while it is still active.

## Try it right now (no API key needed)

```bash
pip3 install -r requirements.txt
python3 run_daily.py --demo
```

Demo mode runs the full pipeline on built-in sample listings (including a
Kathryne-style fixer, a retail-ready home, and a moderate cosmetic flip) and
writes reports to `reports/`.

## Run it for real

1. Get a [RentCast API key](https://app.rentcast.io/app/api) (plans start ~$74/mo;
   there is a free tier of 50 requests/mo for testing).
2. Copy `.env.example` to `.env` and paste your key.
3. Edit `config/markets.yaml` with your target cities.
4. Run:

```bash
python3 run_daily.py
```

Every run:

1. Pulls new/changed sale listings in your target cities.
2. Screens out obvious retail-ready properties.
3. Analyzes listing remarks for distress and motivation language.
4. Pulls comparable sales, separates renovated from unrenovated comps, estimates ARV.
5. Estimates repair scope and cost from the listing evidence.
6. Runs full deal math: net profit, return on total cost, maximum allowable offer.
7. Scores each property 0–100 with a component-by-component breakdown.
8. Writes `reports/daily_opportunities.csv`, `reports/rejected_properties.csv`,
   and a one-page underwriting summary per qualifying property in `reports/summaries/`.
9. Exports properties above the CRM threshold to `reports/crm_export.csv`
   (and to a GoHighLevel webhook if `GHL_WEBHOOK_URL` is set in `.env`).

## Score bands

| Score | Action |
|---|---|
| 90–100 | Immediate acquisition review |
| 80–89 | Call the agent today |
| 70–79 | Underwrite manually |
| 60–69 | Watchlist |
| < 60 | Reject |

## Tuning

All the numbers live in `config/`:

- `markets.yaml` — target cities and hard property filters
- `scoring.yaml` — the 100-point model weights and score bands
- `renovation_costs.yaml` — Bay Area $/sqft by renovation scope, plus big-ticket adders
- `acquisition_rules.yaml` — required profit, holding period, financing, closing costs

## Teach it your history

The biggest accuracy gain comes from your past deals. Fill in:

- `data/historical_deals.csv` — every deal you bought (winners **and** losers)
- `data/rejected_deals.csv` — deals you passed on, and whether passing was right
- `data/manual_reviews.csv` — the team's decision on each property the system surfaces

## Project layout

```
├── CLAUDE.md                 # master instructions for Claude Code
├── run_daily.py              # the daily pipeline entry point
├── config/                   # all tunable numbers
├── data/                     # your historical deal record (the learning loop)
├── src/
│   ├── providers/            # RentCast, ATTOM (stub), demo sample data
│   ├── normalize.py          # Listing / Comp data model
│   ├── distress_analyzer.py  # condition + motivation language analysis
│   ├── comp_analyzer.py      # comp selection, renovated split, ARV estimate
│   ├── repair_estimator.py   # repair scope + cost range
│   ├── deal_calculator.py    # net profit, ROI, maximum allowable offer
│   ├── scorer.py             # transparent 100-point model
│   ├── explanation.py        # one-page underwriting summaries
│   └── crm_export.py         # CSV + GoHighLevel webhook export
├── reports/                  # daily output (gitignored)
└── tests/
```

## Data sources

- **RentCast** (implemented) — listings, records, value estimates, comps.
- **ATTOM** (stub, next phase) — foreclosure, ownership, mortgage, tax, deeper distress.
- **Never** automated scraping of Redfin/Zillow — their terms prohibit it.
