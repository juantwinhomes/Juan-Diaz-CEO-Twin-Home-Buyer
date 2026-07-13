# THB Voice Screen — Build Spec (v1 MVP)

> AI voice interviewer that screens job applicants' speaking ability BEFORE
> they come into the office. Directive from Juan (July 2026): applicants must
> answer directly, speak clearly, and hold a real conversation — screen for
> that early so fewer, better people reach in-person interviews.
>
> **Owner:** Seth (process/rubric) · **Builder:** Carlo (app, via Claude Code)
> **Code lives in its own repo: `thb-voice-screen` — NOT in this repo.**
> This folder is the spec + durable memory only.

## Stack (approved 2026-07-13)

| Component | Technology | Cost |
|---|---|---|
| Voice interviewer | Gemini Live API (Google AI Studio free tier) | $0 |
| Web app (applicant page + admin) | Next.js — ONE app, two routes | $0 |
| Database / auth / file storage | Supabase free tier | $0 |
| Hosting | Vercel (existing account; Hobby tier for pilot, Pro ~$20/mo if permanent) | $0 |
| Transcript scoring | Gemini (same free key) w/ rubric prompt | $0 |

## Architecture rules (non-negotiable)

1. **One Next.js app.** `/interview/[token]` (public, tokenized) and `/admin`
   (Supabase Auth). No second app.
2. **Gemini API key NEVER ships to the browser.** The interview page calls a
   server route that mints an **ephemeral token** for the Live session. Key
   stays server-side.
3. **Unique link per candidate.** Admin generates a one-time interview token.
   No open public URL (prevents quota abuse). Token expires after completion
   or 7 days.
4. **Consent before session** (California two-party consent). The app shows/
   speaks "This interview is recorded" and logs the explicit yes to the DB
   BEFORE the Live session starts. No consent = no interview.
5. **Hard cap 8 minutes.** Session auto-ends, partial transcript saved.

## Data model (Supabase)

```sql
create table candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  role_applied text not null,
  status text not null default 'invited',
    -- invited | interviewed | scored | passed | failed | live_call | hired | declined
  interview_token uuid unique default gen_random_uuid(),
  token_expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now()
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) not null,
  consent_given boolean not null default false,
  consent_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  transcript jsonb,          -- [{role, text, ts}]
  audio_url text,            -- Supabase storage path
  completed boolean default false
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references interviews(id) not null,
  clarity int check (clarity between 1 and 5),
  directness int check (directness between 1 and 5),
  communication int check (communication between 1 and 5),
  knockout boolean not null default false,
  knockout_reason text,
  verdict text,              -- PASS | FAIL
  suggested_followup text,   -- for the live call
  scored_by text,            -- 'ai' | reviewer email (human override)
  notes text,
  created_at timestamptz default now()
);
```

Storage bucket: `interview-audio` (private; admin-only signed URLs).

## MVP feature list (nothing more in v1)

**Applicant page (`/interview/[token]`):**
- Validate token → show name + role + consent screen → mic check →
  Live session (agent runs script in AGENT-PROMPT.md) → "Done, we'll be in
  touch" screen. Saves transcript + audio + timestamps.

**Admin (`/admin`, Supabase Auth):**
- Candidate table (name, role, status, date, scores).
- Add candidate → generates invite link to copy/send.
- Detail view: play audio, read transcript, **"Score with AI" button**
  (sends transcript + SCORING-PROMPT.md to Gemini, writes to `scores`),
  human override of verdict, status dropdown.

**Explicitly OUT of v1:** email automation, calendar booking, analytics,
multi-language, phone dial-out.

## Build order

1. Supabase project: schema above + auth (invite Seth + Carlo only) + bucket.
2. Next.js scaffold, admin shell, candidate CRUD + invite links.
3. Live API integration: ephemeral-token route, mic streaming, interview
   flow per AGENT-PROMPT.md, transcript capture.
4. Audio upload + AI scoring button (SCORING-PROMPT.md).
5. Deploy to Vercel (existing account — connect repo, deploy). Env vars:
   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY (server only).
6. **Dry run: Seth + Carlo interview each other 5x, tune, THEN first real
   applicant.**

## Pass rules (Juan's filter)

- PASS = average ≥ 3.5 across clarity/directness/communication AND no
  knockout.
- Knockouts (any one = FAIL): skipped a question · never gave a straight
  answer · could not hold the conversation / unintelligible.
- PASS → 5-min live call (Seth/Carlo) → only live-call passers reach Juan.
- AI screens volume; **humans make the hire decision.** Final say: Juan.

## Open items

- [ ] Carlo: create `thb-voice-screen` repo, build per this spec
- [ ] Seth: confirm pass threshold (3.5) + first role to screen with Juan
- [ ] Add THB WhatsApp/application form link → invite flow (manual in v1)
