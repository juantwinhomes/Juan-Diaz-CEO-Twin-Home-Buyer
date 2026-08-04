# Fuel & Auto — Fraud / Exception Audit

**Sources:** AmEx Expense Tracker + Capital One Expense Tracker
**Period covered:** 05-Aug-2025 → 29-Jul-2026
**Prepared:** 04-Aug-2026

Full transaction-level detail is in `Fuel_Auto_Fraud_Audit.xlsx` (6 tabs).

---

## Scope and method

Every fuel, toll, car-wash, DMV, towing, parking, tyre/parts and vehicle-upfit charge was
extracted from both workbooks across all transaction tabs, then de-duplicated.

Two tabs were **excluded as stale copies** to avoid double counting:

| Excluded tab | Reason |
|---|---|
| AmEx → `Overhead Expenses` | 414 of its 421 rows repeat `Copy of Overhead Expenses`; it stops at 09-Feb-2026 |
| Cap One → `Copy of Capital One Business Pr` | Subset of `Capital One Business Property E` |

**Population reviewed:** 240 charges, **$30,125.96** — AmEx $19,122.17, Capital One $11,003.79.
Of that, pure pump/station fuel is **$11,797.59** across 144 charges.

---

## 1. Fraudulent and irregular activity

174 of the 240 charges — **$19,377.18** — carry at least one exception.

### F1 · Double-booked charges — $2,533.18 (hard recovery)

The same charge entered on two different tabs, or posted twice on the same day.

| Date | Charge | Card | Duplicated across | $ |
|---|---|---|---|---|
| 05-Feb-26 | A&A Gas — fuel, Ram ProMaster 41406J4 | Cap One | `PPS Expenses` + `Personal Overhead` | 82.66 |
| 05-Feb-26 | A&A Gas — fuel, Ram 41390J4 | Cap One | `PPS Expenses` + `Personal Overhead` | 85.51 |
| 06-Feb-26 | FasTrak replenishment "All Vehicles" | Cap One | `Overhead` + `Personal Overhead` | 580.00 |
| 06-Feb-26 | Golden State Wraps — PPS van wrap | Cap One | `PPS Expenses` + `Personal Overhead` | 1,200.00 |
| 09-Feb-26 | Auto Pride Car Wash subscription | Cap One | `Overhead` + `Personal Overhead` | 59.99 |
| 17-Feb-26 | Loural Towing — drop off Ford F350 | Cap One | `Overhead` + `Personal Overhead` | 280.00 |
| 14-Apr-26 | Shell Frontier Oil — identical twin charge | AmEx | `Copy of Overhead` r578 / r579 | 134.63 |
| 06-Jul-26 | A&A Gas $99.19 — identical twin charge | AmEx | `Copy of Overhead` r915 / r926 | 99.19 |
| 06-Jul-26 | A&A Gas $3.27 — identical twin charge | AmEx | `Copy of Overhead` r914 / r927 | 3.27 |
| 17-Mar-26 | 7-Eleven $7.93 billed to two properties | AmEx | `Property Expenses` r167 / r169 | 7.93 |

The 06-Feb Loural Towing entry is booked to **two different entities** — Equity Track 8251 on one
tab, Matrix Group One / BOA 8217 on the other. Same for the van wrap.

### F2 · Fills that exceed any fleet vehicle's tank — 11 charges, $1,705.78

A Ram ProMaster holds 24 gal; at Bay Area pump prices a full tank tops out near $120.

| Date | $ | Vendor | Job |
|---|---|---|---|
| 18-Feb-26 | 175.00 | ARCO | 1202 Via Lucas |
| 13-Jun-26 | 175.00 | ARCO | — none — |
| 12-Mar-26 | 172.42 | SHELLL OIL *(sic)* | 1574 Jerrold Ave |
| 11-Mar-26 | 158.49 | Holly 76 | 1574 Jerrold Ave |
| 01-Apr-26 | 156.00 | Holly 76 | 751 27th Ave |
| 21-Apr-26 | 150.00 | 76 | 519 Orizaba Ave |
| 26-Feb-26 | 149.59 | Holly 76 | 1202 Via Lucas |
| 20-Feb-26 | 144.99 | ARCO | 1202 Via Lucas |
| 27-May-26 | 143.18 | Shell, San Carlos | — none — |
| 28-Feb-26 | 141.09 | ARCO | 1202 Via Lucas |
| 02-Jun-26 | 140.02 | ARCO | "Rental Property" |

