# Deal Economics — TRUE NET from QuickBooks (2026-07-22)

> **This supersedes the gross numbers in `deal-pattern-buybox.md`.** Built by
> joining two QuickBooks (Equity Track Inc) exports — Profit & Loss by Property
> and Balance Sheet by Property, both "All Dates" — via `tools/deal_net_from_qbo.py`.
> These are **true net** (after commission, mortgage interest, property taxes,
> insurance, holding), not gross. Source of truth for Twin Deal Intelligence.
>
> Synced into the repo 2026-09-21 from Drive (`deal-economics-quickbooks-2026-07.md`,
> owner: Seth). The repo had been running on the superseded gross figures.

## Why this exists

The buy-box analysis was built from Drive documents and reported **gross**
(Sale − Purchase − Rehab). Spot-checking it against QuickBooks showed the gross
numbers are unreliable — the flagship example, **164 Springdale, was recorded
as a +$2.7M win but is actually a ~−$62K loss** (its $2.775M *sale price* had
been logged as profit). This doc replaces belief with the books.

## Method (reproducible)

Flip properties sit on the Balance Sheet as **Inventory** until sold; at sale
the cost basis should move into COGS on the P&L. When that "inventory relief"
is done, **P&L Net Income = true net**. When it isn't, the sale shows in P&L
while the purchase cost is stuck in inventory, so P&L Net Income is overstated.

    true_net(property) = P&L Net Income − remaining Balance-Sheet inventory

Classification (±$15k leftover inventory treated as rounding):
- **CLEAN** (|inv| ≤ 15k): P&L Net Income trusted as-is.
- **CORRECTED** (inv > 15k, not relieved): true = P&L net − stuck inventory.
- **FLAGGED** (inv < −15k, negative/over-relieved): NOT trusted — bookkeeping review.

## Corrected scoreboard

| Metric | Buy-box (gross, old) | QuickBooks (net, corrected) |
|---|---|---|
| Win rate | 86% | **74%** (28 wins / 10 losses of 38 trusted) |
| Biggest win | 164 Springdale +$2.7M ❌ | **255 Amber +$802K** ✅ |
| Reported total | ~$12.8M gross | **$3.59M true net** (38 trusted deals) |

47 sold deals total: **38 trusted**, **9 flagged** for bookkeeping review.

## Big wins (true net, trusted)

| Property | True Net | Note |
|---|---|---|
| 255 Amber Drive | +$802,163 | real #1 (buy-box said $1.07M gross) |
| 159 Rockridge Rd | +$352,055 | |
| 1618 Mclaughlin | +$345,418 | |
| 5 Oceanside Way | +$304,605 | |
| 2057 Eucalyptus Ct | +$298,402 | |
| 948 Karol Way | +$268,040 | |
| 915 52nd St | +$267,806 | |
| 1574 Jerrold | +$250,987 | corrected (inventory not relieved) |
| 519 Orizaba | +$185,902 | corrected (inventory not relieved) |
| 16396 Orange Blossom | +$159,838 | |
| 1202 Via Lucas | +$128,701 | |
| 775 7th Ave | +$127,138 | |
| 1020 Laurel Ave | +$117,254 | |
| 1187 San Moritz | +$108,472 | |
| 819 South Mary Ave | +$93,015 | |

(13 smaller wins from +$85K down to +$12.7K omitted for brevity — in the script output.)

## Losses gross hid (true net, trusted)

| Property | True Net | Note |
|---|---|---|
| 4843 Swinford | −$160,860 | |
| 340 Vallejo Dr Apt 50 | −$123,929 | |
| 1083 Palomino Rd | −$93,350 | |
| 2325 Jefferson | −$89,449 | |
| 404 Ridge Gate | −$71,477 | |
| 1418 Lindsay St | −$63,649 | |
| **164 Springdale Way** | **−$61,862** | corrected — old "biggest win" |
| 13734 Licha Lane | −$58,325 | |
| 2085 Greenwood | −$12,346 | |
| 1795 Kenyon Drive | −$10,725 | |

**None of these are the Peninsula mega-losses the buy-box named** (441 Vera
−$1.09M, etc.). 441 Vera isn't even sold — it's still in inventory; that "loss"
was also fiction.

## RECONCILED (2026-07-27) — Kristine's true nets for the 9 formerly-flagged

