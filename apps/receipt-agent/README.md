# Receipt Agent (Twin Home Buyer)

Every morning the agent checks every card and bank charge from the day before. It finds
each receipt, sends the matched receipt into QuickBooks, logs the business purpose for gas
and small meals, and emails Juan a three-part report. Seth builds it. Kristine runs it
under accounting@. Seth never touches QuickBooks.

## Receipt Inbox page (current direction)

Live page: https://claude.ai/artifact/T5JzERnp9mbpL4jMtaxDq3 (source: `receipt-inbox.html`).
Kristine opens it; it reads accounting@ through her own Gmail connection, uses Claude to fill
in vendor, date, amount, order number and location, and lists every receipt with a checkbox
(Good, Needs follow-up, Not a receipt) and a Property box. Email text is never stored.

**Which scans are saved.** accounting@ scans its whole inbox. Any other company inbox that is a
member of the receipts@ Google Group (Seth) scans only the receipts@ copies in it
(`list:receipts.twinhomebuyer.com`); those are saved too. Anything else runs as a test.
receipts@ rewrites the sender to "'The Home Depot' via Receipts Forwarding <receipts@...>", so the
Home Depot and Amazon searches match the sender's name as well as its address
(`from:(homedepot.com OR "home depot")`). The same receipt can reach accounting@ and a receipts@
copy under different Gmail ids; a scan skips one whose subject matches a saved receipt within 45
minutes. A receipt saved from another inbox opens in yours by finding your copy by subject and date.

**Card charges view (QuickBooks matching).** Seth (Reports-only QuickBooks user) opens each
company card in Accounting → Chart of accounts → Action → Run report, sets Last 30 days, and
exports to Excel. Upload card report reads the file in the page (SheetJS from cdnjs; QuickBooks
QuickReport, Transaction Report, or a card-site CSV) and keeps the rows in the shared store, one
document per card account (`cards/<account>`); a new file replaces its own date range. Matching
runs in the page and is never saved: same amount within -3 to +10 days of the receipt, vendor and
card last 4 must agree when both are known; Amazon shipment emails (items, no tax) match as
"Check" when the charge is 0 to 11% above the item total. Tabs: Missing receipt, Check, Matched,
No receipt needed (card payments, plus charges Kristine marks), Receipt with no charge. Each
receipt shows its card charge and the QuickBooks category. Copy report for Juan builds the typed
summary with the missing-receipt list; Download CSV exports the whole match. Card data is
readable by everyone the page is shared with, so keep the page shared only with Seth, Kristine
and Juan.

**Company Receipts (Google Drive).** Kristine files receipts in the Company Receipts shared drive:
one folder per card, one folder per month ("OCTOBER 2026"), files named "$852.41 - Home Depot".
The Card charges view reads only those file names through the viewer's Google Drive connector
(search_files; nothing is opened or saved): card folders under the drive root, the month folders
for the months the card report covers, then their files. A charge with no emailed receipt counts as
matched ("In Drive") when a filed receipt has the same amount, the same or next month, and no
conflicting vendor or card digits. Check Company Receipts reruns it; uploading a report reruns it.

Cost: scanning Gmail uses no Claude usage. Built-in readers fill in Home Depot, Amazon,
Uber, Waymo and crew-subject receipts for free. Claude reads only the leftovers, in batches of 8
on the smallest model, when Kristine clicks Fill with Claude; the page shows this month's count.

Sources it searches: Home Depot, Amazon (forwarded from construction@), Waymo and other
receipts Juan forwards, Uber, and anything with "receipt" in the subject (crew photos).
Uber receipts reach accounting@ only after the Uber Business profile email is changed from
the Yahoo inbox.

| File | What it is |
|---|---|
| `AGENT_PROMPT.md` | The agent's instructions. Kristine pastes it into her Claude scheduled task. |
| `receipt-helper.gs` | Free Google Apps Script under accounting@. Saves receipts to Drive, copies Juan's calendar, emails matched receipts to QuickBooks. |
| `control-sheet-template.xlsx` | The control sheet: settings, cards, vendor rules, logs. Kristine uploads it to her Drive. |
| `scripts/build_control_sheet.py` | Rebuilds the template. Tab names and headers must match the prompt and the script. |

---

## How it works (the write-up for Juan)

