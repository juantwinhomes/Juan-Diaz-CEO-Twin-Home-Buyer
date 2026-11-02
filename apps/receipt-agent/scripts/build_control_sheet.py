"""Build the Receipt Agent control sheet template (control-sheet-template.xlsx).

Kristine uploads the .xlsx to Drive under accounting@ and opens it with Google Sheets
(File > Save as Google Sheets). The tab names and headers must match AGENT_PROMPT.md and
receipt-helper.gs, so change all three together.

Run: python3 apps/receipt-agent/scripts/build_control_sheet.py
"""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

OUT = Path(__file__).resolve().parent.parent / "control-sheet-template.xlsx"
HEADER_FILL = PatternFill("solid", fgColor="1F3A5F")
HEADER_FONT = Font(bold=True, color="FFFFFF")
TODO_FILL = PatternFill("solid", fgColor="FFF2CC")

HOW_TO = [
    ["Receipt Agent control sheet"],
    [""],
    ["Owner: Kristine (accounting@). The agent and the helper script read and write this sheet."],
    ["Yellow cells: Kristine fills or confirms before the first run."],
    [""],
    ["Settings: addresses, IDs and thresholds."],
    ["Cards: every card and bank account the agent checks. Active must be Y or the charge is flagged."],
    ["Vendor Rules: known vendors and subscriptions. Add a row whenever you identify an unknown charge."],
    ["Charges: paste charges by hand (the test day, or any day card alerts missed)."],
    ["Calendar: written by the helper script every morning. Don't edit."],
    ["Receipt Files: written by the helper script every hour. Don't edit."],
    ["Attach Log: one row per charge, written by the agent. Type Y in Kristine Cleared when you clear a line."],
    ["Run Log: one row per run, written by the agent."],
    ["Helper Status: written by the helper script. Last run, OK or ERROR, and which account it ran as."],
]

SETTINGS = [
    ("Key", "Value", "What it is"),
    ("MODE", "TEST", "TEST = report to Kristine only, nothing sent to QuickBooks. Change to LIVE after the test."),
    ("REPORT_TO", "juan@twinhomebuyer.com", "Daily report recipient in LIVE mode."),
    ("REPORT_CC", "accounting@twinhomebuyer.com", "Kristine. Cc on every LIVE report."),
    ("TEST_REPORT_TO", "accounting@twinhomebuyer.com, seth@twinhomebuyer.com", "TEST mode report goes here only (Kristine and Seth). Never Juan."),
    ("QBO_RECEIPT_ADDRESS", "", "QuickBooks > Receipts > forwarding address (ends in @assist.intuit.com or @qbodocs.com)."),
    ("RECEIPTS_FOLDER_ID", "", "Drive folder 'Receipts Inbox' (the ID is the last part of the folder URL)."),
    ("LEDGER_SHEET_ID", "", "Current month's Twin Home Expense Ledger. Update on the 1st of each month."),
    ("LEDGER_WRITE", "OFF", "ON lets the agent put receipt links into empty ledger cells. Turn ON after a week of clean runs."),
    ("DATE_WINDOW_DAYS", 3, "Receipt date can be this many days before or after the charge."),
    ("MEAL_RECEIPT_THRESHOLD", 75.00, "Restaurants under this need no receipt (calendar purpose instead)."),
    ("TIP_MAX_PCT", 30, "A restaurant charge up to this % over the receipt total still matches."),
    ("ODD_AMOUNT_FUEL_MEALS", 250.00, "A single fuel or restaurant charge above this is flagged. Kristine sets."),
]

CARDS = [
    ("Last 4", "Card / Account", "Bank", "Who uses it", "Allowed Uses", "Active (Y/N)", "Ledger Tab", "Notes"),
    ("2001", "AmEx", "American Express", "", "", "Y", "AMEX", "Most missing receipts (Kristine 10/30). Confirm holder and uses."),
    ("2645", "Discover", "Discover", "", "", "Y", "DISCOVER CARD 2645", "Confirm"),
    ("", "Capital One", "Capital One", "", "", "Y", "CAPITAL ONE", "Last 4 needed"),
    ("5253", "Home Depot", "Home Depot", "", "Home Depot only", "Y", "HOME DEPOT 5253", "Confirm"),
    ("8087", "Home Depot", "Home Depot", "", "Home Depot only", "Y", "HOME DEPOT 8087", "Confirm"),
    ("5880", "Home Depot", "Home Depot", "", "Home Depot only", "Y", "HOME DEPOT 5880", "Confirm"),
    ("", "Home Depot gift card", "Home Depot", "", "Home Depot only", "Y", "HOME DEPOT GIFT CARD", "Last 4 needed"),
    ("0475", "Bank of America", "Bank of America", "", "", "Y", "BOA 0475", "Bank account. Confirm"),
    ("6215", "Wells Fargo", "Wells Fargo", "", "", "Y", "Wells Fargo 6215", "Confirm"),
    ("2149", "Citi", "Citi", "", "", "Y", "Citi 2149", "Confirm"),
    ("", "Relay", "Relay", "", "", "Y", "RELAY BANK", "Last 4 needed"),
]

