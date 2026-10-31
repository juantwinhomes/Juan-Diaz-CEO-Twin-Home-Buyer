# Seller-Call Training

Live: https://claude.ai/artifact/8QTi2eRgZ75pFnhJZDx6We (owned by Seth's account; share it as
Contributor with the team and as Editor with Juan).

Juan's spec (email "Build today: seller-call training, due 12:00 PM", Oct 31, 2026): six modules
in order, no skipping ahead, a quiz at the end of each; sign in by name with a 6-digit code; every
answer saved by name on the shared board; a typed version Claude can read; a final mock call with
Cherry or Thea; then a single Certify button for Juan.

Sources: the recording of Juan's Oct 19 training session (Drive file
`19Aa1uc4nf0MLVfxHRURQEY39H-Jpg2-2`; transcript pasted by Seth on Oct 31, not stored here because it
holds Vanessa's personal details), Gemini's notes of it (Drive doc
`1dCFc-mhwYykEPIV57GHOwLUgGNFjs8B-pB994TXimbM`), Juan's Oct 31 build email, and his Oct 30/31 story
emails. Every lesson part lists its sources with recording timestamps; quotes are lightly cleaned
of filler words. Left out on purpose: Juan's "25 years" line (his story rule bans it), "there may
be a range" (conflicts with no price over the phone), Vanessa's family details, and Cherry's pay.

**Juan's story is told only one way:** "Juan started at 12, sweeping the homes his Uncle George
bought in Oakland. Raised in East Oakland, he's been flipping homes since 2005: 20+ years making
homes beautiful and improving the communities he grew up in." Never state an age for the company
(no "25 years", "since 2002", "24 years").

## How it works

- Sign-in: the roster and code hashes were copied from the Team Hub roster, so everyone uses their
  Team Hub code. Juan (editor) can issue a page-only code under People & codes.
- Modules 1–6 open one at a time. Quiz: every answer right to pass, unlimited tries.
- Module 5: AI practice calls (the `sample` capability plays one of three sellers from the notes).
  A call passes only when all six checks pass; any "25 years" / "since 2002" / "24 years" from the
  rep fails the story check in code. One passed call opens the Module 5 quiz.
- Module 5 also has phone practice: call Rob Walker, a Retell AI seller, at (510) 767-0799; the
  score lands in the Seller practice calls sheet. Setup: `retell-setup.md`.
- After Module 6: Cherry or Thea logs the mock call (Passed / Needs another try, notes required).
- Juan's Team progress shows a Certify button once a mock call has passed.

## Shared board (artifact database)

| Collection | What |
|---|---|
| `roster` | name, role, title, salt, hash (read: everyone, write: editors) |
| `roster_codes` | page-only codes Juan issues (editors only) |
| `answers` | one doc per quiz attempt: name, module, attempt, score, and each question with the chosen answer and right/wrong |
| `roleplays` | one doc per practice call: transcript, six checks, feedback, pass |
| `mockcalls` | Cherry/Thea results with notes |
| `certs` | Juan's certifications (doc id = person slug) |
| `people`, `log` | per-person progress summary; activity by name |

Read it with `ArtifactData` (`list` on any collection above).

## Files

- `content.py`: all training text, quizzes, practice sellers. Edit here only.
- `page.html`: the page template. `build.py` inlines the content and writes
  `seller-call-training.html` plus the typed version `seller-call-training.md` (published next to
  the page as `seller-call-training.md`, the file Claude reads).
- `test/test.js` + `test/mock.js`: headless end-to-end test against an in-memory board and a stub
  AI. Run `python3 build.py && python3 -c "import json,content;json.dump(content.DATA,open('content.json','w'),ensure_ascii=False)"`, then
  `cd test && NODE_PATH=$(npm root -g) node test.js /tmp/shots`.
