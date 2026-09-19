# AI & Systems — Daily KPI Dashboard

A daily execution dashboard for a small AI / Systems team that builds internal apps,
automations, AI agents, integrations and operational systems.

It exists to answer one question every day: **did meaningful work actually move forward?**
Not whether anyone was busy.

```
Daily   — are we moving?
Weekly  — are we shipping?
Monthly — is what we're shipping valuable?
```

---

## Running it

Requires **Node.js 20 or newer**.

```bash
npm install     # installs the Postgres driver
npm run seed    # creates the tables and loads the demo data
npm start       # http://localhost:4000
```

There is no database to install. With no `DATABASE_URL` set the app runs an embedded
PostgreSQL stored under `data/`, so local development needs no setup. Set `DATABASE_URL`
and it uses that server instead — the same code either way, real Postgres both times.

| Command | What it does |
| --- | --- |
| `npm start` | Start the app on port 4000 (`PORT=8080 npm start` to change it) |
| `npm run dev` | Same, restarting on file changes |
| `npm run seed` | Seed demo data (skips if the database already has data) |
| `npm run reset` | Wipe everything and reseed |
| `npm run export` | Write the whole database to one JSON file under `backups/` |

The embedded database is single-process, so stop the server before running `seed`.

--- | --- |
| `npm start` | Start the app on port 4000 (`PORT=8080 npm start` to change it) |
| `npm run dev` | Same, restarting on file changes |
| `npm run seed` | Seed demo data (skips if the database already has data) |
| `npm run reset` | Wipe everything and reseed |

To start empty, use **Settings → Remove data → Everything**, or delete `data/pgdata`.

---

## Deploying it (shared database)

Running locally puts the database on one machine. To have the team working against the
same data, deploy it. **[deploy/DEPLOY.md](deploy/DEPLOY.md) is a step-by-step guide**
written for someone who has never deployed anything: Supabase for the database and
Netlify for the app, neither of which asks for a credit card.

The request handling lives in `server/handler.js`, which takes a plain request and
returns a plain response. `server/index.js` wraps it in a Node server for local use,
Docker and any VM; `netlify/functions/api.js` wraps the same module for Netlify's
serverless runtime. One set of routing, auth and KPI logic behind both.

### Environment variables

| Variable | Value | Why |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string | Without it the database is stored in the container and lost on redeploy |
| `APP_PASSWORD` | A shared team password | Without it the URL is public to anyone who finds it |
| `SESSION_SECRET` | A long random string | Keeps people signed in across restarts |

`APP_PASSWORD` is what turns the password gate on. Unset, the app stays open — which is
what you want locally and never what you want on a public URL.

### Anywhere else

`Dockerfile` builds the whole app and runs on Railway, Fly.io, a VPS or any container
host. No persistent disk is needed, because the data lives in Postgres.

```bash
docker build -t kpi-dashboard .
docker run -p 4000:4000 \
  -e DATABASE_URL='postgresql://…' \
  -e APP_PASSWORD='your-team-password' \
  -e SESSION_SECRET='a-long-random-string' \
  kpi-dashboard
```

### A free always-on server

`deploy/setup.sh` installs everything on a fresh Ubuntu VM in one command — useful if you
want to avoid the cold starts free container hosts have. See `deploy/DEPLOY.md`.

### Backups

`npm run export` writes every table to a single JSON file. Free database tiers keep little
backup history, so schedule this and keep the files somewhere safe.

---

## What it answers every day

| Question | Where |
| --- | --- |
| What did each person commit to today? | Today, Commitments |
| What did they actually complete? | Dashboard scorecards |
| Did each active project make real progress? | Dashboard, Projects |
| How much did completion % move today? | Every project bar: yesterday → today, +Δ |
| What is blocked? | Blockers, with business-day aging |
| What was deployed or launched? | "Deployed Today" card — click it for the list |
| Are production systems working? | Production Health |
| Any bugs or incidents? | Production Health, by severity |
| What should each person do next? | Recommended next priorities |

---

## How a project's percentage works

A project's to-do list is its commitments, and its completion percentage is simply
how many of them are done:

```
completion % = commitments completed ÷ every commitment on the project
```

- Tick one off and the bar goes up. Four to-dos, one done, 25%.
- Add one that is not done and the bar eases back, so a project can never read as
  finished while work is still listed against it.
- Cancelled commitments count on neither side.
- A project with **no** commitments keeps whatever figure was set by hand — which is
  what an imported project shows until its first to-do is added.

**Anyone can overrule it.** Edit the project and untick *Count the completion % from
this project's to-dos*: the figure you type then stands, however many to-dos are open.
Tick it back on and it recounts immediately. The project page says which of the two
is deciding the number.

The first to-do added to a project hands the percentage over to the checklist, so an
imported figure is replaced at that point. That is the trade for a number nobody has
to maintain by hand.

### Finishing a commitment records the progress

A commitment is a promise; a progress entry is the delivery. They used to be typed
separately, which meant writing the same sentence twice. Now, ticking a commitment
complete writes the progress entry for you, on the project the commitment belongs to,
in the commitment's own words:

- taking the tick back removes the entry again, so a mis-click leaves nothing behind.
  Once someone edits that entry it is theirs, and an undo leaves it alone
- a commitment with no project has nowhere to record progress, so it logs nothing. The
  Today page shows a **Link a project** button on those
- Settings → *Ticking a commitment complete logs it as progress on its project* turns
  the automatic entry off. The percentage still counts the to-dos

Note that a finished commitment counts in two parts of the daily score: commitment
completion (50) and projects progressed (25). That is deliberate — the same event
answers both questions — but it does make the score move faster than it did when the
two were typed separately.

### What counts as progress

