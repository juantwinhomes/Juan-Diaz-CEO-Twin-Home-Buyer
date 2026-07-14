# Transcript Scoring Prompt (v1)

> Used by the admin "Score with AI" button (Gemini, same free key) — or
> pasted manually into Claude/ChatGPT with a transcript. Output is JSON so
> the app can write it straight to the `scores` table.

```
You are screening a job applicant for Twin Home Buyer, a real estate
acquisitions company. Below is the transcript of their recorded voice
screening interview. Score STRICTLY — this filter exists so only clear,
direct communicators reach in-person interviews.

Score each category 1–5:

- CLARITY: Easy to follow? Organized thoughts?
  (1 = rambling/confusing, 5 = crisp and structured)
- DIRECTNESS: Did they actually answer each question asked, or dodge and
  fill with fluff? (1 = never answered anything, 5 = straight answers)
- COMMUNICATION: Natural, confident conversation — including how they
  handled the follow-up probe. (1 = froze/robotic/memorized,
  5 = genuine back-and-forth)

TRANSCRIPT QUALITY WARNING: the transcript comes from automatic speech
recognition and will contain mis-transcriptions; many candidates speak
English as a second language. Do NOT penalize isolated odd phrases or
single garbled words plausibly caused by transcription errors — judge
overall substance and flow. Penalize only patterns that persist across
multiple answers.

KNOCKOUTS (any one = automatic FAIL regardless of scores):
- Skipped or refused a question
- Never gave a single straight answer
- Could not hold the conversation (froze, unintelligible, gave up)

VERDICT RULE (computed by the system from the scores; env-tunable):
- PASS: average >= 3.0 and no knockouts -> live call
- BORDERLINE: average >= 2.5 -> human decides (trainable / role-dependent;
  e.g. technical-executor roles can pass here on Seth's review)
- FAIL: below 2.5, or ANY knockout at any score (Juan's non-negotiable:
  cannot-hold-a-conversation fails regardless of other strengths)
Calibration note (2026-07-14): top current salesperson benchmarked 3.33
on a cold run — bar set at 3.0 accordingly. Bands via PASS_BAR /
BORDERLINE_BAR env vars. Pending Juan sign-off.

Return ONLY this JSON:
{
  "clarity": <1-5>,
  "clarity_note": "<one line>",
  "directness": <1-5>,
  "directness_note": "<one line>",
  "communication": <1-5>,
  "communication_note": "<one line>",
  "knockout": <true|false>,
  "knockout_reason": "<empty if none>",
  "verdict": "PASS" | "FAIL",
  "suggested_followup": "<one question for the live call, based on their
    weakest or most interesting answer — empty if FAIL>"
}

TRANSCRIPT:
{{transcript}}
```

## Human review rules (Seth)

- AI score is a draft, not a decision. Spot-check the audio for every PASS
  and any borderline FAIL (3.0–3.5).
- Human override always wins — record it with `scored_by = <your email>`.
- PASS → 5-minute live call (Seth/Carlo, consent line first: recorded,
  CA two-party). Live-call passers go to Juan. Juan makes the hire call.
