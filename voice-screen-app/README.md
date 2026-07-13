# THB Voice Screen

AI voice interviewer that screens applicants' speaking ability before they
reach in-person interviews. Spec: `../projects/voice-screen/BUILD-SPEC.md`.

**Stack:** Next.js · Gemini Live API (free tier) · Supabase (free) · Vercel.

## Setup (Carlo — ~30 min)

1. **Supabase** (supabase.com, free project):
   - SQL Editor → run `supabase/schema.sql`.
   - Storage → New bucket → name `interview-audio` → **uncheck Public**.
   - Authentication → Users → Add user (email+password) for Seth and Carlo.
     Disable public signups (Auth → Providers → Email → turn off signup).
2. **Google AI Studio** (aistudio.google.com): create an API key.
3. **Local:**
   ```bash
   cp .env.example .env.local   # fill in all values
   npm install
   npm run dev
   ```
4. **Vercel:** import the GitHub repo → set **Root Directory = `voice-screen-app`**
   → add the same env vars (set `NEXT_PUBLIC_APP_URL` to the deployed URL)
   → deploy.

## Flow

Admin adds candidate at `/admin` → copies the generated one-time invite link →
candidate opens `/interview/<token>` → consents (logged, CA two-party) →
talks with the Gemini Live interviewer (4 questions + follow-up, 8-min cap) →
transcript + mic recording auto-saved → admin clicks **Score with AI** →
rubric verdict (PASS ≥ 3.5 avg, no knockouts) → human override wins →
passers get a 5-min live call → live-call passers meet Juan.

## Security notes

- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. The
  browser gets a single-use **ephemeral token** (15-min expiry) per interview.
- Invite tokens are single-use and expire after 7 days or on completion.
- RLS is on; anonymous users can touch nothing directly.

## Untested / verify during dry run

Written blind — do the Seth+Carlo dry run (5 fake interviews) before any real
applicant, and check:

- [ ] Live session connects with ephemeral token (`v1alpha` API)
- [ ] Mic PCM streaming + model audio playback (echo? use headphones)
- [ ] Transcript turns captured correctly (input + output transcription)
- [ ] "INTERVIEW COMPLETE" trigger auto-ends the session
- [ ] Audio .webm uploads and plays back in admin
- [ ] Scoring returns valid JSON and writes to `scores`
- [ ] Model name still current (`lib/prompts.ts` — check AI Studio docs if
      connect fails; Live model names rotate)
