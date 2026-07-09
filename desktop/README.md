# THB Direct Mail — Desktop App

A Windows desktop app (Electron) that bundles three things in one window:

1. **Dashboard** — the Direct Mail KPI dashboard (`thb_kpi_dashboard.html`).
2. **Integration bridge** — the REI Blackbook → Monday.com → QuickBooks webhook
   service, running locally with Start/Stop and a live log.
3. **Settings** — one screen for all credentials (QuickBooks app, Monday token,
   webhook secret). Stored **only** on the local machine in `userData/config.json`.

Plus a **↻ Refresh data** button that pulls direct-mail spend from QuickBooks and
mail production from Monday.com on demand.

## Build the `.exe`

> ⚠️ The `.exe` was **not** built in the authoring environment — its network policy
> blocks the Electron binary download from GitHub releases (HTTP 403). Build it on
> any machine (Windows recommended) with normal internet access:

```bash
cd desktop
npm install          # downloads Electron (needs GitHub release access)
npm run dist         # produces dist/THB-DirectMail-Setup.exe + a portable .exe
```

Output lands in `desktop/dist/`:
- `THB-DirectMail-Setup.exe` — installer
- `THB-DirectMail-portable.exe` — single-file portable app

To run it unpackaged during development: `npm start`.

Cross-building a Windows `.exe` from macOS/Linux also works (electron-builder uses
wine + mono), but building on Windows is the most reliable.

## First-run setup

1. Open **Settings** and fill in:
   - **QuickBooks**: Client ID, Client Secret, Refresh Token, Realm (company) ID —
     from a QuickBooks developer app (developer.intuit.com, Accounting scope).
   - **Monday.com**: personal API token (Monday avatar → Developers → My access tokens).
   - **Webhook secret**: any long random string.
   The Monday board IDs are pre-filled for the Property Leads and Red Stone boards.
2. Click **Save settings**.
3. Go to **Integration Bridge** → **Start**. Point your REI Blackbook workflow
   webhook and Monday board webhook at the URLs shown (append `?secret=<your secret>`).
   To receive webhooks from the internet, expose the local port with a tunnel
   (ngrok, Cloudflare Tunnel, etc.).

## Notes / limitations

- **REI Blackbook has no public API.** Its lead figures are gathered via the
  browser-automation scripts in the repo, not inside this app; the dashboard shows
  the last-known REI numbers. QuickBooks + Monday refresh live from the button.
- **QuickBooks deal booking** from a Monday closed-stage event is stubbed until a
  QuickBooks developer app is connected (it logs the event); wire it up in
  `bridge.cjs` once the QBO app is live.
- Shares the bridge logic with the hosted service in `../src/` (kept in sync by hand;
  `src/app.js` is the importable Express app for server deployments).
