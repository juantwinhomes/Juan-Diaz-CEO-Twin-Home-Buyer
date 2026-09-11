# THB Acquisitions Desk — Phase 0 Migration Map

Source: `prototype/acquisitions_desk_prototype.html` (the supplied HTML, 978 lines).
Target: Apps Script Web App + Master Google Sheet (`src/`).

## 1. Every `window.storage` read / write in the prototype

| Key | Read at | Written by | Shape | → Production table |
|---|---|---|---|---|
| `thb:days` | boot | `saveToday()` (rewrites whole array) | `[{date,by,tv,ppc,ppl,other,newleads,calls,missed,contacts,appts,contracts,fell,closed,speed}]` | **DAILY_METRICS** (one row per `business_date`, upsert) |
| `thb:leads` | boot | `addBulk()`, `field()`, flag/comply/attempt/note/done handlers (all rewrite whole array) | `[{id,addr,owner,phone,source,equity,status,owner_by,flag,comply,attempts,next,due,arv,repairs,ask,offer,apptDate,apptOutcome,touched,notes:[{by,at,text}]}]` | **LEADS** (one row per lead, targeted row write) + **LEAD_ACTIVITY** (`notes[]` → append-only rows) + **APPOINTMENTS** |
| `thb:settings` | boot | `saveTargets` | `{dealTarget,budget,maoPct}` | **SETTINGS** (`monthly_deal_target`, `monthly_marketing_budget`, `mao_percentage`) |
| `thb:me` | boot | `#me` dropdown change | string | **REMOVED as identity** → authenticated Google account looked up in **USERS** |
| `thb:tools` | boot | every tool field change/blur, trained toggles, `addTool`, `reassignLeo()` | `[{id,name,job,owner,builtby,status,proof,how,output,cadence,link,rec,handed,verdict,backup,trained:[],custom,asked}]` | **TOOL_INVENTORY** (one row per tool) + **TOOL_TRAINING** (one row per user/tool) |
| `thb:runs` | boot | "Mark run"/"Undo" on Today | `{date:{toolId:{by,at}}}` | **TOOL_RUNS** (one row per run; undo marks `status=UNDONE`, never deletes) |
| `thb:pillars` | boot | pillar `<select>` change | `{p_score:'Running every day',...}` | **SETTINGS** keys `pillar_<id>` |
| `thb:asked` | boot | rollcall "date you asked them" blur | `{Seth:'2026-09-01',...}` | **SETTINGS** keys `asked_<builder>` |

Prototype write pattern everywhere was **load-all → mutate → rewrite-all** (forbidden by spec §43). Every write is now a targeted single-row write or an append, under `LockService`, with `version` checks on LEADS.

## 2. Every state-mutating UI control → server function

| Control (prototype) | Was | Now calls |
|---|---|---|
| `#me` select | set `me` | **removed** (identity shown read-only from `bootstrapApp().user`) |
| `#saveDay` | `saveToday()` | `saveDailyMetrics(date, data)` |
| `#saveTargets` | `saveSet()` | `saveSetting('monthly_deal_target')`, `saveSetting('monthly_marketing_budget')` (ADMIN/MANAGER) |
| `#addBulk` | `addBulk()` | `addBulkLeads(text)` → `{added, duplicates_skipped, failed, failures[]}` |
| lead `select[data-set=status]` | `field()` | `updateLead(id, {status}, expectedVersion)` (server writes `STATUS_CHANGED`; archive statuses route through `archiveLead`) |
| lead `select[data-set=owner_by]` | `field()` | `assignLead(id, userId, expectedVersion)` |
| lead `input[data-set=next]` / `due` | `field()` | `setNextAction(id, next, due, expectedVersion)` |
| lead `arv/repairs/ask/offer` | `field()` | `updateLead(id, {arv,repairs,asking_price,offer}, v)` → `UNDERWRITING_CHANGED` / `OFFER_CHANGED` |
| lead `apptDate` / `apptOutcome` | `field()` | `createAppointment` / `updateAppointment` (APPOINTMENTS row + LEADS summary fields) |
| `[data-attempt]` | attempts++ | `logAttempt(id, note)` |
| `[data-flag]` | toggle flag | `setJuanFlag(id, bool, note)` |
| `[data-comply]` | toggle comply | `setComplianceFlag(id, bool, note)` (also sets `flag_juan=TRUE`) |
| `[data-send]` / Enter in note box | push note | `addLeadNote(id, text)` |
| Today `[data-done]` | clear next/due | `completeNextAction(id, nextAction, dueDate, expectedVersion)` (records `NEXT_ACTION_DONE`, requires a new next action for active leads via UI prompt) |
| Today `[data-run]` | toggle run | `logToolRun(toolId)` / `undoToolRun(runId)` |
| tool field change/blur | mutate tools | `updateTool(toolId, patch)` |
| tool `[data-trained]` | toggle in array | `setToolTraining(toolId, userId, trained)` |
| `#addTool` | push custom tool | `createTool(data)` |
| pillar select | pillars[id]=v | `saveSetting('pillar_<id>', v)` |
| rollcall asked date | asked[b]=v | `saveSetting('asked_<builder>', v)` |
| `#filter/#sort/#search/#builderFilter` | client-only | client-only, plus server-side filter/paging for `archived`/`all`/search |

