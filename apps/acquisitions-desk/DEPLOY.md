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

## Updating production to v1.1.0 (the redesigned desk)

v1.1.0 is a frontend redesign plus a new Dashboards tab and an "Offer sent" action. The database schema is unchanged;
no setup function needs to run again. From `apps/acquisitions-desk` on your computer:

```powershell
git pull
npx.cmd @google/clasp@3 push --force
```

Then in the Apps Script editor: **Deploy → Manage deployments → pencil icon on the live deployment → Version: New
version → description `v1.1.0` → Deploy.** The `/exec` URL stays the same; everyone gets the new desk on their next
load. (Creating a *new* deployment instead would mint a second URL — avoid that.)

Optional: run `runAllTests` once more (Tests.gs) — it now includes a dashboards check — and expect `"failed": 0`.

What changed for the team: the five tabs became a left rail (Today, Board, Dashboards, Tools, Plan, plus Admin for
admins); Numbers moved into Dashboards → Pace and Marketing; each property opens in a side drawer instead of an
inline card; the work queue is one list with tabs; identity, permissions, data and URL are all unchanged.

## Updating to v1.1.1 (import deals that already exist)

Same three steps as above (`git pull`, `clasp push --force`, New version `v1.1.1`). No database change.

What changed: **Add leads** has an "Add them as" picker. Leave it on New for fresh leads. Pick **Under contract** or
**Closed** to load deals that already exist (signed contracts, acquired properties) so they show on the board without
a fake status-change trail. Closed properties get their own **Closed** tab on the board; Archived is now only the
dead leads. Prices (ARV, repairs, asking, offer) are filled in on each property afterwards.

## Updating to v1.2.1 (sources, exit strategy, disposition, purchase price, six spend channels)

This release adds columns, so there is one extra step. From `apps/acquisitions-desk`:

```powershell
git pull
npx.cmd @google/clasp@3 push --force
```

Then in the Apps Script editor pick **`setupDatabase`** in the function dropdown and **Run** it once. It only appends
the four new columns to the existing sheets (`LEADS`: `exit_strategy`, `disposition`; `DAILY_METRICS`: `seo_spend`,
`mail_spend`; `LEADS` also gets `purchase_price`). Nothing is moved, re-seeded or deleted; the log says
`added columns: …` for those two tabs and `ok` for the rest. Skip this and the desk shows "Sheet LEADS is missing column exit_strategy" until you run it.

Then **Deploy → Manage deployments → pencil → New version `v1.2.1` → Deploy.** Same `/exec` URL.

The push also adds one Google permission (read the Workspace directory) so the desk can show each person's Google
profile photo in the rail. The first time you run `setupDatabase` after the push, Google asks you to authorize again;
accept it. People without a profile photo, or accounts outside the Workspace directory, keep their initial.

What changed for the team:
- **Profile photo** from your Google account in the bottom-left of the rail.
- **Source** is now a fixed list: PPC, TV, SEO, Motivated Leads, Property Leads, DM Postcard, DM Letters, DM Checks,
  MLS/Redfin, Realtor, Other. REI BlackBook spellings ("PPC LEAD", "TV Commercial", "PPL", "MLS Lead") are recognized
  on paste and on edit.
- Each source rolls up into one of six **spend channels** on the day log: TV, PPC, SEO, Motivated Leads, Direct mail
  (postcards + letters + checks), Other. Cost per lead is computed per channel; Dashboards → Marketing also lists
  leads by source.
- Every property has an **Exit strategy** (Wholesale, Wholetail, Fix & Flip, Wholetail / Flip, Hold) and, once
  acquired, a **Disposition** (Under construction, Listed, Listed - pending, Sold, Wholesaled). Both live in the
  property drawer under Underwriting → Deal. Disposition shows on the Closed tab in place of offer room.
- **Purchase price** on every property, under Underwriting next to the offer: what we actually pay, as opposed to what
  we offered. On the Closed tab it replaces offer room on the row.

## Updating to v1.2.2 (typing fix)

No database change: `git pull`, `clasp push --force`, then New version `v1.2.2` → Deploy.

