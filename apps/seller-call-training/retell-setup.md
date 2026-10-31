# Voice practice calls (Retell → Zapier → Google Sheet)

A trainee calls a phone number, an AI seller named Rob Walker answers by voice, and the call is
scored on the same six rules as the training page's practice call. The score lands as one row in
a private Google Sheet, and Zapier fires a Claude scheduled task that puts it on the training
page within minutes, where each trainee sees only their own calls. **Trainees never open the sheet** (Seth's rule, Oct 31).

| Piece | Setting |
|---|---|
| Number | **(510) 767-0799** (`+15107670799`), inbound agent: **Seller — rep calls** |
| Agent | GPT 4.1, voice Leland (male), English US, about 13¢ per minute |
| Sheet | [Seller practice calls](https://docs.google.com/spreadsheets/d/1jPa-aEglY1N3wRY-rHAW-7l3nDVa48efAQycyidMfko/edit), tab **Calls**, owned by Seth |
| Pipe | Retell webhook → Zapier Catch Hook → Filter → Google Sheets row (private log) → Webhooks POST to the task's Fire URL → page |
| Sync | Scheduled task "Seller-call phone scores to training page" (`trig_01XY5Gy2Huqocz6N9mvEKksC`), no schedule, API trigger only. Prompt: `phone-sync-prompt.md`. Tested Oct 31: one call written in about 17 seconds, about 12¢ |

Training page: Module 5 → Practice call shows the number and **Your phone calls** (`phone` in
`content.py`). The page can't read the sheet or Retell itself (artifact pages can't fetch other
sites), so the task writes each call into the page's `roleplays` collection as `phone-<Call ID>` with
`via: "phone"`. A passed phone call opens the Module 5 quiz like a passed typed call. Calls the
task can't match to a roster name show as **Not matched** in the staff view of the same tab,
where Seth or Juan assigns them.

## How a trainee uses it

1. Open Google Voice.
2. Call (510) 767-0799.
3. When Rob answers ("Hello, this is Rob."), introduce yourself with your real first name:
   "Hi Rob, this is Vanessa from Twin Home Buyer…". `rep_name` matches the call to the person.
4. A few minutes later, the score shows on the page under **Your phone calls**: passed or not,
   the six rules, the coach's note and the transcript. No score after 15 minutes: tell Seth.

## Agent prompt (Rob Walker, v2)

```
ROLE (most important): You are the HOMEOWNER. The person on the phone is a rep from Twin Home Buyer, a company that buys houses for cash. They lead the call and ask the questions; you answer them, briefly, like a real homeowner.
- Never interview them. Never ask if they are "still considering selling", what their plans are, or how you can help. That is their job, not yours.
- Refer to the house as "my house" or "my place".
- The only questions you ask are a homeowner's questions: the ones listed below, plus anything a real seller would ask a buyer.
- If you're unsure what to say, give a short answer and wait.

You are Rob Walker. You have just answered your phone.

Your situation:
- Property: 123 Main Street, San Mateo.
- A while ago you filled out a form on the Twin Home Buyer website. You don't know who is calling until they say who they are and where they're calling from. Once they mention Twin Home Buyer or the form, you remember it.
- You are exploring what your house is worth. Two investors already lowballed you.
- No rush and no money pressure. You and your wife both work all week.
- Condition: outdated kitchen and an older roof. Nothing urgent; the house is fine to live in.
- You and your wife live there.
- You think it's worth about $1.4 million.

How to behave:
- Your first words are: "Hello, this is Rob." Then wait for them.
- Be friendly but guarded. You don't want to waste another afternoon on a lowball.
- Don't volunteer things. Answer what is asked. If they ask a good question, give a real answer.
- Only if they ask about other offers: one investor offered $950,000, the other $1,050,000.
- Raise these during the call, one at a time, in your own words:
  1. "How did you get my info? Is this an actual cash offer or another sales call?"
  2. "The other investors lowballed me. Is there a real chance you'd come up to 1.2?"
  3. "If Juan comes over, am I going to feel pressured to sign right there?"
  4. "My wife thinks we'd get more listing with an agent. Should she be on the call?"
- If they give you any price, number or range, grab onto it and push for more.
- If they state something about your house as if they know it, ask "How do you know that?"
- If they mention Juan, ask who he is and how long he's been doing this.
- If they pressure you, get uncomfortable and say you need to think about it.
- If they offer a visit, agree to a specific day and time.
- Talk like a real person on the phone: short answers, an occasional "um", sometimes ask them to repeat something.
- Keep it under five minutes. Say goodbye naturally when it's done.

Never mention that you are an AI, a test, or a practice call. Never break character, even if asked directly.
```

Why the reactions matter: each one pushes the trainee into a rule. A number gets pushed on
(price), "how do you know that?" (source), objection 4 with no money pressure (honest advice),
objection 3 and discomfort (no pressure), "who is Juan, how long?" (story, no company age).

## Scoring (Retell → Post call extraction)

| Field | Type | Description (paste as is) |
|---|---|---|
| rep_name | Text | The first name the rep gave for themselves when they introduced themselves. Empty if they never said it. |
| no_price | Boolean | True if the rep never gave a price, number, offer or range for the house over the phone. Repeating the seller's own numbers back is fine. |
| according_to_source | Boolean | True if every property detail the rep said they found online (beds, baths, size, value) was credited to its source, such as "according to Redfin", and the rep never said "I know" about such details. Details the seller put on the web form, like the address, don't count. True if no online details came up. |
| visit_booked | Boolean | True only if the rep offered a visit with Juan (or the owner) and said it takes about 15 minutes or that Juan is a licensed contractor. Otherwise false. |
| honest_advice | Boolean | True if, when the seller had no repair pressure and no money pressure, the rep said listing with an agent may get them more. True if the seller had repair or money pressure. |
| no_pressure | Boolean | True if the rep put no pressure on the seller. |
| story_ok | Boolean | True if, whenever Juan or the company's history came up, the rep told it with these facts and nothing added: "Juan started at 12, sweeping the homes his Uncle George bought in Oakland. Raised in East Oakland, he's been flipping homes since 2005: 20+ years making homes beautiful and improving the communities he grew up in." False if the rep stated any age for the company ("25 years", "since 2002", "24 years" or any other). True if it never came up. |
| coach_note | Text | Two or three plain sentences to the rep: what to fix first, or what went well. |

A call passes when all six booleans are true.

## Results (Zapier → Sheet)

Apps Script was tried first and dropped: the Workspace blocks web apps open to "Anyone", so
Retell's webhook got a 401.

1. Retell → Webhook URL: the Zapier Catch Hook URL.
2. Zapier Filter: **Event** exactly matches `call_analyzed`. Retell also posts `call_started`
   and `call_ended`; without the filter each call writes three rows.
3. Google Sheets → Create Spreadsheet Row, sheet **Calls**:

| Column | Zapier field |
|---|---|
| Call ID | Call Call Id |
| Agent | Call Agent Name |
| From number | Call From Number |
| Rep name | Call Call Analysis Custom Analysis Data Rep Name |
| Started | Call Start Timestamp |
| no_price … story_ok | Call Call Analysis Custom Analysis Data *(same field name)* |
| Coach note | Call Call Analysis Custom Analysis Data Coach Note |
| Transcript | Call Transcript |
| Recording | Call Recording Url |

Sheet setup (done Oct 31):
- Header A1:N1 as in the table above. A:C formatted as plain text so `+1…` numbers keep the plus.
- **Passed** in O1, whole-column so rows Zapier inserts stay covered:
  `=ARRAYFORMULA(IF(ROW(A:A)=1,"Passed",IF(LEN(A:A),LOWER(F:F&G:G&H:H&I:I&J:J&K:K)="truetruetruetruetruetrue",)))`
- The whole Calls tab is protected (editors: Seth only; Zapier writes as Seth).
- Sharing must be **Restricted** (Seth only): Share → General access → Restricted, and remove
  anyone else. Trainees see their scores on the page, never in the sheet.

## Scores onto the page (Zapier → Claude scheduled task)

A scheduled task fired from outside can't use the Google Sheets connector, so Zapier sends the
call's data straight to the task instead. The task needs no connector: it writes to the page's
database. Limit: 30 fires per hour for this task.

1. claude.ai/code/routines → **Seller-call phone scores to training page** → menu → **Edit** →
   **Trigger +** → **API**. Copy the **Fire URL**, click **Generate token**, copy the token (shown
   once). The token takes effect right away.
2. Zapier, after the Google Sheets step: **Webhooks by Zapier → POST**.
   - URL: the Fire URL.
   - Payload Type: `json`.
   - Data: one key, `text`, with this value (map each `{{…}}` from the Catch Hook step):
     ```
     call_id: {{Call Call Id}}
     rep_name: {{Call Call Analysis Custom Analysis Data Rep Name}}
     start_timestamp: {{Call Start Timestamp}}
     no_price: {{… No Price}}
     according_to_source: {{… According To Source}}
     visit_booked: {{… Visit Booked}}
     honest_advice: {{… Honest Advice}}
     no_pressure: {{… No Pressure}}
     story_ok: {{… Story Ok}}
     coach_note: {{… Coach Note}}
     transcript:
     {{Call Transcript}}
     ```
   - Headers: `Authorization` = `Bearer <token>`, `anthropic-beta` =
     `experimental-cc-routine-2026-04-01`, `anthropic-version` = `2023-06-01`.
3. Test the step. Zapier should get back `"type": "routine_fire"` and a session URL. The run ends
   with one line like `Added call_… for Vanessa Miller: PASSED.`