Three parts. Each does the job it is cheapest and most reliable at.

**1. Every receipt lands in one place (no AI cost).** Gmail filters in accounting@ put every
receipt email under one label, "Receipts": Home Depot eReceipts, Amazon order and shipment
emails, Uber and Uber Eats receipts, vendor invoices and crew photos. Every purchase alert
from every card and bank lands under a second label, "Card Alerts".

**2. A free helper script does the mechanical work (no AI cost).** It runs inside
accounting@'s Google account.
- Every hour it saves each new receipt to the Drive folder "Receipts Inbox". Email-only
  receipts are saved as a PDF of the email.
- Every morning at 4 AM it copies the last 7 days of Juan's calendar into the control sheet.
- Every hour it takes each receipt the agent matched, renames it date_vendor_amount_card
  (for example `2026-10-29_HomeDepot_142.37_2001.pdf`) and emails it to QuickBooks' own
  receipt address. QuickBooks reads the receipt and lines it up with the card charge.

**3. The Claude agent does the judgment (small daily AI cost).** It runs at 5:45 AM Pacific
as a Claude scheduled task in Kristine's account.
1. Builds yesterday's charge list from the card alerts, plus anything Kristine pasted in.
2. Flags charges it doesn't recognize: a card that isn't on the list or shouldn't be used,
   repeat charges (the "charged seven times" case), unknown subscriptions, unknown vendors,
   odd amounts.
3. Gas at any amount and restaurants under $75: finds the business purpose on Juan's
   calendar (property address, meeting) and writes it as the memo.
4. Everything else: searches the Receipts label for the amount, date (3 days either side)
   and vendor. Handles restaurant tips, Amazon split shipments, refunds and pending charges.
   One receipt is used for one charge only, and every match is logged.
5. Marks each match for QuickBooks with a suggested category, property and memo.
6. Re-checks the last 7 days of missing receipts, because receipts often arrive late.
7. Emails Juan by about 6:15 AM: charges it doesn't recognize, receipts still missing, then
   matched count and total.

**Kristine's part each day (about 15 minutes):** clear the unrecognized and missing lines
in the report, and confirm the matches in QuickBooks under Receipts. When she identifies an
unknown charge, she adds one row to Vendor Rules and the agent knows it from then on.

---

## Why it's built this way

- **Claude's QuickBooks connector can't do this job.** Intuit's own page for the connector
  lists P&L, cash flow, importing transactions, invoices and payments. It doesn't read
  card charges or the bank feed, edit an existing expense or attach a receipt. So the agent
  sends receipts through QuickBooks' email receipt address instead, and QuickBooks matches
  them to the charge.
- **The Calendar connector only sees the signed-in person's calendar.** Under Kristine's
  login it can't read Juan's. The helper script copies Juan's calendar into the sheet.
- **The Gmail connector can't download attachments.** The helper script saves the files.
- **Cost.** Screens and browsers are the expensive part of an AI run. If the Cowork test
  clicked through QuickBooks in a browser, that is where the credits went. This agent never
  opens a browser or an image. It reads short email text and one sheet, uses the Sonnet
  model, and has two connectors attached. Saving files, reading photos and attaching to
  QuickBooks happen in Google and QuickBooks at no Claude cost.

---

## Setup (Kristine, signed in as accounting@)

Steps 1 to 5 are needed for the test run. Steps 6 to 9 are needed before the first daily
report on Wed Nov 4.

**1. Control sheet (5 min).** Upload `control-sheet-template.xlsx` to Drive, open it with
Google Sheets, then File > Save as Google Sheets. Name it "Receipt Agent Control". Fill the
yellow cells: Settings values, and on the Cards tab the missing last 4s, who uses each card
and Allowed Uses. Set Active to N for any closed card.

**2. Drive folder (1 min).** Create a folder "Receipts Inbox". Copy its ID (the end of the
folder URL) into Settings RECEIPTS_FOLDER_ID.

**3. Gmail labels and filters (10 min).** Paste each search into the Gmail search bar, then
click the filter icon > Create filter > Apply the label > tick "Also apply filter to
matching conversations" (that backfills the label with past receipts).

