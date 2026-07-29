# Flip Scout Agent — SOP

**What it is:** Twin Home Buyer's automated Redfin flip-lead pipeline. Scans our
buy box every hour, underwrites every listing to our flip methodology, and drops
qualifying leads into Bryan's Google Sheet.
**Owner:** Bryan (automation) · **Feeds:** Bryan's flip Google Sheet · **Cadence:** hourly, auto
**Buy box changes:** Juan/Bryan only — never expanded or shrunk unilaterally.

---

## Bottom line up front

- **What it does for us:** turns hundreds of Redfin listings/hour into a short,
  ranked list of homes that pencil as flips — automatically, deduped, with the
  math already run. It replaces a person manually screening listings all day.
- **The one rule that matters:** this is a **screen, not an appraisal.** It tells
  you where to *look*, never what to *offer*. Nothing here goes to a seller
  without the human offer checklist below.
- **Profit gate (Light-rehab scenario — a lead only shows up if it clears this):**

  | ARV | Min projected profit |
  |---|---|
  | $1M+ | $100K |
  | $500K–$1M | $70K |
  | Under $500K | $50K |

  - **"Strong Deal"** = clears the gate even under Heavy rehab.
  - **"Marginal"** = only clears under Light rehab.

**Decision needed from Juan:** none on the tool — it runs itself. Juan's only
decisions are (1) buy-box changes and (2) go/no-go on individual leads *after*
the offer checklist below.

---

## Before you make an offer on ANY lead (non-negotiable)

The system screens. It does not underwrite an offer. Before writing a single offer:

1. **Pull real comps by hand** — genuine 1-mile radius, 6–12 months. Not the
   tool's zip/size-band proxy.
2. **Verify flood zone + code violations manually.** Never checked here.
3. If flagged **"Outside buy-box zips"** or **"ARV not size-matched"** → treat the
   ARV as a rough placeholder, not a number to offer against.
4. If flagged with a **long days-on-market / price-cut** note → find out *why* it's
   sitting before assuming it's underpriced.
5. **Confirm rehab scope in person.** Light/Heavy are two fixed-rate estimates,
   not a substitute for a contractor walkthrough.

> A lead with **no** risk flags is not risk-free — it just means none of the
> tracked signals fired. Flood zone, code violations, and neighborhood inventory
> are never checked here and never faked.

---

## The methodology (Twin Home Buyer standard)

- **ARV** = median $/sqft of *size-matched* sold comps (±20%, widening to ±40%/±60%
  only if too few comps clear the tighter band) × subject sqft. **Not** a flat
  zip-wide median — that overstated ARV by mixing in comps of any size (fixed
  after Juan flagged it as too optimistic).
- **Rehab — always both scenarios:** Light **$70/sqft** (cosmetic) and Heavy
  **$140–150/sqft** (everything new), plus itemized add-ons for anything the
  listing text calls out (soft story/foundation, knob-and-tube, roof).
- **Holding costs (3 months):** 10%/yr financing (prorated) + insurance
  ($2,000 per $1M price) + property tax (1.25%/yr, prorated) + $400 flat
  utilities. (Last two are documented assumptions, not listing-given.)
- **Profit gate + Strong/Marginal labels:** see the table up top.
- **Deliberately NOT included** (removed per standing instruction): ADU potential,
  "Reno Budget" label, seismic/pre-1940-wiring construction-risk flags.

## Buy box (current)

**64 zips · $400K–$1.5M · single-family.** San Francisco · full San Mateo Co.
(Peninsula) · Sunnyvale · Oakland (West/North/rest) · Richmond CA · Berkeley ·
San Leandro · San Jose. Authoritative list: `CONFIG["target_zips"]` in
`flip_scout_redfin.py`. **Changes on Bryan/Juan's explicit instruction only.**

## Reading the Risk column

Only real, verified signals — nothing fabricated.

| Risk text | What it means |
|---|---|
| On market N days[, M price cut(s)] | From Redfin's own Sale History. Flagged at 60+ days or 2+ cuts — may signal a soft submarket or an overpriced property. |
| Outside the scanned buy-box zips | Zip isn't one of the 64 (neighboring-zip catch). ARV used a citywide comp pool — **verify comps manually.** |
| ARV not size-matched | Even the widest band lacked 3+ comps; ARV fell back to the zip's full set. Lower confidence. |
| Small lot | Lot < 2,500 sqft. |
| PRICE ANOMALY | SF listing under $500K — **verify title/liens** before assuming it's a deal. |
| Bayview – neighborhood still transitional | Address-based neighborhood note. |

---

## Operator Runbook (Bryan / whoever runs it)

*Everything below is mechanical. Juan does not need to read this.*

### The moving parts
- **`flip_scout_redfin.py`** — the full scan. Rebuilds ARV comps from scratch per
  zip, searches all active listings, enriches a shortlist, scores, writes the
  report. Heavy (hundreds of requests) — **run on demand, not scheduled.**
