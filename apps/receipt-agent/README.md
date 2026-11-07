# Receipt Agent (Twin Home Buyer)

Every morning the agent checks every card and bank charge from the day before. It finds
each receipt, sends the matched receipt into QuickBooks, logs the business purpose for gas
and small meals, and emails Juan a three-part report. Seth builds it. Kristine runs it
under accounting@. Seth never touches QuickBooks.

## Receipt Inbox page (current direction)

**Guide for the team:** https://claude.ai/artifact/RELEQGGfhPZGSCWP7xZQRK (source in `guide/`). It walks
through the daily routine as an animated step-by-step, labels every button on both screens with
numbered markers, and covers where data comes from, where it goes, and the rules. Its screenshots
come from `guide/shots.js`, which runs the real page on made-up example data; rerun it and rebuild
from `guide/template.html` when the page changes.

Live page: https://claude.ai/artifact/T5JzERnp9mbpL4jMtaxDq3 (source: `receipt-inbox.html`).
Kristine opens it; it reads accounting@ through her own Gmail connection, uses Claude to fill
in vendor, date, amount, order number and location, and lists every receipt with a checkbox
(Good, Needs follow-up, Not a receipt) and a Property box. Email text is never stored.

**Layout (v31).** The header holds the brand and the Receipts / Card charges switch; a toolbar
under it holds the status, the scan (Look back, Scan inbox) and the Sheet buttons. In Card
charges, six status tiles (No receipt found, Check, Matched email, Filed in Drive, No receipt
needed, Receipt with no charge) show count and dollars and open that list when clicked; they
replace the old stat line and tabs. Buttons are grouped: card report, Drive search, report and
export. Each charge row has fixed columns: date, charge and memo, what it was for with a property
chip (address, Office, or "No property" in amber), card and buyer, amount, receipt, and actions.
Below 1100px wide each charge becomes a stacked card with the date and card on one line under the
name, and below 900px the whole page scrolls instead of a boxed list.

**Card and Sort (v32).** Next to the dates, **Card** lists every account in the card report with its
spend and charge count for the dates shown (payments and transfers left out, refunds netted),
largest first. The first line names the dates ("All cards, Nov 5"), and accounts with no charges on
those dates are grouped at the bottom under "No charges ..." instead of showing $0.00. Accounts with more than one card number (Amex 5004 and 1102, Capital One 1175 and
others) list each card under the account, with the holder's name once it's set. Picking one filters
the tiles, the total, the list, the typed report ("..., Amex - 2001 only") and the Excel export,
and a chip beside the total clears it. In Receipt, no charge, a picked card shows only receipts
that print its last four digits. **Sort** orders the list: newest or oldest first, largest or
smallest amount, vendor A to Z, card, or property with the missing ones first; the Excel "Every
charge" tab uses the same order. Both picks are remembered in that browser only.

**Which vendor, which card (v33).** The "Card vendors" source is now "Vendor emails" (receipts
from the vendors on the card report). A receipt sent through QuickBooks Payments, PayPal or Melio
shows the business that was paid, read from the subject ("Invoice #3745-(A&B Trailer Hitch)"),
with "via QuickBooks Payments" under it. Every receipt in the list carries a card tag: green "On
Amex - 2001, card 5004 · Oct 28", amber "Confirm: ..." for a possible match, or grey "No card
charge found" / "Before the card report (starts Oct 1)". The receipt's detail shows the card
charge, what the card statement says ("Card shows"), the holder and the category, and for a
possible match asks "Is this the charge?" with **Yes, this charge** (links it for good and marks it
Good) and **Not this charge** (unlinks it; the charge goes back to No receipt found). The answers
are saved on the receipt as `chargeOk` / `chargeNo`, matching honors them, and a rescan keeps
them. The Card charges view has the same Confirm / Not it on possible email matches.

