"""Build the Home Depot 5253 workings page: every invoice and credit read from the
open-invoice screenshot, the PO the runner typed, and the property it was assigned to.
Run:  python3 approvals/hd_workings.py  ->  writes approvals/home-depot-workings.html
"""
import csv
import html
import os
import re
from collections import defaultdict

import build

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "home-depot-5253", "invoices.csv")
CONFIRMED = {"1464 Sunrise Pkwy": "PETALUMA", "460 5th Ave, Redwood City": "REDWOODCITY",
             "27 Prague St": "SANMATEO", "3375 17th St, San Francisco": "336917THST"}
STATEMENT = 26742.84
TODAY = "2026-10-01"


def esc(s):
    return html.escape(str(s or ""))


def fmt(n):
    return ("−$" if n < 0 else "$") + f"{abs(n):,.2f}"


def d(s):
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s or "")
    if not m:
        return ""
    months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    return f"{months[int(m[2]) - 1]} {int(m[3])}"


def how(po, prop):
    k = re.sub(r"[^A-Z0-9]", "", po.upper())
    if CONFIRMED.get(prop) and k.startswith(CONFIRMED[prop]):
        return "You confirmed"
    if k.startswith("775127TH"):
        return "You confirmed"
    return "Spelling match"


rows = list(csv.DictReader(open(SRC, encoding="utf-8")))
for r in rows:
    r["prop"] = build.po_property(r["Purchase Order"])
    r["amt"] = float(r["Amount"])

by = defaultdict(list)
for r in rows:
    by[r["prop"]].append(r)
props = sorted(by, key=lambda p: -sum(r["amt"] for r in by[p]))

inv = [r for r in rows if r["Type"] == "Invoice"]
cr = [r for r in rows if r["Type"] == "Credit"]
tot_inv, tot_cr = sum(r["amt"] for r in inv), sum(r["amt"] for r in cr)
pre = sum(r["amt"] for r in inv if r["Date"] <= "2026-09-13")
late = [r for r in inv if r["Due Date"] and r["Due Date"] < TODAY]

spell = defaultdict(set)
for r in rows:
    spell[r["prop"]].add(r["Purchase Order"].strip())

summary_rows = "".join(
    f"<tr><td>{esc(p)}</td><td class=n>{sum(1 for r in by[p] if r['Type']=='Invoice')}</td>"
    f"<td class=n>{sum(1 for r in by[p] if r['Type']=='Credit')}</td>"
    f"<td class=n>{fmt(sum(r['amt'] for r in by[p] if r['Type']=='Invoice'))}</td>"
    f"<td class=n>{fmt(sum(r['amt'] for r in by[p] if r['Type']=='Credit'))}</td>"
    f"<td class='n b'>{fmt(sum(r['amt'] for r in by[p]))}</td></tr>"
    for p in props)

rule_rows = "".join(
    f"<tr><td>{esc(p)}</td><td>{', '.join(f'<code>{esc(s)}</code>' for s in sorted(spell[p]))}</td></tr>" for p in props)

detail = []
for p in props:
    rs = sorted(by[p], key=lambda r: (r["Date"], r["Invoice/Ref"]))
    body = "".join(
        f"<tr class='{'cr' if r['Type']=='Credit' else ''}'><td>{d(r['Date'])}</td>"
        f"<td>{'Credit' if r['Type']=='Credit' else 'Invoice'} {esc(r['Invoice/Ref'])}</td>"
        f"<td><code>{esc(r['Purchase Order'])}</code></td><td>{how(r['Purchase Order'], p)}</td>"
        f"<td>{('<span class=late>' + d(r['Due Date']) + ' past due</span>') if r['Due Date'] and r['Due Date'] < TODAY else d(r['Due Date'])}</td>"
        f"<td class=n>{fmt(r['amt'])}</td><td class=n>{fmt(float(r['EPD Amount'])) + ' by ' + d(r['EPD Date']) if r['EPD Amount'] else ''}</td>"
        f"<td class=n>{esc(r['PDF Page'])}</td></tr>" for r in rs)
    detail.append(f"""<details class=prop><summary><span>{esc(p)}</span><span class=n>{len(rs)} rows · <b>{fmt(sum(r['amt'] for r in rs))}</b></span></summary>
<div class=scroll><table><thead><tr><th>Date</th><th>Invoice / credit</th><th>PO the runner typed</th><th>How it was placed</th><th>Due</th><th class=n>Amount</th><th class=n>Early-pay price</th><th class=n>PDF page</th></tr></thead><tbody>{body}</tbody></table></div></details>""")

