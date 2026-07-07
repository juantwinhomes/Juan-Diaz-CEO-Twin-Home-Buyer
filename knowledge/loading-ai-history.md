# Loading Juan's AI History (ChatGPT + Grok) into the Twin

## The problem we hit
Juan's AI exports are big:
- **Grok** (`prod-grok-backend.json`) — ~296MB
- **ChatGPT** export — ~500MB zip

The Twin's remote Google Drive tools **cap file downloads at 10MB**, and the
in-session upload also chokes on files this size. This is a **size limit, not a
permissions problem** — re-sharing the Drive link does not help. So the raw
conversations can't be read inside a web session.

## The fix: process locally, sync the learnings back
Run the conversations through a parser on a machine where the file is on disk,
then commit the small distilled output to this repo — which flows back to the Twin.

### Steps (one-time, ~15 min)
1. Install **Claude Code** on Juan's computer (`npm i -g @anthropic-ai/claude-code`).
2. Clone this repo locally and open Claude Code in it.
3. Put the export file on disk (unzip the ChatGPT `.zip`; the Grok JSON is already a file).
4. Run the parser:
   ```
   python3 tools/analyze_grok_export.py /path/to/prod-grok-backend.json
   ```
   (optional: `pip install ijson` for lighter memory use on the 296MB file)
5. It writes `grok_prompt_profile.md` + `grok_transcripts.txt` next to the input.
6. Paste `grok_prompt_profile.md` back to the Twin, or commit it under `knowledge/`.

### What the parser produces
- **Schema report** — the real structure of the Grok export (its format isn't
  documented, so the script discovers it; if extraction misses, this tells us how
  to adjust the heuristics).
- **Prompting profile** — prompt count, average/min/max length, question-vs-command
  ratio, top topics, and 15 verbatim sample prompts.
- **Transcripts** — full readable conversation dump.

### ChatGPT export
Same idea: unzip it, and the conversations are in `conversations.json`. A similar
parser can be pointed at that file (ask the Twin to generate one, or adapt
`analyze_grok_export.py` — the message-walking logic is format-agnostic).

## Faster alternative if you don't want to set up local Claude Code
Open Grok/ChatGPT and **paste 8–10 representative chats** straight into the Twin
chat. For learning Juan's *prompting style*, a good sample is enough — the Twin
doesn't need all 296MB to characterize how he works.

## Status
- [ ] Grok history parsed and profiled
- [ ] ChatGPT history parsed and profiled
- Blocking reason: files exceed the 10MB remote download cap; awaiting local run
  or pasted samples.