**Who bought, who approved, and Darlyn's fill-ins (v42).** Juan's email asks that every expense show
who bought it and who approved it; Darlyn's asks for payee, what for, property, amount, card, buyer,
receipt YES/NO and approver, with flags that say who to ask and by when. Each purchase now has:
- **Bought by**: the card holder (Who holds each card) until someone fills in another name.
- **Approved by**: filled in by Darlyn. Nothing is assumed.
- **What it's for** and **Property or office**: from QuickBooks, overridable.
- **Personal or unusual**: a mark, plus everything in Owner's Pay & Personal.
"Fill in" on a row edits one charge; tick boxes (and the tick-all box in the header) open a bar
pinned to the bottom that fills the same values into every ticked charge. Saved in the shared
collection `charges/<charge key>` ({boughtBy, approvedBy, whatFor, property, flag, at, by}); a
charge first seen For review keeps its fill-ins once it posts. A second tile row, **Flags to
clear**, counts purchases with No property, No approver, Unknown buyer and Personal or unusual
(purchases = not payments, refunds or statement-covered bills). Every flagged row says "Ask
<buyer> by <receipt deadline>" (Christine while the card holder isn't set). The report for Juan
opens with FLAG COUNTS and lists each flag with who to ask and by when; Every charge shows the
filled-in buyer and approver. Excel's Flags tab lists every flag with Ask and By.

**Home Depot Pro Xtra (v46).** Pro Xtra's Purchase Tracking export (CSV: Receipt Added Date,
Order Origin, Purchaser, Transaction ID, Job Name, Total Amount Paid, Order Number, Payment, Card
nickname, Invoice Number) goes in through Upload card report. It's saved one month per record in
`vendors/proxtra--YYYY-MM`, from the window start on; a new export replaces its own dates. A Home
Depot charge with no receipt takes the Pro Xtra purchase with the same amount, bought 0 to 6 days
before the charge (or up to 2 after); the card number there only breaks ties, since Pro Xtra shows
Apple Pay numbers (0858 matched Amex 5004 charges, 1614 "Cap One Personal" matched Capital One CC,
0712 is named Capital One Business). Those charges show a "Pro Xtra" receipt with the store, order or
invoice number and the job name, count under the "Filed (Drive, Pro Xtra)" tile, and the job name
fills the property when QuickBooks has none ("Job: 972 norton"). Nov 7 load (Seth's export, Aug 1
to Nov 7): 311 purchases from Sep 1 on; 83 Home Depot charges got their receipt, No receipt found
fell by 52.

**Receipts date filter (v45).** The Receipts list has a Dates filter beside Source and Card match:
Any date, Today, Last 7 days, Last 30 days, This month, Last month, or Pick dates (From and To).
It uses the receipt's own date, else the email's, and the tab counts, total and Select all follow
it. The choice is remembered in that browser (except Pick dates). Opening a receipt from Card
charges or the urgency bar clears it so the receipt shows.

