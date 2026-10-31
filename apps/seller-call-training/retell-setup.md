# Voice practice calls with Retell ("Seller — rep calls")

Goal: a trainee dials a phone number, a Retell AI seller answers by voice, and the call is scored
on the same six rules as the training page's practice call, with the result saved by name.

Agent today: **Seller — rep calls** (GPT 4.1, voice Cimo, English US, about $0.115 per minute, so
a 5-minute practice call costs about $0.58). Its prompt already says the seller "just answered
your phone", so the trainee is the one who dials.

---

## Step 1. A number to dial (Retell → Phone Numbers)

1. Buy a number (a Bay Area area code makes it feel real).
2. Set its **Inbound call agent** to the seller agent.
3. Leave outbound empty. Trainees call it from their own phones.

One number per practice seller is the simplest setup (see Step 2), so 3 numbers. To start
today with one, use **Lily**.

## Step 2. Fill in the three sellers

The prompt uses `{{variables}}`. An inbound call gets no values unless something supplies them.
Two ways:

- **Simplest:** duplicate the agent three times: "Seller – San Mateo", "Seller – Lily",
  "Seller – Easy". In each copy, set the values below. If your agent shows a
  **Default dynamic variables** section, put them there. If it doesn't, paste the text straight
  into the prompt in place of each `{{variable}}`. Give each copy its own number.
- **Later:** one agent and one number, with an inbound webhook that picks the seller per call.
  This needs a small server. Skip it for now.

Names and addresses are made up for practice. Situations and objections come from Juan's Oct 19
session, where ChatGPT played these sellers.

### Seller – San Mateo (from Oct 19)

| Variable | Value |
|---|---|
| seller_name | Rob Turner |
| property_address | 1820 Laurel Street, San Mateo |
| motivation | The house needs about $150,000 in repairs. Cash buyers have been calling you for months. An investor once walked through, said $1.2 million, then dropped to $950,000 after 3 days, so you don't trust investors. |
| timeline | No hard deadline, but you're tired of the repairs. You work all week; Saturday is your only free day. |
| condition | Dated kitchen and a leaking roof, about $150,000 of work. |
| occupancy | You live there. |
| price_expectation | At least $1.5 million. |
| seller_opener | Yeah, hello? |
| behavior | Skeptical and a little irritated. You have been burned by an investor before and you test whether they will pressure you. |
| holds_back | You still owe $800,000 on the mortgage and need at least $400,000 in your pocket. |
| objection | Why on earth would I sell to you instead of listing with an agent? Later: the last investor said 1.2 and dropped to 950 after 3 days, so what guarantee do I have you won't do the same? And: are you actually buying, or wholesaling it to someone else? |

### Seller – Lily (from Oct 19)

| Variable | Value |
|---|---|
| seller_name | Lily |
| property_address | 123 Main Street, San Mateo |
| motivation | You filled out a form on the Twin Home Buyer website. You are exploring what the house is worth. Two investors already lowballed you. |
| timeline | No rush. You and your husband both work all week. |
| condition | Outdated kitchen and an old roof. |
| occupancy | You and your husband live there. |
| price_expectation | About $1.4 million. |
| seller_opener | Hello, this is Lily. |
| behavior | Friendly but guarded. You do not want to waste another afternoon on a lowball. |
| holds_back | The two offers were $950,000 and $1,050,000. Your husband thinks you would get more listing with an agent. |
| objection | How did you get my info, is this an actual cash offer or another sales call? Later: if those guys were around a million, is there a real chance you'd come up to 1.2? And: if Juan comes, am I going to feel pressured to sign right there? |

### Seller – Easy (tests honest advice)

| Variable | Value |
|---|---|
| seller_name | Dana Brooks |
| property_address | 455 Oak Avenue, Redwood City |
| motivation | Just curious what a cash buyer would pay. |
| timeline | None. You could easily wait a few months. |
| condition | Good shape, recently updated, no repairs needed. |
| occupancy | You live there. |
| price_expectation | Not sure, maybe around $1.3 million. |
| seller_opener | Hello? |
| behavior | Relaxed and curious, in no hurry. |
| holds_back | You have no money pressure at all. |
| objection | Honestly, should I sell to you or list it with an agent? |

## Step 3. Score the call (Retell → Post call extraction)

Add these fields. Retell's AI fills them in from the transcript when the call ends. They are the
same six rules the training page uses.

| Field | Type | Description (paste as is) |
|---|---|---|
| rep_name | Text | The first name the rep gave for themselves when they introduced themselves. Empty if they never said it. |
| no_price | Boolean | True if the rep never gave a price, number, offer or range for the house over the phone. Repeating the seller's own numbers back is fine. |
| according_to_source | Boolean | True if every property detail the rep found online was credited to its source (for example "according to Redfin") and the rep never said "I know" about property details. True if no property details came up. |
| visit_booked | Boolean | True if the rep offered to book a 15-minute visit with Juan, a licensed contractor. |
| honest_advice | Boolean | True if, when the seller had no repair pressure and no money pressure, the rep said listing with an agent may get them more. True if the seller had repair or money pressure. |
| no_pressure | Boolean | True if the rep put no pressure on the seller. |
| story_ok | Boolean | True if, whenever Juan or the company's history came up, the rep told it with these facts and nothing added: "Juan started at 12, sweeping the homes his Uncle George bought in Oakland. Raised in East Oakland, he's been flipping homes since 2005: 20+ years making homes beautiful and improving the communities he grew up in." False if the rep stated any age for the company ("25 years", "since 2002", "24 years" or any other). True if it never came up. |
| coach_note | Text | Two or three plain sentences to the rep: what to fix first, or what went well. |

A call passes when all six booleans are true.

Trainees must say their real first name when they introduce themselves ("Hi, this is Vanessa
from Twin Home Buyer"). Module 2 teaches that opener anyway, and `rep_name` uses it to match the
call to the person.

## Step 4. Send results out (Retell → Webhook settings)

Retell posts a `call_analyzed` event with the transcript and the fields above. Point the webhook
at the receiver in `retell-webhook.gs` (a Google Apps Script web app that writes one row per call
to a Google Sheet). Deploy it in 5 minutes:

1. Create a Google Sheet named **Seller practice calls**.
2. Extensions → Apps Script. Paste `retell-webhook.gs`. Save.
3. Deploy → New deployment → Web app. Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the URL.
4. Paste the URL into Retell → Webhook settings (agent or account level).
5. Make one test call, then check that a row appears.

## Step 5. Results on the training board

The training page can't receive webhooks directly. Once rows land in the Sheet, a scheduled
Claude task copies new calls onto the board (`roleplays`, marked `via: "phone"`). Each one shows
under Juan's **Every answer**, and a passed phone call opens the Module 5 quiz just like a passed
typed call. Until that is on, the typed practice call on the page still works.
