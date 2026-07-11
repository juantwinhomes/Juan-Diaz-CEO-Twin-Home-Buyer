# Twin Home Buyer — Design Standards (The Designer's Brain)

> Source of truth for the AI Designer agent. Juan's direction (voice note,
> 2026-07-09): given an address + photos + design intent, the Designer returns
> the full spec — **Sherwin-Williams color codes required**, plus finishes for
> hardware, windows, doors, garage doors. Team and buyers can ask the Designer
> how a project is moving forward.
>
> STATUS: v1 skeleton. Juan to approve/expand the standard palettes with 2–3
> past flips he's proud of (photos + what was used). Kristine to backfill
> actuals from past SOWs/receipts.

## How the Designer works (not technical, by design)

**Input:** property address · photos/video · design tier (see below) · any
Juan notes ("keep it light and modern," "this is a $700K buyer," etc.)

**Output — the Spec Sheet:**
1. Paint plan (SW codes: exterior body/trim/door + interior walls/trim/ceiling)
2. Flooring (LVP/carpet/tile by room)
3. Kitchen (cabinet color/style, counter, backsplash, faucet, appliance tier)
4. Baths (vanity, tile, fixtures)
5. Hardware package (door levers, hinges, pulls — finish family)
6. Windows / interior doors / front door / garage door
7. Exterior curb-appeal list (house numbers, lights, landscape basics)
Every line: item, spec/code, finish, where it goes, and budget tier.

## Design tiers (match spec to exit price — buy-box aligned)

| Tier | Exit price band | Philosophy |
|---|---|---|
| **T1 — Rental/Wholesale-ready** | n/a / sub-$500K | Safe, clean, durable. Bare-minimum 2-week scope. |
| **T2 — East Bay engine flip** | $500K–$1M | THE standard. Clean modern, light + bright, nothing custom. Where 80% of projects live. |
| **T3 — Premium** | $1M+ | Elevated finishes, statement front door/lighting. Juan approval required (matches his major-risk seat). |

## Standard palette — SEED (from past projects; Juan to confirm/expand)

### Sherwin-Williams (confirmed used before)
- **SW 9130 Evergreen Fog** — accent/exterior (from a prior full paint plan)
- _TODO Juan: the go-to white (Pure White SW 7005? Alabaster SW 7008?),
  greige (Agreeable Gray SW 7029?), trim white, front-door color(s)._

### Finishes
- _TODO: hardware finish family (matte black? brushed nickel?), LVP color/brand,
  cabinet white/shaker source, counter (quartz level), garage door style._
- Vendor history seen in past chats: Granite Expo (vanities/counters),
  Home Depot (bulk), Alpine Valley granite.

## Rules the Designer enforces

1. **Every paint call-out = a Sherwin-Williams code.** No "light gray." Codes.
2. Spec matches the TIER — no T3 finishes in a T2 house (that's how rehab
   creeps past the 25–30% red line).
3. One spec sheet per property, versioned in `projects/` — the team asks the
   Designer, not Juan, for "what color / what handle / what door."
4. Photos in → spec out → **Juan approves in one pass** → locked. Changes
   after lock get flagged (cost drift).

## Pilot project: 820 28th St, Oakland

The reset says stay in lane — so the Designer's first job is the focus deal:
new-construction spec, T2/T3 call by Juan, full SW palette + finish package
ready before Kiavi funds construction draws. In-lane, immediately useful.
