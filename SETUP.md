# Juan's Brain — Setup (5 minutes, plain English)

This repo IS Juan Diaz's CEO Twin brain: his profile, buy-box, deal data,
prompting style, team, the 90-day reset rules, and the Designer agent.
Open it with Claude and the brain loads automatically.

## Option A — On your computer (recommended: unlocks big files, local tools)

1. Install Node.js if you don't have it: https://nodejs.org (LTS).
2. Open Terminal (Mac) or PowerShell (Windows) and run:
   ```
   npm install -g @anthropic-ai/claude-code
   git clone https://github.com/juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer.git
   cd Juan-Diaz-CEO-Twin-Home-Buyer
   claude
   ```
3. Sign in with the Claude account when prompted. Done — you're talking to
   the Twin. It reads `CLAUDE.md` + `knowledge/` on startup, every time.

   Windows one-click: double-click `setup-juan-brain.bat` instead of step 2.

## Option B — On the web (zero install)

Go to https://claude.ai/code, connect the GitHub repo
`juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer`, start a session. Same brain.

## What's inside the brain

| File | What it holds |
|---|---|
| `CLAUDE.md` | The Twin's operating instructions + Juan's 90-day reset rules |
| `knowledge/juan-diaz-pi-profile.md` | Behavioral assessment (source of record) |
| `knowledge/juan-grok-prompting-profile.md` | How Juan communicates — match it |
| `knowledge/juan-strategic-thinking.md` | How Juan thinks & decides |
| `knowledge/deal-pattern-buybox.md` | 56-deal history + the buy-box gate + 85% rule |
| `knowledge/marketing-postcard-kpis.md` | Direct-mail autopsy & funnel truth |
| `knowledge/820-28th-st-deal.md` | The focus deal: financing, blockers, economics |
| `knowledge/twin-home-buyer-company.md` | Company, team roster, tech stack, timeline |
| `knowledge/design-standards.md` | The Designer's brain (SW codes, tiers, rules) |
| `knowledge/juan-chatgpt-history-report.md` | ChatGPT-era patterns & conversation log |
| `.claude/agents/designer.md` | The AI Designer agent |
| `tools/analyze_grok_export.py` | Parser for Grok exports |

## Rules the brain always follows

- Lead with the answer. Numbers before adjectives. One recommendation.
- Enforce the reset: cash first, 820 28th St, no scatter, >$1–2K gets review.
- Confirm before anything outward-facing (emails, invoices, payments).
- No cheerleading.

## Keeping it smart

The brain learns by committing to this repo. After meaningful sessions, tell
it "save what you learned" — it updates `knowledge/` and pushes. Git history
is its long-term memory; nothing is ever truly lost.
