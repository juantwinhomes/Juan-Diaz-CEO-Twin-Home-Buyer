# SOP — Monthly Campaign Performance & Call Disposition Report (PDF)

**Purpose:** Produce Juan's lead-source call performance report (web artifact +
PDF) from the Weekly Call Logs workbook, using verified raw data — never the
workbook's own dashboard formulas.
**Owner:** Seth · **Cadence:** monthly, or on request
**Companion doc:** `knowledge/call-log-reporting-rules.md` — all classification
rules and metric definitions live there. This SOP is the *how*; that file is
the *what*.
**Live artifact (redeploys in place):**
https://claude.ai/code/artifact/d87e6569-da8a-4f4b-8008-3f00fceae46d

## Step 1 — Get the raw data (Google Drive)

1. Requires the **Google Drive connector enabled in the chat**. If Drive tools
   are missing, ask Seth to toggle it on in the chat's connector settings.
2. Find the workbook: search Drive for title `Weekly Call Logs`. Use the
   current working copy (confirm by `modifiedTime`) — not the year-old copies
   owned by accounting/kyle.
3. **Do not** use `read_file_content` (truncates the Week tab at ~100 rows) or
   xlsx export (too large — kills the connector session). The path that works:
   - `download_file_content` with `exportMimeType: application/zip`
     (zipped HTML of all tabs)
   - The oversized result is saved to a tool-results file on disk
   - Decode: JSON → `content` field → base64 decode → unzip — the raw log is
     `Week.html` (~36 MB)
4. Parse `Week.html` with a Python HTML table parser (stdlib `html.parser`).
   Header row: Date, Start Time, Contact Name/Rei Link, Contact no., Lead
   Source, Campaign, Inbound/Outbound, Caller Category, Lead Type, Call
   Disposition, Notes, durations, Agent Name, …, Week, Month, Hour.

## Step 2 — Validate before computing

- Row-count sanity: the full log is ~15,000+ rows back to Mar 2025; filter the
  report window on the `Month` column.
- Dates come in two formats (`Mar 17, 2025` and `5/1/2026`) — parse both.
- Strip the zero-width character (`​`) the sheet uses in empty cells.
- Cross-check the window's total calls against the dashboard tile — small
  diffs expected (the dashboard's formulas cap their scan ranges); the raw
  re-count wins and the diff gets footnoted.

## Step 3 — Classify and compute

- Apply the **lead source canon and Direct Mail split** exactly as written in
  `call-log-reporting-rules.md`: canonical CRM names; Letters and Postcard by
  campaign name; everything else under the Direct Mail source = **Checks**
  (per Seth + the DM team, 2026-07-22).
- **All lead metrics = unique sellers** (dedupe by phone number, contact-name
  fallback). Calls / inbound / outbound stay call counts.
- Compute per source, per month, and per agent: calls, in/out, interested
  (New Interested Lead tag, unique), appointments booked (Appointment Booked
  (H) + Confirmed Appointment, unique), not interested, invalid, unresponsive,
  do-not-mail, acquired + pipeline stages (Under Contract, Opened Escrow,
  Offer Accepted, Contract Sent).
- **Cohort booking rates** for any trend claim (cohort = month first tagged
  interested → booked ever in window). Monthly booked÷interested rates are
  inflated by sellers who book without an interested tag — don't hang a
  recommendation on them.
- **Cross-foot every table before publishing.** Agent rows must sum to total
  calls exactly; where inbound+outbound ≠ total (missed / no-direction calls),
  footnote which agents hold the gap. Juan catches numbers that don't foot.

## Step 4 — Update the report artifact

- Edit the existing report HTML and republish to the **same artifact URL**
  (it redeploys in place). Sections: masthead dates → exec summary (Issue /
  Impact / Options / Recommendation / Decision Needed) → KPI tiles → monthly
  table + stacked chart → channel verdicts (Scale / Test / Fix / Flag pills)
  → donuts + inbound/outbound chart → source table (columns per Seth: Calls ·
  Interested leads · Appointments booked · Not interested · Invalid ·
  Unresponsive · Do not mail, + Acquired when > 0) → agent scorecard → hourly
  chart → methodology notes.
- Every definition change gets a **dated** methodology note ("per Seth, Jul 22").

## Step 5 — Render the PDF

1. Wrap the artifact HTML in a standalone page and append print CSS:
   - `@page { size: letter landscape; margin: 0.35in }`
   - `html { zoom: 0.80 }` (fits the 1180px layout on landscape letter)
   - `break-inside: avoid` on `.card`/`.masthead`; `break-after: avoid` on
     `.section-title`; `break-inside: avoid` on `tr`
   - **Un-scroll tables for print:** `table { min-width: 0 !important }`,
     `th, td { white-space: normal !important }`, `overflow: visible` on the
     scroll wrappers — otherwise wide columns are cut off at the page edge
2. Render with Playwright + pre-installed Chromium
   (`executable_path='/opt/pw-browsers/chromium'`), `color_scheme='light'`,
   ~1.5 s wait for the JS charts to draw, then
   `page.pdf(format='Letter', landscape=True, print_background=True,
   margin=0.35in all around)`.
3. **Visually verify before sending:** rasterize pages (pypdfium2 + pillow;
   `pip install pypdfium2 pillow` if missing) and check every table foots
   on-page, no clipped columns, charts rendered. This caught real problems
   twice during the first build — never skip it.
4. Deliver as `Campaign-Performance-Report-<window>.pdf`.

## Step 6 — Close the loop

Any new rule learned during review (a classification decision, a definition
change) goes into `call-log-reporting-rules.md` **the same day**, committed
and pushed — so the next report doesn't re-ask questions Seth has already
answered.
