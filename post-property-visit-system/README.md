# Post-Property Visit Conversion System

**Equity Track Inc.** — captures Juan Diaz's field judgment after every property
visit and converts it into structured follow-up actions, seller classification,
documentation scoring, CRM-ready output, and KPI reporting.

> **Core principle: Juan is the driver. Operations is the pit crew.**
> Juan's only required output is (1) a short voice note after every visit and
> (2) photos/videos only when a property is viable, under contract, or needs
> team review. The system does the admin.

---

## Build phases

| Phase | Goal | Keys needed |
|-------|------|-------------|
| **1 (done)** | Local MVP — process a sample folder + transcript into a full debrief | None |
| **2 (done)** | Google Drive folder scanning (via this session's Drive connection) | None yet |
| **3 (done)** | Voicenotes transcript intake + pluggable extraction engine | None yet |
| 3b | Upgrade extraction to Claude API for messy speech | AI API key |
| **4 (done)** | REI BlackBook-ready output (contact, tags, stage, task, webhook payload) | None yet |
| **5 (done)** | Missing-documentation notifications (severity + escalation + log + draft email) | None yet |
| 6 | KPI logging + weekly review | None |
| 7 | Live CRM / Monday / API wiring | All above |

We build the **logic first with sample data**, prove it's correct, then connect
live systems.

---

## Phase 1 — Local MVP (what runs today)

Given a property-visit folder on disk, the system:

1. Scans the folder and counts photos / videos / audio / documents.
2. Reads Juan's voice-memo **transcript**.
3. Extracts the deal facts (price, offer, repairs, motivation, decision maker…).
4. Classifies the seller (one of 8 classifications).
5. Assigns the follow-up owner, sequence, and date.
6. Scores documentation across 7 fields and lists what's missing.
7. Produces the full debrief JSON + a clean CRM-ready summary.

**No internet, no API keys, no risk.**

### Requirements

- Node.js 18+ (tested on Node 22). Check with `node --version`.
- No `npm install` needed — Phase 1 uses only Node's built-in modules.

### Run it

```bash
cd post-property-visit-system

# Process the built-in sample visit (reads src/data/sampleVisitInput.json):
node index.js

# Or process any folder directly:
node index.js "sample-visits/2026-07-04 - 4710 Blum Rd - Maria Santos"
```

The full debrief JSON is written to `src/data/sampleDebriefOutput.json`.

### Test it

```bash
npm test        # runs node --test — should show "# pass 10  # fail 0"
```

### Confirm it works ✅

You should see:
- Folder scan reporting **Photos: 6 | Video: 1 | Audio: 1 | Docs: 1**.
- Seller Classification: **Family Decision**.
- Asking **$550,000**, Likely Offer **$450,000**, Motivation **6/10**.
- Follow-Up Date **2026-07-18** (two weeks after the 2026-07-04 visit).
- Documentation Status: **Complete**, Missing Items: **None**.
- All **10 tests pass**.

### Try the failure modes yourself

Edit `sample-visits/.../voice-note-transcript.txt` and re-run to see the system
adapt:

- Remove the transcript text → `voice_memo_received: No` and a coordinator note.
- Change "went inside" to "no entry" → photos become **Not Required**.
- Change "pursue" to "hard pass" → classification **Pass**, pass reason captured.

---

## Phase 2 — Google Drive folder scanning

Phase 2 reads a **real Google Drive property-visit folder** and runs it through
the same Phase 1 brain. The Node script can't log in to Drive by itself, so the
folder listing + transcript are fetched by the connected Drive session and
saved as a snapshot in `src/data/driveVisitInput.json`. `googleDriveService.js`
normalizes that snapshot into the standard scan object.

### Run it

```bash
node index.js --drive src/data/driveVisitInput.json
```

### What the snapshot contains

```jsonc
{
  "folderId":   "…",          // Drive folder id
  "folderTitle":"123 main st ",// used to parse date/address/seller
  "viewUrl":    "https://…",   // human link
  "createdTime":"2026-07-04T…",// visit_date fallback when name has no date
  "transcriptText": "",        // voice-note transcript text (empty if none)
  "files": [                   // the folder listing
    { "title": "IMG_0167.HEIC", "mimeType": "image/heif" }
  ]
}
```

Files are classified by **MIME type** first (so `image/heif` HEIC photos count),
then by extension. If the folder name has no date, the Drive `createdTime` is
used so a follow-up date can still be computed.

### Naming tip for Juan/Ops

Name each Drive folder `YYYY-MM-DD - Address - Seller` (e.g.
`2026-07-04 - 4710 Blum Rd - Maria Santos`) so the system auto-fills the date,
address, and seller. It still works without this — it just can't auto-fill
those fields.

### Phase 7 upgrade path

To make this fully automatic (no session in the loop), add a
`fetchDriveFolder(folderId)` to `googleDriveService.js` that calls the Google
Drive API with a service-account key (see `.env.example`) and returns the same
`{ folderTitle, files, transcriptText, createdTime }` shape. Everything
downstream is unchanged.

---

## Phase 3 — Voicenotes intake + pluggable extraction

Juan records a memo in the **Voicenotes** app after each visit. Voicenotes
already transcribes it. This Claude session pulls the note (title, transcript,
date) and saves it to `src/data/voicenoteVisitInput.json`;
`voicenotesService.js` cleans the transcript (strips `<br/>`/HTML) and turns it
into the standard scan object. The memo itself supplies the property address
when Juan says it.

### Run it

```bash
node index.js --voicenote src/data/voicenoteVisitInput.json
```

### Combine the memo with Drive media

Add a `"drive"` block (same shape as `driveVisitInput.json`) inside the
voicenote input to merge the memo with the property's photos/video:

```jsonc
{
  "note": { "uuid": "…", "title": "…", "date": "…", "transcript": "…" },
  "drive": {
    "folderTitle": "2026-07-04 - 4710 Blum Rd - Maria Santos",
    "files": [ { "title": "front.jpg", "mimeType": "image/jpeg" } ]
  }
}
```

### The extraction engine is pluggable (`aiDebriefService.js`)

`createPostVisitDebrief` calls `extractDebriefFacts(transcript, { engine })`:

- **`local`** (default, no key): the rule-based parser in `voiceNoteService.js`.
- **`claude`** (Phase 3b): a Claude API call using
  `prompts/juanVoiceMemoExtractionPrompt.md`. Enable by installing
  `@anthropic-ai/sdk`, setting `ANTHROPIC_API_KEY` + `EXTRACTION_ENGINE=claude`
  in `.env`, and uncommenting `extractWithClaude()`.

Both engines return the identical fact object, so nothing downstream changes.

### What Juan should say for full auto-classification

The local parser reads a memo well when it includes: address, **did I go
inside (yes/no)**, are we **pursuing / nurturing / passing**, asking price and
our number, biggest repair, motivation (x/10), decision maker, and follow-up
timing. A thin memo still works — it just leaves fields `Unknown` and flags
them for the coordinator instead of guessing.

---

## Phase 4 — REI BlackBook-ready output

`crmService.js` (`toReiBlackBookPayload`) turns a debrief into everything REI
BlackBook needs. REI BlackBook is tag-driven and ingests external data via
**Zapier / incoming webhooks**, so the output includes a flat, all-string
`webhook_payload` you can map field-for-field in a Zapier "Catch Hook."

Running any mode also writes `src/data/reiBlackBookPayload.json`:

- **contact** — first/last/full name + property address
- **pipeline_stage** — mapped from classification (e.g. Family Decision →
  Follow-Up, Pass → Dead / Archive)
- **tags** — `seller`, `source:post-visit-system`,
  `classification:…`, `status:…`, `motivation:hot|warm|cold`, `pass`,
  `docs:incomplete`
- **custom_fields** — all the structured deal facts
- **note** — the human-readable CRM summary
- **follow_up_task** — title, owner, due date, action
- **webhook_payload** — flat `{ key: "string" }` ready to POST to Zapier

### Live wiring (Phase 7)

1. In Zapier, create a **Catch Hook** trigger; copy its URL into
   `REI_BLACKBOOK_WEBHOOK_URL` in `.env`.
2. Add a Zapier action: **REI BlackBook → Create/Update Contact**, mapping the
   `webhook_payload` fields (and creating the follow-up task).
3. Phase 7 code will `POST` `webhook_payload` to that URL. Nothing about the
   debrief logic changes.

> We build the payload with sample data first. Do **not** POST to a live hook
> until you've confirmed the output looks right for several real visits.

---

## Phase 5 — Missing-documentation notifications

`notificationService.js` reads a debrief and raises alerts for the named
failure modes, then routes them by severity:

| Gap | Severity | Goes to |
|-----|----------|---------|
| No voice memo | HIGH | Coordinator (chases Juan for a 60s update) |
| No photos on a viable deal | HIGH | **Juan** (may still be near the property) |
| No walkthrough video on a viable deal | HIGH | **Juan** |
| Seller not classified | MEDIUM | Coordinator |
| No next action | MEDIUM | Coordinator |
| Pass with no reason | MEDIUM | Coordinator |
| No follow-up date | MEDIUM | Coordinator |

On each run, gaps are printed, appended to `src/data/alerts.log`, and turned
into a **draft email** (`toEmail()`) — which is **not sent**. A complete visit
raises zero alerts.

Recipient addresses come from `.env` (`OPS_ALERT_EMAIL`, `JUAN_ALERT_EMAIL`,
`CHERRY_ALERT_EMAIL`); until set, clearly-marked placeholders are used.

### Delivering alerts for real (later)

`toEmail(debrief, alerts)` returns `{ to, subject, body }`. Hand that to a
Gmail send/draft step or a Slack webhook when you're ready. Nothing is sent
automatically — a human confirms first.

---

## Folder & file map

```
post-property-visit-system/
  index.js                     # Phase 1 entry point (run this)
  package.json                 # scripts: start / demo / test
  .env.example                 # placeholder keys for later phases
  README.md
  src/
    config/
      fields.js                # file-type rules, doc-score fields, JSON schema
      classifications.js       # the 8 seller classifications + keyword hints
      followupRules.js         # follow-up owner / timing / action per class
    services/
      voiceNoteService.js      # LOCAL transcript parser (AI swaps in at Phase 3)
    workflows/
      processVisitFolder.js    # scan a folder, count media, find transcript
      generateDocumentationScore.js  # 7-field score + missing items
      assignFollowUpPath.js    # classification -> owner, sequence, date
      createPostVisitDebrief.js# THE BRAIN — builds the full debrief JSON
    data/
      sampleVisitInput.json    # what an operator hands the system
      sampleDebriefOutput.json # generated on each run
  prompts/
    juanVoiceMemoExtractionPrompt.md  # Phase 3 AI extraction prompt
    operationsDebriefPrompt.md        # CRM-summary format for coordinators
  tests/
    processVisitFolder.test.js # 10 Phase 1 tests
  sample-visits/
    2026-07-04 - 4710 Blum Rd - Maria Santos/   # fake "Google Drive" folder
```

## Property folder naming rule

```
YYYY-MM-DD - PROPERTY ADDRESS - SELLER NAME
2026-07-04 - 4710 Blum Rd - Maria Santos
```

Perfect file names are **not** required — the scanner counts by file extension.

## Seller classifications

Ready Now · Wants More Money · Family Decision · Shopping Offers ·
Title / Legal Issue · Tenant / Access Issue · Long-Term Nurture · Pass

## Documentation score (7 fields, each Yes / No / Not Required)

`voice_memo_received` · `visit_outcome_recorded` · `seller_classified` ·
`photos_uploaded_if_required` · `video_uploaded_if_required` ·
`next_action_assigned` · `follow_up_date_set`

---

*Phase 1 is complete and tested. Do not wire live CRM/Drive until the logic
output is confirmed correct on your own sample data.*
