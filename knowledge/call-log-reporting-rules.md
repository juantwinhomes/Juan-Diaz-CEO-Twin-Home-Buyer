# Call Log Reporting Rules (Campaign Performance & Call Disposition Report)

Established with Seth during the May–July 2026 report build (2026-07-22).
Apply these to every future cut of the Weekly Call Logs data. The live report:
https://claude.ai/code/artifact/d87e6569-da8a-4f4b-8008-3f00fceae46d

## Data source

- **Source of truth = the raw `Week` tab** of the "Weekly Call Logs" Google Sheets
  workbook (one row per call). Never reuse the workbook's own dashboard/pivot
  numbers — its formulas cap their scan ranges and undercount (the dashboard's
  "Total outbound calls" tile counts only agent-attributed calls; its agent pivot
  missed ~40% of calls).
- The workbook is too large for `read_file_content` (Week tab gets truncated) and
  for xlsx export. **Working retrieval path:** Google Drive `download_file_content`
  with `exportMimeType: application/zip` → oversized result saved to a tool-results
  file → base64-decode → unzip → parse `Week.html` with an HTML table parser.
- A CSV export of the dashboard tab is nearly useless (charts/pivots export blank).

## Lead source canon (CRM Source dropdown — use these exact names)

| Report label | Raw log values / rules |
|---|---|
| PropertyLeads (PPL) | `Property Leads`, `Property leads`, `PropertyLeads` (3 spellings = 1 channel) |
| Motivated Leads (PPL) | `Motivated Leads` |
| PPC (Google/Bing Ads) | `PPC Lead` (log does NOT record Google vs Bing — flagged as logging gap) |
| Direct Mail (Checks) | source `Direct Mail` + **any campaign that isn't a Letter or Postcard campaign** — per Seth + the Direct Mail team (2026-07-22). Includes `(Checks)` campaigns, all `Liens/NOD/NTS Area###` campaigns, and generic/mislabeled campaign names |
| Direct Mail (Letters) | source `Direct Mail` + campaign contains `Letter` |
| Direct Mail (Postcard) | source `Postcard`, plus source `Direct Mail` with campaign starting `Postcard` |
| TV Commercial | `TV Commercial` |
| SEO (Organic Search) | `Organic Search` + `SEO` (merged) |
| Other | Leadgeeks, Webforn, Realtor, Facebook Ads, blank |

**Checks, Letters, and Postcards are DIFFERENT products — never lump them.**
Seth has said this repeatedly. Split by campaign name: Letters and Postcard are
identified by their campaign names; **everything else under the Direct Mail source
defaults to Checks** (confirmed by Seth with the Direct Mail team, 2026-07-22 —
no "unattributed" bucket needed). Known logging errors to expect and flag:
TV-named campaigns filed under Direct Mail, postcard campaigns under generic
Direct Mail, blank campaign names.

## Metric definitions (established through several revisions)

- **All lead metrics = unique sellers, deduplicated by phone number** (fall back to
  contact name when no number). Never report call-level counts as "leads" — Seth
  caught this (473 interested calls were only 331 unique sellers).
- **Interested leads** = unique sellers with a `New Interested Lead` Lead Type,
  new-interested only (Existing Interested and "Interested share" columns removed
  per Seth). Caveat known but not shown in the report (per Seth's revert): the tag
  is applied to purchased-lead form-fills before contact, so it overstates
  confirmed interest (~200 of 331 were ever reached live in May–Jul).
- **Appointments booked** = unique sellers with `Appointment Booked (H)` or
  `Confirmed Appointment` disposition.
- **Acquired** = `Acquired` disposition; show the column/callout only when > 0.
  Pipeline stages to surface instead: Under Contract (H), Opened Escrow,
  Offer Made: Accepted, Contract Sent.
- **Cohort booking rate** (for trend claims): cohort = month of first interested
  call; booked = ever in window. Monthly booked÷interested rates are inflated by
  sellers who book without ever being tagged interested. Empirical fact (May–Jul
  2026): 28 of 34 tagged-then-booked sellers booked SAME DAY, all within 7 days —
  there is no second-touch booking motion, so don't claim "capacity backlog"
  without cohort evidence.
- Lead-source table columns (per Seth): Calls · Interested leads · Appointments
  booked · Not interested · Invalid · Unresponsive · Do not mail (+ Acquired if any).
- Agent scorecard must foot exactly to total calls; inbound+outbound ≠ total where
  Missed/no-direction calls exist — footnote which agents hold them.

## Report format

- Artifact (same URL, redeploy in place) + PDF on request: print via Playwright
  Chromium (`/opt/pw-browsers/chromium`), letter landscape, `html { zoom: 0.80 }`,
  print CSS that un-scrolls tables (`min-width: 0`, `white-space: normal`).
- Exec summary on top in Juan's format: Issue / Impact / Options / Recommendation /
  Decision Needed. Channel verdicts table with pills (Scale / Test / Fix / Flag).
- July 2026 data is partial (through Jul 19).

## Open items (as of 2026-07-22)

- Team tagging SOP drafted (live-conversation rule for "New Interested Lead",
  mandatory agent + exact CRM source on every call, campaign names must carry
  format suffix) — Seth reviewed the draft in-chat; not yet distributed.
- Spend data exists only for the postcard program (~$50.5K, 0 acquired). Pull
  PPC / PropertyLeads / Direct Mail spend before any kill decision.
- Reconcile PropertyLeads intake: 163 leads first-dialed in June vs vendor's
  delivery count (would reveal never-dialed purchased leads).
