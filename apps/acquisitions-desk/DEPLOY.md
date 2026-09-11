# THB Acquisitions Desk — Deployment Guide

One shared dashboard · one Apps Script backend · one Master Google Sheet · one production `/exec` URL.

Everything below is done once by the deploying administrator (Seth, `seth@twinhomebuyer.com`, or Juan). It takes
about 15 minutes. Afterwards, updates are one command (`npm run deploy`) or a copy-paste.

## What already exists

| Piece | Where | Status |
|---|---|---|
| Master database (Google Sheet) | **THB Acquisitions Desk — Production Database** — `https://docs.google.com/spreadsheets/d/1EfBWdQRvJ4NB7kEwGziq7Oo0hr0n3GkWDAI8zeko4nE/edit` (Seth's My Drive) | Created 2026-09-11 with all 12 tabs, exact headers, seeded SETTINGS / USERS / TOOL_INVENTORY |
| Backup folder | **THB Acquisitions Desk Backups** — `https://drive.google.com/drive/folders/1bTEM4KsUPjxFtdTfFjr--ZZh7rWjMLNm` | Created, empty until the first backup runs |
| Backend + frontend code | `src/` (14 `.gs` files + 3 `.html`) | Complete, tested under emulation (see Testing) |
| Template of the database | `docs/THB_Acquisitions_Desk_Production_Database_TEMPLATE.xlsx` | Regenerate with `npm run template` |

The Apps Script project itself cannot be created from this repository: creating it and authorizing it is a Google sign-in
step only a human on the company account can do. That is steps 1–4 below.

## Step 1 — Create the Apps Script project (2 min)

1. Signed in as the company account that should own production (recommended: `juan@twinhomebuyer.com` or a
   dedicated `systems@twinhomebuyer.com`; Seth's account is fine to start), open https://script.google.com/home/start.
2. **New project** → rename it **THB Acquisitions Desk**.
3. Project settings (gear icon) → tick **Show "appsscript.json" manifest file in editor** and copy the **Script ID**.

## Step 2 — Put the code in the project

**Option A — clasp (recommended, repeatable):** on a computer with Node 18+:

```bash
cd apps/acquisitions-desk
npx @google/clasp@3 login          # opens a browser; sign in with the SAME account as step 1
cp .clasp.json.example .clasp.json # paste the Script ID from step 1 into it
npx @google/clasp@3 push --force   # uploads src/ (all .gs + .html + appsscript.json)
```

**Option B — copy-paste (no tooling):** in the Apps Script editor create one file per file in `src/` with the same
name (`Code.gs` → "Code", `Index.html` → HTML file "Index", etc.) and paste the contents. Replace the manifest
`appsscript.json` with `src/appsscript.json`. 14 script files + 3 HTML files.

## Step 3 — Connect the database and initialize (3 min)

In the editor, pick the function in the toolbar dropdown and press **Run**. The first run shows Google's
authorization screen — approve it (Sheets, Drive, email identity, triggers).

1. `configureDatabase` cannot take an argument from the toolbar, so open `Setup.gs`, temporarily add at the bottom:
   ```js
   function setupProd() { return configureDatabase('1EfBWdQRvJ4NB7kEwGziq7Oo0hr0n3GkWDAI8zeko4nE'); }
   ```
   run **setupProd**, then delete that helper. (Or run `setupDatabase` with no ID to create a brand-new sheet instead.)
   It verifies every tab and header, seeds anything missing, sets the sheet timezone, and protects every tab so only
   the owner (and therefore the app) can edit cells. Execution log shows the report.
2. Run **installTriggers** → installs the daily 03:00 backup (`runDailyBackup`).
3. Run **bootstrapAdmin** if the account you are using is not already in USERS (Seth, Juan and Cherry already are).
4. Run **runAllTests** (in `Tests.gs`; the function dropdown only lists functions of the open file) → creates
   `TEST - …` leads, runs the 17-test suite against the real sheet, archives the test leads and blanks the test
   numbers for today. Expect `"failed": 0` in the execution log. (Optional but recommended once.)
   If a run ever leaves two DAILY_METRICS rows for one date, run **dedupeDailyMetrics** (in `Setup.gs`) once.
5. Run **createDatabaseBackup** once and confirm a copy appears in the Backups folder and in BACKUP_LOG.

## Step 4 — Deploy the web app (2 min)

**Deploy → New deployment → type: Web app**

| Setting | Value | Why |
|---|---|---|
| Execute as | **Me** (the owner) | The app writes to the sheet with the owner's access; reps never need Editor rights on the raw database |
| Who has access | **Anyone within twinhomebuyer.com** (your Workspace domain) | Nobody outside the company can open it; Google identifies each employee |

Copy the **Web app URL** — it ends in `/exec`. **That is the one production URL.** Share it with the team.
The `/dev` URL is for the owner only and always runs the latest saved code; never hand it out.

With clasp: `DEPLOYMENT_ID=<id> npm run deploy` re-pushes and updates the same deployment (same URL). Bump
`APP_VERSION` in `src/Config.gs` whenever production changes; it shows in the footer and in SETTINGS.

## Step 5 — Identity test (mandatory, 3 min)

Apps Script identity depends on the deployment settings above, so test it, don't assume it:

1. **You (owner):** open the `/exec` URL. Masthead shows your name and role. Post a note on any lead; LEAD_ACTIVITY
   row shows your email.
2. **A normal employee (e.g. Cherry, `cherry@twinhomebuyer.com`):** she opens the same URL on her own computer.
   She must see her own name in "On the desk" — not yours. She logs an attempt; the row in LEAD_ACTIVITY carries
   `user_email = cherry@twinhomebuyer.com`, and Today → "Who worked the board today" shows Cherry.
3. **An account not in USERS** (any other company account): opens the URL → "ACCESS DENIED" page, no data.
   AUDIT_LOG gets an `ACCESS_DENIED` row with that email.
4. **A personal Gmail:** Google itself blocks it before the app loads (domain restriction).

If step 2 shows the owner's name instead of the employee's, the deployment is set to anonymous/anyone access.
Redeploy with "Anyone within <domain>". The code refuses to guess: with no reliable email it shows
`IDENTITY UNAVAILABLE` rather than letting anyone pick a name.

**Team members outside the twinhomebuyer.com domain** (e.g. `@equitytrackph.com` accounts) cannot pass a
domain-restricted deployment. Options: give them `@twinhomebuyer.com` accounts (cleanest), or have the Workspace
admin add `equitytrackph.com` as a secondary domain. Do not switch the deployment to "Anyone with a Google
account" — identity is then not reliable and the app will refuse everyone.

## Step 6 — Add the team's emails (Admin tab)

USERS was seeded with the people named in the build spec. Only emails known from company records were entered:

| Name | Email | Role | Login |
|---|---|---|---|
| Juan Diaz | juan@twinhomebuyer.com | ADMIN | active |
| Seth | seth@twinhomebuyer.com | ADMIN | active |
| Cherry | cherry@twinhomebuyer.com | MANAGER | active |
| David, Diego, Era, Barbie, Thea | **needs email** | REP | inactive until set |
| Jonathan, Bryan | **needs email** | TECHNICAL | inactive until set |

Open the app → **Admin** tab → type each person's company Google email → they become active. (Or edit USERS
column C directly as owner.) No email is ever invented by the system.

## Roles

| | ADMIN | MANAGER | REP | TECHNICAL |
|---|---|---|---|---|
| See board, Today, Numbers, Tools | ✓ | ✓ | ✓ | ✓ |
| Work leads (status, notes, attempts, next action, flags, underwriting, appointments) | ✓ | ✓ | ✓ | – |
| Add / import leads, archive | ✓ | ✓ | ✓ | – |
| Assign / reassign anyone; restore archived | ✓ | ✓ | claim only | – |
| Management view (who worked, what changed), audit log | ✓ | ✓ | – | – |
| Targets (deal target, budget) | ✓ | ✓ | – | – |
| Tools: edit inventory, training, pillars | ✓ | ✓ | run only | ✓ |
| Users, settings (MAO %, timezone, refresh), backups | ✓ | – | – | – |
| Permanently delete anything | nobody | | | |

## Development vs production

- Set `THB_ENV=development` with `setEnvironment('development')` on a second Apps Script project pointed at a copy of
  the sheet whose name contains "DEV". The footer shows the environment; `resetDevelopmentDatabase()` only works there.
- Locally: `npm run dev` serves the exact same frontend against an in-memory emulation at
  `http://127.0.0.1:8787/?as=seth@twinhomebuyer.com` (any USERS email; unknown emails see the denied page).

## Testing

```bash
npm run test        # backend under Node emulation of Apps Script (setup, identity, roles, conflict, 8,000-lead scale…)
npm run test:e2e    # Chromium drives the real frontend with two signed-in users (Playwright)
```
Inside Apps Script: `runAllTests()` (owner only) runs the same 17-test suite against the real sheet.

## Operations

- **Backups:** daily 03:00 copy to the Backups folder + BACKUP_LOG row; manual from Admin tab. Optional
  `backup_retention_days` setting trashes older copies (default keep all).
- **Errors:** server exceptions land in ERROR_LOG with function, user and entity; the user sees "Could not save".
- **Audit:** LOGIN, ACCESS_DENIED, LEAD_CREATED, BULK_IMPORT, ARCHIVED, RESTORED, SETTING_CHANGED, USER_*, TOOL_*,
  BACKUP_CREATED, TRIGGER_INSTALLED, METRICS_SAVED.
- **Quotas:** the Live board returns at most 200 records per page; archived/everything/search are paginated
  server-side. LEAD_ACTIVITY is read once per request. Consider archiving LEAD_ACTIVITY yearly once it passes ~50k rows.
