# SOP — THB Voice Screen (Hiring + Sales Practice)

> Standard Operating Procedure for the AI voice platform.
> **Owner:** Seth · **Backup:** Carlo · **Final decisions:** Juan
> Version 1.0 — July 2026

## 1. What this system is

One web app, two modes:

- **🎓 Hiring mode** — applicants take a 5-minute spoken interview with an
  AI interviewer (4 questions + a live follow-up). Screens for Juan's three
  hiring rules: speaks clearly, answers directly, holds a conversation.
- **📞 Sales practice mode** — the applicant/trainee plays the AGENT and
  calls "John," an AI homeowner lead. They run the official THB follow-up
  script; John reacts to how they treat him and they EARN one of two
  endings: Interested or Not Interested.

**Golden rule: the AI filters and coaches — humans hire. Juan makes final
hiring decisions.**

## 2. System components

| Piece | Where | Login |
|---|---|---|
| App (admin + candidate pages) | https://thb-hr-voice.vercel.app | /admin — Supabase user |
| Database, storage, admin users | supabase.com/dashboard → thb-voice-screen | Supabase account |
| Hosting + env vars + deploys | vercel.com → thb-hr-voice | Seth's Vercel |
| AI (voice + scoring) | Google AI Studio key (free tier) | THB Google account |
| Code — source of truth | juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer, branches `thb-voice-screen` (hiring) and `thb-voice-screen-sales` (both modes) | GitHub |
| Code — deploy mirror | SethConcept/THB-HR-VOICE `main` (temporary custody — migration to company repo pending) | GitHub |

## 3. SOP — Hiring screen (per applicant)

1. **Create:** /admin → Add candidate → name + role → mode **🎓 Hiring** →
   Add + generate link.
2. **Send** the invite link (WhatsApp/email). Tell them: quiet spot,
   headphones if possible, ~10 minutes. Link allows **3 attempts** (different
   questions each) and expires in 7 days.
3. They complete: consent → mic check → AI interview (8-min cap).
4. **Review:** open the candidate → play audio / skim transcript →
   **Score with AI** (or **Score all — 1 API call** if multiple attempts).
5. **Verdict bands** (average of Clarity/Directness/Communication, 1–5):
   - 🟢 **≥ 3.0 PASS** → schedule the 5-min live call
   - 🟡 **2.5–2.99 BORDERLINE** → Seth's judgment (trainable / role fit)
   - 🔴 **< 2.5 FAIL** or **any knockout** → decline
   - Knockouts: skipped a question · zero straight answers · couldn't converse.
6. **Human review is mandatory** on every PASS and any 2.5–3.0: listen to
   the audio. If the AI notes mention garbled transcript, judge by AUDIO,
   not transcript (ESL/ASR fairness rule).
7. **Live call** (Seth/Carlo, 5 min): open with recorded-consent line → ask
   the AI's suggested follow-up → push back once → "questions for us?" →
   pass → schedule with Juan.
8. **Update status** at every step (invited → interviewed → scored →
   passed/failed → live_call → hired/declined). Send decline/advance
   template messages within 3 business days.

## 4. SOP — Sales practice call (per applicant/trainee)

1. **Create:** /admin → Add candidate → mode **📞 Sales practice** →
   difficulty **Easy John** (applicants; first-timers) or **Hard John**
   (experienced hires, team training) → send link.
2. They see the official call script on screen + a personal notes box.
   They click **Call John**; John answers "Hello?" — THEY speak first.
3. John's engagement is earned: warm, attentive callers get the
   **INTERESTED** ending; robotic/pushy callers lose him → **NOT
   INTERESTED** ending. Both endings are legitimate test results.
4. **Score with AI** → card shows: Seller outcome pill + 7 scores
   (Warmth · Clarity · Confidence · Professionalism · Conversational ·
   Completeness · Ending handling) + a coaching note + auto-flags
   (rudeness, promises, quoting prices = auto-FAIL).
5. **Reading results for HIRING decisions:**
   - INTERESTED + avg ≥ 3.0 → strong phone candidate
   - NOT_INTERESTED but high warmth/professionalism → coachable; review audio
   - Any auto-flag → decline for phone roles
