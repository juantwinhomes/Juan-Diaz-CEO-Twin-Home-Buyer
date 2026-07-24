# MLS Property Acquisition — Operating Pipeline (SOP)

**Core principle:** The end result is a profitable acquisition that closes. Spreadsheets, CRM profiles, and AI reports are tools, not the objective. Before any task, ask: does this move a property closer to a profitable close? If no, stop doing it.

## The pipeline at a glance

Every property moves through 7 stages and 3 kill‑gates. A property either advances, or it is dropped with a one‑line reason. Nothing sits without a next action.

| Stage | Kill‑gate | Owner | Tool |
|-------|-----------|-------|------|
| 1 Intake | Fits buy box? | AI agent → PH reviewer (patterns → Bryan) | Sheet / DeepSeek |
| 2 Equity screen | Apparent equity? | PH analyst | DeepSeek comps |
| 3 Deal math | Pencils after all‑in costs? | PH analyst (offer approval: Juan/Cherry) | Sheet MAO calc |
| 4 Deep research | Any deal‑killer? | PH analyst | Paragon + PropertyRadar |
| 5 Profile + synthesis | — | PH analyst builds; Claude organizes | REI BlackBook + Claude |
| 6 Offer + agent contact | — | Terms: Juan/Cherry; Call: Thea | REI BlackBook |
| 7 Follow‑up → close | — | Kyle/Chris; Cherry/Juan | REI BlackBook |

## Stage 1 – Intake

**Purpose:** Get candidate MLS listings into the tracking sheet.  
**Owner:** AI agent feeds the sheet; PH reviewer works it.

**Action:** Review incoming rows against the buy box. Drop anything outside it.

**Feedback loop (do not skip):** If the same disqualifying pattern repeats (e.g. listings >150 days on market, outside target area, already fully renovated, unrealistic price), do NOT silently delete. Log the pattern and report to Bryan so the search criteria improve.

**Gate – fits buy box?** Advance only if it matches property type, area, price band, and resale‑potential criteria.

**Output:** Qualified row flagged for equity screen.

## Stage 2 – Equity screen (GATE)

**Purpose:** Confirm the property may have enough equity before spending more time.  
**Owner:** PH analyst.

**Action:** Run comps via DeepSeek (primary). Provide full property data: address, city, ZIP, type, beds/baths, sqft, lot size, asking price. Ask for comparable sales within ~1 mile prioritizing similar type, size, beds/baths, lot, age, condition, neighborhood. Estimate renovated resale value. Do not accept a shallow answer. Press with follow‑ups: Are these the best comps? More recent sales? Same neighborhood? Condition/lot differences? Busy streets or school boundaries? What lowers the resale value? What raises it? What am I missing?

