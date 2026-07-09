# Juan Diaz — CEO Twin Home Buyer

Working repo for Twin Home Buyer / Equity Track Inc. Holds the integration bridge
(REI Blackbook → Monday.com → QuickBooks) and CEO-facing KPI reports.

## Standing instruction: KPI dashboard on every update

Whenever Juan asks for an **update / status / refresh / recap / "how are we doing"**,
after answering, **regenerate and re-publish the combined KPI dashboard as an artifact**:

- File: `thb_kpi_dashboard.html` (combined QuickBooks + REI Blackbook + Monday.com).
- Publish with the **Artifact** tool using that exact file path so it keeps the same
  URL: https://claude.ai/code/artifact/8b3f705b-9e03-4e7e-b26d-3a4d2144ed88
- Pull fresh figures from QuickBooks, Monday.com, and REI Blackbook where practical
  before republishing; otherwise refresh the "generated" date and note the data vintage.
- Include the artifact link in the reply.

A `UserPromptSubmit` hook (`.claude/kpi-update-reminder.sh`) reinforces this each turn.

## Key artifacts / files

- `thb_kpi_dashboard.html` — combined KPI dashboard (all three systems).
- `directmail_report.html` — postcard-only channel performance report.
- `src/` — integration bridge (Express webhooks): REI Blackbook → Monday → QuickBooks.

## Data-source notes

- **QuickBooks**: live via the Intuit connector (Equity Track Inc). Reports are
  aggregate; transaction-level detail needs a QBO developer app (not the UI — it's
  CAPTCHA-gated).
- **REI Blackbook**: no public API; accessed via authenticated headless browser
  (Playwright, full Chromium at `/opt/pw-browsers/chromium`, `--ssl-version-max=tls1.2`
  through `$HTTPS_PROXY`). Contact query endpoint `/profitdial/contacts/query` paginates
  by page index (`offset` = page number, `limit` ≤ 100). Per-contact profile fields
  (Campaign, Lead Stage, etc.) come from `/profitdial/profiles/getProfileFieldValues`.
  Attribution caveats: the `Source` field is ~81% blank (adopted 2026) — read channel
  from **tags**; lead stage/disposition are blank on ~75% of leads.
- **Monday.com**: live via connector. Direct-mail costs live on the "Red Stone Upload"
  board in the "Equity Track Iriga – Operating System" workspace; deals on "Property Leads".