Label **Receipts**:
```
from:homedepot.com subject:(receipt OR order OR invoice)
from:amazon.com subject:(ordered OR order OR shipped OR refund OR invoice OR receipt)
from:uber.com subject:(trip OR receipt OR order)
from:waymo.com
from:juan@twinhomebuyer.com (waymo OR uber OR "home depot" OR homedepot OR amazon OR receipt OR invoice OR order)
subject:(receipt OR invoice OR "payment received" OR "payment confirmation" OR "order confirmation") -from:accounting@twinhomebuyer.com
```
Label **Card Alerts**:
```
from:(americanexpress.com OR bankofamerica.com OR wellsfargo.com OR citi.com OR capitalone.com OR discover.com OR relayfi.com) subject:(purchase OR transaction OR charge OR "card was used" OR withdrawal OR debit)
```
The juan@ filter catches the receipts Juan forwards (Waymo, Uber, Uber Eats, Home Depot):
forwarded emails come from juan@, so the vendor filters above miss them.
Tune these after the first runs. Marketing emails that slip in are harmless. Receipts that
miss a filter are the real risk, so check the "missing" lines against the inbox in week one.

**4. QuickBooks receipt address (5 min, Kristine only).** QuickBooks > Receipts > set up
the forwarding email address. Make sure accounting@ is the address you sign into
QuickBooks with: QuickBooks only accepts receipts from that address. Paste the address into
Settings QBO_RECEIPT_ADDRESS. Then forward two real receipts to it by hand and check that
QuickBooks offers the match to the card charge.

**5. Install the helper script (Seth 5 min, Kristine 2 min).** Seth opens the control sheet >
Extensions > Apps Script, names it "Receipt Helper", pastes `receipt-helper.gs` with
CONTROL_SHEET_ID and RECEIPTS_FOLDER_ID filled in, and sets Project Settings > time zone
America/Los_Angeles. Seth never runs it: it would install under his account. Kristine, signed
in as accounting@, opens the same sheet > Extensions > Apps Script, picks `setup`, clicks Run
and approves the permissions (Advanced > Go to Receipt Helper). It creates the hourly and daily
triggers under accounting@ and does a first pass. Seth can edit the code afterwards without her;
she only approves again if a change needs a new permission. Anyone who can edit the script can
change what it does with accounting@'s access, so Juan and Kristine approve Seth's edit access in
writing. Juan's calendar must be shared with accounting@ ("See all event details"); Helper
Status shows the error if it isn't.

**6. Card alerts on every card and account (by Tue Nov 3).** In each bank and card portal,
turn on the purchase or transaction alert at the lowest amount the bank allows, sent to
accounting@. Where the alert can only go to juan@, add a Gmail filter in juan@ that
forwards those alerts to accounting@ (company email only, never personal logins). This is
the daily charge feed, and it catches repeat charges the same day.

**7. Route each receipt source to accounting@.**
- Uber and Uber Eats: in the Uber app, set the Business Profile email to accounting@. The
  receipts then skip the Yahoo inbox. Free Yahoo accounts can't auto-forward (Yahoo charges
  for forwarding). If other bills also go to that Yahoo inbox, decide whether to pay for
  Yahoo forwarding or move those bills to accounting@ one by one.
- Amazon (both accounts): order, shipment and refund emails must reach accounting@. Either
  the account email is accounting@, or a Gmail filter in the login inbox forwards them.
- Home Depot: confirm every Home Depot card is linked to the Pro Xtra account that emails
  eReceipts to accounting@, so in-store buys send an eReceipt too.
- Crews (Jairo tells them Monday): email the receipt photo to accounting@ with the subject
  `Receipt $142.37 820 28th St` (amount and property). The agent matches the subject, so it
  never has to read the photo.

**8. Scheduled task (10 min).** In Claude (Claude Code on the web), create a scheduled
task: daily at 5:45 AM Pacific, Sonnet model, connectors Gmail and Google Drive/Sheets
only, prompt = the text from `AGENT_PROMPT.md` with the sheet ID filled in. 5:45 beats the
6 to 9 AM rush when scheduled runs can start late, and the report still lands well before
9:00. Set Settings MODE to LIVE on Tuesday night.

**9. Month change.** On the 1st, put the new month's ledger ID in Settings LEDGER_SHEET_ID.

---

## Test run (Sat Oct 31, for Juan's 4:30 PM deadline)