**Card report saved by month (v44).** Each card's lines are saved one month per record,
`cards/<account>--YYYY-MM`, so a busy card (Amex runs about 470 lines a month) never hits the size
of one record; the old one-record-per-card form (`cards/<account>`, capped at 900 lines) is retired
on the next upload, and months older than the window are removed. An upload now carries over what
people did on unchanged lines: Drive matches (`found`) and No receipt needed (`marks`); before
v44 a re-upload dropped the Drive matches. Nov 7 load (done from Seth's files): Transaction Detail
by Account Sep 1 to Nov 7 plus the 7 For review files, 30 monthly records and 7 pending lists,
1,365 card charges Sep 1 to Nov 5 (138 not in QuickBooks yet), the 12 Drive matches kept. Two
accounts showed up that the October report didn't have: BoA Visa 2406/0475 (Sep 2 to 4 only) and
Citi 2149 (one charge, Sep 14), both pointing to feeds that stopped.

**Layout fix (v43).** The Card charges panel scrolls as one piece, with the column headings pinned,
so nothing that opens in the header can get stuck out of reach. Card holders open in their own
window (Card holders button beside the file line): one row per card with its account, charge count
and a holder box, scrolling on its own. Status tiles are slimmer and the four flags sit in one thin
row. A flagged row says "Ask Christine" while its card has no holder.

**Darlyn's tracker columns (v42).** Save to Sheet also fills the **Daily Expense Tracker** tab of
the Receipt Agent Data sheet in her columns, A to P in her order (Date, Receipt, Payee, Amount,
What is this for?, Who paid?, Status, Category, Sub Category, Expense Type, Property, two blank,
Paid By, Approved By, Unique ID), so rows paste straight into her card tabs; Q to U add Card,
Flags, Ask, By when and the receipt link. Status is "In QuickBooks" or "Not in QuickBooks yet";
Category and Sub Category come from the QuickBooks category; Expense Type is Property, Marketing,
Overhead - Peninsula or Overhead. "Who paid?" is left blank (her own rows leave it blank).

**QuickBooks charges by email, no upload (Christine sets it up once).** QuickBooks can email a
saved report on a schedule: Reports, Transaction Detail by Account, set the dates to cover the last
3 months, Save customization; then Reports, Custom reports, Edit, turn on Set email schedule, pick
daily if offered, send to accounting@, tick "Attach the report as an Excel file". Needs QuickBooks
Essentials, Plus or Advanced; check the first email is an Excel file. Once a sample arrives, the
page will read it on Scan inbox (not built yet). For review lists can't be scheduled, so the P
files stay a manual export.

**Hidden for now (v40, Seth's call on Nov 7).** The goal is purchases that need a receipt or
invoice. Card charges hides mortgage and interest, insurance, taxes, EMD wires, auto and equipment
loans, payroll and labor cost (including Matrix payroll by bank memo) and bank fees: a statement
covers them. Owner's pay and personal purchases came back in v41 (Seth's call): they show as purchases
with a red "Owner (personal)" chip and a receipt deadline, so Darlyn can flag them. The rule (`isHiddenKind`) reads the QuickBooks category (or QuickBooks'
suggestion for a charge not posted yet), the payee (IRS, Franchise Tax Board, Gusto, LendingHome,
Kiavi), the bank memo (PMT, PYMT, auto finance, EFT debit, payroll) and asset-named loan accounts
("2025 Bobcat - Wells Fargo"). Hidden lines drop out of the list, tiles, deadlines, report, Excel and
sheet; matching still runs on them. A link beside the file line shows the count and dollars and
toggles them back (remembered in that browser). Still shown: utilities, telephone, due-from
related-company charges, and legal & professional fees. Effect on Oct 1 to Nov 5: No receipt found
went from 524 ($537,910) to 398 ($197,595); 130 lines ($340,435) hidden.

**Fill with Claude on someone else's receipt (v41).** A receipt saved from another inbox (accounting@,
or the sender's) has another id, or isn't there at all, in yours. Fill with Claude now looks for
your copy first; if there isn't one, it names the receipt and says Christine can fill it from
accounting@. It no longer says to mark it Not a receipt.

**Last 7 days and card match (v39).** Card charges opens on **Last 7 days** (today and the 6 days
before), next to Latest day and All dates. The Receipts list has a **Card match** filter beside
Source: On a card charge, Confirm a charge, No card charge. To clear matched receipts in one go:
To review tab, Card match "On a card charge", Select all, Good. Select all only takes what the
filters show, so unmatched receipts are left alone.

**Date window (v38).** Everything gathered stays within this month and the two months before it
(Sep 1 onward in November, Oct 1 onward in December): card report uploads, For review uploads, card
charges saved earlier, receipts in the queue and in matching, inbox scans, and the Send My Receipts
search (its From date can't go earlier). The Card charges view says which date it keeps from.

**Charges not posted yet (v35).** The card report only has posted charges. Charges still waiting in
QuickBooks Bank transactions come in from the **For review** export: Banking, pick the card, For
review tab, Export (one CSV per card, at most 1,000 rows each). Upload card report takes those CSVs,
several at once, next to the Transaction Detail by Account file. Each file shows in a panel with
its account picked from the card numbers in the bank text (XXXX5004 is Amex - 2001, "- 7260" is
Capital One Business - 2680) or the way the bank words its lines ("sale original invoice" is Home
Depot - 5253); check it and click Load. Files from the Categorized tab (already posted) are listed
and skipped. Each card's For review list is saved as `cards/pending-<account>` and replaced by the
next upload for that card; lines more than 3 months older than the newest line (a stale card payment
left in For review) are skipped. Those charges carry a dashed "Not in QuickBooks yet" chip and
QuickBooks' suggested category, count in every tile, deadline and filter, and match receipts like
any charge. When a later card report has the same card, amount and bank text within 3 days, the
charge counts once. A cleared check ("CHECK 3252") pairs with a posted check or bill payment by
check on the same account for the same amount within 30 days, since the card report has no check
number. On bank accounts, money coming in (deposits, interest) counts as a transfer, and QuickBooks'
suggested category decides whether a statement covers the line (EMD, auto loans). First run (Nov 7): Amex 93, Capital One Business 38, Home Depot 5253 5 = 136
charges ($28,380); 16 receipts matched them, Receipt with no charge went from 113 to 97. Second
batch (Capital One CC 4, Discover 4, Wells Fargo 8251 6, WF 8263 1; WF 0002 had none) brought it
to 150 lines; after pairing the two Wells Fargo checks already in the books, 146 charges ($33,886)
are not in QuickBooks yet. Of 101 Amazon receipts dated Oct 1 to Nov 5, 50 ($10,083) match no Amazon line on
any connected card, posted or For review, so they were most likely paid on a card that doesn't
feed QuickBooks (the Nov 7 Banking page showed feed errors on WF CC 3269 and Citi 2149).

**Deadlines and urgency (v33).** Two rules, set at the top of the script: a purchase needs its
receipt within **7 days** of the charge (`RECEIPT_DUE_DAYS`), and a receipt in To review gets
looked at within **2 days** of arriving (`REVIEW_DUE_DAYS`). Bills, loans, taxes, payroll and bank
memos marked PMT have no deadline (a statement covers them). A bar under the toolbar, on both
views, counts across every date and card: receipts late (red), due in 2 days (amber), matches to
confirm (amber), and To review items waiting 2+ days (red); each opens its list. In Card charges,
every charge with no receipt shows "Due in N days", "Due today" or "N days late", late rows get a
red edge, the No receipt found tile shows the late count and dollars, and the default sort is
**Most urgent first** (late purchases, largest first, then due soon, then to confirm). The report
for Juan opens with a LATE line and marks each flag with its due status; the Excel Flags tab has a
Due column.

**Which scans are saved.** accounting@ scans its whole inbox. Any other company inbox that is a
member of the receipts@ Google Group (Seth) scans only the receipts@ copies in it
(`list:receipts.twinhomebuyer.com`); those are saved too. Anything else runs as a test.
receipts@ rewrites the sender to "'The Home Depot' via Receipts Forwarding <receipts@...>", so the
Home Depot and Amazon searches match the sender's name as well as its address
(`from:(homedepot.com OR "home depot")`). The same receipt can reach accounting@ and a receipts@
copy under different Gmail ids; a scan skips one whose subject matches a saved receipt within 45
minutes. A receipt saved from another inbox opens in yours by finding your copy by subject and date.

**Card charges view (QuickBooks matching).** The report to upload is QuickBooks **Transaction Detail
by Account** (Reports, search the name, set the dates, Export to Excel), unfiltered. It lists every
account, so each card charge appears twice: on the card or bank account, with the category as its
Split, and on the category, with the card as its Split. The page rebuilds the account tree from the
group and "Total for X (with sub-accounts)" rows, keeps only card and bank accounts (names like
Amex - 2001, WELLS FARGO (8251), Relay, Capital One, Home Depot - 5253, or any account with card
payments or transfers; never expense, loan, mortgage, inventory, due-from or vehicle accounts), copies
the bank memo from the category line onto the card line (that memo carries the card member, e.g.
XXXX5004), and keeps one side of each transfer or card payment between two of our own accounts.
Journal entries and bills are skipped. The older formats still work (Account QuickReport, the newer
Transaction report, Transaction List by Vendor, a card-site CSV). A file listing more than 25 accounts
(the General Ledger) is refused with a pointer to Transaction Detail by Account. Rows are kept in the
shared store, one document per account (`cards/<account>`, trimmed to stay under the 256 KB document
limit); a new file replaces its own date range, and a card-level upload removes the old all-cards
upload's rows for the same dates so nothing counts twice. Matching runs in the page and is never
saved: same amount within -3 to +10 days of the receipt, vendor and card last 4 must agree when both
are known; Amazon shipment emails (items, no tax) match as "Check" when the charge is 0 to 11% above
the item total. Tabs: No receipt found, Check, Matched email, Filed in Drive, No receipt needed
(card payments, transfers, plus charges Kristine marks), Receipt with no charge.

Each charge shows what it's for (the category's last level), the property or office (the address in
the category path, "Property not set" for a rehab or holding cost with no property, Office otherwise)
and the buyer. Until purchase emails name the buyer, the buyer is the card holder: Who holds each card
lists every card member and bank account in the report, and the names typed there are shared
(`meta/cardholders`). Approver shows "not recorded" until approvals are tracked. **Copy report for
Juan** builds Juan's format for the dates picked (the latest date by default): flags first (no receipt
found, purchases first, then bills, loans, taxes and payroll that a statement usually covers; amount
to check; approvals), then every charge as Date | Charge | What it's for | Property or office | Amount
| Buyer | Approver | Receipt YES/NO. Download CSV and Save to Sheet carry the same four columns. Card
data is readable by everyone the page is shared with, so keep the page shared only with the team that
runs it.

