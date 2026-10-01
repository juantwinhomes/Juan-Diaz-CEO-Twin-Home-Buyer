"""Build the CEO card-approval page from the credit card expense CSV exports.

Each card lives in data/<card-key>/ with up to three files:
  overhead.csv   - "Overhead Expenses" tab export
  property.csv   - "Property Expenses" tab export
  marketing.csv  - "Marketing Expenses" tab export
or, for store accounts billed by invoice (Home Depot):
  invoices.csv   - open invoices and credits; the runner-typed PO is mapped
                   to a property with PO_RULES below

Only unpaid charges (PAID != TRUE) with an amount count. The page shows one
total per property / company / marketing type, not the individual charges.
Run:  python3 approvals/build.py   ->  writes approvals/card-approvals.html
"""
import csv
import hashlib
import json
import os
import re
from collections import Counter

from overhead_categories import categorize
from purpose import about

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

# Card key, display name, statement minimum payment due (None if not given).
# Add new cards here as they are uploaded.
CARDS = [
    ("amex", "American Express", 30887.76),
    ("capone-business", "Capital One Business", None),
    ("home-depot-5253", "Home Depot 5253", None),
]

# Statement facts shown under the card total (label, value).
CARD_FACTS = {
    "home-depot-5253": [
        ("Last statement balance (Sep 13, 2026)", 26742.84),
        ("Last payment (Sep 1, 2026)", 10904.75),
    ],
}

# One-line caveat shown on a card's summary.
CARD_NOTES = {
    "home-depot-5253": "Read from the invoice-page screenshot: 79 of the 84 open invoices were legible; "
                       "5 are missing until the CSV export is added.",
}

# Runners type the job location into the Home Depot PO field with many spellings.
# First matching pattern (on the PO with spaces/punctuation removed) wins.
# A PO that matches nothing lands in "Location to confirm".
PO_RULES = [
    (r"^27PR?A[A-Z]*|^27PAGUE", "27 Prague St"),
    (r"1464|SUNRISE", "1464 Sunrise Pkwy"),
    (r"^52PAR|PARAMO|PARMOU", "52 Paramount Ter"),
    (r"UMLAND", "492 Umland Dr, Santa Rosa"),
    (r"^4605TH", "460 5th Ave, Redwood City"),
    (r"^751TH27|^75127TH|^775127TH", "751 27th Ave"),
    (r"170GLENN", "170 Glenn Way"),
    # Confirmed by accounting, Oct 1 2026
    (r"^PETALUMA", "1464 Sunrise Pkwy"),
    (r"^REDWOODCITY", "460 5th Ave, Redwood City"),
    (r"^SANMATEO", "27 Prague St"),
    (r"^336917THST", "3375 17th St, San Francisco"),
]
UNMATCHED = "Location to confirm"


def po_property(po):
    k = re.sub(r"[^A-Z0-9]", "", (po or "").upper())
    for pat, prop in PO_RULES:
        if re.search(pat, k):
            return prop
    return UNMATCHED



def money(s):
    s = (s or "").strip()
    if not s:
        return None
    neg = s.startswith("(") or s.startswith("-")
    n = re.sub(r"[^0-9.]", "", s)
    if not n:
        return None
    v = round(float(n), 2)
    return -v if neg else v


def norm_date(s):
    s = (s or "").strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if not m:
        return s
    mo, d, y = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"


def rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


def find_header(all_rows, first_cells):
    for i, r in enumerate(all_rows):
        cells = [c.strip().lower() for c in r]
        if all(fc in cells for fc in first_cells):
            return i, cells
    raise ValueError(f"header {first_cells} not found")


def col(cells, name, start=0):
    return cells.index(name.lower(), start)


def flag_col(h, data, preferred):
    """Index of the TRUE/FALSE paid flag. Some exports keep it under another header."""
    if preferred in h:
        return h.index(preferred)
    for j in range(len(h)):
        vals = {x[j].strip().upper() for x in data if j < len(x) and x[j].strip()}
        if vals and vals <= {"TRUE", "FALSE"}:
            return j
    raise ValueError("paid flag column not found")


def opt(x, c, k):
    return x[c[k]] if c.get(k) is not None else ""


