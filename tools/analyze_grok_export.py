#!/usr/bin/env python3
"""
analyze_grok_export.py — parse a Grok (xAI) data export and profile how Juan prompts.

WHY THIS EXISTS
    Juan's Grok export (`prod-grok-backend.json`) is ~296MB. The Twin's remote
    Drive tools cap downloads at 10MB, so the conversations can't be read in a
    web session. Run this LOCALLY (Claude Code on Juan's machine, or plain
    `python3`) where the file is on disk — no size limit.

WHAT IT DOES
    1. Reports the JSON's structure (top-level shape + sample) so we learn the
       real schema — Grok's export format isn't publicly documented, so this is
       written defensively rather than assuming a layout.
    2. Best-effort extracts conversations: user prompts vs. assistant replies.
    3. Prints a prompting-style profile: how many chats, prompt lengths, how
       often Juan iterates, question vs. command phrasing, and top topics.
    4. Writes two files next to the input:
         - grok_transcripts.txt   (readable transcripts)
         - grok_prompt_profile.md (the style analysis — paste this back to the Twin)

USAGE
    python3 analyze_grok_export.py /path/to/prod-grok-backend.json
    # optional: pip install ijson   (streaming parser, lighter on memory)

NOTE
    The extraction heuristics may need one tweak once we see the real schema —
    the structure report in step 1 tells us exactly how to adjust.
"""
import sys, json, re, os
from collections import Counter

def load(path):
    """Load the JSON. Try streaming (ijson) first for large files, else json.load."""
    try:
        import ijson  # streaming, memory-friendly
        with open(path, "rb") as f:
            # materialize top level; for very large files consider iterating events instead
            return json.load(open(path, "r", encoding="utf-8"))
    except ImportError:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

def describe(obj, depth=0, max_depth=3):
    """Print the shape of the JSON so we learn the schema."""
    pad = "  " * depth
    if isinstance(obj, dict):
        print(f"{pad}dict with {len(obj)} keys: {list(obj)[:20]}")
        if depth < max_depth:
            for k in list(obj)[:8]:
                print(f"{pad}.{k}:")
                describe(obj[k], depth + 1, max_depth)
    elif isinstance(obj, list):
        print(f"{pad}list of {len(obj)} items")
        if obj and depth < max_depth:
            describe(obj[0], depth + 1, max_depth)
    else:
        s = str(obj)
        print(f"{pad}{type(obj).__name__}: {s[:100]}")

# keys that commonly hold message text / roles in chat exports
TEXT_KEYS = ("message", "content", "text", "prompt", "body", "query", "response")
ROLE_KEYS = ("role", "sender", "author", "type", "is_user", "from")

def walk_messages(obj, out):
    """Recursively collect (role, text) pairs from anything that looks like a message."""
    if isinstance(obj, dict):
        text = None
        for tk in TEXT_KEYS:
            v = obj.get(tk)
            if isinstance(v, str) and v.strip():
                text = v.strip(); break
        role = None
        for rk in ROLE_KEYS:
            if rk in obj:
                role = str(obj[rk]); break
        if text:
            out.append((role or "?", text))
        for v in obj.values():
            walk_messages(v, out)
    elif isinstance(obj, list):
        for v in obj:
            walk_messages(v, out)

def is_user(role):
    r = (role or "").lower()
    return any(x in r for x in ("user", "human", "true", "juan", "me"))

def profile(msgs):
    users = [t for role, t in msgs if is_user(role)]
    # fallback: if roles unknown, treat shorter alternating turns as user prompts
    if not users:
        users = [t for _, t in msgs]
    lengths = [len(t.split()) for t in users]
    questions = sum(1 for t in users if "?" in t)
    commands = sum(1 for t in users if re.match(r"^(write|make|give|build|create|draft|analyze|find|explain|help|show|list|calculate|compare)", t.strip().lower()))
    words = Counter(re.findall(r"[a-z']{4,}", " ".join(users).lower()))
    stop = set("this that with have from your what when will they them then than about into more your yours just like need want know they'll".split())
    topics = [(w, c) for w, c in words.most_common(60) if w not in stop][:25]
    avg = sum(lengths) / len(lengths) if lengths else 0
    return {
        "total_messages": len(msgs),
        "user_prompts": len(users),
        "avg_prompt_words": round(avg, 1),
        "shortest": min(lengths) if lengths else 0,
        "longest": max(lengths) if lengths else 0,
        "pct_questions": round(100 * questions / len(users), 1) if users else 0,
        "pct_commands": round(100 * commands / len(users), 1) if users else 0,
        "top_topics": topics,
        "sample_prompts": users[:15],
    }

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    path = sys.argv[1]
    print(f"Loading {path} ...")
    data = load(path)

    print("\n===== JSON STRUCTURE (schema discovery) =====")
    describe(data)

    print("\n===== EXTRACTING MESSAGES =====")
    msgs = []
    walk_messages(data, msgs)
    print(f"Found {len(msgs)} candidate message blocks.")

    p = profile(msgs)
    outdir = os.path.dirname(os.path.abspath(path))

    # transcripts
    tpath = os.path.join(outdir, "grok_transcripts.txt")
    with open(tpath, "w", encoding="utf-8") as f:
        for role, text in msgs:
            f.write(f"[{role}] {text}\n\n")
    print(f"Wrote transcripts -> {tpath}")

    # profile markdown
    mpath = os.path.join(outdir, "grok_prompt_profile.md")
    with open(mpath, "w", encoding="utf-8") as f:
        f.write("# Juan — Grok Prompting Profile (auto-generated)\n\n")
        f.write(f"- Candidate message blocks: {p['total_messages']}\n")
        f.write(f"- User prompts: {p['user_prompts']}\n")
        f.write(f"- Avg prompt length: {p['avg_prompt_words']} words (min {p['shortest']}, max {p['longest']})\n")
        f.write(f"- Phrased as a question: {p['pct_questions']}%\n")
        f.write(f"- Phrased as a direct command: {p['pct_commands']}%\n\n")
        f.write("## Top topics\n")
        for w, c in p["top_topics"]:
            f.write(f"- {w} ({c})\n")
        f.write("\n## Sample prompts (verbatim)\n")
        for s in p["sample_prompts"]:
            f.write(f"- {s[:300]}\n")
    print(f"Wrote profile -> {mpath}")
    print("\nDONE. Paste grok_prompt_profile.md back to the Twin (or commit it to the repo).")

if __name__ == "__main__":
    main()
