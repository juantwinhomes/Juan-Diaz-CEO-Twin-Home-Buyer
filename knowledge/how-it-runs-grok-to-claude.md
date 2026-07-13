# How It Runs: Grok → Christine → Claude

> The one-page operating picture for the whole team. Who does what, where, and
> how a house actually moves through the system. Written for Christine (the
> operator) but everyone should read it once.

## The big idea

We have **two AI "people," both living on Claude:**

- **Juan (the CEO Twin)** — thinks and decides like Juan. Ask it strategy,
  deals, negotiation, priorities, money. It's Juan, always on, never tied up.
- **The Designer** — turns a house into a buildable finish + rehab plan:
  Sherwin-Williams color codes, flooring, kitchen, baths, hardware, doors,
  garage door, landscaping, and a phased cost estimate.

**Grok is not a third system — it's Juan's sketchpad.** Juan dreams up the
*look* in Grok (that's where he generates images and iterates). Claude is
where that look becomes real, tracked, and team-usable.

The flow, in one line:

> **Juan visualizes in Grok → Christine brings it into Claude → the Designer
> turns it into the locked spec → the team builds → anyone asks Juan or the
> Designer questions here.**

## Christine's job (the operator seat)

You are the bridge. Juan and Brian shouldn't be the bottleneck — you are the
one who keeps the machine turning:

1. **Take what Juan drafts in Grok** and bring it into Claude (see the image
   step below).
2. **Run the Designer** on each new property — feed it the address, photos,
   and tier; get the spec.
3. **Keep the specs organized** — one per property under `projects/`.
4. **Keep the knowledge current** — new facts about a deal, a vendor, a
   preference → tell the Twin so it remembers.
5. **Approve and hand off** — you and Brian sign off on specs and hand them to
   the crew. Only a $1M+ premium (T3) house goes to Juan for a quick yes.

## The house workflow (repeat for every property)

1. **On-site photos.** Whoever's at the house shoots the shot list in
   `knowledge/photo-cheat-sheet.md` (whole house, siding, garage, all 4 sides,
   kitchen, baths, damage). Foolproof — don't let them zoom on the floor.
2. **Design the look.** If the look still needs deciding, Juan (or you) plays
   with it in Grok — generate a picture, react, refine until it's right. Juan
   never takes the first answer; keep pushing.
3. **Bring it to Claude.** Paste the approved image + address + tier here and
   ask the Designer to spec it.
4. **Get the spec.** The Designer returns the full plan — SW codes + sheen,
   finishes, garage door, landscaping — plus a phased rehab cost estimate,
   and flags anything still missing (measurements, etc.).
5. **Approve + build.** You/Brian sign off, pull bids, hand to the crew.
6. **Later questions** ("what color's the trim?", "how much was the rehab?")
   → ask the Designer here. It answers from the saved spec. Nobody texts Juan.

## The image step (Grok → Claude, for now)

Claude writes the spec; it does **not** generate pictures. Grok does. So today
the picture step is a simple copy-paste:

1. Generate / finalize the yard or exterior look in **Grok**.
2. Screenshot or save the image Juan approved.
3. **Paste it into Claude here** and say what you want ("spec this," "what
   colors match this look," "estimate the rehab").

That's it — zero setup, works today. (We looked at wiring Grok's image
generator directly into Claude so you could do it all in one chat. It's
possible but it's a developer build + a monthly API bill — not worth it during
the cash reset. If pasting images ever becomes the bottleneck, we revisit it
then.)

## How to talk to these agents (match Juan's style)

Same rules whether you're talking to the Twin or the Designer — this is how
Juan communicates, so mirror it (full detail in
`knowledge/juan-grok-prompting-profile.md`):

- **Lead with what you want.** "Spec the Petaluma front yard" beats a paragraph
  of preamble.
- **Bring the facts** — address, tier, budget, photos.
- **Push back.** If the first answer isn't right, say so and make it refine.
  Juan does this constantly; the agents expect it.
- **Ask for a recommendation, not just options.** "What should we do?" — the
  agents are built to make the call, not just list choices.
