# Kristine AI Controller Academy

An internal web app that trains Kristine to run a reliable month-end close and acts as the review layer on top of QuickBooks Online.

- **QuickBooks Online stays the system of record.** This app never posts entries, pays bills, changes vendors or connects to a bank.
- **It ships with synthetic data only.** Every amount, vendor and address in the demo is made up. The four entity names come from Juan's brief and are marked *unverified* until someone confirms them in Setup.
- **AI is optional.** Without an approved AI key, a rules-based tutor and brief drafter run instead, and the app is fully usable.

## Sections

| Section | What it does |
|---|---|
| 1 · Learn | Six modules from the 12-week plan. Each has a lesson, QuickBooks Online steps, a practice problem, a scored quiz, a real task, a rubric and a reviewer sign-off. Answers stay hidden until Kristine writes her reasoning. |
| 2 · Workbench | CSV import with column mapping, control totals, a duplicate-file check and a preview screen before commit. Originals are stored unchanged with their SHA-256 fingerprint, and every record links back to its file and line. PDFs are stored with a page count. |
| 3 · Exception queue | Duplicate invoices, wrong entity, missing project, missing receipt, missing approval, unmatched bank items, unrecorded or short-funded draws, loan mismatches, cost overruns, negative cash weeks, stale receivables, vendor bank changes, intercompany mismatches and stale data. Each item has evidence, severity, a next step, an owner, a due date and a disposition. |
| 4 · Close & reports | Per-entity close checklist with preparer, reviewer, evidence, automatic checks and sign-off. Reports: bank reconciliation, project budget vs actual and profit bridge, A/P and A/R aging, 13-week cash forecast, debt and draws, intercompany rollforward. Reports can be saved as versions and stay drafts until reviewed. |
| Juan's brief | Cash today, lowest cash in 13 weeks, money owed to us, bills due, project overruns, lender draws, open exceptions, top three issues and three decisions. Every number cites its source or shows "unknown". The brief also shows last refresh, data completeness and draft/reviewed status. |
| Approvals | Payment requests, vendor bank-change verification, journal-entry proposals and the approval log. |
| 5 · Coach & scorecard | Skills matrix, promotion gates, confidence vs accuracy, mistake log with corrected procedures, work quality, Juan's weekly progress report and the coaching prompt library. |
| Setup / Admin | Setup wizard (entity list, QuickBooks plan, exports, approvers, CPA, data sources, AI tools, pilot), users and roles, policy register, thresholds, AI approval, connectors (not connected), audit trail and backup. |

## Run it

Requires **Node.js 22.5 or newer**. There's nothing to install: the app uses Node's built-in web server and SQLite.

```bash
cd app
npm start            # http://127.0.0.1:4400 — seeds the synthetic data on first run
npm test             # 25 automated checks, including every pilot acceptance check
npm run reset        # delete the local database and start again from the synthetic seed
npm run screenshots  # with the server running; needs Playwright
```

Sign in by picking a demo user:

| User | Roles | Can |
|---|---|---|
| Kristine | learner, preparer | Learn, import, work exceptions, prepare reconciliations and close steps, request payments, propose journal entries |
| CPA Reviewer (placeholder) | reviewer | Review and approve reconciliations, close steps, journal entries, reports and training sign-offs |
| Juan Diaz | executive | Read the brief, approve payments, verify vendor bank changes |
| Admin | admin | Setup, users, settings, policies, backup |

Nobody can approve something they requested or prepared. A learner can't approve anything, even if she also holds another role.

### Walk through the demo

1. As **Kristine**, open the Exception queue and click into the duplicate Sample Drywall bill. Click a source link to see the exact CSV line.
2. Open **Bank reconciliation**. The difference is $0.00, but the account can't pass: four items are unexplained, and two bank items aren't in the books yet.
3. In **Workbench**, import `samples/synthetic-thb-ledger-adjustments-2026-09.csv` as a ledger for Twin Home Buyer. This records the draw and the bank fee. Then explain the two outstanding items, and the reconciliation passes. Mark it prepared.
4. As the **CPA Reviewer**, review the reconciliation, then review close steps.
5. As **Juan**, open the brief. Try to approve the Sample Electric payment: it's blocked until someone verifies the bank change by call-back.

## AI

The AI path gets a minimized evidence bundle, never raw files. It has no write access, and every number it writes must cite an evidence item whose value contains that number. Sentences that fail the check are removed and listed. Text inside documents is treated as data: the sample ledger contains an embedded instruction, and a test proves it changes nothing.

To turn on Claude:

