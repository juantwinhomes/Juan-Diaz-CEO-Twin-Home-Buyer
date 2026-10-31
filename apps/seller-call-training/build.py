"""Build the Seller-Call Training page and its typed version from content.py."""
import json
from content import DATA, STORY
RULES = ["No price over the phone", "“According to Redfin,” never “I know”", "Booked a 15-minute visit with Juan",
         "Honest advice about listing", "No pressure", "Juan’s story as written, no company age"]
def typed():
    o = ["SELLER-CALL TRAINING · Twin Home Buyer", "Source: " + DATA["source"] + ".", "",
         "How it works: sign in with your name and 6-digit code. Six modules, in order, no skipping ahead. Each module ends with a quiz: every answer right opens the next module. Module 5 also needs one passed AI practice call. Every answer is saved by name. After Module 6: a final mock call with Cherry or Thea, then Juan certifies.", "",
         "JUAN’S STORY (the only way it is told):", "“" + STORY + "”", "Never state an age for the company.", ""]
    for i, m in enumerate(DATA["modules"]):
        o += ["MODULE %d: %s" % (i + 1, m["title"].upper()), "Rule: " + m["rule"]]
        for p in m["parts"]:
            o += ["", p["h"]]
            if p.get("intro"): o.append("   " + p["intro"])
            if p.get("say"): o.append("   “" + p["say"] + "”")
            for k, x in enumerate(p.get("pts", [])): o.append(("   %d) " % (k + 1) if p.get("ol") else "   - ") + x)
            EXK = {"seller": "Seller says", "you": "You say", "juan": "What Juan said", "yes": "Say", "no": "Don’t say"}
            for e in p.get("ex", []): o.append("   %s: %s" % (EXK[e["k"]], e["t"]))
            o.append("   Source: " + " / ".join("%s: “%s”" % (f["s"], f["t"]) for f in p["from"]))
        if m.get("roleplay"): o += ["", "Practice call checks (all six must pass): " + "; ".join(RULES) + "."]
        o += ["", "Quiz (%d questions, all must be right):" % len(m["quiz"])]
        for k, q in enumerate(m["quiz"]):
            o.append("%d. %s" % (k + 1, q["q"]))
            for j, a in enumerate(q["o"]): o.append("   %s. %s" % ("ABC"[j], a))
            o.append("   Answer: %s. Why: %s" % ("ABC"[q["a"]], q["why"]))
        o.append("")
    o.append("FINAL STEP: mock call with Cherry or Thea (Passed / Needs another try, with notes), then Juan’s Certify.")
    return "\n".join(o)
page = open("page.html", encoding="utf-8").read()
assert page.count("__DATA__") == 1
open("seller-call-training.html", "w", encoding="utf-8").write(page.replace("__DATA__", json.dumps(DATA, ensure_ascii=False)))
t = typed()
open("typed.txt", "w", encoding="utf-8").write(t)
open("seller-call-training.md", "w", encoding="utf-8").write(
    "# Seller-Call Training\n\nTyped version of the Seller-Call Training page: the same words as the modules, quizzes and answer key.\n"
    "Shared board (artifact database) collections: `answers` (every quiz attempt, each answer, by name), `roleplays` (every AI practice call: transcript, six checks, pass/fail), "
    "`mockcalls` (Cherry/Thea results with notes), `certs` (Juan's certifications), `people`, `log`.\n\n```text\n" + t + "\n```\n")
print("built", len(page), "bytes template;", len(t.split()), "words typed")
