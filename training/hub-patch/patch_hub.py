"""Add the Training tab (Module 1) to a Team Hub HTML file. Usage: python3 patch_hub.py IN.html OUT.html"""
import os
import json, sys
HERE = os.path.dirname(os.path.abspath(__file__))
src, out = sys.argv[1], sys.argv[2]
html = open(src, encoding="utf-8").read()
mod = json.load(open(os.path.join(HERE, "..", "module-01-juans-method.json"), encoding="utf-8"))
js = open(os.path.join(HERE, "training.js"), encoding="utf-8").read().replace("__MODULE_JSON__", json.dumps(mod, ensure_ascii=False))
if "training_attempts" in html:
    sys.exit("already patched: " + src)
R = [
 ('var t=[["today","Today"],["score","Scorecard",mineOpen],',
  'var t=[["today","Today"],["train","Training",modsOpen()],["score","Scorecard",mineOpen],'),
 ('["coach","Coaching"],', '["coach","Coaching"],["train","Training"],'),
 ('score:scoreView};', 'score:scoreView,train:trainingView};'),
 ('  if(canEdit){\n    db.collection("join_requests")',
  '  db.collection("training_attempts").onSnapshot(function(s){mergeAttempts((s&&s.docs)||[]);if(me)softRender();},function(){loadAttempts().then(function(){if(me)softRender();});});\n  loadAttempts();\n  if(canEdit){\n    db.collection("join_requests")'),
 ("(!x.p.trained?'<div class=\"small red\">Not trained yet</div>':\"\")",
  "(!x.p.trained?'<div class=\"small red\">Not trained yet</div>':\"\")+modLine(x.r.slug)"),
 ('<b>People & codes:</b> codes, new codes, and access requests.',
  '<b>People & codes:</b> codes, new codes, and access requests.<br><b>Training:</b> who passed Module 1 and is cleared to go live, and every quiz attempt by name.'),
 ('/* ---------- how it works ---------- */', js + '/* ---------- how it works ---------- */'),
]
for old, new in R:
    n = html.count(old)
    if n != 1:
        sys.exit(f"anchor found {n} times: {old[:70]!r}")
    html = html.replace(old, new)
open(out, "w", encoding="utf-8").write(html)
print("patched", src, "->", out)
