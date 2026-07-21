import csv
import io
import openpyxl

wb = openpyxl.load_workbook('bateman_leads_dashboard.xlsx')
fb = wb['Facebook Leads']
gg = wb['Google Leads']
fb_rows = [[c.value if c.value is not None else '' for c in row] for row in fb.iter_rows(min_row=2)]
gg_rows = [[c.value if c.value is not None else '' for c in row] for row in gg.iter_rows(min_row=2)]

HEADERS = ["Date", "Name", "Address", "Phone Number", "Email", "Disposition",
           "Notes", "Source", "Campaign", "Tracking Link"]

DISPOSITIONS = [
    "Qualified | Appointment",
    "Qualified | Contract",
    "Unqualified Seller | Other",
    "Unqualified Seller | Poor Location",
    "Unqualified Seller | Retail",
    "Unqualified Seller | Already Listed",
    "Non-Seller | Other",
    "Non-Seller | SPAM",
    "No Contact",
    "Test Lead",
    "Duplicate Lead",
]

# Ad-spend inputs (hardcoded from account screenshots; edit these as figures change)
GOOGLE_SPEND = 25400        # Google Ads: $14.1K (Jun 1-30) + $11.3K (Jul 1-21), 2026
META_SPEND = 2695.78        # Meta Ads total, Last 30 days (Jun 21 - Jul 20, 2026)
META_BOFU_SPEND = 11.84     # BOFU - Bateman (lead-gen campaign)
META_TOFU_SPEND = 2683.94   # TOFU - Bateman (top-of-funnel / awareness)
META_IMPRESSIONS = 67862
META_REACH = 38744

# Placeholders for lead-table ranges, resolved after the table rows are known.
RNG = "{{RANGE}}"       # Disposition column
SRC = "{{SRC_RANGE}}"   # Source column
DTE = "{{DATE_RANGE}}"  # Date column

rows = []


def add(cells=None):
    """Append a row and return its 1-indexed row number."""
    rows.append(list(cells) if cells else [])
    return len(rows)


add(["Bateman Collective / Twin Home Buyer -- Lead Tracking Dashboard"])
add()

# ---- Overview ----
add(["Overview"])
r_total = add(["Total Leads", f"=COUNTA({DTE})"])
r_junk = add(["Junk Leads (Test Lead + Duplicate Lead)",
              f'=COUNTIF({RNG},"Test Lead")+COUNTIF({RNG},"Duplicate Lead")'])
r_action = add(["Actionable Leads (Total - Junk)", f"=B{r_total}-B{r_junk}"])
r_qual = add(["Qualified Leads (Appointment + Contract)",
              f'=COUNTIF({RNG},"Qualified | Appointment")+COUNTIF({RNG},"Qualified | Contract")'])
r_qrate = add(["Qualified Rate (of Actionable Leads)", f"=IFERROR(B{r_qual}/B{r_action},0)"])
add()

# ---- Leads by Source ----
add(["Leads by Source"])
r_src_fb = add(["Facebook", f'=COUNTIF({SRC},"Facebook")'])
r_src_google = add(["Google", f'=COUNTIF({SRC},"Google")'])
add(["Print", f'=COUNTIF({SRC},"Print")'])
add()

# ---- Leads by Disposition ----
add(["Leads by Disposition"])
for d in DISPOSITIONS:
    add([d, f'=COUNTIF({RNG},"{d}")'])
add(["(No Disposition Set)", f"=COUNTBLANK({RNG})"])
add()

# ---- Google Ads Cost Analysis ----
add(["Google Ads Cost Analysis"])
r_gspend = add(["Google Ads Spend (this period)", GOOGLE_SPEND])
r_gleads = add(["Google Leads Count", f"=B{r_src_google}"])
r_gqual = add(["Qualified Leads from Google",
               f'=COUNTIFS({SRC},"Google",{RNG},"Qualified | Appointment")'
               f'+COUNTIFS({SRC},"Google",{RNG},"Qualified | Contract")'])
add(["Cost Per Lead (Google)", f"=IFERROR(B{r_gspend}/B{r_gleads},0)"])
add(["Cost Per Qualified Lead (Google)", f"=IFERROR(B{r_gspend}/B{r_gqual},0)"])
add()

