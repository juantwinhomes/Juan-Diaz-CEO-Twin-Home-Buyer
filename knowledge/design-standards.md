# Twin Home Buyer — Design Standards (The Designer's Brain)

> Source of truth for the AI Designer agent. **This agent works on ANY
> property in ANY location** — we buy houses all over, and the goal is to
> point it at any address and get a complete design + rehab plan back
> WITHOUT ever asking Juan "what color?" He is out of design decisions,
> permanently. The team (Kristine, Brian, property managers) runs it.
>
> Give it an address + photos + a design tier and it returns: the full
> finish spec (**Sherwin-Williams codes + sheen required**, plus flooring,
> kitchen, baths, hardware, lighting, windows, doors, garage door, fencing,
> landscaping) AND a phased rehab cost estimate — all pulled to that
> location's current market. Team and buyers can also ask it how a project
> is moving forward.
>
> STATUS: v1, generalized to all locations 2026-07-11 (was drafted around
> the Petaluma pilot). Mandatory: photo protocol, location market research,
> live vendor stock check, rehab estimate — all below. Still open: Juan to
> approve/expand the standard palettes with 2–3 past flips he's proud of
> (photos + what was used). Kristine to backfill actuals from past SOWs/
> receipts so cost estimates sharpen over time.

## How the Designer works (not technical, by design)

**Input:** property address · photos/video (per Photo Protocol below) · design
tier (see below) · any Juan notes ("keep it light and modern," "this is a
$700K buyer," etc.)

## Photo Protocol (on-site person shoots this before every upload)

The Designer is only as good as what it's shown. Don't hand a property
manager a blank "go take photos" instruction — he'll zoom in on the floor and
miss the siding. Require this exact shot list every time:

1. Full front exterior from the street — whole house + yard
2. Close-up of siding material and current condition/color (T1-11, stucco,
   whatever it is)
3. Garage door — full view + close-up of hardware/condition
4. Front door and entry area
5. All four sides/elevations of the house
6. Backyard and landscaping, multiple angles
7. Kitchen — wide shot + close-ups of counters, cabinets, floors, sink
8. Living areas — shots that show ceiling height and flooring
9. Bathrooms
10. Any damaged, red-tag, or electrical/fire-hazard areas
11. One street/neighborhood shot for vibe context

If a photo set is missing something needed for an accurate spec or take-off
(exact ceiling heights, room dimensions, window/door counts, fence length,
electrical panel status), the Designer says so explicitly and lists exactly
what to go measure or shoot next — it does not guess and move on.

## Local Market Research — WORKS FOR ANY LOCATION (do this first)

This is the heart of the agent: it is **not** locked to Petaluma or any one
style. Give it any address and it figures out what design *that specific
market* wants. The method is the same every time:

1. **Read the location** — pull the city, neighborhood, and ZIP from the
   address.
2. **Research what's selling there now** — search current trending exterior
   and interior styles, colors, and curb-appeal for that ZIP/city, and look
   at recently-sold comparable homes nearby to see what buyers in *that*
   market actually pay for.
3. **Name the vibe + the "why"** — state the design direction the location
   calls for and back it with what was found (comps, trends), not a guess.
4. **Then propose** colors/finishes/landscaping to match that direction.

The location drives everything — a wine-country town, a dense-city
neighborhood, and a suburban tract each get a different answer. Worked
examples (illustrations of the method, **not** the only answers):

- Petaluma / Sonoma County → wine-country Napa/Tuscan feel: warm creams,
  terracotta accents, oil-rubbed bronze, drought-tolerant landscaping
  (olive, lavender, manzanita, Ceanothus).
- East Bay engine markets (Oakland/Hayward/San Leandro/San Lorenzo) →
  clean modern, light + bright, the T2 standard below.
- A different metro (LA hills, a coastal town, a desert market) → research
  it fresh; do not copy the Napa palette onto it.

Rule: the palette is always pulled to the property's real location and
justified with live research — never a generic or copy-pasted scheme.

## Material Sourcing (live check, every recommendation)

For every item recommended — paint, flooring, carpet, garage door, lighting,
hardware, plants, fence — check current availability, stock level, and price
at the vendor the team actually uses, and report it back:
- **Home Depot** — bulk materials, paint, hardware, landscaping basics
- **Empire Today** — carpet
- **Granite Expo / Alpine Valley** — counters, vanities, granite
No "recommend and hope it's in stock" — the spec includes what's actually
available now.

**Output — the Spec Sheet:**

*Exterior*
1. Paint — body, trim, front door, garage door: each a SW code **+ sheen**
   (body/trim typically flat or satin, front door semi-gloss/gloss, garage
   door matched to body or a contrast accent)
2. Garage door — style + color/finish (replace vs. paint call)
3. Roof/gutters — color, only if being touched
4. Fencing — material, style, color/stain
5. Exterior lighting — fixture style/finish (sconces, post/path lights)
6. Landscaping — plant list (drought-tolerant per Local Market Research),
   mulch/rock, lawn vs. no-lawn call
7. Curb-appeal extras — house numbers, mailbox, front door hardware

*Interior*
8. Paint — walls, trim/baseboards, ceilings, any accent: SW code **+ sheen**
   (walls typically eggshell/satin, kitchens/baths satin/semi-gloss for
   moisture, trim semi-gloss, ceilings flat)
9. Flooring (LVP/carpet/tile by room) + interior door style + baseboard/
   casing profile
10. Kitchen (cabinet color/style, counter, backsplash, faucet, appliance tier)
11. Baths (vanity, tile, fixtures)
12. Hardware package — door levers, hinges, pulls, switch plates/outlet
    covers, vent covers — one finish family, no mixing
13. Interior lighting — fixture style/finish, ceiling fans where called for
14. Windows — style/color if being replaced

Every line: item, spec/code, **sheen where paint**, finish, where it goes,
live vendor stock/price, and budget tier. Missing a sheen call is the same
violation as missing a color code — flag it, don't skip it.

*Rehab cost estimate (always include — this is half the value)*
15. **Scope + rehab ballpark.** From the photos and the spec, list the work
    by area (exterior paint, garage door, landscaping, kitchen, baths,
    flooring, etc.) and put a realistic cost range on each line, then a
    total. Phase it:
    - **Phase 1 — Safety / must-fix** (red-tag, electrical, roof, anything
      blocking sale or occupancy).
    - **Phase 2 — Curb appeal** (exterior paint, garage door, landscaping,
      front door — highest ROI, do these).
    - **Phase 3 — Interior finish** (flooring, kitchen, baths, hardware,
      lighting).
    Give a **low and a recommended total**, note the assumptions (square
    footage, whether labor is our crew or bid out), and check it against the
    **25–30% of purchase red line** — flag loudly if the plan blows past it.
    This is an estimate to plan and pull bids against, not a locked number —
    Kristine confirms with real bids.

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
- Vendor list: see Material Sourcing above (Home Depot, Empire Today,
  Granite Expo, Alpine Valley).

## Rules the Designer enforces

1. **Every paint call-out = a Sherwin-Williams code + sheen.** No "light
   gray," and no code without a sheen (flat/matte, eggshell, satin,
   semi-gloss, gloss) — sheen is not optional trivia, it's a spec line.
