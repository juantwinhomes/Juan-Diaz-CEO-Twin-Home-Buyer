#!/usr/bin/env python3
"""REI Lead QA sweep — pulls the N most recent contacts (read-only) and
checks each against the Lead Entry & QA Playbook rules.

Usage: python3 reibb_qa_sweep.py <state.json> [N]
Writes: qa_report.md + qa_results.jsonl next to the state file.
Assumes an already-authenticated storage state (run reibb_login.py first).
"""
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright

STATE = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 5
OUTDIR = os.path.dirname(os.path.abspath(STATE))

# About-panel labels, in the order they appear on a contact record. A label
# followed by another label (or section header) means the field is empty.
ABOUT_LABELS = [
    "Category", "Lead Stage", "Call Disposition", "Notes", "Sales Agent",
    "Source", "Name", "Phone (Mobile)", "Phone (Home)", "Email", "Campaign",
    "Property Address", "Mailing Address", "Amount Offer", "Next Step",
]
BOUNDARY = set(ABOUT_LABELS) | {
    "View Screenshot Details Link", "Transfer to Airtable", "Appointment Time",
    "Appointment Date", "Appointment Assigned To", "Appointment Type",
    "Revenue", "Manage Contact Tab(s)", "Tag(s)", "Social Profiles",
    "Latest Engagement Insights", "Primary Details", "Contact Type",
}


def parse_record(text):
    lines = [l.strip() for l in text.split("\n")]
    lines = [l for l in lines if l]
    fields = {}
    for label in ABOUT_LABELS:
        try:
            i = lines.index(label, lines.index("About") if "About" in lines else 0)
        except ValueError:
            fields[label] = ""
            continue
        val = lines[i + 1] if i + 1 < len(lines) else ""
        fields[label] = "" if val in BOUNDARY or val in {"-", "--"} else val

    # Tags: between "Tag(s)" and "Social Profiles" in the left panel
    tags = []
    if "Tag(s)" in lines:
        j = lines.index("Tag(s)") + 1
        while j < len(lines) and lines[j] not in BOUNDARY:
            tags.append(lines[j])
            j += 1
    fields["Tags"] = tags

    # Social profile: anything between "Social Profiles" and the next section
    social = []
    if "Social Profiles" in lines:
        j = lines.index("Social Profiles") + 1
        while j < len(lines) and lines[j] not in BOUNDARY:
            social.append(lines[j])
            j += 1
    fields["Social"] = social

    # Contact Type: left panel, between "Contact Type" and "Tag(s)"
    ctype = []
    if "Contact Type" in lines:
        j = lines.index("Contact Type") + 1
        while j < len(lines) and lines[j] not in BOUNDARY:
            if lines[j] not in {"+"}:
                ctype.append(lines[j])
            j += 1
    fields["Contact Type"] = ", ".join(ctype)

    fields["Deal Linked"] = bool(re.search(r"Associated Deals \(0*[1-9]", text))
    fields["Notes Count"] = int(m.group(1)) if (m := re.search(r"Notes \((\d+)\)", text)) else 0
    return fields


DEAD_DISPOS = {"out of buy box", "not interested", "listed with agent",
               "sold elsewhere", "bad number", "pass", "dead"}

# Confirmed picklists (2026-07-18). Category -> allowed leading stage numbers.
CAT_STAGE = {"active": {"1", "2", "3", "4", "5", "7", "8"},
             "lost/dead": {"0", "6", "9"},
             "won": {"10"}}
DEAD_STAGES = {"0", "6", "9"}


def stage_num(stage):
    m = re.match(r"(\d+)", stage.strip())
    return m.group(1) if m else ""


