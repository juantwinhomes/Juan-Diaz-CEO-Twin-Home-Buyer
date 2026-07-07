# Twin Home Buyer — Postcard / Direct-Mail KPI Dashboard (Redstone)

> Source: Google Sheet "THB Postcard KPI Dashboard" (Twin Home Buyer | Equity
> Track Inc.). Live dashboard with a date filter. Snapshot below captured at
> "All Time." **Vendor: Redstone** (postcard mail house). This is the
> **acquisition/marketing** side of the funnel — the channel that's supposed to
> feed the deals in `deal-pattern-buybox.md`.
>
> ⚠️ Data hygiene: the sheet reports two different date ranges — mailing window
> **Dec 3, 2025 – May 29, 2026** vs. footer "Data: Nov 6, 2025 – Mar 28, 2026."
> Some fields are internally inconsistent (see notes). Treat exact figures as
> directional until reconciled.

## Spend & Volume

| Metric | Value |
|---|---|
| Postcards mailed | 77,763 |
| Mailing batches | 39 |
| Campaigns | 29 |
| Redstone cost | $42,274.54 |
| **Total spend (all-in)** | **$50,549.48** |
| Cost / postcard (Redstone only) | $0.544 |
| Cost / postcard (all-in) | $0.65 |
| Avg cost / batch | $1,083.96 |
| Campaign age | 216 days |
| Days since last drop | 32 |

## Response Funnel

| Stage | Count | Rate |
|---|---|---|
| Postcards mailed | 77,763 | — |
| Inbound calls | 125 | 0.16% of mailed |
| Total leads | 92 | **0.12% response rate** |
| Interested | 30 | 32.6% interest rate (of leads) |
| Not interested | 62 | 67% |
| Offers made (declined) | 3 | — |
| **Acquired deals** | **0** | **0.0% lead→deal** |
| Sold deals | 0 | — |
| Avg gross spread | $0 | — |

**Opt-outs / negatives:** Do Not Mail 19, Do Not Call 19 (≈41% of leads asked to
be removed), No Plans to Sell 8, Ghost Calls 9, No Answer 5, Follow-Up Needed 4,
Nurture Pipeline 2, Canceled 1.

## Cost Efficiency

| Metric | Value |
|---|---|
| Cost / lead (Redstone) | $459.51 |
| Cost / lead (all-in, $50,549 / 92) | ~$549 |
| Cost / interested lead (all-in / 30) | ~$1,685 |
| **Cost / acquired deal** | **∞ — zero deals to date** |
| Avg days mail → contract | 34 days *(inconsistent — 0 contracts recorded)* |

## Response Category Detail (75 new calls / 122 total)

- Not Interested 53 (37.6%) · Interested 22 (15.6%) · Do Not Mail 19 (13.5%) ·
  Do Not Call 19 (13.5%) · Ghost Calls 9 (6.4%) · No Plans to Sell 8 (5.7%) ·
  No Answer 5 (3.5%) · Follow-Up Needed 4 (2.8%) · Nurture 2 (1.4%).
- Top single dispo: "Do Not Call" (16). Offers "Made: Decline" total 3.

---

## Twin's Analysis (Juan's read)

**Headline: 216 days, ~$50.5K spent, 77,763 postcards — and ZERO acquired deals.**
Lead→deal rate is 0.0%. This channel has not paid for itself yet, at all.

**Where it breaks — the conversion cliff, not the top of funnel:**
- Lead *quality* looks OK: 32.6% of leads say "interested." That's not the problem.
- The funnel dies AFTER interest: 30 interested → only 3 offers made → all declined
  → 0 under contract → 0 acquired. **We are getting interest and not converting it
  into contracts.** That's an acquisitions/negotiation execution gap, not a mail gap.

**Top-of-funnel is also thin:** 0.12% response rate is low for distressed/absentee
direct mail (typical is ~0.5%+). And ~41% of responders asked to be removed
(DNM+DNC) — a signal of list fatigue or a poorly targeted list.

**The link to the buy-box:** unknown whether Redstone is mailing INTO the proven
East Bay sub-$1M winner geography or spraying broadly. If the list isn't aimed at
the buy-box, low conversion is expected. **This is the first question to answer.**

**Fair caveats:**
- Last drop was only 32 days ago; a couple leads are still in nurture. Some lag is
  normal — but 216 days with 0 acquisitions is well past the historical ~34-day
  mail→contract benchmark. Lag doesn't explain zero.