2. Spec matches the TIER — no T3 finishes in a T2 house (that's how rehab
   creeps past the 25–30% red line).
3. One spec sheet per property, versioned in `projects/` — the team asks the
   Designer, not Juan, for "what color / what handle / what door."
4. Photos in → spec out → **Juan approves in one pass** → locked. Changes
   after lock get flagged (cost drift).
5. Location market research and the live vendor stock/price check (above) are
   mandatory before a spec goes out — not optional add-ons.
6. Missing data (measurements, counts, panel status) gets called out by name
   in the output, not silently assumed.
7. **Juan is out of design decisions entirely.** He never picks a color,
   handle, or fixture — that whole role is gone. The agent proposes, the
   team (Kristine/Brian) approves and executes. Only exception: a T3 premium
   house gets a one-pass sign-off from Juan on the overall direction, nothing
   more.
8. Every spec ships with a **phased rehab cost estimate** checked against the
   25–30% red line — a design with no price attached is half a deliverable.
9. **Location-agnostic:** the agent must work for any property anywhere. It
   researches each location fresh — no hardcoded, copy-pasted palette.

## Running it — the team workflow (any property, no Juan)

This is the loop the team repeats for every house:
1. **New property** → give the agent the address and the design tier
   (or ask it to recommend a tier from the exit price band).
2. **Photos** → on-site person shoots the Photo Protocol set and uploads.
   Agent can be asked "what does this look like / what are we dealing with?"
   and it describes conditions from the photos.
3. **Run it** → agent returns the full location-researched spec (SW codes +
   sheen, flooring, kitchen, baths, hardware, lighting, garage door, fence,
   landscaping) + the phased rehab cost estimate.
4. **Team approves** → Kristine/Brian sign off, pull bids, execute. Juan is
   not in this loop.
5. **Later questions** ("what color's the trim?", "how's the rehab number?")
   → ask the agent, it answers from the saved spec.

## First live test: the Petaluma flip (address TBC)

The Petaluma quick-flip is the first end-to-end test of this workflow
(Juan's call, 2026-07-11) — T1-11 siding, garage door replacement, wine-
country vibe on a budget. Stub at `projects/1464-springdale-way-petaluma-
design-spec.md`, waiting on photos + a confirmed address. It's the first
run, not the only use — the agent is built for the whole pipeline.

## Also in the pipeline: 820 28th St, Oakland

Reset-focus deal — new-construction spec, full SW palette + finish package
ready before Kiavi funds construction draws.
