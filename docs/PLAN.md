# Kristine AI Controller Academy: implementation plan

Source: Juan Diaz's build brief and operating playbook (September 26, 2026).

## Scope of this MVP

A working internal web app that runs on one computer with **synthetic data only**. The app is a training and review layer. QuickBooks Online stays the system of record: the app never posts to QuickBooks, pays a bill, changes a vendor, or connects to a bank, payroll or payment system.

## Stack

- **Node.js 22.5+**, no npm packages. Built-in `node:http` for the server and `node:sqlite` for storage. `npm install` is not needed.
- A single-page front end in plain HTML, CSS and JavaScript (no build step).
- Tests use the built-in `node:test` runner. Screenshots use Playwright.
- Money is stored as integer cents. All report math is plain deterministic code in `server/calc/`.

## Build order

1. **Data model** (`server/schema.sql`): entities, accounts, bank accounts, projects, budgets, commitments, vendors, source documents, import batches, transactions, bank statement lines, loans, draws, issues, close periods and tasks, approvals, payments, journal-entry proposals, lesson attempts, sign-offs, mistakes, policies, users, report versions, audit events. Entity IDs (`ENT-…`) and project IDs (`PRJ-…`) are separate.
2. **Roles and controls** (`server/auth.js`): learner, preparer, reviewer, executive and admin. Separation of duties: nobody approves what they requested or prepared, and a learner can't approve anything.
3. **Audit trail** (`server/audit.js`): every import, mapping change, issue disposition, approval and sign-off.
4. **Importer** (`server/import/`): CSV upload with configurable column mapping, saved original file, SHA-256 hash, row references, control total and row count checks, duplicate-file rejection, duplicate-invoice detection, and a preview screen before commit. PDFs are stored as source documents with page counts. Text extraction is deferred.
5. **Calculations** (`server/calc/`): bank reconciliation, budget variance, project profit bridge, AP/AR aging, 13-week cash forecast, intercompany rollforward, lender draw reconciliation.
6. **Exception rules** (`server/rules/`): duplicate invoice, wrong entity, missing project, missing receipt, missing approval, unmatched bank item, unrecorded draw, draw timing, cost overrun, negative cash week, stale receivable, vendor bank change, intercompany mismatch.
7. **Close and reports**: per-entity checklist with preparer, reviewer, timestamps, evidence and sign-off. Reports are saved as versions and stay "draft" until reviewed.
8. **Executive brief**: eight questions plus three decisions. Every number carries a citation, or the brief says "unknown". Shows last refresh, completeness and draft/reviewed status.
9. **Learn, Coach and Scorecard**: six modules from the 12-week curriculum, loaded from editable JSON files. The learner writes her reasoning before answers are revealed, and records her confidence. Includes reviewer sign-off, a skills matrix and a mistake log.
10. **AI adapters** (`server/ai/`): a rules-based tutor and brief drafter by default. An optional Claude adapter runs only when an admin marks it approved *and* an API key is set in the environment. It receives a minimized evidence bundle and no write access, and its numbers are checked against citations.
11. **Setup wizard**: asks for the real entity list, ledger, exports, project IDs, approval owners, CPA reviewer and permitted data sources. Missing answers show as warnings and don't block training.
12. **Connectors**: read-only interface definitions only (QuickBooks Online, bank). Nothing is implemented or connected.

## Acceptance checklist

Pilot checks from the brief, each covered by an automated test in `app/test/` (all passing: `npm test`, 25 tests):

- [x] Demo import catches a duplicate invoice and a wrong-entity expense, and keeps links to the source file and row.
- [x] Reconciliation finds the unmatched bank items and can't pass while any difference or item is unexplained.
- [x] Project report ties to transaction detail and labels each cost as actual, committed or forecast.
- [x] A learner can't approve her own payment, journal entry or close.
- [x] The brief won't state a number without a source, and it labels stale or incomplete data.
- [x] Juan sees the top three issues on the brief with owner, amount, evidence and action.
- [x] A reviewer can reproduce the calculations from source rows and sign off a close.

Additional checks:

- [x] Importing the same file twice is rejected.
- [x] A control-total mismatch or an unbalanced file blocks commit.
- [x] Every import, disposition and sign-off writes an audit event.
- [x] Nothing in the AI path can post entries, approve, change vendors or close a period.
- [x] Text inside an uploaded document is treated as data, never as instructions.
- [x] The app runs with no AI key.

## Not in this MVP

- Live QuickBooks Online, bank, payroll or payment connections
- Real login (the MVP uses a demo user picker; production needs SSO or passwords)
- PDF text extraction or OCR
- Multi-user hosting, encryption at rest, and backups beyond the manual copy described in the README