1. Check the provider's business data terms and get approval.
2. Run `npm install` in `app/` (this installs the optional `@anthropic-ai/sdk`).
3. Set `ANTHROPIC_API_KEY` in the environment. Never put it in code or in the database.
4. As Admin, tick **AI provider approved** in Admin.

The default model is `claude-opus-5-5`; override it with `KCA_AI_MODEL`. Both steps 3 and 4 are required; either one alone keeps the rules-based provider.

## Access

- The server listens on `127.0.0.1` only. Set `HOST` to expose it on a network, and only do that behind HTTPS and real sign-in.
- **The demo user picker is not authentication.** Before any real company data goes in, replace `login()` in `server/auth.js` with SSO or password sign-in. The permission and separation-of-duties checks stay the same.
- Security headers: a strict Content-Security-Policy (no inline scripts, no third-party hosts), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`.

## Backup

Everything lives in `app/data/`:

- `academy.db` holds the SQLite database: staging data, issues, approvals, training, audit trail.
- `documents/` holds the original uploaded files. They are written once, read-only, and named by document ID.

To back up:

- **From the app:** Admin → **Download a backup**. This gives you a consistent copy of the database; copy `data/documents/` alongside it.
- **From the command line:** stop the server, then copy the whole `data/` folder.

Keep backups encrypted and somewhere with the same access controls as the accounting files. To restore, stop the server and put the folder back.

## Data retention

- Originals, import manifests and the audit trail are never edited or deleted by the app.
- The demo keeps everything. Before live use, have the CPA set a retention period for source documents and workpapers (commonly seven years for tax support, but confirm it). Then record the decision in the policy register and schedule purging of `data/` to match.
- Don't store bank account numbers, SSNs or full card numbers here. The AI redactor strips long digit strings and emails from evidence as a second line of defense, but it is not a substitute for keeping that data out.

## Add the next lesson

Lessons are JSON files in `content/lessons/`, loaded in filename order. To add one, copy `m6.json` to `m7.json` and edit these fields:

| Field | Content |
|---|---|
| `id`, `weeks`, `title`, `goal`, `skills` | The basics |
| `concept_card` | The 3-minute card shown from the work queue |
| `lesson_html` | Trusted HTML written by the team. Only admins should edit these files. |
| `rule` | The rule to remember |
| `qbo_steps` | QuickBooks Online steps |
| `scenario` | `text_html`, `ask`, `answer_cents` (the answer in cents), `explain`, `followup` |
| `quiz` | Items with `q`, `options`, `answer` (0-based index), `why`, `policy` (a policy register ID) and an optional `followup` |
| `task`, `rubric` | The hands-on task and what the reviewer checks |

Restart the server. The loader checks for required fields and valid answer indexes, and `npm test` verifies that answers stay hidden. To link exceptions to the new lesson, add their types to `LESSON_FOR` in `server/rules/exceptions.js`.

## Add a connector (later phase)

`server/connectors/index.js` defines read-only interfaces for a ledger (QuickBooks Online) and a bank. To build a real one:

1. Implement the interface with **read-only** scopes. No connector may create, edit or delete ledger records, vendors, payments or bank details.
2. Load credentials from environment variables or a secrets manager.
3. Have every pull produce a CSV-shaped export and send it through `importer.preview()` → review → `importer.commit()`. It gets the same stored original, hash, row references, validation and audit trail as a manual upload.
4. Add it to `CONNECTORS` and write tests with recorded, synthetic responses.

## Project layout

```
app/
  server/        index.js (start), app.js (HTTP API), schema.sql, seed.js, auth.js, workflow.js, audit.js
    import/      importer: mapping, validation, preview, commit
    calc/        reconcile, project (budget/profit), aging, forecast, intercompany, draws — pure functions
    reports/     data loaders with source references, executive brief
    rules/       exception rules
    ai/          rules-based and Claude adapters, evidence minimizer, citation checker
    connectors/  read-only interfaces (not connected)
  public/        front end (index.html, app.js, styles.css)
  content/lessons/  editable lesson files
  samples/       synthetic CSV exports
  test/          acceptance, unit and HTTP tests
  screenshots/   screens captured from the synthetic demo
```

## What is not done yet

- Real sign-in, HTTPS and multi-user hosting
- PDF text extraction and OCR
- Live QuickBooks Online or bank connections
- Encryption at rest
- The real entity map, chart of accounts, approval matrix and CPA policy decisions. These are placeholders until answered in Setup.

Until those are verified, the numbers in this app are training numbers, not company financials.
