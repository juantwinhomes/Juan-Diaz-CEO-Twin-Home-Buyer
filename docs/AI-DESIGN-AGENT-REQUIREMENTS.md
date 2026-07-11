# AI Design Agent — Requirements

**Project:** Twin Home Buyer — "Juan-in-a-box" AI Design Agent
**Owner:** Juan Diaz (CEO) · **Building it:** Brian · **Driving it day-to-day:** Kristine
**Status:** Requirements draft (v1) — distilled from Juan's Grok design session + voice notes
**Goal in one line:** Stop asking Juan "what color? where's the carpet?" — let the AI make the design call the way Juan would, and only bring Juan in to approve.

---

## 1. Why this exists (the problem Juan is solving)

Right now every flip stalls on design decisions that only Juan makes: paint color, sheen,
carpet, flooring, fencing, lighting, garage door, landscaping. That doesn't scale.

Juan wants an AI agent that **thinks like him about design** so the team can run a house
end-to-end without pinging Juan for every choice. Juan stays as the *approver of taste*,
not the source of every decision.

> "No more 'Hey Juan, what color do you need? Where's the carpet, Juan?' None of that."

---

## 2. The single most important behavior (Juan said this twice)

The Grok thread is not really about paint colors. Juan used it to **teach the behavior he
wants the agent to have.** Two rules come straight from him:

### Rule 1 — Never accept the first answer. Keep pushing.
Juan re-prompted ~15 times before he got something he liked. The agent must expect to be
corrected and must keep refining toward the vision instead of declaring victory early.

> "Look how much I've been fighting with it. I don't just prompt one time and go OK, send
> it. No — I keep prompting, making it better and better."

### Rule 2 — Always show options first, then lock only what's approved.
The agent must present **3–4 directional options up front** (different siding treatments,
entry ideas, accent placements). A human (Juan first, later Kristine) picks one. **Only
then** does the agent lock colors/materials and build the full budget + shopping list.

> "It's gonna give us different variances in the beginning. I will approve it… eventually
> Kristine or somebody else will take the string."

**Build this into the agent's core prompt:**
> *"Always present 3–4 visual/directional options first. Do not lock colors, materials, or
> budget until a human approves a direction."*

---

## 3. How the agent must think about design (Juan's mental model)

### Step 1 — Anchor on location and what's trending there
Every decision flows from the city/market. The agent must research current trends for the
specific location before proposing anything.

- Example: **Petaluma = Sonoma/Napa wine country.** Relaxed, country, modern farmhouse.
  2026 trend = warm charcoal siding, white trim popping the roof pitch, wood/black accents.
- The agent should name the market, state the trend, and cite why (so Juan can sanity-check
  the reasoning, not just the swatch).

### Step 2 — Work from the ACTUAL house, not a fantasy house
Juan's biggest frustration in the thread: the AI kept showing two-story modern builds,
stone, and pink when the real house is a **single-story T1-11 house**. Hard requirement:

- The agent works from **uploaded photos + address of the real property.**
- Recommendations must be realistic for that structure and budget (e.g. paint + planks +
  a new door on T1-11 siding — **not** stone cladding or a rebuild).
- No fantasy renders that don't match the actual footprint.

### Step 3 — Cover every design category, and self-check for gaps
The agent owns the full decision list, not just paint. Categories Juan listed:

**Exterior**
- Siding treatment + paint (with **exact color code, brand, sheen/gloss level**)
- Trim / gables / roofline
- Front entry / recessed areas ("the cave") — the feature that adds the "twist"
- Garage door (design + color)
- Fencing
- Exterior lighting
- Landscaping

**Interior**
- Flooring
- Carpet
- Cabinets
- Lighting
- Hardware
- Fixtures / finishes

**Self-check requirement:** after proposing, the agent must ask *"What am I missing?"* and
fill gaps before finalizing. Juan does this manually every time — the agent should do it
automatically.

### Step 4 — Tie it to the money (ROI / ARV)
Every locked plan must include budget, quantities, where to buy, and the resulting ARV so
the design decision is also a financial decision.

- Example target from the thread: **~$90k rehab → ~$720k ARV.**
- Output should include quantities and a sourcing list (e.g. Home Depot / Empire) so the
  crew can execute without another round of questions.

---

## 4. Inputs the agent needs

| Input | Required | Notes |
|---|---|---|
| Property address | Yes | Drives the market/trend research |
| Photos of the actual house | Yes | Exterior + interior; no realistic plan without them |
| Rehab budget | Yes | Constrains material choices |
| Target ARV / comps | Preferred | Lets the agent optimize spend to value |
| Any "hard no's" from Juan | Optional | e.g. "no pink," "no stone," "no two-story looks" |

---

## 5. Outputs the agent must produce

1. **Market read** — city, trend summary, why it fits.
2. **3–4 directional options** — described (and ideally shown) for a human to choose.
3. **After approval — a locked Design Package** containing, per category:
   - Exact product: brand, color name **and code**, sheen/finish
   - Quantity needed
   - Where to buy + rough cost
4. **Budget + ROI** — total spend vs. projected ARV.
5. **Gap check** — "here's what I also considered / what still needs a decision."

See `docs/design-packages/petaluma-1464-sunrise.md` for a worked example in the exact
format the agent should output.

---

## 6. Roles / workflow (who does what)

1. **Juan** articulates the vision (voice notes, Grok/ChatGPT threads).
2. **Kristine** takes Juan's raw messages, runs them through the Juan AI Design Agent, and
   asks it: *"What is he asking for? How do I make this happen? What would Juan do here?"*
3. **Agent** produces options → gets approval → produces the locked package + budget.
4. **Kristine** (and eventually the crew) executes off the package — without pinging Juan.
5. **Juan** approves taste at the option stage only. Over time Kristine "takes the string."

---

## 7. Definition of done for the agent (acceptance criteria)

The agent is doing its job when:

- [ ] It researches the specific market before proposing anything.
- [ ] It presents 3–4 options and waits for approval before locking.
- [ ] It works from the real photos and never proposes something impossible for the house/budget.
- [ ] Every locked item has a brand, color code, sheen, quantity, and source.
- [ ] It runs its own "what am I missing?" gap check.
- [ ] It outputs budget + ARV.
- [ ] It keeps refining on feedback instead of defending its first answer.
- [ ] Juan can go a whole project without being asked a single "what color?" question.

---

*This is the bar. The agent should keep getting pushed until it delivers this level of
accuracy for every house — the same way Juan pushed the Grok thread until it was right.*