def tidy(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def load_property(path):
    r = rows(path)
    i, h = find_header(r, ["property", "who will pay", "amount"])
    c = {k: col(h, k) for k in ["property", "who will pay", "date", "description", "vendor", "amount"]}
    c["paid"] = flag_col(h, r[i + 1:], "paid")
    out, bal = [], {}
    for x in r[i + 1:]:
        x += [""] * (len(h) - len(x))
        amt = money(x[c["amount"]])
        if amt is None:
            continue
        g = tidy(x[c["property"]]) or "No property listed"
        bal[g] = bal.get(g, 0) + amt
        if x[c["paid"]].strip().upper() == "TRUE":
            continue
        out.append({
            "group": g,
            "date": norm_date(x[c["date"]]),
            "vendor": tidy(x[c["vendor"]]),
            "desc": tidy(x[c["description"]]),
            "amount": amt,
            "payer": tidy(x[c["who will pay"]]),
        })
    return out, bal


def load_overhead(path):
    r = rows(path)
    i, h = find_header(r, ["who will pay", "company", "amount"])
    c = {k: col(h, k) for k in ["who will pay", "date", "vendor", "description", "amount", "company"]}
    # Overhead lines are grouped by what the money was for (Travel, Insurance, ...);
    # the company is kept as a breakdown on each line.
    for k in ["bucket", "expense type"]:
        c[k] = h.index(k) if k in h else None
    c["paid"] = flag_col(h, r[i + 1:], "paid")
    out, bal = [], {}
    for x in r[i + 1:]:
        x += [""] * (len(h) - len(x))
        amt = money(x[c["amount"]])
        if amt is None:
            continue
        g = categorize(x[c["vendor"]], x[c["description"]], opt(x, c, "bucket"), opt(x, c, "expense type"))
        bal[g] = bal.get(g, 0) + amt
        if x[c["paid"]].strip().upper() == "TRUE":
            continue
        tags = []
        out.append({
            "group": g,
            "date": norm_date(x[c["date"]]),
            "vendor": tidy(x[c["vendor"]]),
            "desc": tidy(x[c["description"]]),
            "amount": amt,
            "payer": tidy(x[c["who will pay"]]),
            "company": tidy(x[c["company"]]) or "No company listed",
            "tag": " · ".join(tags),
        })
    return out, bal


def load_marketing(path):
    r = rows(path)
    i, h = find_header(r, ["date", "marketing type", "vendor name", "paid"])
    paid_flag = col(h, "paid", col(h, "paid") + 1)  # second PAID column is the TRUE/FALSE flag
    c = {k: col(h, k) for k in ["date", "marketing type", "vendor name"]}
    for k in ["simple charge description", "marketing category", "lead channel"]:
        c[k] = h.index(k) if k in h else None
    amount_col = col(h, "paid")  # first "Paid" column holds the amount
    canon = {}
    out, bal = [], {}
    for x in r[i + 1:]:
        x += [""] * (len(h) - len(x))
        amt = money(x[amount_col])
        if amt is None:
            continue
        g = tidy(x[c["marketing type"]]) or "No type listed"
        g = canon.setdefault(g.lower(), g)  # "InvestorBase" / "Investorbase" -> one group
        bal[g] = bal.get(g, 0) + amt
        if x[paid_flag].strip().upper() == "TRUE":
            continue
        tags = [t for t in (tidy(opt(x, c, "marketing category")), tidy(opt(x, c, "lead channel"))) if t]
        out.append({
            "group": g,
            "date": norm_date(x[c["date"]]),
            "vendor": tidy(x[c["vendor name"]]),
            "desc": tidy(opt(x, c, "simple charge description")),
            "amount": amt,
            "tag": " · ".join(tags),
        })
    return out, bal


def load_invoices(path):
    """Home Depot open invoices + credits. Everything listed is unpaid."""
    out, bal = [], {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for x in csv.DictReader(f):
            amt = money(x["Amount"])
            if amt is None:
                continue
            g = po_property(x["Purchase Order"])
            bal[g] = bal.get(g, 0) + amt
            credit = x["Type"].strip().lower() == "credit"
            tags = [f'PO {x["Purchase Order"].strip()}']
            if x.get("CSA"):
                tags.append(f'CSA {x["CSA"].strip()}')
            it = {
                "group": g,
                "date": x["Date"].strip(),
                "vendor": ("Credit #" if credit else "Invoice #") + x["Invoice/Ref"].strip(),
                "desc": "Return / credit applied to account" if credit else "",
                "amount": amt,
                "tag": " · ".join(tags),
                "key": x["Invoice/Ref"].strip(),
            }
            if x.get("Due Date"):
                it["due"] = x["Due Date"].strip()
            if x.get("EPD Amount"):
                it["epd"] = {"date": x["EPD Date"].strip(), "amount": money(x["EPD Amount"])}
            out.append(it)
    # Accounting reallocations between properties (data/<card>/adjustments.csv)
    adj = os.path.join(os.path.dirname(path), "adjustments.csv")
    if os.path.exists(adj):
        with open(adj, encoding="utf-8-sig", newline="") as f:
            for n, x in enumerate(csv.DictReader(f), 1):
                amt = money(x["Amount"])
                for g, sign in ((x["From"].strip(), -1), (x["To"].strip(), 1)):
                    bal[g] = bal.get(g, 0) + sign * amt
                    out.append({"group": g, "date": x["Date"].strip(), "vendor": "Adjustment", "desc": x["Note"].strip(),
                                "amount": sign * amt, "tag": "", "adj": True, "key": f"adj-{n}-{sign}"})
    return out, bal


LOADERS = [("overhead", "Overhead", load_overhead), ("property", "Property", load_property), ("marketing", "Marketing", load_marketing),
           ("invoices", "Property", load_invoices)]


def summarize(card, skey, items, bal):
    """One approval line per property / company / marketing type: totals only."""
    groups = {}
    for it in items:
        groups.setdefault(it["group"], []).append(it)
    lines = []
    for g, its in groups.items():
        payers = sorted({i["payer"] for i in its if i.get("payer")})
        dates = sorted(i["date"] for i in its if re.match(r"^\d{4}-\d{2}-\d{2}$", i["date"] or ""))
        line = {
            "id": hashlib.sha1(f"{card}|{skey}|{g}".encode()).hexdigest()[:16],
            "name": g,
            "owed": round(sum(i["amount"] for i in its), 2),
            "count": sum(1 for i in its if not i.get("adj")),
            "credits": sum(1 for i in its if i["amount"] < 0 and not i.get("adj")),
            "payers": payers,
            "from": dates[0] if dates else "",
            "to": dates[-1] if dates else "",
        }
        line["about"] = about(skey, its)
        moved = round(sum(i["amount"] for i in its if i.get("adj")), 2)
        if moved:
            line["moved"] = moved
        if g in bal:
            line["balance"] = round(bal[g], 2)
        dues = [{"d": i["due"], "a": i["amount"], **({"ed": i["epd"]["date"], "ea": i["epd"]["amount"]} if i.get("epd") else {})}
                for i in its if i.get("due")]
        if dues:
            line["dues"] = dues
        comp = {}
        for i in its:
            if i.get("company"):
                comp[i["company"]] = comp.get(i["company"], 0) + i["amount"]
        if comp:
            line["companies"] = [{"name": k, "owed": round(v, 2)} for k, v in sorted(comp.items(), key=lambda kv: -abs(kv[1]))]
        if g == UNMATCHED:
            line["pos"] = sorted({re.sub(r"^PO ", "", i["tag"].split(" · ")[0]) for i in its})
        lines.append(line)
    lines.sort(key=lambda l: ((l["name"] != UNMATCHED), -abs(l["owed"]), l["name"]))
    return lines


def build():
    cards = []
    for key, name, min_due in CARDS:
        sections = []
        for skey, sname, loader in LOADERS:
            p = os.path.join(DATA, key, f"{skey}.csv")
            if not os.path.exists(p):
                continue
            items, bal = loader(p)
            lines = summarize(key, skey, items, bal)
            sections.append({"key": skey, "name": sname, "lines": lines})
        cards.append({"key": key, "name": name, "minDue": min_due,
                      "note": CARD_NOTES.get(key, ""), "facts": [{"label": l, "amount": v} for l, v in CARD_FACTS.get(key, [])], "sections": sections})
    tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    html = tpl.replace("/*__DATA__*/null", json.dumps({"cards": cards}, separators=(",", ":")))
    out = os.path.join(HERE, "card-approvals.html")
    open(out, "w", encoding="utf-8").write(html)
    for c in cards:
        for s in c["sections"]:
            print(c["name"], s["name"], len(s["lines"]), "lines", round(sum(l["owed"] for l in s["lines"]), 2))
    print("wrote", out)


if __name__ == "__main__":
    build()
