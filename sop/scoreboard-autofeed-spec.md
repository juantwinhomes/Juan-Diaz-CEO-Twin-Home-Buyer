# The Scoreboard — Auto-Feed Spec (hand-off for Bryan)

**Goal:** kill the manual "update this and send it back to me" workflow. The
2026 Lead & Paid-Media KPI dashboard should update itself — CRM + ad platforms
flow in on a schedule, KPIs recalc, Juan reads a live board on his Sunday
review. Zero human transcription. No screenshots.

**Owner:** Bryan (build) · Roiz (source data quality) · reviewed by Juan.
**Non-negotiable:** every number traces to a system of record, not a screenshot.

---

## 1. The problem this fixes

Current dashboard is fed by screenshots someone types in by hand, then emails
around. The workbook's own README admits values "may be truncated." That's how
you get a board Juan won't trust. Root fixes:
- Pull from source systems via API/native connector — never re-key.
- One definition of "lead" and "qualified" so marketing metrics ≠ CRM metrics
  never get confused (the Facebook "2,695 results" trap).
- Refresh on a schedule; Juan inspects, never updates.

## 2. Sources → destination

| # | Source | What it holds | How to pull |
|---|---|---|---|
| A | **REI BlackBook** (CRM) | The truth on leads: disposition, source, motivation, address | BlackBook/Profit Dial API or scheduled CSV export → landing table |
| B | **Google Ads** | Spend, clicks, impressions, conversions | Google Ads API (or Google Ads → Looker/Sheets connector) |
| C | **Meta (Facebook) Ads** | Spend, reach, results (TOFU), leads if lead-form | Meta Marketing API (or Meta → Sheets connector) |
| D | **Instantly** (realtor email) | Sent, replies (opens/clicks disabled) | Instantly API → replies only |

**Destination:** the existing workbook stays the display layer (Juan knows it),
but its lead tables are populated by the pipeline, not by hand. Better long-term:
land raw data in **BigQuery** (already partly built), and the sheet reads from
BigQuery so history is preserved and nothing is overwritten.

## 3. The pipeline (Make.com — already in the stack)

```
Every night 2 AM PT:
  Scenario 1 — CRM sync
    BlackBook (new/updated leads since last run)
      → normalize: Date, Name, Address, Phone, Email, Motivation,
        Disposition, Notes, Lead Source, Campaign/Tracking, Reference
      → append/update "All Leads" landing table (dedupe on phone+address)
  Scenario 2 — Ad spend sync
    Google Ads API  → Ad Spend Inputs (Platform=Google, period, spend,
                       clicks, impressions, raw conversions)
    Meta Ads API    → Ad Spend Inputs (Platform=Facebook, ...),
                       RESULT TYPE labeled explicitly (TOFU/reach vs lead-form)
  Scenario 3 — Recalc + snapshot
    Dashboard KPIs recalc (formulas already exist)
    Write a dated row to "History" tab (weekly cash-of-the-week style trend)
    Post a 1-line summary to the team channel + flag anomalies
```

## 4. The definitions that MUST be locked (this is the trust layer)

| Metric | Exact definition | Never confuse with |
|---|---|---|
| **Lead** | A record in BlackBook with a real contact | Ad-platform "results"/clicks/reach |
| **Qualified** | Disposition = "Qualified \| *" in CRM ONLY | Meta "results", Google "conversions" |
| **Raw Result** | Whatever the ad platform counts (often TOFU) | A lead. Label it "TOFU/Reach" on the board |
| **CPL** | Total ad spend ÷ CRM leads (not platform results) | Platform's reported cost/result |
| **Cost per Qualified** | Total ad spend ÷ CRM qualified leads | CPL |

**Rule on the board:** Google & Meta "results" render in a **separate, greyed
"Platform-Reported (unreconciled)" block** — never added into the lead totals.
Juan's own note in the workbook demands this reconciliation; enforce it in the layout.

## 5. What the board shows Juan (top strip, live)

1. **Spend → Leads → Qualified → Appointments → Contracts** (the full funnel, by source)
2. **Cost per Qualified Lead** by channel — the number that matters
3. **This week vs last week** (trend, from the History snapshots)
4. 🔴 auto-flag: any channel over $X cost-per-qualified, or spend up with qualified flat

Current reality it will surface on day one (from the file you sent):
**$64,144 spend → 55 leads → 3 qualified → 0 contracts; Facebook $3,522/lead.**
The board makes that impossible to hide — which is the point.

## 6. Guardrails baked in

- **No overwrite of history** — every run appends a dated snapshot.
- **Source-of-record stamp** on every number (which system, which pull time).
- **Anomaly alerts** to Bryan (spend spike, zero-qualified week, bounce >3%).
- **Nobody emails Juan a file** — he opens the live board link. If a human had
  to touch it to make it current, the build isn't done.

## 7. Build order (one brick at a time)

1. **Week 1:** BlackBook → All Leads auto-sync (Scenario 1). Kills the biggest
   manual step immediately.
2. **Week 1:** Google + Meta spend auto-sync (Scenario 2) with result-type labels.
3. **Week 2:** History snapshots + weekly trend + team-channel summary.
4. **Week 2:** Anomaly flags + Juan's live link.
5. **Later:** move landing tables to BigQuery for durable history.

## 8. Definition of done

- [ ] Juan opens one link and sees current numbers with zero human update
- [ ] Lead totals come from CRM; platform results shown separately, never merged
- [ ] Cost-per-qualified is visible by channel
- [ ] A dated snapshot is written every run (trend survives)
- [ ] Anomaly alerts fire to Bryan, not to Juan
- [ ] The phrase "update this and send it back to me" no longer exists anywhere