- **`hourly_check.py`** — the recurring job. Reuses cached comps (rebuilt only if
  7+ days old), searches active listings, enriches/scores only listings not
  already in `seen_listings.json`. **This is what runs every hour.**
- **`FlipScoutSheet.gs`** — Apps Script in Bryan's sheet. Pulls
  `leads_for_sheets.json` from the repo and appends new leads, deduped by Redfin
  link, on its own hourly Google trigger.
- **State files** (committed after every run, so state survives sessions):
  `comp_benchmarks_cache.json`, `seen_listings.json`, `leads_for_sheets.json`.

### Hourly check — what "normal" looks like
1. `git pull`, run `hourly_check.py`.
2. **No `new_leads.json`** → nothing qualified. Commit `seen_listings.json` if it
   changed, **stay silent — do not message Bryan.**
3. **`new_leads.json` exists** → something qualified:
   - Sanity-check each lead (oversized-for-zip, outside-buy-box, stale) — the risks
     are already in the data, just read them.
   - Update the published field-report artifact (**adds** leads, never removes).
   - Commit + push: `seen_listings.json`, `comp_benchmarks_cache.json`,
     `new_leads.json`, `leads_for_sheets.json`.
   - Message Bryan **one line per lead**: address/city/zip, score, price, profit,
     Redfin link. Short — not a full report dump.

> Some zip fetch failures every run are **normal** (`⚠️ Error fetching ZIP XXXXX:
> no usable response after retries`). Redfin occasionally returns an empty/challenge
> response; the script retries, skips that zip this run, and re-looks next hour.
> Not a problem **unless every zip fails.**

### Google Sheet — Apps Script menu
| Menu item | Use it when |
|---|---|
| **Refresh Now** | Normal operation — pulls new leads. Runs hourly on its own once enabled. Never touches existing rows. |
| **Resync Existing Leads** | A lead in the sheet needs numbers/risks refreshed from the current feed (e.g. after a methodology fix). Preserves "First Added." Skips rows whose URL isn't in the feed anymore. |
| **Clear All Leads** | Clean slate after a real methodology change (asks to confirm). Run Refresh Now after to repopulate. |
| **Remove Non-Profitable Leads** | One-time backstop for rows added before profitability filtering existed. |
| **Enable/Disable Hourly Auto-Refresh** | Set up once. Idempotent — safe to click again. |

> **Known gap:** a lead excluded from the feed *after* it was added to the sheet
> (e.g. later found already-renovated) is **not** auto-removed — Refresh only
> appends, Resync skips URLs no longer in the feed. If Bryan flags a lead that
> looks wrong, check whether it's still in `leads_for_sheets.json`; if not, remove
> it from the sheet manually (or Clear All + Refresh for a full rebuild).

### Troubleshooting
- **Sheet shows old columns after a schema change** → header row rebuilds only if
  it doesn't match the current schema, or via Clear All Leads. Re-paste the latest
  `.gs` and click Refresh Now.
- **Duplicate leads** → shouldn't happen; dedup is by Redfin link in both the feed
  merge and the Apps Script check. Verify by comparing the **Redfin Link** column,
  not the address text — a relisted property under a new URL is a genuine "new"
  listing by design, not a bug.
- **Field-report artifact looks stale** → the publish tool fails transiently
  sometimes; repo data is always current. Retry the publish; meanwhile
  `leads_for_sheets.json` is the source of truth.
- **A lead's numbers look off** → re-derive by hand from the same repo data
  (`comp_benchmarks_cache.json` for the zip's real comps) before assuming a bug.
  Most "wrong-looking" numbers are a real effect of the methodology (e.g. an
  oversized home against a zip's typical comp size). If the *scraped source data*
  is wrong (price/sqft/zip), fix it at the source — don't just exclude the listing.

---

## Revision history (major changes, newest first)
- Added Apps Script menu items for resync / clear-all to handle schema and
  methodology changes without manual sheet surgery.
- Added pagination + retry-on-transient-failure to the scraper (inventory or
  sold-comp count can exceed one page; a single empty response used to look
  identical to "no listings").
- Fixed a bug where un-enriched candidates from a full scan were permanently
  marked "seen," silently excluding anything past the top-6 cutoff.
- Replaced flat zip-wide median ARV with size-matched comps (root cause: a few
  large/luxury sold comps were setting the rate for much smaller subjects).
- Removed construction-condition risk flags (seismic, pre-1940 wiring) per
  standing instruction; kept only non-construction risks.
- Replaced the generic "DOM not verified" disclaimer with a real
  days-on-market / price-cut signal from each listing's Redfin sale history.
- Rebuilt the engine to the Twin Home Buyer methodology (size-matched ARV,
  Light/Heavy rehab, dollar profit gate) — replaced the original
  spread-percentage / ADU-potential model entirely.
