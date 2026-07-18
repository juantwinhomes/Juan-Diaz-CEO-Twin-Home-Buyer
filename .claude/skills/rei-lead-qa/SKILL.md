---
name: rei-lead-qa
description: REI Lead QA Bot — scheduled sweep of REI BlackBook leads against the Lead Entry & QA Playbook. Pulls recently created/modified leads via the Playwright browser, runs every rule in knowledge/rei-lead-qa-rules.md, and reports which leads have incomplete details (missing fields, broken links, Category/Stage/Disposition mismatches) with the owner named. Use when the scheduled QA trigger fires or someone says "run the lead QA sweep" / "check the leads".
---

# /rei-lead-qa — Scheduled Lead QA Sweep

Automates Section 2 (QA Verification Checklist) and Section 3 (Definition of
Done) of the **REI BlackBook Lead Entry & QA Playbook v1.1**. The bot reports;
it does not fix. Phase 1 is strictly **read-only** in the CRM.

## Step 0 — Load the rules

Read `knowledge/rei-lead-qa-rules.md`. That file is the single source of
truth for field rules, the consistency matrix, verdict logic, and report
format. Never hardcode rules here.

## Step 1 — Determine the sweep window

- Read `logs/qa/last-sweep.json` (`{"last_sweep": "<ISO timestamp>"}`).
- Sweep = all leads **created or modified since last_sweep**.
- If the file doesn't exist (first run), sweep the last 48 hours and say so.
- Cap: if the window returns more than 40 leads, sweep the 40 most recently
  modified, and report how many were skipped — never silently truncate.

## Step 2 — Pull the leads (Playwright, read-only)

1. Open REI BlackBook in the browser; confirm logged in. If the login page
   appears, stop and report "sweep blocked — Blackbook login needed" instead
   of guessing credentials.
2. Filter contacts by last-modified within the sweep window.
3. For each lead, open the contact record and capture every field listed in
   the rules file, including: all Contact Info fields, Social Profile
   type/URL, the About panel (Category, Lead Stage, Call Disposition, Notes
   with dates, Sales Agent, Seller Source, Amount Offer, Next Step), tags,
   and the Associated Property / Associated Deal links.
4. Do NOT edit, tag, or save anything in Phase 1. Read-only.

## Step 3 — Run the checks

For each lead, evaluate every rule in `rei-lead-qa-rules.md` §1, then the
consistency matrix in §2, and assign the verdict per §3
(FAIL / NEEDS ATTENTION / PASS).

Judgment calls:
- CONDITIONAL fields pass only if the value exists **or** the Notes
  explicitly document its absence. "Probably no email" in your own reasoning
  is not documentation — it must be written in the record.
- For the story check, if the matrix draft doesn't cover a combination that
  looks legitimate, flag it as NEEDS ATTENTION ("combo not in matrix — Juan
  to confirm") rather than FAIL, until the matrix is red-lined.
- Never invent field values or assume a link is correct because the names
  look similar — the playbook explicitly warns about similarly named records.

## Step 4 — Report here (the deliverable)

Post the report in this chat using the format in the rules file §4:

1. **Headline:** `QA sweep <date>: N leads checked — X FAIL, Y need
   attention, Z pass.`
2. **Each FAIL lead**, worst first: name, address, owner, and the exact
   missing/wrong fields in plain language ("Contact Type not set; Email
   empty with no note confirming none exists; Stage says Appointment Booked
   but Disposition says Reschedule — reconcile").
3. **NEEDS ATTENTION** leads in one compact list.
4. **Per-owner tally** of fails (for the Monday dashboard).
5. If zero fails: say so in one line. Don't pad a clean sweep.

Keep it Juan-style: lead with the counts, no preamble, name the owner on
every problem so accountability is unambiguous.

## Step 5 — Log the sweep

- Append one line per checked lead to `logs/qa/sweeps.jsonl`:
  `{"ts": "...", "lead": "...", "address": "...", "owner": "...",
  "verdict": "FAIL|ATTENTION|PASS", "issues": ["..."]}`
- Update `logs/qa/last-sweep.json` with the current timestamp.
- Commit both log files to the current branch and push (logs are the bot's
  memory between runs).

## Escalations

- Blackbook unreachable or login required → report it here, don't retry
  blind, and leave `last-sweep.json` untouched so the next run re-covers the
  window.
- Same lead FAILing on 2+ consecutive sweeps → mark it **REPEAT** in the
  report; repeat fails are a coaching item, not just a data item.
- More than half the sweep failing → say so at the top; that's a process
  problem, not a data-entry problem.

## Phase 2 (needs Juan's explicit go — not yet approved)

Once the matrix is red-lined and the report has been reliable for ~2 weeks:
auto-tag failing records `QA-FAIL` in Blackbook and create a fix task for
the record owner. Until then: report-only.
