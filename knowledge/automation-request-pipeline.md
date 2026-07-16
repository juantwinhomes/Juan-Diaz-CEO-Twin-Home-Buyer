# THB Automation Request Pipeline (Intake Form + Tracker + Triage)

> Owner: Seth (AI/Dev department). Purpose: one door for every department to
> request an app/automation/AI build. Everything is logged, classified,
> revenue-generating requests get built first. Designed 2026-07-16 with the
> Twin. v1 = Google Form + Google Sheet. No website unless the Form breaks.

## The Pipeline

1. **Submit** — requester fills the Google Form (below).
2. **Log** — response auto-writes a row to the tracker Sheet.
3. **Triage** — Claude/Seth processes new rows weekly (or on arrival):
   dedupe → classify → score with the rubric → assign owner.
4. **Status back** — requester sees status on the shared read-only sheet:
   Received → Reviewed → Queued / Building / Testing / Live / Rejected
   (rejections always get a one-line reason).
5. **Report up** — same sheet is Juan's view of what each department is
   asking for and what the PH team is building.

**Standing rule:** revenue-generating requests outrank everything. Non-revenue
requests queue behind them, no exceptions.

---

## Google Form — exact questions

**Form title:** THB Build Request — Apps, Automations & AI
**Description text:** One request per form. If you have three ideas, submit
three forms. Revenue-generating requests get built first — if your idea makes
or recovers money, prove it in Section 3.

### Section 1 — Who you are

1. **Your name** — short answer, required
2. **Your department** — dropdown, required:
   - Acquisitions
   - Dispositions
   - Marketing / SEO
   - Transaction Coordination / Admin
   - HR / Recruiting
   - Finance
   - Leadership
3. **Who will actually use this day to day?** — short answer, required
   (names + roles; "me" is fine)

### Section 2 — The request

4. **Name your idea** — short answer, required
5. **What's slow or broken today?** — paragraph, required
   Helper text: "Describe the workflow as it works right now, step by step.
   What takes too long, gets dropped, or requires copy-paste?"
6. **What should it do instead?** — paragraph, required
   Helper text: "Describe the workflow WITH the tool. What happens
   automatically? What do you still do by hand?"
7. **What happens if we don't build this?** — paragraph, required
   Helper text: "Be honest. 'Nothing, it would just be nice' is an
   acceptable answer and saves everyone time."
8. **How often does this workflow happen?** — multiple choice, required:
   - Many times a day
   - Daily
   - Weekly
   - Monthly
   - Rarely / one-time
9. **Systems this touches** — checkboxes, required:
   - REI Blackbook
   - GoHighLevel (GHL)
   - CallRail
   - Monday.com
   - QuickBooks
   - Instantly / cold email
   - Google Sheets / Drive / Gmail
   - Podio / Make.com
   - Other (fill in)
10. **Is this a brand-new tool, or an add-on to something we already built?**
    — multiple choice, required:
    - New tool
    - Add-on / feature of an existing project (name it in the next question)
    - Not sure
11. **If add-on: which existing project?** — dropdown (kept in sync with the
    project tracker), optional:
    - High Equity Lead Revival Automation
    - Juan Automated Email Access
    - Property Visit Automated Update
    - Directmail Home Scout
    - Property Leads Dispute Automation
    - SEO Content System
    - Directmail KPI Tracker
    - Lead Review Assistant
    - REI Blackbook Full Access agent
    - THB SEO Analyzer
    - Cold Email Manager
    - Pipeline Status Cleanup
    - Other / not sure

### Section 3 — Money (conditional: shown to everyone, gates priority)

12. **Does this make or recover money for THB?** — multiple choice, required:
    - Yes — it generates leads / deals / revenue
    - Yes — it recovers money we're losing (refunds, wasted spend, dropped leads)
    - No — it saves time / reduces errors
    - Not sure
13. **If yes: exactly how?** — paragraph, required when Q12 = Yes
    Helper text: "Be specific and use numbers if you have them. Good:
    'We get ~30 interested sellers per quarter and convert 0 because
    follow-up leaks — this fixes follow-up.' Bad: 'It will help us grow.'"
14. **If yes: how much per month, roughly?** — multiple choice:
    - Under $1K/mo
    - $1K–$5K/mo
    - $5K–$25K/mo
    - $25K+/mo (a deal or more)
    - Can't estimate

### Section 4 — Evidence

15. **Upload your SOP, Loom, or Claude/Grok conversation** — file upload,
    optional but strongly encouraged (up to 5 files)
    Helper text: "The better you show the workflow, the faster we build it."
16. **Anything else we should know?** — paragraph, optional
17. **How urgent is this, honestly?** — multiple choice, required:
    - Blocking revenue right now
    - Hurting us weekly
    - Annoying but survivable
    - Whenever you get to it

