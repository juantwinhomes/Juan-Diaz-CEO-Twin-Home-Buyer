# Flip Scout — Juan's Autonomous Deal Finder

Daily scan of San Francisco, San Mateo, and Sunnyvale for value-add flip
opportunities, built around **Juan's actual deal signal: a house listed too
low vs its 1-mile comps** — not keyword-hunting for "fixer".

## How it works

```
Redfin (active + coming soon, <$1.5M, houses/small multifam, no condos)
  → 1-mile sold comps (180 days, similar beds/sqft, min 3)
  → candidates: listed ≤ 85% of comp-implied value        ← Juan's 85% rule
  → deterministic underwrite at 3 rehab tiers ($200/350/500 per sqft)
      guardrails from knowledge/deal-pattern-buybox.md:
      rehab > 30% of purchase = RED, spread < 20% = fail
  → listing remarks fetched per candidate (Redfin page)
  → Claude (claude-opus-4-8) structured analysis per lead:
      rehab tier, condition read, ADU potential, risks, score 1-10
  → email-ready report with only score ≥ 8, plus performance recap
```

The math is computed in code and handed to the model as fixed — the agent
chooses between pre-computed tiers and judges what math can't (condition,
comp applicability, ADU upside, risk), but cannot invent numbers.

## Run

```sh
cd tools/flip-scout
pip install -r requirements.txt

python scout.py --dry-run    # ingest + comps only, no API key needed
ANTHROPIC_API_KEY=... python scout.py    # full daily scan
```

Output: `reports/flip-scout-YYYY-MM-DD.md` (email-ready) and `flip_scout.db`
(SQLite: listing history, price drops, verdicts, scan log).

## Files

| File | Role |
|---|---|
| `config.py` | Buy box, regions, guardrails, model — the only file to tune |
| `redfin.py` | Data source (unofficial gis-csv endpoint + remarks fetch) |
| `comps.py` | 1-mile haversine comps → implied value + discount |
| `underwrite.py` | Deterministic deal math at 3 rehab tiers + buy-box gates |
| `agent.py` | Claude structured analysis + performance report |
| `db.py` | SQLite dedup (by MLS#), price-drop detection, scan log |
| `scout.py` | Daily scan entry point |

## Notes / known limits

- Redfin's CSV feed has no listing description; remarks are scraped from the
  listing page per candidate (best effort — agent caps score at 7 when
  condition is unverified).
- The `gis-csv` endpoint is unofficial and can be blocked or changed by
  Redfin at any time. If it starts returning 403s, the data-source layer
  (`redfin.py`) is the only file that needs swapping (RentCast / MLS feed).
- Price cap is $1.5M per Juan's flow and the historical loss data. The scout
  brief mentioned up to $2.5M — anything above $1.5M is deliberately excluded
  until Juan signs off on an AMBER-tier exception process.
- Schedule it daily via cron: `0 7 * * * cd .../tools/flip-scout && python scout.py`