A project counts as **progressed** on a date when anything was recorded against it that
day: a progress entry, a deployment, a completed milestone, or a resolved production
issue. Nothing grades the wording. An earlier version of this app rejected entries like
*"worked on it"* and refused to count them; the team asked for that judgement to go, so
what gets written is what gets counted. The forms still show examples of wording that
reads well in a report — as advice, not a gate.

Unfinished commitments never disappear silently. Closing out a day requires a reason for
every incomplete item — *continue tomorrow*, *blocked*, *cancelled* or *changed priority* —
and anything marked "continue tomorrow" is carried to the next business day.

---

## Daily Execution Score

A transparent 0–100 score. Every line shows its own maths on the dashboard.

| Weight | Component | How points are lost |
| --- | --- | --- |
| 50 | Daily commitment completion | Completed ÷ total commitments |
| 25 | Active projects progressed | Projects with something recorded ÷ active projects |
| 15 | Production quality | Open issues by severity, unhealthy systems |
| 10 | Blocker management | Aging or unassigned blockers; resolving one earns points back |

Production quality takes the *worse* of a system's status and its open incidents, so a
system that is Degraded because of a known bug is penalised once, not twice.

**No points** for hours worked, lines of code, prompts written, or creating automations
nobody asked for. Business impact is excluded from the daily score entirely — it is
weekly/monthly reporting, so projected savings can never inflate today's number.

---

## Pages

| Page | Purpose |
| --- | --- |
| **Dashboard** | Today's KPI cards, execution score, per-person scorecards, stagnation warnings, active project table |
| **Today** | The main working page — morning commitments, progress logging, end-of-day close-out |
| **Commitments** | Every commitment, filterable by person, project, priority, status and date range |
| **Projects** | All projects with progress bars, milestones, blockers and deadlines |
| **Blockers** | Dedicated tracking with business-day aging (Same Day / 1 / 2 / 3+) |
| **Production Health** | Live systems, success rates, incidents by severity |
| **Weekly** | Monday–Friday trends for commitments, progress, deployments, blockers and incidents |
| **Manager View** | Both team members side by side, with a per-person score breakdown |
| **Business Impact** | Hours and cost saved — monthly reporting only |
| **Reports** | Seven report types, printable and formatted to paste into Slack, Google Chat or email |
| **Team** | People, roles, avatars and what they own |
| **Settings** | Targets, scoring reference, and data removal |

---

## Removing things

Everything can be removed, from a single row to the whole database:

- **Rows** — every commitment, progress entry, blocker, deployment, system, incident, impact
  entry, project and team member has a remove button with a confirmation that spells out
  what else goes with it.
- **Softer options first** — projects can be archived and people deactivated, which keeps
  their history. The confirmation dialog points this out.
- **Bulk** — Settings → Remove data clears a whole category (commitments, progress logs,
  blockers, deployments, incidents, business impact, KPI snapshots) or everything at once.
  Useful for clearing the demo data before your team starts.

Removing a progress entry recalculates the project's completion percentage from the entries
that remain, so the history stays consistent.

---

## How dates work

Each project gets one completion snapshot per day (`project_snapshots`). Progress today is
always `today's % − the most recent earlier %`, so nobody calculates deltas by hand.

Historical data is never overwritten. Closing out a day writes a `daily_kpi_snapshots` row
for the team and for each person, which is what the weekly trends read from. Changing the
date in the top bar moves the whole app to that day.

Aging and stagnation are measured in **business days**, so a blocker reported on Friday is
one day old on Monday, not three.

---

## Project layout

```
server/
  handler.js        Transport-agnostic request handling (routing, auth, static)
  index.js          Node server wrapper for local, Docker and VM use
  api.js            REST API — every entity supports create, update and delete
  db.js             Postgres access, settings, insert/update/remove helpers
  schema.js         13 relational tables, plus migrations for databases that already exist
  seed.js           Demo data across six days
  export.js         Whole-database JSON export
  lib/
    kpi.js          All KPI maths: progress detection, score, weekly, stagnation, priorities
    quality.js      Wording examples and the score kept alongside each entry
    reports.js      The seven report builders
    dates.js        Business-day arithmetic
    enums.js        Every dropdown, shared by the API and the UI
netlify/
  functions/api.js  Netlify serverless wrapper around the same handler
scripts/
  check-bundle.mjs        Builds the serverless bundle and runs it (npm run check:bundle)
  check-queries.mjs       Query budget for the pages people open constantly (npm run check:queries)
  check-progress-link.mjs Commitment -> progress behaviour, end to end (npm run check:progress)
  check-schema.mjs        The database can be built from nothing (npm run check:schema)
  import-directory.mjs    Turns the Tools and Artifact Directory CSV into SQL
public/
  index.html        App shell
  css/app.css       Design system
  js/
    app.js          Router, shell, shared state
    api.js          Fetch wrapper
    ui.js           Components: KPI cards, tables, progress bars, modals, forms
    pages/          One module per page
```

### Database tables

`users` · `projects` · `project_snapshots` · `project_milestones` · `progress_logs` ·
`commitments` · `blockers` · `deployments` · `production_systems` · `incidents` ·
`business_impact` · `daily_kpi_snapshots` · `settings`

---

## Demo data

Seeded relative to the current date — five prior business days plus today — so the dashboard
always opens on a live-looking day.

Two team members (**Lawrence** and **Team Member 2**, both renameable on the Team page) plus
a manager account, across five projects: Retell Voice AI, Lead Tracker Dashboard, CRM
Automation, Payroll Automation and Client Onboarding Bot.

The data is deliberately imperfect so the features are visible: one project is stagnant with
an escalated blocker, one commitment is blocked waiting on credentials, one progress entry is
written vaguely and is correctly rejected, and one production system sits below its success
rate target.