6. **Reading results for TRAINING:** the coaching note is the deliverable —
   share it with the trainee; re-run weekly on Hard John and track the
   outcome + average trend.

## 5. Capacity & cost (free tier)

- Interviews/calls: effectively unlimited (one at a time is safest).
- **AI scorings: 20/day** (each Score click = 1; Score-all = 1 for all
  attempts). Resets midnight Pacific. Usage meter:
  aistudio.google.com/rate-limit.
- Outgrowing 20/day → "Set up billing" on the same Google account —
  pennies per interview. Requires Juan's OK (spend decision).

## 6. Compliance — never bend

- **Consent before every recording** — the app enforces it for AI sessions;
  YOU must say "this call is recorded" on human live calls. Covers PH
  all-party consent (RA 4200) and California two-party.
- Accent/ESL is never a scoring factor (built into the rubric). When in
  doubt, audio > transcript.
- AI screens; humans decide; Juan has final say on hires.
- Candidate data (recordings, transcripts, notes) stays in Supabase —
  don't download/share outside the hiring team.
- Company code stays in company repos; the personal-repo deploy is a
  temporary stopgap.

## 7. Changing things (dials, no code)

| Change | How |
|---|---|
| Pass bands | Vercel env `PASS_BAR` / `BORDERLINE_BAR` → redeploy |
| Live voice model (if retired) | env `LIVE_MODEL` → current name from ai.google.dev/gemini-api/docs/models |
| Scoring model | env `SCORING_MODEL` |
| Company name (hiring mode) | env `NEXT_PUBLIC_COMPANY_NAME` (default: Equity Track) |
| Interview questions / John's personality / rubrics | `voice-screen-app/lib/prompts.ts` and `lib/sales-prompts.ts` — edit via the Twin (Claude), never freehand |

## 8. Code update procedure (until company-repo migration)

1. The Twin (Claude) builds + verifies on the company branch, pushes.
2. Seth syncs to the deploy repo (CMD):
   `cd C:\Users\AJHAY\THB-HR-VOICE` → `git pull origin main` → clone the
   company branch to `company-tmp` → `xcopy /E /Y /I company-tmp\voice-screen-app voice-screen-app`
   → `rmdir /s /q company-tmp` → `git add -A` → commit → `git push origin main`.
3. Vercel auto-rebuilds. Check Deployments = Ready, then hard-refresh.
4. If a database change shipped, run the provided `.sql` file in Supabase
   SQL Editor FIRST (migrations are always additive).
5. ⚠️ Known trap: the deploy repo's root `.gitignore` contains `lib/` —
   negation lines for `voice-screen-app/lib/` must stay at the bottom of
   it, or lib files silently vanish from pushes.

## 9. Troubleshooting quick table

| Symptom | Fix |
|---|---|
| Interview page: red "closed (1008): model not found" | Live model retired → set `LIVE_MODEL` env → redeploy |
| Scoring failed (mentions model) | set `SCORING_MODEL` env |
| Scoring failed (rate limit) | 20/day cap → wait for midnight PT or add billing |
| Build fails "Module not found: @/lib/..." | the `.gitignore` trap (section 8.5) — check the file exists on GitHub |
| Transcript shows foreign languages / AI questions fragmented | candidate on speakers — echo; recommend headphones (ASR is pinned to English; isolated garble is cosmetic) |
| Link "unavailable" | 3 attempts used / 7 days old / status closed |
| Add candidate errors after an update | a `.sql` migration wasn't run in Supabase |
| Anything else | bring the exact error text to the Twin |

## 10. Weekly reporting (to Juan, Sunday review)

One line per mode:
- *Hiring: X screened · Y passed · Z live calls · N sent to Juan.*
- *Sales practice: X calls run · avg score trend · flags.*
Plus any capacity/spend flags. Format: Issue → Impact → Options →
Recommendation → Decision needed.

## 11. Open items (as of v1.0)

- [ ] Hiring dry run: Borderline / Dodger / Freezer personas + audio check
- [ ] Sales mode: validate both endings (one warm run, one robotic run)
- [ ] Juan sign-offs: bands 3.0/2.5 · first role · sub-2.5 tech exception
- [ ] Carlo admin login + trained on this SOP
- [ ] Migrate deploy to a company-owned repo (Juan action)