VENDOR_RULES = [
    ("Merchant text contains", "Vendor", "Kind", "Receipt needed", "Where the receipt comes from",
     "Default Category", "Default Property", "Owner", "Expected Amount", "Notes"),
    ("HOME DEPOT", "Home Depot", "Materials", "Yes", "eReceipt email to accounting@ (Pro Xtra)", "", "", "", "", ""),
    ("AMZN", "Amazon", "Supplies", "Yes", "Order/shipment emails from both Amazon accounts", "", "", "", "", "Charges per shipment"),
    ("AMAZON", "Amazon", "Supplies", "Yes", "Order/shipment emails from both Amazon accounts", "", "", "", "", "Charges per shipment"),
    ("UBER *TRIP", "Uber", "Travel", "Yes", "Uber business profile receipts to accounting@", "", "", "", "", ""),
    ("UBER *EATS", "Uber Eats", "Meals", "Yes if 75+", "Uber business profile receipts to accounting@", "", "", "", "", ""),
    ("WAYMO", "Waymo", "Travel", "Yes", "Juan forwards ride receipts to accounting@", "", "", "", "", "Pickup/drop-off address shows the property visit"),
    ("SHELL", "Shell", "Fuel", "No", "Card statement + Juan calendar", "", "", "", "", ""),
    ("CHEVRON", "Chevron", "Fuel", "No", "Card statement + Juan calendar", "", "", "", "", ""),
    ("ARCO", "ARCO", "Fuel", "No", "Card statement + Juan calendar", "", "", "", "", ""),
    ("VALERO", "Valero", "Fuel", "No", "Card statement + Juan calendar", "", "", "", "", ""),
    ("COSTCO GAS", "Costco Gas", "Fuel", "No", "Card statement + Juan calendar", "", "", "", "", ""),
]

CHARGES = [("Date", "Card Last 4", "Merchant (as on statement)", "Amount", "Posted or Pending", "Source", "Notes")]
CALENDAR = [("Date", "Start", "End", "Title", "Location", "Notes")]
RECEIPT_FILES = [("Saved At", "Gmail Message ID", "Email Date", "From", "Subject", "File Name", "File ID", "File URL")]
ATTACH_LOG = [(
    "Run Date", "Charge Date", "Card Last 4", "Merchant", "Amount", "Status", "Reason / Notes",
    "Receipt Gmail ID", "Receipt Subject", "Drive File ID", "Drive File Name", "Confidence", "Vendor",
    "Suggested Category", "Suggested Property", "Memo", "Suggested Split", "Send to QBO", "QBO Sent At",
    "Kristine Cleared",
)]
STATUS = [("Job", "Last Run", "Result", "Details", "Runs As")]
RUN_LOG = [(
    "Run Date", "Check Date", "Mode", "Charges Checked", "Matched", "Matched $", "No Receipt Needed",
    "Missing", "Unrecognized", "Pending", "Errors",
)]


def add_tab(wb, title, rows, widths=None, todo_cells=()):
    ws = wb.create_sheet(title)
    for row in rows:
        ws.append(list(row))
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical="center")
    ws.freeze_panes = "A2"
    for i, width in enumerate(widths or [], start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = width
    for ref in todo_cells:
        ws[ref].fill = TODO_FILL
    return ws


def main():
    wb = Workbook()
    how = wb.active
    how.title = "How To Use"
    for row in HOW_TO:
        how.append(row)
    how["A1"].font = Font(bold=True, size=14)
    how.column_dimensions["A"].width = 110

    add_tab(wb, "Settings", SETTINGS, [26, 34, 100], todo_cells=("B6", "B7", "B8", "B13"))
    cards = add_tab(wb, "Cards", CARDS, [8, 22, 18, 18, 22, 12, 22, 60])
    for r in range(2, len(CARDS) + 1):
        for col in ("A", "D", "E", "F"):
            cards[f"{col}{r}"].fill = TODO_FILL
    add_tab(wb, "Vendor Rules", VENDOR_RULES, [24, 16, 12, 14, 44, 22, 18, 14, 16, 30])
    charges = add_tab(wb, "Charges", CHARGES, [12, 12, 40, 12, 16, 14, 40])
    # Keep last-4 as text so 0475 doesn't turn into 475.
    for ws, col in ((cards, "A"), (charges, "B")):
        for r in range(1, 501):
            ws[f"{col}{r}"].number_format = "@"
    add_tab(wb, "Calendar", CALENDAR, [12, 8, 8, 40, 40, 60])
    add_tab(wb, "Receipt Files", RECEIPT_FILES, [18, 20, 12, 30, 40, 40, 30, 50])
    add_tab(wb, "Attach Log", ATTACH_LOG)
    add_tab(wb, "Run Log", RUN_LOG)
    add_tab(wb, "Helper Status", STATUS, [24, 18, 10, 60, 32])

    wb.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