A single swipe above tank capacity means a second vehicle, a jerry can, or a third party was
fuelled on the same transaction.

### F3 · Exact round-dollar fuel — 21 charges, $2,349.00

$100.00, $175.00, $150.00, $125.00, $120.00, $95.00, $80.00, $50.00. Pumps do not stop on round
dollars — these are counter prepays, which decouple the amount from what actually went in the
tank. **Eight of them are exactly $100.00 at A&A Gas and Food Mart.**

### F4 · Same-day multiple fuel purchases — 27 days affected, $4,170.08

The clearest instances:

- **06-Jul-26** — four A&A Gas charges: $99.19, $3.27, $99.19, $3.27. Two near-identical full
  fills at the same station on the same day.
- **14-Apr-26** — two Shell Frontier charges of $134.63 each, $269.26 in one day.
- **05-Feb-26** (Cap One) — four A&A charges totalling $336.34, of which half are the duplicate
  postings in F1.
- **13-Feb-26** — GO! Gas $102.91 **and** Shell Oil $105.40, $208.31 in one day, both booked to
  1574 Jerrold.
- **20-Mar-26** — A&A $100.00 **and** Union 76 $105.65, $205.65 in one day.
- **05-Mar-26** — Chevron $115.88 **and** Holly 76 $95.00, $210.88.

### F5 · Convenience-store purchases booked as fuel — 20 charges, $118.76

**Six charges of exactly $3.27 at A&A Gas and Food Mart** (29-Jun, 01-Jul, 03-Jul, 06-Jul ×2,
15-Jul), plus $4.42, $6.59, $6.73, $8.55, $9.02, $9.48, $9.87. Every one of the $3.27 charges is
paired with a fuel fill the same day — a drink or snack rung up separately on the company card.

### F6 · Fuel deliberately outside the Fuel & Auto line — $3,575.02, 49 AmEx charges

Every fuel charge on AmEx from 04-Mar-2026 onward has a **blank Bucket**. It is real fuel — Shell,
Chevron, Valero, Union 76, A&A — but because no bucket was assigned, none of it reaches the
Fuel & Auto category. This is the single largest reason the reported tile is wrong.

Also mis-bucketed: Mexico fuel stops (Gas Villa Corona $2.57, Union De Tula $71.90) filed under
**Travel**, and a 7-Eleven charge under **Meals/Entertainment**.

### F7 · Personal fuel on the business cards — 23 charges, $2,341.44

All booked to entity **Owner's Pay** — i.e. already acknowledged as personal — yet paid on the
corporate cards and sitting in the business trackers.

The March run is the concentrated one: **Maria Elena, $402 of fuel in 13 days** across four Union
76 fills (04-Mar $77.76, 08-Mar $91.49, 12-Mar $103.87, 17-Mar $128.78), then Foster City Valero
$92.59 on 21-Mar, A&A $100.00 on 26-Mar and Phillips 66 $130.55 on 30-Mar — **$725.04 in 27 days
for one person**. Total tagged to Maria Elena across the period, including an Enterprise rental:
**$1,500.64**.

### F8 · Vendor contradicts the description

| Date | Vendor | Booked as | Problem |
|---|---|---|---|
| 28-Aug-25 | Shell Oil, $22.74 | Expense Type = **Fuel** | Description reads "internet service (Iriga Office)" |
| 09-Mar-26 | Auto Pride Car Wash, $59.99 | Expense Type = **Fuel** | A car wash is not fuel |
| various | "Blink Charging" ×4, $43.98 | EV-charging vendor | Description is "AMAZON BLINK – CCTV", a camera subscription |

### F9 · Tolls, fines and violations — $5,433.71, no vehicle named on any of them

- **FasTrak auto-replenishment $4,813.91** across 9 charges, including **three separate $700.00
  top-ups** (19-Apr, 05-Jun, 16-Jul) and two $580.00 charges. $2,100 of tolls in three months.