1. Kristine does setup steps 1 to 5.
2. She pastes every charge from one real day into the Charges tab (all cards). Thursday
   Oct 29 is a good choice: its receipts have had two days to arrive.
3. She opens Claude, starts a new session on Sonnet with Gmail and Drive/Sheets connected,
   and pastes `AGENT_PROMPT.md` with `TEST DATE: 2026-10-29` as the last line.
4. The report goes to accounting@ and seth@ only (Settings TEST_REPORT_TO). Nothing goes to
   QuickBooks (HOLD). Kristine and Seth each check five matches against the real receipts.
5. Seth emails Juan the results and this write-up.

Results email (Seth to Juan, fill in the numbers):
```
Juan,

Receipt agent: test run on real charges from Thu Oct 29, run by Kristine under accounting@.

Checked: __ charges, $__
Matched: __, $__ (spot-checked __ of them against the real receipts: __ correct)
No receipt needed, business purpose from your calendar: __, $__
Missing: __, $__
Flagged as unrecognized: __ (__)

What changed from the plan: Claude's QuickBooks connector can't read card charges or
attach receipts. Matched receipts go to QuickBooks through its receipt email address
instead, and Kristine confirms them in QuickBooks. Card alerts feed the daily charge list.

Next: card alerts and receipt routing by Tue Nov 3, first daily report Wed Nov 4, 9:00 AM.

How it works, step by step: (paste "How it works" from the README)

Seth
```

---

## Checking it without logging into accounting@ (Seth)

Everything the helper and the agent produce lands in the control sheet and the Receipts Inbox
folder, both owned by Seth.

| Look at | Healthy | If not |
|---|---|---|
| Helper Status tab | One line per job, Result OK, Runs As accounting@ | ERROR shows the reason. Runs As seth@ means it was installed under the wrong account. |
| Calendar tab | Juan's last 7 days | Juan's calendar isn't shared with accounting@ |
| Receipt Files tab and Receipts Inbox folder | New files every hour | The Gmail "Receipts" label is empty, or the filters are missing |
| Run Log and Attach Log | One row per run, one row per charge | The agent didn't run, or failed: check its Errors column |
| Test report email | Arrives at accounting@ and seth@ (Settings TEST_REPORT_TO) | Check the Run Log Errors column |

To check a match, open the receipt from its File URL on Receipt Files and compare it with the
Attach Log row. Kristine confirms by screenshot that QuickBooks offered the match for the
receipts sent there: that screen is inside QuickBooks.

### Test it yourself first, on your own account

1. Make a copy of the control sheet named "Receipt Agent Control TEST" and a test Drive folder.
2. In the copy: Extensions > Apps Script, paste the helper, and put the copy's sheet ID and the
   test folder ID in CONFIG.
3. In your own Gmail, create a "Receipts" label and put 2 or 3 real receipts in it.
4. Run `saveReceipts` and `exportJuanCalendar` by hand. **Never run `setup` in the test copy**:
   it would leave hourly triggers running under your account.
5. Check Helper Status, Receipt Files and the test folder.
6. Agent: in the copy, set TEST_REPORT_TO to seth@ only and put one Charges row that matches a
   test receipt. Run the prompt in a Claude session with the copy's sheet ID and a
   `TEST DATE:` line. Check the Attach Log and the report email.

Delete the test copy when you're done.

---

## Known limits

- **One click per receipt in QuickBooks.** QuickBooks reads the emailed receipt and offers
  the match. Kristine confirms it, and she picks Match, never Add, when the charge is
  already in the bank feed (Add creates a duplicate expense). If the clicks become the
  bottleneck, phase 2 is a direct QuickBooks connection under Kristine's login that
  attaches the file itself. That takes an Intuit developer app and about a week.
- **Files under 46 KB** are rejected by QuickBooks. The helper marks those rows "attach by
  hand".
- **Charges with no alert.** If a bank won't send alerts for every purchase, paste that
  card's charges into the Charges tab, or the agent reads them from the ledger once those
  rows arrive.
- **Gas and meals with no calendar entry** show as missing with "no business purpose
  found". Kristine asks Juan. Paying with Apple Pay gives merchant detail.
- **Policy check.** The no-receipt rule for gas and meals under $75 is company policy. Have
  the CPA confirm it once.
- **Test dates older than 7 days** need CALENDAR_DAYS_BACK raised in the helper script first.