**Company Receipts (Google Drive).** Kristine files receipts in the Company Receipts shared drive:
one folder per card, one folder per month ("OCTOBER 2026"), files named "$852.41 - Home Depot".
The Card charges view reads only those file names through the viewer's Google Drive connector
(search_files; nothing is opened or saved): card folders under the drive root, the month folders
for the months the card report covers, then their files. A charge with no emailed receipt counts as
matched ("In Drive") when a filed receipt has the same amount, the same or next month, and no
conflicting vendor or card digits. Check Company Receipts reruns it; uploading a report reruns it.
Drive lists a folder 5 files per page, so every month folder is read to the end, four folders at a
time, with a running count in the status line (before v23 only the first 50 files per batch were read,
which left most filed receipts unmatched).

**Search all of Drive.** For flagged charges in the dates shown (purchases first, largest first, 150
per click; another click goes on to the next 150), the page asks Drive's full-text search, which reads
the text inside PDFs and photos, for the charge's amount (410.10, 4,500.00, 4,500) and one vendor word,
in PDFs and images created from 20 days before the charge. A hit counts when the file name carries the same
amount, or the text Drive returns (about 5,000 characters) shows the amount as a whole number
("$410.10" counts, "1,410.10" doesn't). A second search with the amount alone, for amounts with cents,
files its hit as a possible match in the Check tab, where Confirm or Not it settles it. Each file
matches one charge, and a file marked Not it is never offered again. Downloaded receipts can be dropped
into Drive without renaming. Hits are saved on the charge's account document (`cards/<account>.found`), so
everyone sees them; they show as Filed in Drive ("Found in Drive") with a link to the file.

**Export to Excel** (replaces Download CSV) writes one workbook for the dates shown: Flags (each
flag, purchases before bills, loans, taxes and payroll), Every charge (Juan's columns plus account,
memo, QuickBooks category and the receipt link), and Receipt no charge.

**Send My Receipts (past receipts in teammates' inboxes).** https://claude.ai/artifact/LzMyRE7saT4PX8bCcSqwxN,
source `send-my-receipts.html`. A separate page with no database and no company data: each teammate opens it in their
own Claude, picks dates (Oct 1 to today by default) and it searches only their own Gmail (search_threads, get_thread for
long monthly-receipt threads) for receipt and invoice emails, leaving out @twinhomebuyer.com senders, their sent mail,
quotes and estimates, and Anthropic and Claude emails (Gmail keeps those from Claude's tools). They untick anything
personal and click Send; each email is forwarded from their account to receipts@ (Gmail forward, with its PDF) with a
note "Sent with Send My Receipts (ref <message id>). From: Vendor <address> Date: YYYY-MM-DD". The ref marks it as sent
on any device (the page reads its own sent notes back), and the From and Date give the Receipt Inbox the original vendor
and day. Nobody logs into anyone else's inbox. Share this link with the team; keep the Receipt Inbox shared only with
the people who run it.

**Receipts forwarded to receipts@.** The scan has a "Forwarded to receipts@" source (`list:receipts.twinhomebuyer.com
subject:(fwd OR fw)`) so forwarded invoices count whatever their subject says. For a forward, the vendor and the date come
from the forwarded message (Gmail's forwarded header, or the Send My Receipts note), not from the teammate who forwarded
it or the day it was forwarded. Refunds and credits with no matching receipt count as "No receipt needed (refund)".

**Card vendors search.** Besides the fixed sources, each scan builds searches from the loaded card report: one term
per vendor (its billing domain when known, such as apple.com, google.com, intuit.com, pge.com; otherwise its name as a
phrase, such as "lyngso materials"), plus payment services small vendors bill through (Square, PayPal, Stripe, Toast,
Clover, Intuit, Venmo, Invoice2go, Joist, Housecall Pro, Jobber), limited to receipt, invoice and paid-bill subjects
and leaving out quotes and estimates. Vendors with unmatched charges come first; Amazon, Home Depot, Uber and Waymo keep
their own searches; fuel, fast food, cash, our own accounts and Anthropic are left out. New vendors on a new report are
searched automatically.

**Upload receipt (Darlyn).** Every charge with no receipt, or with a possible match, has an Upload receipt button. It
opens a panel with the Company Receipts card folder (guessed from the account, for example Amex - 2001 to AmEx Receipt,
changeable) and a file picker. The file goes to that card folder's month folder ("NOVEMBER 2026", created if missing,
otherwise the card folder itself) through the viewer's Google Drive connector (create_file), named Christine's way
("$318.00 - Ox Mountain.pdf"); phone photos over 1.2 MB are shrunk to a 2000-pixel JPEG first. The upload is saved on the
charge (`cards/<account>.found`, uploaded: true) so the charge shows Filed in Drive for everyone right away. The uploader
needs edit access to Company Receipts.

**Payment-service receipts.** QuickBooks Payments, PayPal and Melio receipts take the vendor from the subject
("Invoice #6740-(Accent Window Systems, Inc.)", "payment to Yuri Hernandez"). When the card shows a different name for the
same business (American Rock and Rent billing as Jet Black Logistics), a same-amount, same-window match from a payment
service is a possible match in the Check tab.

**Receipts the team sends to receipts@.** An email addressed (To or Cc) to receipts@ counts as a receipt even from a
company address, so a teammate's photo or screenshot ("Starlink Mounts Receipt" from era@) is no longer dropped by the
internal-email rule. A "Sent to receipts@ by the team" search also picks up team emails with an attachment whatever the
subject says. **Receipt photos:** when a receipt has no amount and its only receipt is an image (no PDF), Fill with
Claude sends the image (the larger pictures in the email, shrunk to 1600 pixels, up to 2) to Claude on the quick tier and
saves the vendor, date, amount, items and card it reads. The page declares `sample: {images: true}`.

**Receipt Agent Data sheet.** https://docs.google.com/spreadsheets/d/1Tnh8nUd8F5MM02aL_k-aNtjfif-6txOS6JUuqsK9s6g/edit
(in Seth's Receipt Agent folder). Save to Sheet writes, through the viewer's Google Sheets connector
(update_values, batch_clear_values): the Receipts tab (one row per saved receipt, with its card charge
and category when matched) and the Card match tab (one row per charge in the uploaded report, with its
match, property or office, buyer, approver and receipt YES/NO in columns N to Q), replacing both each time, and stamps Summary!B2 with the time. The Summary tab counts both tabs
with formulas. Text that starts like a number, date or formula is written with a leading apostrophe
so Sheets keeps it as text; Card, Order # and Receipt ID columns are formatted as plain text.
Whoever saves needs edit access to the sheet.

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