- This is ONE channel (Redstone postcards), not the whole company. The 56 historical
  deals came from somewhere; this campaign isn't the only acquisition source.
- Data hygiene issues (conflicting date ranges, 34-day metric with 0 contracts) mean
  figures need reconciliation before we bet on them.

**Bottom line:** As a standalone investment, this campaign is currently a ~$50K
cost with no return. The break isn't lead quality — it's converting interested
sellers into signed contracts, plus a possibly mistargeted list. Both are fixable
and both are acquisition-execution issues (Roiz + whoever runs offers).

## DEEPER DIVE — Full Workbook (24 tabs), added after reading beyond the dashboard

The workbook ("KPI Postcard") has 24 tabs, not just the dashboard. Key finds:

### Targeting is diluted across the whole state — only ~15% hits the buy-box
"Addresses Uploaded by Area Group" — 74,770 addresses across 13 area groups:

| Bucket | Addresses | % | Verdict |
|---|---|---|---|
| **ON buy-box** (Oakland/Emeryville, Alameda Co., Hayward, West Contra Costa) | 10,994 | **15%** | ✅ the proven engine |
| **OFF buy-box** (SF, Peninsula/S. Peninsula, South Bay, Central Valley, Sonoma, Solano, Marin) | 33,877 | **45%** | ❌ wrong geography |
| Mixed / "Bay Area (broad)" + Tri-Valley/East CC | 29,899 | 40% | ⚠️ partly East Bay, partly spray |

- **Only ~15% of the mail is aimed squarely at the East Bay sub-$1M engine.**
- **45% is off-box** — and it includes the **Peninsula / SF** (Menlo Park, Los
  Altos, Los Gatos, Saratoga, Alamo named in the "Ugly" campaign) — i.e. the exact
  premium markets where **every historical LOSS came from** (`deal-pattern-buybox.md`).
- Mail even went to **Los Angeles (~2,764 pieces)** and **Lake Elsinore (SoCal)** —
  entirely outside the Bay Area operation.

### List strategy (from Expenses Overview + campaign names)
- **Data vendors:** Profit Dial (ReiBlackbook) and DealMachine (skip trace / list pull).
  **Mail house:** Redstone Print & Mail.
- **List types (distress):** Liens, Tax Delinquent, NOD (Notice of Default), NTS,
  Absentee Owner, "Ugly Houses," Code Violations, "Stack" (multiple distress signals
  stacked), Out-of-State owners, Return Mail. Filters: Owned >7–19 yrs, Equity >35–40%.
- The single best-targeted drop = **"Stack — Oakland/Emeryville 7 core zips"**
  (94608/07/12/06/01/21/03), 2,786 pieces → most interested callers (5). This is
  the play to scale.

### The one contract this campaign produced — off-box, and it CANCELED
"In Contract" tab has exactly one record: **33025 Wildomar Rd, Lake Elsinore, CA
(Riverside County), Liens/Postcard — "Canceled Contract."** The only deal that
advanced came from outside the core geography, and it died.

### The conversion problem is now visible in the seller notes ("Interested leads")
Interest is real and in the sweet spot — Oakland sellers at $400–550K — but we
lose them after the call. Recurring reasons in the notes:
- **Offers land low / insult the seller:** "our offer was too low," "reaction is
  sarcastic. Ended call abruptly," lost to an investor "at 350k."
- **Follow-up leaks:** repeated "Callback made. No answer," "await callback."
- **They list with an agent instead** (several).
Named people working leads: **Cherry** and **Jose** (making offers).

### Reframed bottom line
This is not a lead-quality problem and not purely a "no deals yet" problem. It's
**two fixable execution problems:** (1) the spend is scattered statewide instead of
concentrated on the ~15% that is the proven East Bay engine — with 45% aimed at
off-box / loss-zone markets; and (2) interested East-Bay sellers aren't being
converted because offers come in low and follow-up leaks. Fixing targeting is a
Roiz/list decision; fixing conversion is an offer-strategy + follow-up-cadence
decision (Cherry/Jose).

## Open Questions To Close

1. ~~Is Redstone mailing into the buy-box?~~ **Answered: only ~15% is; 45% is off-box.**
2. Why are offers landing low — pricing model, or authority to go higher? Who owns
   the offer number, and what's the max-offer rule?
3. What's the follow-up cadence/SLA on an "interested" lead? Right now leads slip to
   "no answer."
4. Reconcile date ranges and the "34 days mail→contract / 0 contracts" conflict.
5. Which channel produced the 56 historical deals, and its cost/deal vs. this one?