def qa_check(f):
    issues = []
    req = [("Name", "Full Name"), ("Phone (Mobile)", "Mobile phone"),
           ("Source", "Source"), ("Lead Stage", "Lead Stage"),
           ("Call Disposition", "Call Disposition"), ("Sales Agent", "Sales Agent"),
           ("Property Address", "Property Address"), ("Category", "Category")]
    for key, label in req:
        if not f.get(key):
            issues.append(f"{label} is empty (required)")
    if not f.get("Contact Type"):
        issues.append("Contact Type not selected (required)")
    if not f.get("Tags"):
        issues.append("No tags applied (required)")
    if not f.get("Social"):
        issues.append("Social profile / website URL missing (required)")
    if not f.get("Email"):
        issues.append("Email empty — add it or document that none exists")
    if not f.get("Campaign"):
        issues.append("Campaign not attached — attach or confirm N/A for this source")
    if f.get("Notes Count", 0) == 0 and not f.get("Notes"):
        issues.append("No notes on record (required)")

    dispo = f.get("Call Disposition", "").lower()
    stage = f.get("Lead Stage", "")
    cat = f.get("Category", "").lower()
    snum = stage_num(stage)
    is_dead = dispo in DEAD_DISPOS or cat in {"lost/dead", "won"}
    if not f.get("Next Step") and not is_dead:
        issues.append("Next Step missing (required unless lead is Lost/Dead or Won)")
    if cat in CAT_STAGE and snum and snum not in CAT_STAGE[cat]:
        issues.append(f"Story mismatch: Category '{f['Category']}' does not "
                      f"allow Stage '{stage}' (per Category x Stage matrix)")
    if dispo in DEAD_DISPOS and snum and snum not in DEAD_STAGES:
        issues.append(f"Story mismatch: Disposition '{f['Call Disposition']}' "
                      f"(dead lead) but Stage is '{stage}' — should be "
                      f"0 Invalid Leads, 6 Cancelled Contract, or 9 Lost / Dead Lead")
    if dispo in DEAD_DISPOS and cat == "active":
        issues.append(f"Story mismatch: Disposition '{f['Call Disposition']}' "
                      f"(dead lead) but Category is 'Active' — should be Lost/Dead")
    if not f.get("Deal Linked"):
        issues.append("Contact not linked to a Deal (required)")

    hard_fail = any("required" in i or "mismatch" in i for i in issues)
    verdict = "FAIL" if hard_fail else ("ATTENTION" if issues else "PASS")
    return verdict, issues


