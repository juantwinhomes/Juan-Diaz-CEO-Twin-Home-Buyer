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

Requires **Node.js 22.5 or newer**. There are no dependencies to install — the server uses
Node's built-in `node:sqlite` and `node:http`.

```bash
npm run seed     # create the database and load the demo data
npm start        # http://localhost:4000
```

| Command | What it does |
| --- | --- |
| `npm start` | Start the app on port 4000 (`PORT=8080 npm start` to change it) |
| `npm run dev` | Same, restarting on file changes |
| `npm run seed` | Seed demo data (skips if the database already has data) |
| `npm run reset` | Wipe everything and reseed |

The database lives at `data/kpi.db` and is git-ignored. To start empty, run `npm run seed`
then use **Settings → Remove data → Everything**, or just delete `data/kpi.db`.

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

## The rule that makes it work

Activity is not progress. A project only counts as **progressed** when there is
concrete evidence on that date:

- a progress log entry that passes the measurable-result check, **or**
- a deployment, **or**
- a completed milestone, **or**
- a resolved production issue

A percentage bump on its own is deliberately *not* enough. If someone writes
*"worked on it"* and moves the bar from 70% to 80%, the entry is stored and shown —
flagged, and not counted.

```
Does not count          Counts
-------------------     ------------------------------------------
Worked on it            Completed webhook integration
Researched              Fixed 3 of 4 routing scenarios
Checked system          Passed 18 of 20 test cases
Continued coding        Connected Google Sheets API
Had meeting             Deployed automation to production
Looked into issue       Reduced workflow from 8 steps to 3
```

The check runs server-side (`server/lib/quality.js`) and is the single source of truth —
the commitment and progress forms call it live as you type, so you get feedback before saving.

Unfinished commitments never disappear silently. Closing out a day requires a reason for
every incomplete item — *continue tomorrow*, *blocked*, *cancelled* or *changed priority* —
and anything marked "continue tomorrow" is carried to the next business day.

---

## Daily Execution Score

A transparent 0–100 score. Every line shows its own maths on the dashboard.

| Weight | Component | How points are lost |
| --- | --- | --- |
| 50 | Daily commitment completion | Completed ÷ total commitments |
| 25 | Active projects progressed | Projects with evidence ÷ active projects |
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
  index.js          HTTP server (node:http) + static file serving
  api.js            REST API — every entity supports create, update and delete
  db.js             SQLite access (node:sqlite), settings, insert/update/remove helpers
  schema.sql        11 relational tables
  seed.js           Demo data across six days
  lib/
    kpi.js          All KPI maths: progress detection, score, weekly, stagnation, priorities
    quality.js      The measurable-result rule engine
    reports.js      The seven report builders
    dates.js        Business-day arithmetic
    enums.js        Every dropdown, shared by the API and the UI
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
