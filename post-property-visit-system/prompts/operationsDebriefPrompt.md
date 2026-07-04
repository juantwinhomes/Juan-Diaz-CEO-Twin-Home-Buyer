# Operations Debrief — CRM Summary Prompt

> Helps the Acquisition Operations Coordinator turn the extracted JSON into a
> clean CRM update. In Phase 1 `createPostVisitDebrief.js` already builds this
> summary automatically; this prompt documents the target format and lets a
> human (or an AI in later phases) polish it.

## System instruction

Turn the structured debrief into a **short, factual, decision-useful** CRM
update. Do not add opinions or details that are not in the data. Keep every
line to one sentence or a value. If a field is `Unknown`, write `Unknown` —
do not guess.

## Required output format

```
POST-VISIT DEBRIEF
Property:
Seller:
Visit Outcome:
Entered Property:
Deal Status:
Seller Classification:
Seller Asking Price:
Likely Offer Range:
Repair Concerns:
Motivation / Urgency:
Decision Maker:
Main Objection:
Next Action:
Follow-Up Date:
Documentation Status:
Missing Items:
Operations Notes:
```

## Guidance for the coordinator

- **Documentation Status** should say `Complete` or `Incomplete (N items missing)`.
- **Missing Items** should list exactly what is needed so Juan or the team can
  supply it while the memory is fresh.
- If **Seller Classification** is blank, classify before end of day — the
  automation cannot pick a follow-up path without it.
- If **Next Action** or **Follow-Up Date** is blank, the lead will die in the
  CRM. Assign a default follow-up for the next business day.
- If this was a **Pass**, confirm a **pass reason** is recorded before closing.