- **FasTrak violations $127.50** (25.50 + 102.00) — penalties, not tolls.
- **Citations/fines $491.95** — SFMTA $108.00, Parking Citation Service Center $105.95 and
  $114.00, and others.
- **Clipper transit $179.85** across 34 charges, frequently two or four identical $5.50 taps on
  the same day — more than one person riding on the company card.

### F10 · Car wash "subscription" that is not a subscription — $1,025.60

| Month | Charges | $ |
|---|---|---|
| Aug-25 | 1 | 49.99 |
| Oct-25 | 3 (5.75 / 59.99 / 49.99) | 115.73 |
| Nov-25 | 3 (59.99 / 79.99 / 49.99) | 189.97 |
| Dec-25 | 3 (59.99 / 79.99 / 49.99) | 189.97 |
| Feb-26 | 2 — both on the 9th, both $59.99 | 119.98 |
| May-26 | 2 (59.99 / 60.00) | 119.99 |
| Jun-26 | 2 (59.99 / 60.00) | 119.99 |

A single membership bills one fixed amount once a month. Three charges a month at three different
prices means **multiple concurrent memberships** — most plausibly personal vehicles enrolled
alongside the fleet.

---

## 2. Which vehicle consumed the money

**This cannot be answered from the records as kept.** Only 7 of 240 charges name a vehicle.

