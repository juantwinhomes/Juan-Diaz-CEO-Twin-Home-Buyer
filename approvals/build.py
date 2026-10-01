"""Build the CEO card-approval page from the credit card expense CSV exports.

Each card lives in data/<card-key>/ with up to three files:
  overhead.csv   - "Overhead Expenses" tab export
  property.csv   - "Property Expenses" tab export
  marketing.csv  - "Marketing Expenses" tab export

Only unpaid charges (PAID != TRUE) with an amount are sent for approval.
Run:  python3 approvals/build.py   ->  writes approvals/card-approvals.html
"""
import csv
import hashlib
import json
import os
import re
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

# Card key, display name, statement minimum payment due (None if not given).
# Add new cards here as they are uploaded.
CARDS = [
    ("amex", "American Express", 30887.76),
    ("capone-business", "Capital One Business", None),
]


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
    for k in ["bucket", "expense type"]:
        c[k] = h.index(k) if k in h else None
    c["paid"] = flag_col(h, r[i + 1:], "paid")
    out, bal = [], {}
    for x in r[i + 1:]:
        x += [""] * (len(h) - len(x))
        amt = money(x[c["amount"]])
        if amt is None:
            continue
        g = tidy(x[c["company"]]) or "No company listed"
        bal[g] = bal.get(g, 0) + amt
        if x[c["paid"]].strip().upper() == "TRUE":
            continue
        tags = [t for t in (tidy(opt(x, c, "bucket")), tidy(opt(x, c, "expense type"))) if t]
        out.append({
            "group": g,
            "date": norm_date(x[c["date"]]),
            "vendor": tidy(x[c["vendor"]]),
            "desc": tidy(x[c["description"]]),
            "amount": amt,
            "payer": tidy(x[c["who will pay"]]),
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


LOADERS = [("overhead", "Overhead", load_overhead), ("property", "Property", load_property), ("marketing", "Marketing", load_marketing)]


def assign_ids(card, section, items):
    """Stable ids: same charge -> same id across rebuilds, so decisions stick."""
    seen = Counter()
    for it in items:
        base = "|".join([card, section, it["group"], it["date"], it["vendor"], it["desc"], f'{it["amount"]:.2f}'])
        seen[base] += 1
        it["id"] = hashlib.sha1(f"{base}|{seen[base]}".encode()).hexdigest()[:16]


def build():
    cards = []
    for key, name, min_due in CARDS:
        sections = []
        for skey, sname, loader in LOADERS:
            p = os.path.join(DATA, key, f"{skey}.csv")
            if not os.path.exists(p):
                continue
            items, bal = loader(p)
            items.sort(key=lambda it: (it["group"].lower(), it["date"] or "9999"))
            assign_ids(key, skey, items)
            balances = {g: round(v, 2) for g, v in bal.items() if any(it["group"] == g for it in items)}
            sections.append({"key": skey, "name": sname, "items": items, "balances": balances})
        cards.append({"key": key, "name": name, "minDue": min_due, "sections": sections})
    tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    html = tpl.replace("/*__DATA__*/null", json.dumps({"cards": cards}, separators=(",", ":")))
    out = os.path.join(HERE, "card-approvals.html")
    open(out, "w", encoding="utf-8").write(html)
    for c in cards:
        for s in c["sections"]:
            print(c["name"], s["name"], len(s["items"]), round(sum(i["amount"] for i in s["items"]), 2))
    print("wrote", out)


if __name__ == "__main__":
    build()