Kristine confirmed the bookkeeping process: each unsold property sits in
**Property Inventory** carrying Rehab & Holding, Closing, and Construction Tax
Wages, plus its Kiavi/Mortgage account. **When sold and once all expenses are
finalized, those costs move from inventory into COGS/P&L.** So "stuck inventory"
(e.g. 164 Springdale) is usually just *not finalized yet* — not an error — and
the app already corrects it. The 9 below had *negative* inventory (over-relieved)
and needed manual reconciliation. Her reconciled true nets:

| Property | Reconciled true net |
|---|---|
| 34515 Torrey Pine | **+$437,998** |
| 709 Simpson Pl | +$100,106 |
| 155 Gardiner | +$87,302 |
| 17221 Via Estrella (San Lorenzo) | +$72,930 |
| 1637 Orleans Drive | +$52,310 |
| 1680 Tahoe | +$37,922 |
| 2352 Menalto Ave | +$7,649 |
| 7426 Mulholland Drive | −$19,447 |
| 1502 Magazine St | −$35,064 |
| **Subtotal (7 wins, 2 losses)** | **+$741,707** |

**PROVISIONAL** — some bank transactions aren't fully categorized, so final COGS
can shift. Wired into the app via `deal-corrections.json` (override by address),
flagged `prov`; remove an entry once a clean QuickBooks export reports it on its
own. **Updated headline: 47 deals, 35 wins (74%), ~$4.33M true net** (was 38
trusted / $3.59M). Torrey Pine at +$438K was a completely hidden win.

## (historical) FLAGGED — negative inventory, before reconciliation

These have cost over-relieved or contra entries — likely closed/owned under a
**different entity** (Prescott Development, Peninsula Plumbing, Matrix Group all
appear as inter-company balances). Numbers are unreliable until reconciled.

| Property | P&L Net (unreliable) | Inventory |
|---|---|---|
| 34515 Torrey Pine | +$454,626 | −$1,058,856 |
| 1637 Orleans Drive | +$144,439 | −$883,240 |
| 1680 Tahoe | +$59,398 | −$604,694 |
| 155 Gardiner | +$265,612 | −$488,826 |
| 1502 Magazine St | +$32,813 | −$345,000 |
| 7426 Mulholland Drive | −$19,447 | −$83,662 |
| 2352 Menalto Ave | +$27,096 | −$45,899 |
| 17221 Via Estrella San Lorenzo | +$65,282 | −$44,075 |
| 709 Simpson Pl | +$92,458 | −$35,397 |

## Decision (2026-07-22): training set = 38 trusted deals

The **38 trusted deals are the official TDI training set.** The **9 flagged
deals are PARKED** — excluded from all pattern analysis pending Tin's
bookkeeping reconciliation, but not deleted. Rationale: a model trained on
known-wrong numbers learns false lessons; 38 clean deals is enough signal to
start. Numbers are **trusted-but-provisional** — if Tin confirms any of the 9
were real deals under another entity, the picture may shift. Any TDI artifact
must state "9 deals excluded pending review" so the exclusion is visible, not
hidden.

## KNOWN GAP — no city / neighborhood field (logged 2026-09-21)

This ledger is **address-only**. There is no city, ZIP, county, or neighborhood
column anywhere in the closed-deal record, so questions like "what have we
closed in Excelsior / Bayview / Portola / Visitacion Valley / Outer Sunset?"
**cannot be answered from our own books today** — the geography has to be
re-derived by hand off settlement statements.

Consequence: we cannot produce neighborhood-level proof for marketing, SEO/AEO
content, or realtor outreach without a manual pull. Fix = add `City`, `ZIP`,
`County`, and (for SF) `Neighborhood` columns to the deal ledger on the next
`tools/deal_net_from_qbo.py` refresh. Owner: **Seth** (per the TDI refresh SOP).

## Open items

1. **Tin/Kristine:** reconcile the 9 flagged deals — confirm which entity holds
   each, relieve/clean inventory so a true net can be computed.
2. **Held (unsold) inventory** exists for ~21 more properties (441 Vera, 820
   28th St, 1090 Central, etc.) — cost basis is accumulating; not yet realized.
3. Re-run `tools/deal_net_from_qbo.py` on fresh exports to refresh; the raw
   financial workbooks are kept out of git (see `.gitignore`).
4. **Geo-tag the ledger** (see KNOWN GAP above) — Seth.