def field_matrix(f):
    """Per-field value + status, in the playbook's worked-example format.
    Status: PASS (green) / FAIL (red, required missing or wrong) /
    CHECK (amber, conditional field empty)."""
    dispo = f.get("Call Disposition", "").lower()
    cat = f.get("Category", "").lower()
    snum = stage_num(f.get("Lead Stage", ""))
    is_dead = dispo in DEAD_DISPOS or cat in {"lost/dead", "won"}
    mismatch = ((cat in CAT_STAGE and snum and snum not in CAT_STAGE[cat])
                or (dispo in DEAD_DISPOS and snum and snum not in DEAD_STAGES)
                or (dispo in DEAD_DISPOS and cat == "active"))
    notes_val = f.get("Notes") or (f"{f.get('Notes Count', 0)} note(s)"
                                   if f.get("Notes Count") else "")
    csd = " / ".join(x if x else "—" for x in
                     (f.get("Category"), f.get("Lead Stage"), f.get("Call Disposition")))

    def req(v):
        return (v, "PASS" if v else "FAIL")

    return [
        ("Full Name",) + req(f.get("Name", "")),
        ("Phone (Mobile)",) + req(f.get("Phone (Mobile)", "")),
        ("Source",) + req(f.get("Source", "")),
        ("Tags", ", ".join(f.get("Tags", [])),
         "PASS" if f.get("Tags") else "FAIL"),
        ("Notes",) + req(notes_val),
        ("Sales Agent",) + req(f.get("Sales Agent", "")),
        ("Next Step", f.get("Next Step", ""),
         "PASS" if f.get("Next Step") else ("CHECK" if is_dead else "FAIL")),
        ("Property Address",) + req(f.get("Property Address", "")),
        ("Associated Deal", "Linked" if f.get("Deal Linked") else "Not linked",
         "PASS" if f.get("Deal Linked") else "FAIL"),
        ("Contact Type",) + req(f.get("Contact Type", "")),
        ("Email",) + req(f.get("Email", "")),
        ("Social Profile / URL", "; ".join(f.get("Social", [])),
         "PASS" if f.get("Social") else "FAIL"),
        ("Campaign", f.get("Campaign", ""),
         "PASS" if f.get("Campaign") else "CHECK"),
        ("Amount Offer", f.get("Amount Offer", ""),
         "PASS" if f.get("Amount Offer") else "CHECK"),
        ("Category / Stage / Dispo", csd,
         "FAIL" if (mismatch or not f.get("Category") or not f.get("Lead Stage")
                    or not f.get("Call Disposition")) else "PASS"),
    ]


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, executable_path="/opt/pw-browsers/chromium",
                           args=["--no-sandbox", "--ssl-version-max=tls1.2"],
                           proxy={"server": os.environ["HTTPS_PROXY"]})
    ctx = b.new_context(storage_state=STATE)
    p = ctx.new_page()
    p.goto("https://my.reiblackbook.com/contacts", wait_until="domcontentloaded",
           timeout=60000)
    p.wait_for_timeout(8000)
    if "/contacts" not in p.url or p.locator('input[type="password"]').count():
        print("NOT LOGGED IN — run reibb_login.py first", file=sys.stderr)
        sys.exit(4)

    hrefs = []
    for a in p.locator('a[href*="/contacts/"]').all():
        h = a.get_attribute("href") or ""
        if re.search(r"/contacts/\d+", h) and h not in hrefs:
            hrefs.append(h)
        if len(hrefs) >= N:
            break

    results = []
    for h in hrefs:
        url = h if h.startswith("http") else "https://my.reiblackbook.com" + h
        p.goto(url, wait_until="domcontentloaded", timeout=60000)
        p.wait_for_timeout(6000)
        f = parse_record(p.inner_text("body"))
        verdict, issues = qa_check(f)
        results.append({"url": url, "name": f.get("Name", "?"),
                        "address": f.get("Property Address", "?"),
                        "owner": f.get("Sales Agent", "?"),
                        "verdict": verdict, "issues": issues,
                        "matrix": field_matrix(f)})
        print(f"[{verdict}] {f.get('Name','?')} — {len(issues)} issue(s)")

    ctx.storage_state(path=STATE)
    b.close()

with open(f"{OUTDIR}/qa_results.jsonl", "w") as fh:
    for r in results:
        fh.write(json.dumps(r) + "\n")

counts = {v: sum(1 for r in results if r["verdict"] == v)
          for v in ("FAIL", "ATTENTION", "PASS")}
lines = [f"# QA Sweep — {len(results)} leads checked",
         f"**{counts['FAIL']} FAIL / {counts['ATTENTION']} need attention / "
         f"{counts['PASS']} pass**", ""]
for r in results:
    if r["verdict"] == "PASS":
        continue
    icon = "❌" if r["verdict"] == "FAIL" else "⚠️"
    lines.append(f"{icon} **{r['name']}** — {r['address']} (owner: {r['owner']})")
    for i in r["issues"]:
        lines.append(f"   - {i}")
    lines.append("")
owners = {}
for r in results:
    if r["verdict"] == "FAIL":
        owners[r["owner"]] = owners.get(r["owner"], 0) + 1
if owners:
    lines.append("**Fails by owner:** " +
                 ", ".join(f"{k}: {v}" for k, v in sorted(owners.items())))
with open(f"{OUTDIR}/qa_report.md", "w") as fh:
    fh.write("\n".join(lines))
print(f"\nReport: {OUTDIR}/qa_report.md")