| Vehicle / asset | Identified from | Charges | $ traced |
|---|---|---|---|
| 2025 Ram ProMaster — unit **41406J4** | Fuel receipts name the unit | 4 | 379.20 |
| 2025 Ram — unit **41390J4** | Fuel receipts name the unit | 3 | 276.67 |
| Ford F350 | Loural Towing "Drop off Ford F350" | 2 | 560.00 |
| PPS van (wrapped) | Golden State Wraps | 2 | 2,400.00 |
| Ram ProMaster (no unit #) | Amazon "Promaster mirror" | 1 | 341.80 |
| Chevy Silverado | Bristol West insurance line | 0 | **0.00** |
| Tesla | Tesla Inc charge | 1 | 14.21 |
| Mercedes-Benz | Parking citation / TSYSTEMS line | 1 | 105.95 |
| Trailer(s) | Wiring, locks, hydraulic pump | 5 | 767.71 |
| **No vehicle named anywhere** | — | **227** | **$26,389.93** |

**$11,127.51 of fuel — 94% of all fuel spend — cannot be tied to a vehicle.** The Silverado is
insured by the business but has not a single fuel charge traced to it; the F350 appears only when
it was towed. Vehicle IDs appear on exactly five fuel receipts, all in Feb–Mar 2026, and the
practice stopped after 20-Mar-2026.

### The fleet, as far as the records reveal it

2025 Ram ProMaster 41406J4 · 2025 Ram 41390J4 · Ford F350 · Chevy Silverado · a wrapped PPS van ·
a Tesla · a Mercedes-Benz · at least one trailer · a Bobcat. Named drivers: **Rudy, Maria Elena,
Hector, Alan, Lucas, Gavin.**

---

## 3. What the fuel was consumed for

| Property / Job | Fills | $ | Window | Implied $/month | Assessment |
|---|---|---|---|---|---|
| **(no job assigned)** | 95 | **7,403.65** | Aug-25 → Jul-26 | — | **cannot be tied to any job** |
| 1574 Jerrold Ave | 10 | 1,101.97 | 07-Feb → 14-Mar | $918 | **outlier** |
| 1202 Via Lucas | 11 | 1,031.40 | 30-Jan → 17-Mar | $658 | **outlier** |
| 751 27th Ave | 9 | 639.31 | 16-Feb → 07-Jul | $135 | within range |
| 27 Prague St | 5 | 471.62 | 03-Jul → 25-Jul | $615 | **outlier** |
| 519 Orizaba Ave | 3 | 340.49 | 09-Apr → 21-May | $242 | elevated |
| 1464 Sunrise Pkwy | 3 | 317.24 | 09-Jul → 25-Jul | $566 | **outlier** |
| "Rental Property" | 1 | 140.02 | 02-Jun | — | job not identified |
| 164 Springdale Way | 1 | 129.52 | 13-Apr | — | within range |
| 1932 Chestnut Ave | 3 | 106.65 | 17-Mar → 07-Apr | $150 | within range |
| 820 28th St | 2 | 80.54 | 15-May → 27-May | $186 | within range |
| 100 Palm Ave | 1 | 35.18 | 02-May | — | within range |

**63% of fuel spend has no job attached.** Where a job is attached the description is usually the
vendor name repeated ("ARCO", "Holly 76", "76.0") rather than a purpose.

Two clusters stand out:

- **1574 Jerrold Ave** — $1,101.97 in 36 days, driver Hector named on the first four. Includes two
  fills on 13-Feb ($208.31) and back-to-back $158.49 / $172.42 on 11–12 Mar.
- **1202 Via Lucas** — $1,031.40 in 47 days, plus City Towing $400 on 26-Feb. Six of eleven fills
  exceed $140 or land on a round dollar. Three separate 76 charges on 23-Feb ($47.96 / $25.91 /
  $100.34).

A rehab property does not consume $900–1,000 of fuel a month. These are almost certainly
personal or side-job miles being job-costed.

---

## 4. Reconciling the $5,882 / $230 tile

### Part A — the tile does not tie

| Measure | AmEx | Capital One |
|---|---|---|
| Reported "Fuel & Auto" tile | $5,882.00 | $230.00 |
| Tracker `Vehicle/Field` bucket, Real Estate entity | $6,148.72 | $127.98 |
| **Variance** | **$266.72** | **($102.02)** |
| Tracker `Vehicle/Field` bucket, all entities | $10,815.93 | $1,990.03 |

No row, and no combination of rows, in either workbook sums to $5,882 or to $230. Every subset up
to three rows was tested against the $266.72 AmEx gap — nothing matches. The tile was built from a
different snapshot than the files supplied.

The tile also carries **Home Depot 1511, 5253 and 8087** columns. Neither workbook contains those
card ledgers, so any Home Depot fuel or auto spend is outside this audit.

### Part B — rebuilding the category from the transactions

| Component | Where it lives | AmEx | Capital One |
|---|---|---|---|
| Correctly bucketed to `Vehicle/Field` | Overhead tabs | $10,078.55 | $1,990.03 |
| **Uncategorised — Bucket left blank** | Overhead tabs | **$6,382.51** | **$5,495.26** |
| Mis-bucketed to Travel / Meals | Overhead tabs | $464.81 | $0.00 |
| Job-costed on the Property Expenses tabs | Never enters the rollup | $2,196.30 | $3,518.50 |
| **True fuel & auto exposure** | | **$19,122.17** | **$11,003.79** |
| Understatement vs the tile | | **$13,240.17** | **$10,773.79** |

The tile reports **$6,112** of combined Fuel & Auto. Audited exposure is **$30,125.96** — roughly
five times the reported figure.

*Part A uses the trackers' own `Vehicle/Field` bucket; Part B uses this audit's definition (fuel,
tolls, fines, parking, car wash, DMV, towing, tyres/parts, vehicle upfit, car rental, transit).
The two are deliberately different measures.*

---

## Recommended actions

1. **Recover the $2,533.18 in double-booked charges** — six of them are Capital One entries
   sitting on two tabs each; correct the tabs before the next close.
2. **Pull the merchant receipts for the 11 over-capacity fills ($1,705.78)** and the 21
   round-dollar prepays ($2,349.00). A receipt shows gallons; gallons show whether one vehicle
   could have taken it.
3. **Reconcile FasTrak** — $4,813.91 with no vehicle named, including three $700 top-ups. Pull the
   FasTrak account's transponder-level statement; it lists plate and crossing time per toll.
4. **Cancel the surplus Auto Pride memberships** — the account is carrying more than one.
5. **Fix the categorisation** — 117 charges across both cards have a blank Bucket. Until that is
   closed, no category summary of Fuel & Auto is reliable.
6. **Require a vehicle unit number and a job code on every fuel charge.** The practice existed in
   Feb–Mar 2026 and stopped; restoring it is what makes questions 2 and 3 answerable next time.

---

*Nothing here establishes intent. These are exceptions — charges whose pattern is inconsistent
with legitimate fleet use and which need a receipt, a fuel log or an explanation to clear.*