**Gate – apparent equity?** Apparent equity = estimated renovated resale value – estimated purchase price. Advance only if there is meaningful spread. (Apparent equity ≠ profit; that's Stage 3.)

**Output:** Equity estimate + comp set logged.

## Stage 3 – Deal math (GATE)

**Purpose:** Prove a realistic path to profit, not just spread.  
**Owner:** PH analyst. Offer amounts approved by Juan/Cherry.

**Action:** Subtract all‑in costs from resale value to get Maximum Allowable Offer (MAO). Account for: renovation, closing costs, commissions, financing, property taxes, insurance, utilities, holding costs, permits, unexpected repairs, resale risk, and required company profit.

**Gate – pencils?** Advance only if MAO leaves the required profit at a purchase price the deal can realistically hit.

**Output:** MAO + net profit estimate logged.

## Stage 4 – Deep research (GATE)

**Purpose:** Surface anything that changes the offer or kills the deal.  
**Owner:** PH analyst.

**Action – MLS (Paragon):** Read every remark. Capture agent/private remarks, offer instructions + deadline, required forms, court‑confirmation/probate/bankruptcy, tenant occupancy, showing/lockbox/appointment rules, preferred escrow/title, disclosures, reports, known defects, financing restrictions, seller preferences, rent‑back, as‑is status, multiple offers, prior fall‑outs.

**Action – Ownership (PropertyRadar):** Owner name/type, mailing address, length of ownership, estimated loan balance, liens, notices of default, tax delinquencies, judgments, transfers, trust/corporate/probate indicators.

**Important:** The listing agent does NOT own the property – the seller/entity does. Document accurately. Do not contact a homeowner directly on an actively listed property unless management approves and it's legal/ethical.

For every finding ask: what does it mean, is it opportunity or risk, does it change price/timeline/approach, what could prevent closing? If you hit an unfamiliar term (lien, encumbrance, court confirmation, NOD), use AI to educate yourself immediately.

**Gate – deal‑killer?** Advance if no unresolved killer; otherwise drop with reason.

**Output:** Risk + opportunity notes.

## Stage 5 – Profile + AI synthesis

**Purpose:** Make it a complete, hand‑off‑ready record and turn raw research into a plan.  
**Owner:** PH analyst builds the profile; Claude organizes the plan.

**Action – REI BlackBook:** Build/update the opportunity as the central record. Capture property info, listing info, ownership info, financial analysis, condition, and communication history. Do NOT dump irrelevant data – only what advances the transaction.

**Action – Claude synthesis:** Hand Claude the full package (sheet, comps, Paragon, PropertyRadar, REI BlackBook notes) with the instruction: "End goal is to purchase and close profitably. Organize this into an acquisition plan: property summary, financial summary, comps, risks, missing info, offer recommendation + terms, agent talking points, seller‑motivation analysis, due‑diligence checklist, follow‑up schedule, next actions, closing strategy."

**Output:** Structured acquisition plan.

## Stage 6 – Offer + agent contact

**Purpose:** Win the deal – which is not always the highest price.  
**Owner:** Terms approved by Juan/Cherry. Agent call by Thea.

Think beyond price: cash, as‑is, short/waived inspection, no appraisal contingency, flexible or fast close, seller rent‑back, nonrefundable deposit, strong proof of funds, reliable escrow, clear communication, probate/court experience, handling personal property, solving title/condition problems. Never promise an unapproved term.

Agent call goal: build trust and learn what the seller actually needs – why selling, prior rejected offers, failed escrows, timing/condition/title concerns, what would make the agent comfortable recommending us. Communicate experience humbly ("thousands of Bay Area transactions... said humbly, to show we can close"), professionally, curious — never scripted or arrogant.

**Output:** Offer submitted + agent intel logged.

## Stage 7 – Follow‑up → close

**Purpose:** Manage the opportunity to the finish line.  
**Owner:** Kyle/Chris follow up; Cherry/Juan close.

**Rule:** every property has a next action. Each active opportunity records: current status, person responsible, last action, next action, deadline, follow‑up date, missing info, reason still active, conditions to move forward.

Research is not progress. It only counts when it leads to a decision or action.

**Output:** Executed contract → close → collected revenue.

---

## KPI layer (weekly)

Track the funnel, not activity:

- Intake volume and qualified rate
- Stage 2 equity‑screen pass rate
- Stage 3 deal‑math pass rate (% reaching offer‑ready)
- Offers submitted; offer → accepted rate
- Contracts; closings; revenue; net profit per deal
- Cycle time per stage (where deals stall)
- Follow‑up compliance (% of active properties with a dated next action)
- Pattern‑feedback items logged to Bryan (system‑improvement signal)

---

## Reusable AI prompt templates

### Comp prompt (Stage 2 — DeepSeek)

> Analyze [address, city, ST ZIP]. Property: [type, beds/baths, sqft, lot size, year, asking price]. Find the best comparable sales within ~1 mile. Prioritize same type, sqft, beds/baths, lot, age, condition, neighborhood. Estimate renovated resale value and explain which comps support it. Then: are these truly the best comps, any more recent sales, condition/lot differences, busy streets or school boundaries, what lowers resale, what raises it, what am I not considering?

### Synthesis prompt (Stage 5 — Claude)

> End goal is to purchase and close this transaction profitably. Below is everything collected from the sheet, comps, Paragon, PropertyRadar, and REI BlackBook. Organize it into an acquisition plan: property summary, financial summary, comps analysis, risk summary, missing‑information list, offer recommendation, offer terms, agent talking points, seller‑motivation analysis, due‑diligence checklist, follow‑up schedule, next‑action list, closing strategy.

---

## Two prerequisites to define before launch

1. **Written buy box** — the exact filter Stage 1 runs on (property type, target ZIPs/areas, price band, max days‑on‑market, minimum resale spread). This is what makes the intake gate consistent and what you feed back to Bryan to tune the AI agent.

2. **MAO formula with real assumptions** — your standard % or $ figures for reno, closing, commissions, financing, holding, and required profit, so Stage 3 produces the same MAO regardless of who runs it.

> **Twin note — these two prerequisites already partly exist in the Brain:**
> - **Buy box** → `deal-pattern-buybox.md`: East Bay sub-$1M engine; RED zone =
>   Peninsula + rehab >25–30% + buy >$1.5M; hard ceiling "never past 85%."
>   Stage 1 should run on THIS. It's also where 8 historical losses came from —
>   the intake gate exists to stop that repeating.
> - **MAO / required profit** → the Redfin screening SOP tiers:
>   <$500K → ≥$50K profit · $500K–$999K → ≥$70K · $1M+ → $80–100K+ (Juan's-eyes-only).
>   Rehab as % of purchase must be stated; >25% cannot be a "Good Flip."
> Wire Stage 3's MAO calc to these numbers so the whole team underwrites identically.

---

## Standard of good work

**Not:** rows deleted, longest report, one AI question, staying busy.

**Yes:** real opportunity identified, patterns caught and fed back, accurate comps, risks found early, complete profile, effective offer strategy, agent trust, consistent follow‑up, deal moved toward a profitable close.