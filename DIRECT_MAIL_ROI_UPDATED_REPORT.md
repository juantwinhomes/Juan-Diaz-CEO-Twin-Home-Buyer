# Updated Direct-Mail ROI Report

## Report Information

| Field | Value |
| --- | --- |
| Report generated | 2026-07-22 (Pacific Time) |
| Reporting timezone | America/Los_Angeles (PT) |
| Latest REI Blackbook sync | 2026-07-21 13:13 PT (via the Monday direct-mail board, hourly REI reconciliation — verified exact REI match: 410 = 410, 0 duplicates, 0 stage mismatches). No live REI browser session was available in this session, so REI figures are as of the last reconciled sync, not re-pulled today. |
| Latest Monday.com sync | 2026-07-22 (pulled **live** this session — board `📬 Direct Mail & Postcard Leads` #18421423765, `updated_at` 2026-07-21 20:13:05 UTC). 410 items, no change since the 07-21 dashboard. |
| Latest QuickBooks refresh | 2026-07-10 (AM- Direct Mail spend). The Intuit QuickBooks connector is installed but **not enabled in this chat**, so spend could not be re-pulled today — figure carried from the last refresh. |
| Reporting period | 2026 year-to-date (cumulative direct-mail channel). Spend = 2026 YTD; leads = all 2026 direct-mail leads. |
| Data scope | **Direct mail only** — Postcards, Checks, Letters, and qualifying mail Call-ins. Source field wins over tags. PPC / PropertyLeads / Bing / web / TV excluded. |

> **Live-data note.** Of the three systems, only **Monday.com was queried live** this session and it confirms the existing dashboard exactly (410 leads, identical stage distribution). **QuickBooks spend (07-10)** and **REI revenue (07-21)** are carried from their last successful pulls because the QB connector is disabled in this chat and no authenticated REI session exists in this container. No figures below are estimated, mocked, or placeholder — every number traces to live Monday data or the last verified QB/REI pull. See §8.

---

## 1. Executive Summary

| KPI | Current Result | Previous Period (07-11 full snapshot) | Change |
| -------------------- | -------------: | --------------: | -----: |
| Total Spend | $124,332.62 | $124,333.00 | −$0.38 (≈0.0%) |
| Total Leads | 410 | 373 | +37 (+9.9%) |
| Cost per Lead | $303.25 | $333.00 | −$29.75 (−8.9%) |
| Closed Deals | 2 | 2 | 0 (0.0%) |
| Revenue | $35,918.75 | $35,918.75 | $0 (0.0%) |
| Cost per Acquisition | $62,166.31 | $62,166.50 | −$0.19 (≈0.0%) |
| ROAS | 0.29x | 0.29x | 0.00x (0.0%) |
| ROI Percentage | −71.1% | −71.1% | 0.0 pts |
| Net Return | −$88,413.87 | −$88,414.25 | +$0.38 (≈0.0%) |

*"Previous Period" is the last independent full snapshot on record (2026-07-11 evening pull: 373 leads, $124,333 spend, cost/lead $333). Lead-count movement since then reflects backfill of missed direct-mail leads and the 07-21 removal of 29 non-mail hotline call-ins — a classification change, not organic growth. See §7 for the caveats.*

**In plain language:**

- **Is direct mail profitable right now? No.** The channel is running at a **negative return of −$88,413.87** on the money invested.
- **How much was spent:** **$124,332.62** in 2026 YTD (QuickBooks AM- Direct Mail $124,330.13 + Mail Services $2.49).
- **How much revenue was produced:** **$35,918.75**, and that comes from a **single closed deal** (8227 Ney Ave, Oakland). The other closed deal has **no revenue entered** in REI.
- **How much was gained or lost:** **Lost $88,413.87.** For every $1 spent, the channel has returned **$0.29**.
- **Did ROI improve or decline?** It is **flat.** Spend, revenue, and closings have not moved since the first (and only) revenue was attributed on 07-11. Cost-per-lead improved 8.9% only because more leads were reconciled onto the board against the same spend.
- **Primary reason for the result:** This is **not a spend problem, it is a conversion-and-attribution problem.** 410 leads have produced only **2 closings (0.49% close rate)**, and only **one** of those two carries a revenue figure. The channel needs one to two more properly-attributed closings to approach break-even.

---

## 2. ROI Calculation

All figures used:

- Total Direct-Mail Spend = **$124,332.62** (AM- Direct Mail $124,330.13 + Mail Services $2.49)
- Total Direct-Mail Revenue = **$35,918.75** (REI Revenue field, closed deals only)

### ROAS

```
Revenue ÷ Spend = ROAS
$35,918.75 ÷ $124,332.62 = 0.2889 → 0.29x
```

### ROI Percentage

```
((Revenue − Spend) ÷ Spend) × 100 = ROI
(($35,918.75 − $124,332.62) ÷ $124,332.62) × 100 = −71.1%
```

### Net Return

```
Revenue − Spend = Net Return
$35,918.75 − $124,332.62 = −$88,413.87  →  NEGATIVE RETURN
```

**Spend breakdown**

| Component | Amount |
| --- | ---: |
| AM - Direct Mail | $124,330.13 |
| Mail Services | $2.49 |
| **Combined direct-mail spend** | **$124,332.62** |

---

## 3. Direct-Mail Funnel

Source: live Monday board groups (410 leads), 2026 YTD.

| Stage | Lead Count | Percentage of Total |
| --------------------- | ---------: | ------------------: |
| New Leads | 72 | 17.6% |
| Working / Contacted | 80 | 19.5% |
| Appointment & Offer | 8 | 2.0% |
| Under Contract | 1 | 0.2% |
| Closed / Won | 2 | 0.5% |
| Cancelled Contract | 1 | 0.2% |
| Dead / Not Interested | 246 | 60.0% |
| **Total** | **410** | **100%** |

**Active Pipeline** (task definition = Working/Contacted + Appointment & Offer + Under Contract):

```
80 + 8 + 1 = 89 active leads
```

> Note: the existing KPI dashboard's "Active Pipeline" tile shows **91** because it also counts the 2 Closed/Won deals. Excluding closed deals (which are no longer "in pipeline"), the active figure is **89**. Dead (246), Cancelled (1), and New (72) are excluded from the active count.

---

## 4. Conversion Rates

Rates use cumulative "reached-stage" counts derived from the current board snapshot. A lead in a later stage necessarily passed through the earlier ones (a Cancelled/Under-Contract/Won lead reached Contract; a Contract lead reached Appointment; an Appointment lead was Contacted).

- Reached Contact = Working/Contacted (80) + Appointment (8) + Under Contract (1) + Won (2) + Cancelled (1) = **92**
- Reached Appointment = Appointment (8) + Under Contract (1) + Won (2) + Cancelled (1) = **12**
- Reached Contract = Under Contract (1) + Won (2) + Cancelled (1) = **4**
- Closed = Won = **2**

| Conversion KPI | Formula | Result |
| ----------------------- | ------- | -----: |
| Contact Rate | Reached Contact ÷ Total Leads = 92 ÷ 410 | 22.4% |
| Appointment Rate | Reached Appointment ÷ Total Leads = 12 ÷ 410 | 2.9% |
| Contract Rate | Reached Contract ÷ Total Leads = 4 ÷ 410 | 1.0% |
| Close Rate | Closed ÷ Total Leads = 2 ÷ 410 | 0.49% |
| Appointment-to-Contract | Reached Contract ÷ Reached Appointment = 4 ÷ 12 | 33.3% |
| Contract-to-Close | Closed ÷ Reached Contract = 2 ÷ 4 | 50.0% |
| Cancellation Rate | Cancelled ÷ Reached Contract = 1 ÷ 4 | 25.0% |

> **Snapshot caveat.** The Monday board stores each lead's *current* stage, not its stage history. Any of the 246 Dead leads that were once contacted or booked an appointment are **not** credited in the numerators above, so Contact/Appointment rates are **conservative** (they understate historical mid-funnel throughput).

---

## 5. Performance by Direct-Mail Type

Live source counts (Monday board): Direct Mail (Checks) 267 · Direct Mail (Postcard) 142 · Direct Mail (Letters) 1.

| Type | Leads | Reached Appt | Reached Contract | Closed | Revenue | Spend | Cost/Lead | CPA | ROAS | ROI % | Net Return |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct Mail (Checks) | 267 | 8 | 3 | 1 | $35,918.75 | n/a¹ | n/a¹ | n/a¹ | n/a¹ | n/a¹ | n/a¹ |
| Direct Mail (Postcard) | 142 | 4 | 1 | 1 | $0² | ~$50,620³ | ~$356³ | ~$50,620³ | 0.00x³ | −100%³ | −$50,620³ |
| Direct Mail (Letters) | 1 | 0 | 0 | 0 | $0 | n/a¹ | n/a¹ | n/a¹ | n/a¹ | n/a¹ | n/a¹ |
| Direct Mail (Call-in) | 0 | 0 | 0 | 0 | $0 | — | — | — | — | — | — |
| **Total** | **410** | **12** | **4** | **2** | **$35,918.75** | **$124,332.62** | **$303.25** | **$62,166.31** | **0.29x** | **−71.1%** | **−$88,413.87** |

¹ **QuickBooks does not split direct-mail spend by mail type** — AM- Direct Mail is a single aggregate account. Per-type Cost/Lead, CPA, ROAS, ROI, and Net Return for Checks and Letters cannot be computed from the source data and are not estimated.

² **The one closed Postcard deal (1464 Sunrise Pkwy, Petaluma) has a blank Revenue field in REI**, so Postcard revenue reads $0 despite a closing. This understates Postcard performance (see §8).

³ Postcard spend/economics shown are from the standalone **"KPI Postcard" Google Sheet** (Redstone cost $50,620.32, Dec 3 2025 – Jun 10 2026) — a *different measurement system and window* than the QB YTD spend, and its lead base (175 postcard leads on the tracker) differs from the board's 142. Treat the Postcard ROAS/ROI row as indicative only; it is not directly comparable to the aggregate.

**Read-out:** Checks is the only mail type producing attributed revenue ($35,918.75 from 1 of 267 leads) and carries the deeper pipeline (3 contracts reached, 5 live appointments). Postcard has the same number of closings (1) but $0 attributed revenue and the highest standalone spend. Letters is a single new-2026 test lead with no movement.

---

## 6. Performance by Campaign or Mailing List

Campaign/List tag is now populated on **366 of 410 leads (89%)** — a major improvement over the 14% noted in earlier snapshots (44 leads, 11%, still blank).

**Top campaigns by lead volume (live):**

| Campaign / List | Leads | Reached Appt+ | Contracts | Closed | Revenue |
| --- | ---: | ---: | ---: | ---: | ---: |
| Liens | 160 | 5 | 1 (cancelled) | 0 | $0 |
| Tax Delinquent | 37 | 0 | 0 | 0 | $0 |
| NOD / Foreclosure | 36 | 0 | 0 | 0 | $0 |
| Ugly House | 28 | 0 | 0 | 0 | $0 |
| Postcard Liens | 22 | 1 | 0 | 0 | $0 |
| Death of Joint Tenant | 18 | 0 | 0 | 0 | $0 |
| Foreclosure | 16 | 0 | 0 | 0 | $0 |
| **Sorted Ugly Houses EQT (Checks)** | 1 | 1 | 1 | **1** | **$35,918.75** |
| Postcard | 5 | 3 | 2 | 1 | $0² |

**Strongest campaign (by revenue and ROI):** **"Sorted Ugly Houses EQT (Checks)"** — the only campaign with attributed revenue: **1 lead → 1 closing → $35,918.75.** It is the entire revenue line of the channel.

**Weakest / highest-risk campaigns:** **Liens** is the largest single list (160 leads, plus 22 "Postcard Liens" = 182 total) yet has produced **0 closings, $0 revenue, and the only cancelled contract** (7400 Rudsdale St, Oakland). It absorbs the most volume with the least yield.

**Campaign exception flags (from live campaign × stage matrix):**

| Flag | Campaigns affected |
| --- | --- |
| Spend but no leads | **Cannot be determined** — QuickBooks does not track spend at campaign/list level. |
| Leads but no appointments | Tax Delinquent (37), NOD / Foreclosure (36), Ugly House (28), Death of Joint Tenant (18), Foreclosure (16), and all remaining small lists — every campaign except Liens, Postcard, Postcard Liens, EQT Liens- Check, and Sorted Ugly Houses. |
| Appointments but no contracts | Postcard Liens (1 appt, 0 contract), EQT Liens- Check (1 appt, 0 contract). |
| Contracts but no closed deals | **Liens** (1 contract — cancelled — 0 closed). |
| Closed deals with missing revenue | **Postcard** — 1464 Sunrise Pkwy, Petaluma: closed/won but Revenue field blank in REI. |

---

## 7. Period Comparison

### Previous week (07-14 → 07-22)

| Metric | 07-14 | Current | Numeric Δ | % Δ |
| --- | ---: | ---: | ---: | ---: |
| Spend | $124,333 | $124,332.62 | −$0.38 | ≈0.0% |
| Leads | 432* | 410 | −22 | −5.1%* |
| Revenue | $35,918.75 | $35,918.75 | $0 | 0.0% |
| Closed Deals | 2 | 2 | 0 | 0.0% |
| Cost per Lead | $287.81 | $303.25 | +$15.44 | +5.4% |
| Cost per Acquisition | $62,166.50 | $62,166.31 | −$0.19 | ≈0.0% |
| ROAS | 0.29x | 0.29x | 0.00x | 0.0% |
| ROI % | −71.1% | −71.1% | 0.0 pts | 0.0% |
| Net Return | −$88,414.25 | −$88,413.87 | +$0.38 | ≈0.0% |

*The 07-14 board (432) still included ~29 non-mail hotline call-ins that were removed on 07-21 under the current source-wins classification rule. The lead decline is a **definition tightening, not lost demand** — the two counts are not directly comparable.

### Previous month (June → July MTD)

| Metric | June 2026 | July 2026 (MTD) | Numeric Δ | % Δ |
| --- | ---: | ---: | ---: | ---: |
| Direct-mail spend (QB, by month) | $17,268 | $10 | −$17,258 | −99.9% |
| Direct-mail leads (by month) | 67 | 26 | −41 | −61.2% |
| Revenue | Historical comparison unavailable | Historical comparison unavailable | — | — |
| Closed deals | Historical comparison unavailable | Historical comparison unavailable | — | — |
| Cost/Lead, CPA, ROAS, ROI, Net | Historical comparison unavailable | Historical comparison unavailable | — | — |

*Monthly spend and lead counts are available from the dashboard's monthly series; monthly revenue/closings/derived-KPIs are **not** tracked as historical snapshots and are not reconstructed here. July spend is near-zero because the last postcard drop was 06-10 — the channel is currently in follow-up mode, not active mailing.*

### Year-to-date 2026 (cumulative — the headline)

| Metric | YTD 2026 |
| --- | ---: |
| Spend | $124,332.62 |
| Leads | 410 |
| Revenue | $35,918.75 |
| Closed deals | 2 |
| Cost per Lead | $303.25 |
| Cost per Acquisition | $62,166.31 |
| ROAS | 0.29x |
| ROI % | −71.1% |
| Net Return | −$88,413.87 |

**Monthly spend & leads (2026, from dashboard series):**

| Month | Spend | Leads |
| --- | ---: | ---: |
| Jan | $41,711 | 112 |
| Feb | $30,860 | 70 |
| Mar | $27,469 | 56 |
| Apr | $759 | 27 |
| May | $6,254 | 19 |
| Jun | $17,268 | 67 |
| Jul | $10 | 26 |

*The monthly lead series sums to 377 (an earlier board vintage); the current live board is 410 after backfill/reclassification. Use the monthly split for trend shape, and 410 for the current total.*

---

## 8. Data Accuracy Warnings

| # | Issue | Affected Records | Impact on ROI |
| --- | --- | --- | --- |
| 1 | **QuickBooks spend is stale.** Last refresh 2026-07-10 (12 days ago); the Intuit connector is not enabled in this chat, so spend could not be re-pulled. | Spend denominator ($124,332.62) | Any July mailing spend since 07-10 would raise the denominator and push ROI further negative. July spend has been ~$10, so impact is likely minimal but unconfirmed. |
| 2 | **REI Blackbook not re-pulled live.** No authenticated REI session in this container; lead/stage/revenue data is as of the last hourly reconciliation (07-21 13:13 PT). | All 410 leads + revenue | Report reflects state as of 07-21, not a fresh 07-22 REI scan. Monday board (the reconciled mirror) shows no change since. |
| 3 | **Closed deal missing revenue.** 1464 Sunrise Pkwy, Petaluma (Postcard) is Closed/Won but its REI Revenue field is blank. | 1 of 2 closed deals | Revenue is likely understated. A single typical wholesale spread ($15k–$40k) here would materially improve ROAS/ROI. #1 fix. |
| 4 | **Revenue rests on a single REI entry; QuickBooks shows $0 booked.** Property sales are journaled, not invoiced, so QB has not confirmed the $35,918.75. | Entire revenue line | ROI numerator is low-confidence until QB and REI are reconciled. |
| 5 | **Conversion rates from current-state snapshot.** Board does not retain stage history. | Up to 246 Dead leads | Contact/Appointment rates are conservative (understated). |
| 6 | **Per-type and per-campaign spend unavailable.** QuickBooks aggregates all direct mail into one account. | Type & campaign ROAS/ROI/CPA | Cannot compute mail-type or campaign-level return except the standalone postcard tracker (different window). |
| 7 | **Monthly lead series vintage mismatch.** Monthly split sums to 377; live board is 410. | ~33 leads | Affects only the monthly trend table, not the headline totals. |
| 8 | **Historical source-field gaps in REI (~81% blank historically; channel read from tags).** Mitigated by the source-wins reconciliation (0 mismatches on 07-21). | Classification confidence | Low residual risk; board reconciles exactly to REI. |

**No placeholder, test, mock, or hardcoded values are included.** All lead/stage/source/campaign figures were pulled live from Monday.com this session; spend and revenue are the last verified QuickBooks/REI values.

**Validation results:** 0 duplicate leads · non-direct-mail sources excluded (source-wins) · Monday↔REI counts consistent (410 = 410) · cancelled deal (1) correctly separated from closed (2) · 246 Dead leads excluded from active pipeline · revenue not double-counted (single entry).

---

## 9. Management Insights

1. **Direct mail is currently unprofitable — a −$88,413.87 net loss and 0.29x ROAS.** $124,332.62 spent has returned $35,918.75. The channel returns $0.29 per $1 spent.
2. **The strongest return comes from one Checks campaign: "Sorted Ugly Houses EQT (Checks)"** — it is the *only* campaign with attributed revenue ($35,918.75 from a single closing at 8227 Ney Ave, Oakland). Checks as a type carries 100% of confirmed revenue.
3. **The biggest underperformer is the Liens list.** At 182 leads (160 "Liens" + 22 "Postcard Liens") it is the largest volume driver, yet it has produced 0 closings, $0 revenue, and the channel's only cancelled contract (7400 Rudsdale St, Oakland). Highest volume, lowest yield.
4. **The biggest pipeline drop-off is New → Contact and, above all, the close.** 246 of 410 leads (60%) are Dead, and the close rate is 0.49% (2 of 410). Even among the 12 leads that reached an appointment, only 4 reached contract and 2 closed. The leak is late-funnel conversion, not lead volume.
5. **What to investigate next: the missing revenue on the Petaluma (Postcard) closing (§8 #3) and the QuickBooks reconciliation.** Entering that deal's revenue in REI, plus confirming the $35,918.75 in QuickBooks, is the single fastest way to make ROI accurate — one to two properly-booked closings move this channel toward its ~2-deal break-even at a $25k average spread.
