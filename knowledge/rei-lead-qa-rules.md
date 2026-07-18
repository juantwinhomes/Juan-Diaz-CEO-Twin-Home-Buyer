# REI BlackBook — Lead QA Rules (machine-checkable)

Source of truth: **REI BlackBook Lead Entry & QA Playbook v1.1** (Equity Track
PH, Operations). This file translates the playbook into rules the REI Lead QA
Bot can run automatically. If the playbook and this file disagree, the playbook
wins — update this file.

The Golden Rule: *a record is ready when another team member can open it and
act on it without asking a single question.*

## 1. Field rules

Legend for `Rule`:
- **REQUIRED** — must be populated. Empty = FAIL.
- **CONDITIONAL** — must be populated **or** the Notes must explicitly document
  that it doesn't exist / doesn't apply (e.g., "no email — confirmed with
  seller"). Empty with no documentation = FAIL. Documented-absent = PASS.
- **CHECK** — empty is allowed but gets flagged as CHECK (soft warning), not FAIL.

| # | Section | Field | Rule | What the bot verifies |
|---|---------|-------|------|----------------------|
| 1 | Contact Info | Full Name | REQUIRED | Present; not a placeholder ("unknown", "seller", "test") |
| 2 | Contact Info | Phone (Mobile) | REQUIRED | Present; valid 10-digit US format |
| 3 | Contact Info | Phone (Home) | CONDITIONAL | Present, or absence documented |
| 4 | Contact Info | Email | CONDITIONAL | Present and valid format, or absence documented in Notes |
| 5 | Contact Info | Mailing Address | CONDITIONAL | Present when different from property address |
| 6 | Contact Info | Source | REQUIRED | One of the approved list: Direct Mail, PPC, TV Commercial, Property Leads, Referral, Cold Call, SEO/Web, Other (approved) |
| 7 | Contact Info | Campaign | CONDITIONAL | Attached when the Source has active campaigns (Direct Mail, PPC, TV always do) |
| 8 | Contact Info | Contact Type | REQUIRED | One of: Homeowner, Agent, Attorney, Family Member, Tenant, Other (approved) |
| 9 | Contact Info | Tags | REQUIRED | At minimum one Lead Source tag AND one Status tag; Motivation tag when known |
| 10 | Social Profile | Website Type | REQUIRED | Redfin if a Redfin listing exists; else Zillow; else REI — in that order |
| 11 | Social Profile | Website URL | REQUIRED | URL saved and resolves to the subject property |
| 12 | About | Category | REQUIRED | Selected; consistent per §2 matrix |
| 13 | About | Lead Stage | REQUIRED | Reflects current pipeline stage; consistent per §2 matrix |
| 14 | About | Call Disposition | REQUIRED | Reflects latest call outcome; consistent per §2 matrix |
| 15 | About | Notes | REQUIRED | Dated; reflect the **latest** activity (most recent note ≤ 7 days older than last stage/disposition change) |
| 16 | About | Sales Agent | REQUIRED | A real, active team member assigned |
| 17 | About | Seller Source | REQUIRED | Original seller source identified |
| 18 | About | Amount Offer | CONDITIONAL | Required once Stage ≥ offer made; before that, CHECK |
| 19 | About | Next Step | REQUIRED | A concrete action **with a date**. A next step without a timeline = FAIL |
| 20 | Property Info | Property Address | REQUIRED | Complete, verified format (street, city, state, ZIP) |
| 21 | Property Info | Associated Deal | REQUIRED | Contact's property attached to the correct Deal record (not a similarly named one) |
| 22 | Property Info | Associated Property | REQUIRED | Contact linked to the correct property record |

## 2. Consistency matrix — Category × Lead Stage × Call Disposition

The playbook's rule: **these three fields must tell one story.** Any
combination not on this matrix = FAIL ("story mismatch"), exactly like the
worked example (Stage "3 Appointment Booked" vs Disposition "Appointment
Pending" when the call said reschedule).

**Confirmed picklist values (from account screenshots, 2026-07-18):**

- **Category:** `Active`, `Lost/Dead`, `Won`
- **Lead Stage:** `0 Invalid Leads`, `1 New Lead`, `2 Follow Up`,
  `3 Appointment Booked`, `4 Offer Sent`, `5 <name TBC — Juan to confirm>`,
  `6 Cancelled Contract`, `7 Reinstated`, `8 Clear to Close`,
  `9 Lost / Dead Lead`, `10 Acquired`

**Category × Stage matrix (enforced):**

| Category | Allowed Lead Stages |
|----------|--------------------|
| Active | 1 New Lead, 2 Follow Up, 3 Appointment Booked, 4 Offer Sent, 5, 7 Reinstated, 8 Clear to Close |
| Lost/Dead | 0 Invalid Leads, 6 Cancelled Contract, 9 Lost / Dead Lead |
| Won | 10 Acquired |

> **Still needed from Juan:** (1) the name of Stage 5 (between "4 Offer Sent"
> and "6 Cancelled Contract"); (2) the full **Call Disposition** picklist, so
> the Stage × Disposition pairs can be enforced too. Until then, disposition
> consistency uses the hard rules below only.

Hard rules regardless of matrix state:
- Disposition indicating a dead/disqualified lead (e.g., "Out of Buy Box",
  "Not Interested", "Listed with Agent") → Stage must be 0, 6, or 9 and
  Category must be `Lost/Dead` — not "1 New Lead" / `Active`.
- Disposition mentions reschedule/cancel → Stage must NOT still say
  booked/confirmed.
- Category `Lost/Dead` or `Won` → Next Step may be empty; `Active` requires
  a future-dated Next Step.
- Stage at or past "4 Offer Sent" (except 6/9) → Amount Offer becomes
  REQUIRED (rule 18).

## 3. Verdict logic

- **FAIL** — any REQUIRED rule fails, any undocumented CONDITIONAL fails, or
  a story mismatch (§2). Record is NOT ready for closeout.
- **NEEDS ATTENTION** — no FAILs, but one or more CHECK flags.
- **PASS** — everything green. Ready per the playbook's Definition of Done.

## 4. Report format (what the bot posts)

Per failing lead:

```
❌ <Full Name> — <Property Address>   (owner: <Sales Agent>)
   Missing/wrong: <field>: <reason>; <field>: <reason>
   Story check: <Category> / <Stage> / <Disposition> → <ok | mismatch>
```

Then a summary: leads swept, PASS / NEEDS ATTENTION / FAIL counts, and a
per-owner tally of fails (feeds Kristine's Monday dashboard).