## 3. Render functions and their data source now

| Render fn | Prototype source | Production source |
|---|---|---|
| `loadTodayForm` | `days` | `getTodayDashboard().metrics` |
| `renderRunsToday` / `streak` | `tools`,`runs` | `getTodayDashboard().tools_today` (runs by business date, streak computed server-side in business TZ) |
| `renderQueue` | `leads` | `getWorkQueue()` — overdue → due today → upcoming → **NO NEXT ACTION / NO DUE DATE** |
| `renderFlagged` | `leads` | `getTodayDashboard().waiting_on_juan` (property, status, rep, reason, last note, time flagged) |
| `renderActivity` | `leads[].notes` | `getRepSnapshot()` from LEAD_ACTIVITY (touched, attempts, notes, status changes, appts, contracts, closes, last activity, active/overdue assigned) |
| `renderNumbers` | `days`,`leads`,`settings` | `getNumbersDashboard()` — all totals calculated server-side from DAILY_METRICS + LEADS |
| `renderLeads` | `leads` | `listLeads({filter,sort,search,page})` |
| `renderTools/Rollcall/Verdicts/Pillars` | `tools`,`asked`,`pillars` | `getTools()` (inventory + training + settings) |

## 4. Feature disposition (spec §75)

| Feature | Disposition | Notes |
|---|---|---|
| 5 tabs: Plan / Today / Numbers / Lead board / Tools we own | PRESERVE | same markup, same CSS variables |
| The Plan copy | PRESERVE | static content, unchanged |
| "On the desk" identity dropdown | **REMOVE — reason: spec §9 forbids self-selected identity.** Replaced by authenticated user badge | |
| Today's log form + "not logged" warning | MIGRATE | DAILY_METRICS upsert keyed by business date |
| Tools that must run today + streak | MIGRATE/IMPROVE | TOOL_RUNS rows; undo keeps the row (`UNDONE`) |
| Work queue (overdue/due today) | IMPROVE | adds upcoming + NO NEXT ACTION / NO DUE DATE sections |
| Mark done | IMPROVE | logs `NEXT_ACTION_DONE`, prompts for the next step on active leads |
| Waiting on Juan | IMPROVE | adds rep, reason, time flagged |
| Who worked the board today | IMPROVE | full per-rep snapshot from LEAD_ACTIVITY |
| Pace / funnel / costs / channel / day-by-day | MIGRATE | computed server-side, MAO % from SETTINGS |
| Targets (deals, budget) | MIGRATE | SETTINGS, ADMIN/MANAGER only |
| Live list tally + filters + sorts + search | PRESERVE/IMPROVE | search adds phone + assignee; archived/all paginated |
| Add leads (bulk paste) | IMPROVE | server validation, dedupe, summary Added/Skipped/Failed |
| Lead card: status, assign, next/due, attempt, flag, comply, underwriting, appointment, notes | PRESERVE | every action → LEAD_ACTIVITY |
| MAO / offer room | PRESERVE | percentage from SETTINGS, not hard-coded |
| Archive statuses | PRESERVE | `archiveLead` + `restoreLead`; no hard delete anywhere |
| Tools inventory (22 seeded tools) | PRESERVE | seeded into TOOL_INVENTORY by `setupDatabase()` |
| Tool status / recommendation / cadence / steps / link / output / builder / operator / backup / handed / verdict / proof / asked | PRESERVE | `asked_date` added as a column (kept from prototype) |
| Trained people toggles | MIGRATE | TOOL_TRAINING rows, people list from USERS |
| Rollcall (Seth / Jonathan / Bryan) + verdict chips | PRESERVE | builders list from tool `built_by` values |
| Five AI pillars | MIGRATE | SETTINGS `pillar_*` |
| Log a build not listed | PRESERVE | `createTool` |
| `reassignLeo()` one-time data fix | **REMOVE — reason: one-off migration hack for old prototype data; the seed data already has no "Leo" rows.** | |
| Hard-coded PEOPLE list | **REMOVE — reason: replaced by USERS table** | |
| Link `href` from user input | IMPROVE | server validates `http(s)://` only |