Fixes a real bug. While someone was typing a next action, a save on another field rebuilt the property card, and the
browser committed whatever was in the half-finished sentence. One property picked up twelve versions of the same
line. The card now waits until the person leaves the field, so only a deliberate commit (Tab, Enter, or clicking away)
saves. No data was lost by the bug; the log just collected partial entries.

## Updating to v1.3.0 (speed)

No database change: `git pull`, `clasp push --force`, then New version `v1.3.0` → Deploy.

The desk asks the server for far less. Nothing about the data, the sheets or how anything works changed.

| What you do | Server calls before | After |
|---|---|---|
| Open the desk | 5 | 1 |
| Today tab | 2 | 1 |
| Return to a tab you already opened | 1, and you wait | 1, in the background, screen is already there |

Spreadsheet cells read, measured on 2,000 properties with 12,000 activity entries:

| Operation | Before | After |
|---|---|---|
| Board page | 204,189 | 78,042 |
| Today | 204,784 | 78,637 |
| Open a property | 146,232 | 20,085 |
| Any save (log attempt, status, note) | 146,231 | 2,072 |
| Dashboards, 8 weeks | 206,897 | 80,897 |

How: the activity log is append-only and in time order, so anything recent sits at the end. Summary views read the
newest 1,500 rows instead of the whole sheet, and fall back to a full read only when a report reaches further back
than that. A save returns the entries it just wrote rather than re-reading. The full history of a property is still
complete; it is fetched when you open the History tab.

One thing to know: settings and the user list are held for up to 5 minutes. Change them in the Admin tab and they
apply at once. Edit those two tabs directly in the spreadsheet and the desk can take up to 5 minutes to notice.

## Updating to v1.3.1 (the whole team, real dates on tools)

```powershell
git pull
npx.cmd @google/clasp@3 push --force
```

Then run **`setupDatabase`** once in the editor — that is what adds the missing people — and Deploy → Manage
deployments → pencil → New version `v1.3.1` → Deploy.

- **The rest of the team is on the list**: Genesis, Gian, Lawrence, Christine Joy, Mc, Jesery, Arjane, John,
  Kristine, Denzel, Darlyn, Leo and Marieflor, alongside the ten already there. They show up wherever people do,
  including the trained-on-a-tool chips. No emails were invented, so each is inactive and cannot sign in until an
  admin sets their real email in the Admin tab. Everyone new starts as TECHNICAL, which can see the board and run
  tools but cannot work properties; change the role when you set the email.
- Re-running `setupDatabase` now **tops up** missing people instead of skipping. It never edits a row that already
  exists, so a role, team or email you set by hand survives, and anyone you deactivated stays deactivated.
- **A name can only appear once.** Adding a second person with an existing name is refused, and a tool's trained list
  shows one chip per person, keeping the entry that can actually sign in.
- **Asked builder for steps** and **Handed to the user on** are date pickers now, not free text. Anything that is not
  a real date is refused rather than stored.

## Updating to v1.4.0 (closing date, sale price, and the whiteboard)

```powershell
git pull
npx.cmd @google/clasp@3 push --force
```

Run **`setupDatabase`** once (it appends `closing_date` and `sale_price` to LEADS), then Deploy → Manage
deployments → pencil → New version `v1.4.0` → Deploy.

Every property now has a **closing date** and a **sale price** alongside the purchase price, under Underwriting.
On the Closed tab a sold property shows its sale price on the row, with what it was bought for underneath.

### Putting the whiteboard into the desk

The office whiteboard photographed on 2026-09-12 is transcribed in `src/Whiteboard.gs`. In the Apps Script editor:

1. Run **`previewWhiteboardUpdate`**. It writes nothing and prints, per property, exactly what would change.
   Read the log before going further.
2. Run **`applyWhiteboardUpdate`**. It writes through the normal lead API, so every field change is version
   checked, recorded in LEAD_ACTIVITY and attributed to you. Running it again does nothing.

It matches each property by a distinctive part of its address. A row that matches nothing, or matches more than
one property, is reported and skipped rather than guessed at.

