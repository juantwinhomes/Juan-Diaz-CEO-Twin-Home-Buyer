# THB Acquisitions Desk

The acquisitions team's shared work desk: **one dashboard, one Apps Script backend, one Master Google Sheet, one URL.**
Migrated from the single-file prototype (`prototype/`) per `docs/BUILD_SPEC.md`.

```
Browser (Index/Styles/Scripts.html)  ──google.script.run──▶  Apps Script (src/*.gs)  ──▶  Master Google Sheet (12 tabs)
```

| Folder | Contents |
|---|---|
| `src/` | Apps Script project: `ReportService` (Dashboards), `Code` (doGet/bootstrap), `Auth`, `Database`, `LeadService`, `ActivityService`, `AppointmentService`, `DashboardService`, `MetricsService`, `ToolService`, `AdminService`, `BackupService`, `Setup`, `Tests`, `Utils`, `Config`, and the three HTML files |
| `test/` | `gas-mock.js` (in-memory Apps Script emulation), `run-backend-tests.js`, `e2e-server.js` + `e2e.js` (Playwright) |
| `scripts/` | `privatize.js` (hides internal functions from `google.script.run`), `build_xlsx_template.py`, `deploy.sh` |
| `docs/` | `BUILD_SPEC.md`, `MIGRATION_MAP.md`, `public-functions.json` (the 56-function server API), database template `.xlsx`, screenshots |

Design: `docs/design/` holds the two mockups the v1.1 frontend was built from. Deploying: see **[DEPLOY.md](DEPLOY.md)**. Testing: `npm test && npm run test:e2e`.

Design rules the code enforces: identity from the Google account only; targeted single-row writes under
`LockService`; `version` check on every lead update (`CONFLICT_RECORD_CHANGED`); append-only LEAD_ACTIVITY;
archive never delete; business date in `America/Los_Angeles` (SETTINGS) for every "today"; server-side validation
on every input; every server response is `{ok, data|code, message}`.
