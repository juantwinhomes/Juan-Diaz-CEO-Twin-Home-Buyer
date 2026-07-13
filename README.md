# REI BlackBook Inbox Automation

Automates the **Profit Dial → Texts inbox** in REI BlackBook. When a lead texts one of
your Profit Dial numbers:

1. REI BlackBook fires a webhook to this service.
2. Claude drafts a reply in your voice, following the rules in
   [`config/business-rules.md`](config/business-rules.md) and the contact's full
   conversation history.
3. The draft either **waits for your one-tap approval** on a mobile-friendly dashboard
   (default), or **sends automatically** back through an REI BlackBook workflow
   (`REPLY_MODE=auto`).

Built-in guardrails: `STOP`/opt-out detection (opted-out contacts are never replied to),
quiet hours for auto-send, a safe fallback reply if Claude is unreachable, and hard
business rules (the AI never commits to a price or terms).

```
Lead texts your Profit Dial number
        │
        ▼
REI BlackBook workflow ── webhook ──► POST /webhook/inbound-text
                                              │
                                     Claude drafts a reply
                                              │
                          ┌───────────────────┴───────────────────┐
                 REPLY_MODE=approve                        REPLY_MODE=auto
                          │                                        │
              dashboard: review / edit / send           POST to REI BlackBook webform
                          │                                        │
                          └──────────────► "Send AI Reply" workflow texts the lead
```

## Quick start

```bash
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY and DASHBOARD_TOKEN at minimum
npm start                 # listens on :3000
npm test                  # run the test suite
```

Deploy anywhere that runs Node 20+ and has a public HTTPS URL (Railway, Render, Fly.io,
a VPS). REI BlackBook needs to reach `https://<your-host>/webhook/inbound-text`.

Open the dashboard at `https://<your-host>/dashboard?token=<DASHBOARD_TOKEN>`.
Check service status at `/health`.

## REI BlackBook setup (one time, ~15 minutes)

### A. Send inbound texts to this service

1. In REI BlackBook, open **Workflow Builder** and create a workflow triggered when a
   contact **sends an inbound text** to your Profit Dial number(s).
2. Add a **Webhook** step pointing to:
   `https://<your-host>/webhook/inbound-text?secret=<WEBHOOK_SECRET>`
3. Map the fields: contact phone → `phone`, message body → `message`, first/last name →
   `first_name` / `last_name`. (Different labels? Set the `WEBHOOK_FIELD_*` variables in
   `.env` instead of renaming things in REI BlackBook.)

### B. Let this service send replies (needed for approve-send and auto mode)

REI BlackBook has no public "send SMS" API, so replies go back in through a webform that
triggers a texting workflow:

1. Create a **custom field** on contacts named `ai_reply` (text).
2. Create a **webform** with fields `phone`, `first_name`, `last_name`, and `ai_reply`.
   Copy its POST URL into `REIBB_SEND_WEBFORM_URL` in `.env`.
3. Create a workflow triggered by that webform submission with a single **Text Reply**
   step whose message is the merge field for `ai_reply`, sent from your Profit Dial
   number.

### C. Get notified in Google Chat when a draft needs approval

1. In **Google Chat**, open (or create) the space where you want alerts.
2. Space name → **Apps & integrations** → **Webhooks** → **Add webhook**, name it
   (e.g. "Lead Texts"), and copy the webhook URL.
3. Paste it into `NOTIFY_WEBHOOK_URL` in `.env`, and set `PUBLIC_BASE_URL` to this
   service's public URL so the message includes a **Review & send** link.

Each inbound lead text then posts a Chat message with the lead's name and message, the
AI-suggested reply, and a one-tap link to approve it.

(Non–Google Chat URLs — Slack, Zapier, Make — also work; they receive a generic JSON
POST instead.)

## Configuration

Everything is set via environment variables — see [`.env.example`](.env.example) for the
full annotated list. The two behavior switches:

| Setting | Values | What it does |
|---|---|---|
| `REPLY_MODE` | `approve` (default) / `auto` | Whether drafts wait for you or send themselves |
| `QUIET_HOURS_*` | tz + start/end hour | Auto-send is suppressed at night; drafts queue for approval instead |

To change how replies sound, edit [`config/business-rules.md`](config/business-rules.md)
— it's plain English, no code.

## Compliance notes

- Only text leads who contacted you first or otherwise consented (TCPA).
- `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` permanently opt a contact out of
  AI replies in this service. Keep REI BlackBook's own opt-out handling on too.
- Start in `approve` mode. Move to `auto` only once you trust the drafts, and consider
  keeping price-sensitive conversations human-approved permanently.
