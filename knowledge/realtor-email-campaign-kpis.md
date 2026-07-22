# Realtor Email Campaign — Setup & KPI Playbook

**Campaign:** "Realtors July 2026" (Instantly) · ~900 realtor list · launched July 2026
**Owner:** Carlo James Ballerda (campaign) · PH team (unibox) · Seth (oversight)
**Goal:** referral deal flow from Bay Area agents (agent keeps commission as agent
of record, or hands off for a referral fee — fee amount TBD by Juan).

## Campaign configuration (as launched)

- **Sequence:** 5 A/Z variants on step 1, 2 follow-ups in-thread (day ~3–4 and ~8).
  Follow-ups have no subject (send as reply bumps).
- **Subjects:** `{{firstName}}, question about off-market sellers` / `tough listings`
  / `{{firstName}}, quick question` / `referral fee` / `stuck listings`
- **Winning metric:** Reply Rate (open/link tracking disabled by design — the
  tracking pixel hurts deliverability and open data is unreliable anyway).
- **Delivery settings:** text-only (no HTML), stop-on-reply ON, provider matching
  ON, domain limiter 3/day per company domain, 9+14 min randomized gaps,
  unsubscribe header ON + visible Unsubscribe link + "reply no" line in body.
- **Compliance:** physical address in every email; unsubscribe link auto-adds to
  Instantly workspace blocklist (permanent suppression); "no" replies marked
  unsubscribed manually same day.

## Known risks / open items (as of 2026-07-22)

- ⚠️ Early sends went out from **root-domain accounts (juan@twinhomebuyer.com
  etc.)** — standing directive: cold volume moves to lookalike-domain accounts
  (pre-warmed, ~$350) and root domain accounts come out of the campaign.
- ⚠️ At least one hard bounce (dead address) before list verification — full list
  must be verified (MillionVerifier) before further volume.
- Referral fee dollar amount not yet set by Juan — emails say "referral fee at
  closing" until he sets it.
- Google Workspace legal footer ("privileged and confidential") must stay OFF on
  sending accounts.

## KPI funnel

Sent → Delivered (100% − bounces) → Replies → Positive replies → Appointments →
Offers → Referral deals closed.

### Daily (PH team, ~10 min)

| KPI | Where | Threshold / rule |
|---|---|---|
| Bounce rate | Analytics | **>3% → PAUSE campaign, re-verify list.** <1.5% healthy |
| Replies answered | Unibox | Same business day, zero exceptions |
| "No" / unsubscribes processed | Unibox | Marked unsubscribed same day (compliance) |
| Account health scores | Accounts tab | <90% → pull account from rotation, warmup only |
| Sends going out | Analytics | Daily sends ≈ daily limit; investigate stalls |

### Weekly (Kristine's Monday dashboard / Juan's Sunday review)

| KPI | Benchmark |
|---|---|
| Reply rate | 2–5% solid; **<1% after 2 full weeks = copy/list problem — intervene** |
| Positive reply rate | ~⅓ of replies should be positive; tag every reply Interested / Not / Wrong person |
| Variant leaderboard | After ~100 sends/variant: kill bottom 2, reroute volume to winners |
| Appointments set | The KPI Juan actually watches |
| Offers sent / deals in escrow | The money row |

### Silent killers

- **Bounces** — fastest reputation damage; verified list keeps this near zero.
- **Spam complaints** — invisible directly; symptom = reply rate collapsing
  week-over-week on stable volume. If so: pause, test-send to own Gmail, check
  inbox placement before resuming.

## Weekly report format for Juan (one block, numbers + winner + next action)

> Realtor campaign wk N: X sent, X% bounce, X replies (X%), X interested,
> X calls booked, X properties under review. Variant "___" leading at X% reply.
> Next: ___.

## Scaling rules

- Start 30/day → step up weekly (30 → 60 → 100+) only while bounce <2% and
  health scores ≥90%.
- New lists always verified before upload; never mix unverified leads in.
- "Not now / keep me in mind" replies → 30/60-day nurture subsequence (to build
  in week 2+).
