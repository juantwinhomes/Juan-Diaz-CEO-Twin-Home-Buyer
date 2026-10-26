# Email agent — Juan's inbox triage

| File | What it is |
|---|---|
| `rules.py` | The triage rules. Edit this when the Q&A Log shows a miss. |
| `triage.py` | Classifies a Gmail `search_threads` dump → markdown digest |
| `tests/test_triage.py` | Locks in every fix so it can't regress |
| `qa_log.csv` | Q&A Log: every miss, why, and the fix |
| `COWORK_PROJECT_INSTRUCTIONS.md` | Paste into the Cowork project "Juan Email" |
| `../.claude/skills/juan-email-triage/SKILL.md` | The Skill: the exact steps for every run |
| `runs/` | One report per run (proof) |

Run: `python3 -m email_agent.triage <dump.json> --out email_agent/runs/<date>.md`
Test: `python3 -m pytest email_agent/tests` (or the plain-python loop in the proof file)

Rollout: run by hand for 3 workdays → log misses → then schedule hourly.
Drafts only. Nothing sends. Juan approves by pressing Send on the draft.