page = f"""<title>Home Depot 5253 Workings</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@600;700&family=Public+Sans:wght@400;600;700&display=swap">
<style>
/* Layout: a working-papers packet: method first, the tie-out, then each property's invoices folded underneath. */
:root {{ --bg:#eef2ea; --paper:#fbfcf8; --ink:#17261f; --muted:#5b6b62; --line:#d3ddd2; --soft:#e3eadf; --money:#1e5a3c; --gold:#8f6b12; --gold-bg:#f6eccd; --warn:#b23b2e; --ok:#1f7a46;
  --f-money:"Spectral",Georgia,serif; --f-body:"Public Sans","Segoe UI",system-ui,sans-serif; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#0f1713; --paper:#16211b; --ink:#e2ece5; --muted:#95a89c; --line:#283a30; --soft:#1d2b23; --money:#7cc79c; --gold:#e0b955; --gold-bg:#3a2f12; --warn:#ef8a7c; --ok:#7cd39d; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --bg:#0f1713; --paper:#16211b; --ink:#e2ece5; --muted:#95a89c; --line:#283a30; --soft:#1d2b23; --money:#7cc79c; --gold:#e0b955; --gold-bg:#3a2f12; --warn:#ef8a7c; --ok:#7cd39d; color-scheme:dark; }}
* {{ box-sizing:border-box; }}
body {{ background:var(--bg); color:var(--ink); font-family:var(--f-body); font-size:14px; line-height:1.5; }}
.wrap {{ max-width:1000px; margin:0 auto; padding:28px 18px 64px; display:grid; gap:22px; }}
.eyebrow {{ font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--money); font-weight:700; }}
h1 {{ font-family:var(--f-money); font-size:32px; margin:4px 0 0; line-height:1.1; text-wrap:balance; }}
h2 {{ font-family:var(--f-money); font-size:21px; margin:0 0 8px; }}
p {{ margin:0; max-width:72ch; }}
.muted {{ color:var(--muted); }}
section {{ background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:18px 20px; display:grid; gap:10px; min-width:0; }}
ol {{ margin:0; padding-left:20px; display:grid; gap:6px; max-width:76ch; }}
.tie {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px 20px; max-width:560px; font-variant-numeric:tabular-nums; }}
.tie .n {{ text-align:right; font-family:var(--f-money); font-size:16px; }}
.tie .t {{ border-top:1.5px solid var(--ink); padding-top:4px; font-weight:700; }}
.flag {{ background:var(--gold-bg); border:1px solid var(--gold); border-radius:10px; padding:12px 14px; display:grid; gap:4px; }}
.scroll {{ overflow-x:auto; }}
table {{ border-collapse:collapse; width:100%; font-size:13px; font-variant-numeric:tabular-nums; }}
th, td {{ text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }}
th {{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }}
td.n, th.n {{ text-align:right; }}
td.b {{ font-weight:700; }}
tr.cr td {{ color:var(--ok); }}
tfoot td {{ font-weight:700; border-top:1.5px solid var(--ink); border-bottom:0; }}
code {{ font-family:ui-monospace,Menlo,monospace; font-size:12px; background:var(--soft); padding:1px 5px; border-radius:4px; white-space:nowrap; }}
.rules td {{ white-space:normal; }}
.rules td code {{ display:inline-block; margin:2px 0; }}
.late {{ color:var(--warn); font-weight:600; }}
details.prop {{ border:1px solid var(--line); border-radius:10px; background:var(--paper); min-width:0; overflow:hidden; }}
details.prop > summary {{ cursor:pointer; padding:12px 14px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px 16px; font-weight:700; }}
details.prop > summary b {{ font-family:var(--f-money); font-size:16px; }}
details.prop[open] > summary {{ border-bottom:1px solid var(--line); background:var(--soft); }}
.props {{ display:grid; gap:8px; min-width:0; }}
.props > * {{ min-width:0; }}
</style>
<div class=wrap>
<header><div class=eyebrow>Twin Home Buyer · Accounts payable</div><h1>Home Depot 5253 Workings</h1>
<p class=muted>How the Home Depot numbers on Juan's approval page were put together, from the invoice-page screenshot taken Oct 1, 2026.</p></header>

<section><h2>How it was built</h2><ol>
<li><b>Source.</b> The Home Depot Commercial Account “Open invoices” page (account ending 5253), saved as an 8-page PDF on Oct 1, 2026. Everything in the Open list is unpaid.</li>
<li><b>Read every row.</b> For each invoice: date, invoice number, the PO the runner typed, due date, amount, and the early-pay price. For each credit: date, reference number, PO, credit amount. The PDF page for each row is in the tables below so you can check it.</li>
<li><b>Assign a property from the PO.</b> Runners type the job into the PO field with different spellings. Spaces and punctuation are ignored, then each PO is matched to a property (the spellings found are listed below). Five PO words had no street address, and you confirmed those on Oct 1.</li>
<li><b>Credits reduce what's owed.</b> Each credit is subtracted from the property in its PO.</li>
<li><b>Total per property</b> = its invoices minus its credits. That is the “Owed” number on each Home Depot line Juan approves.</li>
</ol></section>

<section><h2>Tie-out</h2>
<div class=tie>
<span>{len(inv)} open invoices read</span><span class=n>{fmt(tot_inv)}</span>
<span>{len(cr)} credits</span><span class=n>{fmt(tot_cr)}</span>
<span class=t>Total owed shown on the approval page</span><span class="n t">{fmt(tot_inv + tot_cr)}</span>
</div>
<div class=flag><b>5 invoices are missing.</b>
<span>The page footer says “Viewing 84 of 84 Invoices”, but only {len(inv)} could be read. The screenshot tool lost rows where it stitched the page together. One is visibly cut off on PDF page 6, between Jul 22 and Jul 17 (PO <code>27PRAGUEST</code>, amount not visible), and one row on page 7 (invoice 5901294) was captured twice and is counted once.</span>
<span>Cross-check: invoices dated on or before the Sep 13 statement that could be read total <b>{fmt(pre)}</b>. The Sep 13 statement balance is <b>{fmt(STATEMENT)}</b>. The <b>{fmt(STATEMENT - pre)}</b> difference is most likely those missing invoices. The CSV from the portal's Download button would close this gap.</span></div>
<p><span class=late>{len(late)} invoices ({fmt(sum(r['amt'] for r in late))}) were due Sep 30 and are past due.</span></p>
</section>

<section><h2>By property</h2><div class=scroll><table>
<thead><tr><th>Property</th><th class=n>Invoices</th><th class=n>Credits</th><th class=n>Invoice total</th><th class=n>Credit total</th><th class=n>Owed</th></tr></thead>
<tbody>{summary_rows}</tbody>
<tfoot><tr><td>Total</td><td class=n>{len(inv)}</td><td class=n>{len(cr)}</td><td class=n>{fmt(tot_inv)}</td><td class=n>{fmt(tot_cr)}</td><td class=n>{fmt(tot_inv + tot_cr)}</td></tr></tfoot>
</table></div></section>

<section><h2>PO spellings matched to each property</h2><div class=scroll><table class=rules>
<thead><tr><th>Property</th><th>What runners typed in the PO</th></tr></thead><tbody>{rule_rows}</tbody></table></div>
<p class=muted>Confirmed by you: PETALUMA → 1464 Sunrise Pkwy, REDWOODCITY → 460 5th Ave, SANMATEO → 27 Prague St, 336917THST → 3375 17th St, 775127THAVEEVARIS → 751 27th Ave.</p></section>

<section><h2>Every invoice and credit</h2><p class=muted>Open a property to see its rows. Credits are in green.</p><div class=props>{''.join(detail)}</div></section>
</div>
"""
out = os.path.join(HERE, "home-depot-workings.html")
open(out, "w", encoding="utf-8").write(page)
print("wrote", out, len(inv), len(cr), round(tot_inv + tot_cr, 2), round(pre, 2))
