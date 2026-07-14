# THB Voice Screen — Operator Cheatsheet (Seth)

## Key links
| What | Where |
|---|---|
| Admin dashboard | https://thb-hr-voice.vercel.app/admin |
| Vercel (deploys, env vars) | vercel.com → thb-hr-voice |
| Supabase (data, users) | supabase.com/dashboard → thb-voice-screen |
| Usage meter | aistudio.google.com/rate-limit |
| Source of truth (code) | juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer → branch `thb-voice-screen` |

## Daily flow (per candidate)
1. `/admin` → add name + role → **Add + generate link**
2. Send the invite link (WhatsApp/email). One link = up to **3 attempts**, expires 7 days.
3. Candidate: consent → mic check → interview (~5 min, 8-min cap, different
   questions per retake).
4. You: open candidate → listen/skim transcript → **Score with AI**.
5. Verdict lands → set status → PASS gets a 5-min live call → live-call
   passers go to Juan.

## Verdict bands (avg of Clarity / Directness / Communication, 1–5)
| Avg | Verdict | Action |
|---|---|---|
| ≥ 3.0 | 🟢 PASS | schedule live call |
| 2.5–2.99 | 🟡 BORDERLINE | your judgment (trainable / executor roles) |
| < 2.5 | 🔴 FAIL | decline |
| Any knockout | 🔴 FAIL always | skipped a question · zero straight answers · couldn't converse |

- Benchmark: top salesperson = 3.33 on a cold run.
- You outrank the AI: status dropdown is the human override. Spot-check audio
  on every PASS and any 2.5–3.0.
- Change bands: Vercel env `PASS_BAR` / `BORDERLINE_BAR` → redeploy.
- Bands pending Juan sign-off; sub-2.5 technical exception = ask Juan.

## Limits (free tier)
- Interviews: effectively unlimited (watch TPM 65K/min if many run at once)
- **Scorings: 20/day** ← the only real cap. Re-scores count.
- Outgrowing it: AI Studio → Set up billing (pennies per interview).

## Live-call script (for PASSes, ~5 min)
1. "This call is recorded, OK?" ← required, CA two-party
2. Ask the AI's suggested follow-up (on the score card)
3. Push back once on their answer — do they engage or fold?
4. "What questions do you have for us?"
Pass → schedule with Juan.

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Connection problem" + red reason on interview page | Read the reason. "model not found" → model retired: set Vercel env `LIVE_MODEL` to current name from ai.google.dev/gemini-api/docs/models → redeploy |
| Scoring failed (4xx/5xx with message) | "model" → same fix via `SCORING_MODEL` env. "rate limit" → 20/day cap hit, wait for midnight PT |
| Link says unavailable | 3 attempts used, 7 days passed, or status is live_call/hired/declined |
| Mic bar never moves | Candidate's mic/browser permissions — reload, allow mic |
| Candidate can't hear AI | Their speakers; recording still captures — check transcript |
| Build fails after edit | Vercel → deployment → Build Logs → read `Module not found` / error block |
| Any code fix needed | Ask the Twin — fixes land on branch `thb-voice-screen`, then Raw-copy to SethConcept/THB-HR-VOICE |

## Rules that never bend
- Recording consent before every interview and every live call (CA two-party).
- AI screens, humans hire. Juan makes the final call.
- Company data stays in company repos — app code only in the personal repo
  (temporary, until migration to a company-owned repo).

## Open items
- [ ] Dry run: 5 personas (solid / rambler / dodger / freezer / borderline)
- [ ] Juan sign-off: bands 3.0/2.5 · first role to screen · sub-2.5 tech exception
- [ ] Re-score Thea under new bands (should PASS at 3.33)
- [ ] Migrate app to company-owned repo (post-pilot cleanup)