# ---- Meta (Facebook) Ads Cost Analysis ----
add(["Meta (Facebook) Ads Cost Analysis"])
r_mspend = add(["Total Meta Spend (Last 30 Days: Jun 21 - Jul 20, 2026)", META_SPEND])
add(["  - BOFU - Bateman Spend (lead-gen campaign)", META_BOFU_SPEND])
add(["  - TOFU - Bateman Spend (awareness campaign)", META_TOFU_SPEND])
add(["Meta Impressions", META_IMPRESSIONS])
add(["Meta Reach (accounts)", META_REACH])
r_fbleads = add(["Facebook Leads Count", f"=B{r_src_fb}"])
r_fbqual = add(["Qualified Leads from Facebook",
                f'=COUNTIFS({SRC},"Facebook",{RNG},"Qualified | Appointment")'
                f'+COUNTIFS({SRC},"Facebook",{RNG},"Qualified | Contract")'])
add(["Cost Per Facebook Lead (total Meta spend basis)", f"=IFERROR(B{r_mspend}/B{r_fbleads},0)"])
add(["Cost Per Qualified Facebook Lead", f'=IFERROR(B{r_mspend}/B{r_fbqual},"N/A - 0 qualified")'])
add()

# ---- Combined / Blended Totals ----
add(["Combined Ad Performance (Google + Meta)"])
r_totspend = add(["Total Ad Spend (Google + Meta)", f"=B{r_gspend}+B{r_mspend}"])
r_totleads = add(["Total Leads (all sources)", f"=B{r_total}"])
add(["Total Actionable Leads", f"=B{r_action}"])
r_totqual = add(["Total Qualified Leads", f"=B{r_qual}"])
add(["Blended Cost Per Lead (all leads)", f"=IFERROR(B{r_totspend}/B{r_totleads},0)"])
add(["Blended Cost Per Actionable Lead", f"=IFERROR(B{r_totspend}/B{r_action},0)"])
add(["Blended Cost Per Qualified Lead", f"=IFERROR(B{r_totspend}/B{r_totqual},0)"])
add()

# ---- Notes ----
add(["Note (Google Ads): $25,400 spend is from Google Ads screenshots (2026-07-21): "
     "$14.1K for Jun 1-30 + $11.3K for Jul 1-21, 2026 (rounded as shown in the UI), "
     "approximating the Google Leads date range. Replace with exact billing for precision."])
add(["Note (Meta Ads): $2,695.78 is the total across 17 Meta campaigns for the Last 30 Days "
     "(Jun 21 - Jul 20, 2026). Most of it ($2,683.94) is the TOFU awareness campaign; the "
     "BOFU lead-gen campaign directly spent only $11.84. Facebook cost-per-lead uses total "
     "Meta spend as the marketing cost basis. 0 of the 11 Facebook leads were qualified."])
add(["Note (Combined): Google and Meta spend windows differ slightly (Google ~6 weeks vs Meta "
     "last 30 days) and lead attribution is approximate, so blended figures are directional."])
add()

# ---- All Leads table ----
add(["All Leads (Facebook + Google combined)"])
r_headers = add(HEADERS)
for r in fb_rows:
    add(r)
for r in gg_rows:
    add(r)

DATA_START = r_headers + 1
DATA_END = DATA_START + len(fb_rows) + len(gg_rows) - 1
RANGE = f"F{DATA_START}:F{DATA_END}"
SRC_RANGE = f"H{DATA_START}:H{DATA_END}"
DATE_RANGE = f"A{DATA_START}:A{DATA_END}"

for r in rows:
    for i, cell in enumerate(r):
        if isinstance(cell, str):
            r[i] = cell.replace(RNG, RANGE).replace(SRC, SRC_RANGE).replace(DTE, DATE_RANGE)

buf = io.StringIO()
w = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
for r in rows:
    w.writerow(r)

with open('bateman_leads_dashboard.csv', 'w', newline='') as f:
    f.write(buf.getvalue())

print("data rows:", DATA_START, "-", DATA_END, "| total rows:", len(rows))
print("key refs -> total:", r_total, "action:", r_action, "qual:", r_qual,
      "gspend:", r_gspend, "mspend:", r_mspend, "totspend:", r_totspend)