## Updating to v1.4.1 (money on the row, less noise)

No database change: `git pull`, `clasp push --force`, then New version `v1.4.1` → Deploy.

- A closed property shows **bought, sold and profit** on its row instead of one figure. Profit is the sale price less
  the purchase price and repairs; with no repairs entered the caption reads **spread**, because that is all it is.
  The same figure is in the drawer under Underwriting.
- A property under contract shows **what we are buying at and when it closes**, instead of "no ARV yet".
- Where a closed property is in disposition (under construction, listed pending, sold, wholesaled) sits under the
  word CLOSED, where the status belongs.
- The line under each address is now just **who, their number, where the lead came from, and who is on it**. The
  free-text note stays on live properties, where it is the reason to call, capped at 60 characters. On closed
  properties it was repeating the status and the source, so it is gone from the row and stays in the drawer.

## Updating to v1.4.2 (the drawer header, and an editable background note)

No database change: `git pull`, `clasp push --force`, then New version `v1.4.2` → Deploy.

The header line inside a property is now the same short line as the board row: seller, number, source, who is on it,
attempts. It was repeating the exit strategy, the disposition and the whole background note, all of which are fields
further down the same card.

**Background** is now an editable field on the Work tab. It holds the free text that came across on import (the
REI BlackBook tags, for example). Until now it was displayed but had no field, so a wrong or stale note could not be
corrected. Imported notes can contradict a source that has since been changed — read them once and fix what is wrong.

## Updating to v1.5.0 (seller email, and the tags out of the notes)

```powershell
git pull
npx.cmd @google/clasp@3 push --force
```

Run **`setupDatabase`** once (it appends `seller_email` to LEADS), then Deploy → Manage deployments → pencil →
New version `v1.5.0` → Deploy.

**Seller email** is a proper field now, on the Work tab under Background.

> **`setupDatabase` has to run before `applyTidyNotes`.** Without the new column the run stops, and because every
> public function returns failures as a value rather than throwing, the editor still reports "Execution completed".
> Since v1.5.1 the Execution log says `!! applyTidyNotes did NOT run` and names the fix, so an empty log means the
> run really did nothing rather than silently failing.

### Taking the REI BlackBook tags out of the Background notes

The properties imported from REI BlackBook carried their tag list in the Background note, which repeated the status
and the source back at you and, after the whiteboard run, sometimes contradicted them. In the Apps Script editor,
open the **TidyNotes** file and:

1. Run **`previewTidyNotes`**. It writes nothing and prints, per property, the note before and after.
2. Run **`applyTidyNotes`**. Running it again does nothing.

A note is read as a list of fragments separated by "·". An email moves into the Seller email field rather than being
thrown away. A fragment that is a known tag is dropped. Everything else is kept, because a person wrote it: notes
like "high equity", "liens noted" and "co-trustee is signing contact" survive.

## Updating to v1.6.0 (Tools page, and emptying the inventory)

No database change: `git pull`, `clasp push --force`, then New version `v1.6.0` → Deploy.

- **Log a build sits at the top of the Tools page**, as one row of four fields, so adding something does not mean
  scrolling past everything already there.
- **The inventory is two columns**, which halves the scroll. The status column was dropped from the row because the
  middle column already says the same thing; it is still in the tool's drawer.
- **Date asked** under "Who hands over what" is a date picker rather than free text.

### Emptying the tool inventory before entering real builds

The 22 tools that came with the desk were examples. In the Apps Script editor, open the **ClearTools** file and:

1. Run **`previewClearTools`**. It lists what would go and writes nothing.
2. Run **`clearTools`**. It takes a full backup of the database first and stops if that backup fails, then empties
   TOOL_INVENTORY, TOOL_TRAINING and TOOL_RUNS. The log names the backup; BACKUP_LOG and the Drive folder hold it.

This is the one place in the desk that deletes rather than archives, because a seeded example is not history. After
it runs, `setupDatabase` will not put the examples back, so the inventory stays as you leave it. Only an admin or a
manager can run it. Then add real builds with the form at the top of the Tools page.

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
