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

# Card key -> display name. Add new cards here as they are uploaded.
CARDS = [
    ("amex", "American Express"),
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


def tidy(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def load_property(path):
    r = rows(path)
    i, h = find_header(r, ["property", "who will pay", "paid"])
    c = {k: col(h, k) for k in ["property", "who will pay", "date", "description", "vendor", "amount", "paid"]}
    out = []
    for x in r[i + 1:]:
        x += [""] * (len(h) - len(x))
        amt = money(x[c["amount"]])
        if amt is None or x[c["paid"]].strip().upper() == "TRUE":
            continue
        out.append({
            "group": tidy(x[c["property"]]) or "No property listed",
            "date": norm_date(x[c["date"]]),
            "vendor": tidy(x[c["vendor"]]),
            "desc": tidy(x[c["description"]]),
            "amount": amt,
            "payer": tidy(x[c["who will pay"]]),
        })
    return out


def load_overhead(path):
    r = rows(path)
    i, h = find_header(r, ["who will pay", "company", "paid"])
    c = {k: col(h, k) for k in ["who will pay", "date", "vendor", "description", "amount", "company", "bucket", "expense type", "paid"]}
    out = []
    for x in r[i + 1:]:
        x += [""] * (len(h) - len(x))
        amt = money(x[c["amount"]])
        if amt is None or x[c["paid"]].strip().upper() == "TRUE":
            continue
        tags = [t for t in (tidy(x[c["bucket"]]), tidy(x[c["expense type"]])) if t]
        out.append({
            "group": tidy(x[c["company"]]) or "No company listed",
            "date": norm_date(x[c["date"]]),
            "vendor": tidy(x[c["vendor"]]),
            "desc": tidy(x[c["description"]]),
            "amount": amt,
            "payer": tidy(x[c["who will pay"]]),
            "tag": " · ".join(tags),
        })
    return out


def load_marketing(path):
    r = rows(path)
    i, h = find_header(r, ["date", "marketing type", "vendor name", "paid"])
    paid_flag = col(h, "paid", col(h, "paid") + 1)  # second PAID column is the TRUE/FALSE flag
    c = {k: col(h, k) for k in ["date", "marketing type", "vendor name", "simple charge description", "marketing category", "lead channel"]}
    amount_col = col(h, "paid")  # first "Paid" column holds the amount
    canon = {}
    out = []
    for x in r[i + 1:]:
        x += [""] * (len(h) - len(x))
        amt = money(x[amount_col])
        if amt is None or x[paid_flag].strip().upper() == "TRUE":
            continue
        g = tidy(x[c["marketing type"]]) or "No type listed"
        g = canon.setdefault(g.lower(), g)  # "InvestorBase" / "Investorbase" -> one group
        tags = [t for t in (tidy(x[c["marketing category"]]), tidy(x[c["lead channel"]])) if t]
        out.append({
            "group": g,
            "date": norm_date(x[c["date"]]),
            "vendor": tidy(x[c["vendor name"]]),
            "desc": tidy(x[c["simple charge description"]]),
            "amount": amt,
            "tag": " · ".join(tags),
        })
    return out


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
    for key, name in CARDS:
        sections = []
        for skey, sname, loader in LOADERS:
            p = os.path.join(DATA, key, f"{skey}.csv")
            if not os.path.exists(p):
                continue
            items = loader(p)
            items.sort(key=lambda it: (it["group"].lower(), it["date"] or "9999"))
            assign_ids(key, skey, items)
            sections.append({"key": skey, "name": sname, "items": items})
        cards.append({"key": key, "name": name, "sections": sections})
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
