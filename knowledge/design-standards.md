# Twin Home Buyer — Design Standards (The Designer's Brain)

> Source of truth for the AI Designer agent. Juan's direction (voice note,
> 2026-07-09): given an address + photos + design intent, the Designer returns
> the full spec — **Sherwin-Williams color codes required**, plus finishes for
> hardware, windows, doors, garage doors. Team and buyers can ask the Designer
> how a project is moving forward.
>
> STATUS: v1 skeleton, requirements sharpened 2026-07-11 from Juan's Grok
> working session (photo protocol, local/ZIP market research, live vendor
> stock check now mandatory — see sections below). Still open: Juan to
> approve/expand the standard palettes with 2–3 past flips he's proud of
> (photos + what was used). Kristine to backfill actuals from past SOWs/
> receipts.

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

## Local Market Research (before proposing a palette)

Colors aren't generic — they're pulled to the property's specific city/ZIP.
Before finalizing a palette, the Designer researches what's currently
trending in that market and states it as the "why":

- Petaluma / Sonoma County (94952/94954) properties → wine-country Napa/
  Tuscan-hills vibe: warm creams, terracotta accents, oil-rubbed bronze,
  drought-tolerant landscaping (olive, lavender, manzanita, Ceanothus).
- Other markets get their own pull — East Bay flips (Oakland/Hayward/San
  Leandro) lean the T2 clean-modern standard below, not wine country.
- Cite what's actually trending (comps, curb-appeal examples) — not a
  generic guess.

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
5. Local market research and the live vendor stock/price check (above) are
   mandatory before a spec goes out — not optional add-ons.
6. Missing data (measurements, counts, panel status) gets called out by name
   in the output, not silently assumed.
7. Juan never picks a color, handle, or fixture. He approves a finished
   proposal in one pass — the Designer/Kristine own getting there.

## Pilot project: 1464 Springdale Way, Petaluma

**This is the first live test of the Designer agent end to end** (Juan's
call, 2026-07-11). Newly-bought property, quick flip/cosmetic makeup before
listing — not new construction, existing T1-11 siding and a garage door that
needs to go. Target vibe: Napa/Petaluma-hills wine-country, on a tight
budget (see Local Market Research). Spec sheet: `projects/1464-springdale-way-
petaluma-design-spec.md` — currently a stub, waiting on photos per the Photo
Protocol above before the Designer can run the full spec.

## Also in the pipeline: 820 28th St, Oakland

Reset-focus deal — new-construction spec, T2/T3 call by Juan, full SW
palette + finish package ready before Kiavi funds construction draws.
