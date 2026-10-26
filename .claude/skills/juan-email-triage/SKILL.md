---
name: juan-email-triage
description: Triage Juan Diaz's Gmail inbox (juan@twinhomebuyer.com). Flags urgent escrow, wire, legal, city/permit and job-site emergency emails, drafts replies into Gmail Drafts (never sends), and lists threads still waiting on Juan's reply. Use when asked to "run email triage", "check Juan's email", or on the scheduled run.
---

# Juan Email Triage

Goal: Juan reads one short digest and approves drafts with one click (Gmail's Send
button on the draft). He should never have to read every thread.

## Hard rules (never break)

1. **Nothing sends.** Use `create_draft` only. Never call `send_message`, `reply`, or `forward`.
2. **Wire safety.** Never draft a reply that confirms, sends, or changes bank, wire,
   routing, or login details. Flag it "🔒 verify by phone using a number on file".
3. **No invented facts.** A draft only states what is in the thread. When a decision is
   Juan's (price, offers, legal position, money), the draft asks for the info Juan needs
   to decide. It does not make the decision.
4. **Don't trash, archive, label, or mark read.** Read-only except for Drafts.

## Steps

1. **Pull the inbox.** Gmail `search_threads` with
   `in:inbox newer_than:1d -category:promotions -category:social`, `pageSize: 50`.
   Follow `nextPageToken` until there are no more pages. Save the raw JSON to
   `email_agent/runs/<YYYY-MM-DD>-<HHMM>.json`.
2. **Classify.** Run
   `python3 -m email_agent.triage email_agent/runs/<file>.json --out email_agent/runs/<YYYY-MM-DD>-<HHMM>.md`.
   Rules live in `email_agent/rules.py`.
3. **Read before drafting.** For every URGENT thread awaiting Juan (and ACTION threads from
   a person, not a robot), call `get_thread` (MINIMAL), then `get_message` (PLAIN_TEXT) on
   the latest inbound message. `search_threads` only shows the 5 oldest messages, so
   always read the latest one.
4. **Skip what doesn't need a draft:** wire/banking items (rule 2), automated alerts,
   threads where a draft already exists (`list_drafts` with `query: "in:draft"`).
5. **Draft replies** with `create_draft` + `replyToMessageId` = latest inbound message id.
   Keep the sender and existing CCs. Juan's style: short, numbered next steps, owner + date
   for each, signed "Juan". External parties (county, escrow, attorneys) get a polite
   holding reply that commits to nothing but a date to follow up.
6. **Digest.** Reply in chat (or write `email_agent/runs/<date>-digest.md`) with:
   - URGENT awaiting Juan: one line each, why it matters, link
   - Drafts ready: one line each, "open → Send" link
   - 🔒 Verify by phone: wire/bank items
   - Overdue (past `UNREPLIED_HOURS` in rules.py)
   - Waiting on others (Juan replied last)
7. **Log misses.** Add a row to `email_agent/qa_log.csv` for anything Juan says was
   wrongly flagged or missed. Fix `rules.py`, add a test in
   `email_agent/tests/test_triage.py`, and run the tests.