---

## Tracker Sheet — column layout

One tab: **Requests** (form responses land here; triage columns appended).

| Col | Field | Source |
|---|---|---|
| A | Timestamp | auto |
| B | Requester | form |
| C | Department | form |
| D | End users | form |
| E | Idea name | form |
| F | Problem today | form |
| G | Desired workflow | form |
| H | If we don't build it | form |
| I | Frequency | form |
| J | Systems touched | form |
| K | New vs add-on (+ parent project) | form |
| L | Revenue claim (Q12) | form |
| M | Revenue mechanism (Q13) | form |
| N | Revenue estimate (Q14) | form |
| O | Files link | form |
| P | Urgency (self-rated) | form |
| Q | **Triage: duplicate/feature of** | triage |
| R | **Triage: classification** (Revenue Generating / Revenue Supporting / Automation) | triage |
| S | **Triage: score** (rubric below) | triage |
| T | **Triage: verdict** (Build / Merge into existing / Park / Reject + reason) | triage |
| U | **Build type** (Claude Code / Agent / App / Zapier-Make) | triage |
| V | **Owner** (Bryan / Jonathan / Carlo / Lawrence / Seth) | triage |
| W | **Status** (Received / Reviewed / Queued / Building / Testing / Live / Rejected) | dev team |
| X | **Status note / rejection reason** | dev team |
| Y | Date live | dev team |
| Z | **Revenue attributed** (post-launch, monthly) | dev team |

Second tab: **Live Projects** — the existing Claude_Projects list migrates
here (same columns Q–Z) so old and new live in one system.

Share the sheet **read-only** with all departments. That visibility is the
status-back loop — without it, people go back to chat-pinging and the form dies.

---

## Triage Rubric (Claude or Seth scores each request)

Score = sum. Build order = score descending within classification tier.

**Tier gate first (hard order): Revenue Generating > Revenue Recovering >
Automation/time-saver.** Rubric only ranks within tiers.

| Factor | Points |
|---|---|
| Directly produces seller leads or contracts in the buy-box (East Bay, sub-$1M) | +5 |
| Recovers money already being spent/lost (disputes, dropped leads, wasted mail) | +4 |
| Revenue mechanism is specific and numbered (Q13 passes the smell test) | +3 |
| Workflow happens daily or more | +2 |
| Add-on to an existing live project (cheap to ship) | +2 |
| Requester uploaded SOP/Loom/conversation | +1 |
| Requester answered "nothing" to Q7 (what if we don't build) | −3 |
| Off buy-box / out of Twin Home Buyer scope | −5 (auto-reject) |
| Duplicate of existing project | merge, don't score |

**Auto-reject conditions:** outside THB scope (other ventures), violates the
90-day reset (new side-business tooling), or requester can't articulate the
problem (Q5 empty of substance). Every rejection gets a one-line reason in
col X.

**Triage cadence:** new rows processed within 3 business days; full queue
re-ranked weekly (fits the Sunday review / Monday dashboard rhythm).

## LIVE FORM v1 — deltas from the spec (published 2026-07-16, Seth)

Seth built and published the form with these changes vs. the spec above:

- **Departments** (checkboxes, multi-select): Operations, Marketing,
  HR/Recruiting, Accounting, Sales.
- **Removed:** "What happens if we don't build this?" (Q7) and
  "How much per month, roughly?" (Q14). Rubric note: the −3 "nothing happens"
  factor has no direct input now — infer from urgency + problem description.
- **"If add-on: which existing project?"** is free text, not a dropdown —
  dedupe stays a manual triage step.
- **Systems list** adds "AI Tools — Claude/ChatGPT/Grok" and merges
  "Podio / Make.com / Zapier."
- **File upload is live** ("Upload your SOP, or Claude/Grok conversation if
  Available") — added manually as planned.
- Section 3 (Money) kept only the "Exactly how?" paragraph, required.
- ⚠️ **Open check at publish time:** confirm the money gate question uses
  "Go to section based on answer" (Yes → Section 3, No/Not sure → Section 4).
  Screenshot showed default "continue to next section" on Section 2.

Sheet-sync facts (for whoever maintains the tracker): columns map by question
ID; deleted questions leave orphan columns (relink the destination sheet
before first responses to clean up); renamed questions do not rename headers;
keep triage columns on a separate tab so form-added columns never collide.

## v2 triggers (when a website becomes worth it)

Only move off Google Forms if one of these actually happens:
- Requesters need to see the live project list *while* filling the form.
- We want Claude to interview the requester conversationally at intake.
- Volume makes manual triage a bottleneck (>10 requests/week sustained).
