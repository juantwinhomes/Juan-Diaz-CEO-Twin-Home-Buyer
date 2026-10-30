# Team Hub training modules

Training lives in the **Training** tab of the live Juan AI · Team Hub:
https://claude.ai/artifact/M1UaSSbpkaTjaFd3Z9vVsY (build and test first in the
Sandbox: https://claude.ai/artifact/2jJ2KswtNQXUAyXubRcdqF).

Team-tool pattern: sign in with name + code → read the training → pass the quiz
(every answer right) → "cleared to go live". Every attempt is its own record in
the Hub database collection `training_attempts` (name, time, attempt number,
score, missed question numbers, pass/fail), plus a line in Activity. Each
person's summary is stored under `people/<slug>.training.<module id>`. Juan's
Training tab shows who's cleared, attempts, and the full attempt log.

| Module | Source | Status |
|---|---|---|
| `m1` Juan's method | Gemini notes of Juan's Oct 19, 2026 session (Drive doc `1dCFc-mhwYykEPIV57GHOwLUgGNFjs8B-pB994TXimbM`) | Live Oct 30, 2026 |

Rules for writing a module: use Juan's words from the source only, no new
rules. Every section carries the exact lines from the source it came from
(`from`), so anyone can check it.

## Files

- `module-01-juans-method.json`: the module (sections, source quotes, quiz). Single source of truth.
- `module-01-juans-method.md`: readable copy (same text as the email to Juan).
- `hub-patch/training.js`: the Training tab code inserted into the Hub.
- `hub-patch/patch_hub.py IN.html OUT.html`: applies the Training tab to a Hub file. Fails loudly if an anchor moved.
- `hub-patch/test-hub.js` + `mock-claude.js`: headless test against an in-memory db (blank submit, fail, pass, attempt log, Juan's view, phone width).

## Adding Module 2

The Hub code renders `MODULES[0]` today. For a second module: add the JSON,
put both in `MODULES`, add a module picker to `trainingView` / `trainingBoard`,
patch the Sandbox, run the test, then publish to the live Hub.
