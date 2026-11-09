# Equity Track Inc. — CPA-Level Diagnostic Review of the YTD Financial Statements

**Period reviewed:** January 1 – November 9, 2026 (accrual basis, QuickBooks Online)
**Prepared for:** Controller, Equity Track Inc.
**Prepared on:** November 9, 2026
**Nature of engagement:** Diagnostic review. This is not an audit, review engagement under SSARS, or an opinion. No QuickBooks transactions were posted, edited, or deleted.

---

## 0. Scope, evidence examined, and limits

### Evidence actually examined

| Ref | Document | Basis | Run date and time |
|---|---|---|---|
| **[PL]** | *Equity Track Inc — Profit and Loss, January 1–November 9, 2026* (3 pages) | Accrual | Mon Nov 9, 2026, 10:44 AM PST |
| **[BS]** | *Equity Track Inc — Balance Sheet as of Nov 9, 2026* (8 pages) | Accrual | Mon Nov 9, 2026, 10:44 AM PST |

I re-footed every subtotal and total on both reports. **All of them foot.** Examples: COGS $14,362,622.00; Total Expenses $1,313,225.95; Inventory Asset $7,020,097.26; Total Other Current Assets $7,560,516.93; Long-term Liabilities $7,544,090.26; Total Equity $280,084.05; Total Assets = Total Liabilities + Equity = $8,031,219.63.

I tried to pull the General Ledger, transaction detail, A/P and A/R aging, and a 2025 comparative directly from QuickBooks through the Intuit connector. The connection returned an error twice, so **no transaction-level data was examined.**

### Evidence NOT available (and therefore NOT verified)

- General Ledger / Transaction Detail by Account
- Bank and credit-card statements and QBO reconciliation reports (Wells Fargo 8251, Relay, Amex, Capital One, Home Depot, and others)
- Closing / settlement statements (HUD-1 / ALTA) for any purchase, sale, or refinance
- Loan statements and payoff letters (Anchor, Kiavi, ARC Home, NewRez, private lenders)
- Payroll registers (Equity Track W-2, Matrix Group One invoices, Wise transfers, Iriga payroll)
- 2025 P&L, 2025 Balance Sheet, filed 2025 return, and the CPA's adjusting journal entries
- Books of Prescott Development, Matrix Group One, Peninsula Plumbing Solutions, and Daliaz
- Home Depot Pro Xtra purchase history and receipts

**Effect on this report:** every finding is labeled with its evidence status:

- **CONFIRMED** — the reports themselves show the issue (for example, an account title or a sign that cannot be right).
- **PROBABLE** — the account structure strongly indicates the issue, but the GL is needed to finalize the amount.
- **VERIFY** — it is a risk indicator only.

I make no claim about any individual transaction, settlement statement, or bank balance.

---

## A. Executive CPA Assessment

**Conclusion: the reported YTD net loss of –$332,977.90 [PL p.3] is not reliable in its current form.** The reports show several things directly:

1. **The cost-capitalization boundary is undetermined.** COGS includes $2,469,790.48 of cost types that, under GAAP (ASC 970 / ASC 835-20), belong in property inventory for any property still under development:
   - Rehab & Holding $1,220,331.38
   - Construction Labor – Matrix $559,169.37
   - Interest – Mortgage $407,908.61
   - Closing Cost – Acquisition $256,561.57
   - Property Taxes $22,468.85
   - Loan Fees $3,350.70

   Meanwhile, six unsold properties carry $6.99M of inventory [BS p.3–5], and **no capitalized interest appears on any of them.** Without the GL I cannot tell how much of the $2.47M relates to sold properties (correct as COGS) and how much relates to unsold ones (net loss overstated). The direction of the risk is clear: **if anything, the net loss is overstated.**
2. **Personal and corporate activity are commingled at a material level.** Four personal properties (100 Palm Ave, 8125 Cottonmill, 816 22nd St, 8715 D St) are carried inside corporate equity at a net –$1,460,073.07. Two of those balances are **mortgages recorded in equity**: Northpoint Bank $525,817.03 and United Wholesale Mortgage $307,000.00. There is also a corporate bank account for one of these personal properties (WF 8263 – 8715 D St, $8,819.04), and Owner's Pay & Personal Expenses totals –$2,678,532.99.
3. **Suspense and plug balances remain open:**
   - "263A Adjustment – Other Assets" –$370,786.00
   - "Prior Period Loan Reconciliation – CPA Review" $12,363.75
   - $2,830.00 posted directly to the "Other Current Assets" parent account
4. **Intercompany accounting is broken:**
   - Peninsula Plumbing has two conflicting accounts: +$27,761.81 receivable and a separate –$133,730.68 "asset".
   - Matrix Group appears both as a negative receivable (–$28,128.73) and as an equity account (+$131,661.98).
   - The Daliaz receivable (–$72,733.66) sits in equity.
   - The Prescott receivable is negative (–$23,163.20).
5. **No 2026 depreciation has been recorded** on about $567K of gross fixed assets. Every depreciation account shows $0.00.
6. **There is no payroll liability account at all**, even though wages, payroll tax, and statutory contributions are being expensed.
7. **Eleven accounts carry the wrong sign:**

   | Account | Balance |
   |---|---|
   | A/P | –2,660.50 |
   | Citi – 2149 | –1,520.75 |
   | Discover – 2645 | –4,294.24 |
   | Home Depot – 1511 & 6852 | –3,982.20 |
   | RAM ProMaster 2500 loan (Delances Bank) | –864.90 |
   | EMD "5475" | –500.00 |
   | Due from Matrix Group One | –28,128.73 |
   | Due from Prescott Development (parent) | –61,762.63 |
   | Peninsula – Operating Expenses | –37,769.24 |
   | Peninsula – Payroll | –2,532.78 |
   | Peninsula Plumbing Solutions, Inc. | –133,730.68 |

**Material weaknesses (control-level):**

- **MW-1:** No documented book and tax capitalization policy is applied consistently by property.
- **MW-2:** Owner, personal-property, and corporate transactions run through the same ledger.
- **MW-3:** Intercompany balances are not reconciled with counter-party books.
- **MW-4:** Unresolved prior-period CPA entries are parked in suspense accounts.
- **MW-5:** Period-end accruals are not performed (depreciation, payroll, interest).

**The books are not ready for the external CPA.** The Section J items marked "Before CPA" must be completed first.

---

## B. Financial Statement Analysis (account by account)

### B.1 Summary (as reported)

| Metric | Amount | Source and calculation |
|---|---:|---|
| Total income | 15,340,500.00 | [PL p.1] |
| — Property sales revenue | 15,022,500.00 | |
| — Wholesale fee income | 313,000.00 | |
| — Forfeited EMD | 5,000.00 | |
| Total COGS | 14,362,622.00 | [PL p.1] |
| Gross profit | 977,878.00 | 6.4% of total income |
| **Gross profit on flips only** (ex wholesale and EMD) | 659,878.00 | 977,878 – 313,000 – 5,000 = **4.4% of sales** |
| Operating expenses | 1,313,225.95 | [PL p.3] |
| Net operating income | –335,347.95 | |
| Net other income | 2,370.05 | |
| **Net income** | **–332,977.90** | |
| Total interest (COGS + opex) | 461,440.31 | 407,908.61 + 53,531.70 |
| Buying cost ÷ sales | 72.8% | 10,935,000 ÷ 15,022,500 |
| Disposition commission ÷ sales | 4.40% | 661,467.80 ÷ 15,022,500 |
| Disposition closing costs ÷ sales | 1.53% | 229,389.19 ÷ 15,022,500 |

**Key analytical red flag:** a **72.8% purchase-to-sale ratio** means roughly a 27% gross spread before rehab and carry. Yet flip-only gross margin is just **4.4%**. Two explanations fit:

- **(a) Unsold-property costs are in COGS.** This is consistent with no interest being capitalized on any unsold property, and with Matrix labor running mostly through COGS.
- **(b) The sold deals were genuinely poor.**

Only a by-property P&L (Section C procedure) can tell these apart. **This is the single most important open question in the file.**

Monthly and prior-year variance analysis was not possible because only a single-column YTD report was provided. Rerun the P&L with *Display columns by: Months* and *Compare: Previous year (PY)* (Section J, task 1).

### B.2 Income

| Account | Amount | Assessment | Status |
|---|---:|---|---|
| Property Sales Revenue | 15,022,500.00 | It is a round-dollar total, which is consistent with **gross contract prices** (correct presentation, not net escrow proceeds). Each sale must still be tied to its final settlement statement for closing date (period cut-off), gross price, and buyer credits. Seller credits and concessions should reduce revenue or be booked as selling cost consistently. | VERIFY |
| Wholesale Fee Income | 313,000.00 | Assignment fees are legitimate revenue when the assignment closes. Confirm none are deposits on deals still in escrow (those are liabilities until close), and that no wholesale deal also sits in inventory (see 506 N Cesar Chavez, Section D). | VERIFY |
| Forfeited Earnest Money Deposits | 5,000.00 | Income only if a buyer forfeited to Equity Track. If this is Equity Track's *own* EMD being refunded, it is a balance-sheet credit to EMD, not income. Note the EMD account "5475" is **–$500.00**, which looks like a refund booked without the original deposit. | VERIFY |
| Other Income/Loss | 18,384.97 | This is a catch-all. Test it for loan proceeds, escrow refunds, insurance proceeds, intercompany reimbursements (for example Prescott), and owner deposits. | VERIFY |
| Credit Card Cashback Rewards | 1,486.89 | Acceptable. Many CPAs net cashback against the card expense instead. | OK |
| Interest Income | 45.32 | Immaterial. | OK |

### B.3 Cost of Goods Sold

| Account | Amount | Correct home | Assessment | Status |
|---|---:|---|---|---|
| Buying Cost | 10,935,000.00 | COGS (relief of inventory) | Must equal the acquisition cost removed from inventory for each sold property. Confirm it is posted by relieving the inventory sub-account, not by a second entry that leaves the inventory balance in place. Most sold properties show $0.00, which is good. 519 Orizaba still shows $211.83. | VERIFY |
| Closing Cost – Acquisition | 256,561.57 | Inventory until sale, then COGS | Correct in COGS **only** for properties sold in 2026. Unsold properties already carry $270,444.86 of capitalized closing costs, so two treatments are in use. Identify which deals the $256,561.57 belongs to. | PROBABLE inconsistency |
| Closing Cost – Disposition | 229,389.19 | Selling cost (COGS or opex) | Reasonable at 1.53% of sales. Check that transfer taxes are here and not in "Taxes Paid." | VERIFY |
| Disposition Commission | 661,467.80 | Selling cost | 4.40% of sales is reasonable. "Commission Expense" ($5,452.90) and "Selling Cost" ($6,536.37) are overlapping accounts and should be consolidated. | OK / cleanup |
| Construction Labor – Matrix | 559,169.37 | Inventory for unsold properties; COGS for sold ones | Matrix labor is capitalized on four unsold properties ($140,451.79 of "Construction Team Wages"), yet $559K is expensed. Was all of the $559K for sold properties? Also: 1782 Woodhaven has $258,825.42 of rehab but **zero** construction-team wages. | PROBABLE misclassification |
| Rehab & Holding Costs | 1,220,331.38 | Inventory for unsold properties | The largest variable in the file. Must be split by property. | PROBABLE misclassification |
| Interest – Mortgage | 407,908.61 | GAAP: capitalize during active development (ASC 835-20). Tax: see D.2. | About $6.08M of property debt is outstanding on unsold properties, and **none** of their inventory carries capitalized interest. | PROBABLE misclassification (GAAP) |
| Loan Fees | 3,350.70 | Debt issuance cost (ASC 835-30), amortized as interest | Small. Note that 820 28th capitalized $33,671.33 of refinance closing costs to *inventory*, which is a third treatment of financing costs. | CONFIRMED inconsistency |
| Property Taxes | 22,468.85 | Inventory during development | Same split issue as above. | VERIFY |
| Payroll Tax | 14,033.27 | Follows the wages it relates to | The related **Salaries & Wages ($103,321.85) are in opex**, while construction-team wages are capitalized. Payroll tax should follow its wages. At 13.6% of opex wages it is high; it likely also covers the capitalized construction wages, or employee withholdings are being expensed (double count). | PROBABLE misclassification |
| Payroll Fee | 1,700.00 | Opex (G&A) | Payroll service fees are overhead. | CONFIRMED (classification only) |
| **Virtual Team – Wise VA Wages** | **38,448.51** | **Opex (G&A or marketing)** | Offshore virtual assistants are not direct property costs. Possible **duplication** with the Iriga office labor ($69,413.44) if Wise transfers fund the Iriga payroll. | **CONFIRMED (classification)**; duplication VERIFY |
| Property Maintenance / Warranty / Selling Cost | 488.43 / 315.05 / 6,536.37 | COGS | Acceptable. | OK |

### B.4 Operating expenses: items needing action

| Account | Amount | Issue | Status |
|---|---:|---|---|
| **Taxes Paid** | **120,220.29** | Unexplained and material. It could be federal or state income tax (should be income-tax expense below pretax income, or a distribution if it is the shareholder's personal tax), transfer taxes (selling cost), property taxes (capitalize or COGS), or Juan's personal taxes (distribution). Also note a **"Prepaid Estate Tax" asset of $3,700**; estate tax is personal, not corporate. | VERIFY — HIGH |
| **Interest Expense – Shareholder Loan** | **32,083.37** | **No shareholder loan liability exists on the Balance Sheet.** The owner's funding sits in equity ("Owner's Investment" $3,186,239.54), and interest cannot be paid on equity. Either it is interest on the private loans (Manuel Martin $200,000; Manuel Morfin $500,000), in which case rename it and tie to the notes, or it is a distribution. | CONFIRMED inconsistency |
| **Penalties & Settlements** | **41,533.61** | Book expense is fine. Government fines and penalties are non-deductible for tax under IRC §162(f). Identify the payee of each item. | VERIFY |
| **Marketing Allocation Offset / Property Marketing Allocation – PPC** | **–35,000.00 / +35,000.00** | **Both accounts are opex, so the entry nets to zero and achieves nothing.** If the intent was to move PPC into property cost or to charge Peninsula, the debit is in the wrong account. | CONFIRMED |
| Insurance | 60,417.40 | Property-specific policies (builder's risk, vacant dwelling) are holding costs and belong with the property. G&A policies (GL umbrella, auto, workers' comp) stay in opex. | VERIFY |
| Utilities / Repairs & Maintenance / Fees & Permits | 18,188.61 / 7,015.22 / 737.37 | Property-site utilities, repairs, and permits are holding or rehab costs. | VERIFY |
| Waste Disposal Fees (Other Expense) | 16,747.49 | Construction debris haul-off is a direct rehab cost. It is misplaced in "Other Expenses." | PROBABLE |
| Acquisition Marketing (9 sub-accounts) | 456,210.93 | Correctly expensed. Under ASC 970-340, costs to *find* properties are period costs unless directly tied to a specific acquired property. | OK |
| Related Party Expense – Equity Track Inc (Iriga Office) | 121,661.45 | The name implies the Iriga office is **the same legal entity** as Equity Track, which would make "related party" the wrong label. If it is a separate Philippine entity, the title, transfer pricing, and the $17,336.72 "Due From" should reflect that. | VERIFY |
| Auto Expenses / Lease Payments – Auto / Parking | 29,114.74 / 27,223.91 / 1,815.32 | The company *owns* about eight vehicles **and** pays auto leases. The fixed-asset register includes a **1977 Rolls Royce, a 2018 Kawasaki motorcycle, a UTV, and a Honda Accord**. Personal use must be documented or reclassified to distributions. | VERIFY |
| Meals & Entertainment / Meals for the team / Gifts | 13,840.54 / 9,829.70 / 458.66 | Tax limitation and segregation only (entertainment is non-deductible; meals are generally 50% deductible). | Tax note |
| Medical | 88.20 | Probably personal. | VERIFY |
| Salaries & Wages | 103,321.85 | See Section F. There is no payroll liability on the Balance Sheet. | VERIFY |
| Depreciation (all accounts) | 0.00 | **No 2026 depreciation recorded.** Depreciation accounts also appear in two P&L sections (Expenses and Other Expenses). | CONFIRMED |
| Parent-level postings | Advertising $1,034.05; Interest Expense $3,296.61 | Posted to parent accounts instead of sub-accounts. Reclass for clean reporting. | CONFIRMED (presentation) |

---

## C. Property-Level Cost and Profitability Review

### C.1 Unsold / active properties (from Inventory Asset and Mortgages [BS pp.2–7])

| Property | Acquisition | Closing costs | Construction team wages | Rehab / holding | **Total inventory** | Loan (lender) | Undrawn holdback receivable | Funded loan* | Funded loan ÷ cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1782 Woodhaven Way | 1,101,800.00 | 164,120.40 | — | 258,825.42 | **1,524,745.82** | 1,155,000.00 (ARC Home) | — | 1,155,000.00 | 75.8% |
| 52 Paramount Ter, SF | 1,550,000.00 | 26,002.68 | 28,390.15 | 67,473.46 | **1,671,866.29** | 1,775,687.92 (Anchor) | 237,300.00 | 1,538,387.92 | 92.0% |
| 820 28th St, Oakland | 1,146,742.38 | 33,671.33 (refi) | 25,043.18 | 86,332.99 + 204.52 + 1,132.68 | **1,293,127.08** | 741,459.78 (Kiavi) | 267,435.00 | 474,024.78 | 36.7% |
| 460 5th Ave, Redwood City | 930,003.05 | 17,487.24 | 40,632.86 | 85,037.14 + 38.20 | **1,073,198.49** | 1,108,968.94 (Anchor) | 81,915.00 | 1,027,053.94 | 95.7% |
| 972 Norton St, San Mateo | 980,000.00 | 16,357.16 | 3,879.93 | 58,675.01 + 6,654.64 | **1,065,566.74** | 980,000.00 (Anchor) | — | 980,000.00 | 92.0% |
| 22496 Ave 18 3/4, Madera | 200,000.00 | 12,806.05 | 42,505.67 | 109,895.37 | **365,207.09** | 320,500.00 (Anchor) | — | 320,500.00 | 87.8% |
| 506 N Cesar Chavez | 24,229.75 (parent only) | — | — | — | **24,229.75** | none | — | — | — |
| 441 Vera | — | — | — | 1,944.17 | **1,944.17** | none | — | — | — |
| 519 Orizaba Ave | 211.83 (parent only) | — | — | — | **211.83** | 0.00 | — | — | — |
| **Total** | | | **140,451.79** | | **7,020,097.26** ✔ | **6,081,616.64** ✔ | **586,650.00** ✔ | | |

\*Funded loan = loan balance minus the undrawn holdback receivable. This assumes the loan was booked at face with an offsetting "Due from Lender" receivable, the standard entry. Confirm against the lender statements.

**Property-specific observations:**

- **1782 Woodhaven Way** (not on your list, and the largest asset at $1.52M):
  - Closing costs of $164,120.40 are **14.9% of the purchase price**. That is abnormal. It likely includes loan points, prepaid interest, impounds, prorated taxes, or a duplicate. Under GAAP, loan costs are debt issuance costs, not property basis.
  - The loan exceeds the purchase price, and the lender (ARC Home LLC) has no holdback. That pattern is typical of a DSCR / long-term loan, which raises the question of whether this is a **rental (held-for-use)** property rather than a flip. If it is a rental, reclassify it to fixed assets, depreciate it, and record rental income.
- **820 28th St:**
  - The "Refinance 2026" sub-accounts, the cleared First Bridge Funding loan, and a new Kiavi loan indicate a 2026 refinance.
  - Refinance closing costs ($33,671.33) belong with the **new debt** (ASC 835-30), not with property cost.
  - Funded debt is only 36.7% of cost. Confirm the First Bridge payoff on the refinance settlement statement, and confirm where any cash-out went.
  - If this property is being held as a rental (BRRRR), the same rental reclassification applies.
- **972 Norton St:** the loan ($980,000.00) **equals the purchase price exactly**, and there is no rehab holdback receivable. Either the purchase was 100% financed with rehab paid from cash, or the acquisition entry was plugged to the loan amount. Tie both figures to the settlement statement.
- **460 5th Ave:**
  - A purchase price of $930,003.05 is not a round contract price. Prorations or credits were probably mixed into the acquisition amount. Rebuild it from the settlement statement.
  - The loan balance exceeds the inventory.
- **52 Paramount Ter:**
  - Also financed by a $250,000 "Investor Contribution – Teo Valencia" (in equity) and a dedicated bank account (2832, $81,588.81).
  - The total sources (funded loan + investor) are about $1.79M, against $1.67M of cost.
  - The terms of the Teo Valencia agreement (loan vs. profit participation) determine the accounting (Section F.3).
- **22496 Ave 18 3/4 (Madera):** construction-team wages ($42,505.67) are the highest of any property and 21% of total cost. Review Matrix timesheets for allocation accuracy. The sub-account name "Closings Costs" is a typo; standardize it.
- **441 Vera:** this is a **Prescott Development** project (see "Due from Prescott – 441 Vera – Rehab & Holding Costs"). $1,944.17 is sitting in Equity Track's inventory. **PROBABLE misallocation.**
- **506 N Cesar Chavez:** $24,229.75 is posted to the parent account with no loan and no sub-accounts. It is either a wholesale or dead deal (expense it, or charge it to wholesale cost) or a pending acquisition (move it to EMD or deposits).
- **519 Orizaba:** the loan and holdback are $0, so the property is sold. A $211.83 residual should have been relieved to COGS.

### C.2 Disposed properties (inventory, loan, and holdback all at $0.00)

These properties are fully relieved on the balance sheet:

- 1090 Central Blvd (Kiavi)
- 1202 Via Lucas (Kiavi)
- **1464 Sunrise Pkwy, Petaluma** (Kiavi)
- 1574 Jerrold Ave (Anchor)
- 164 Springdale Way (Kiavi)
- 1932 Chestnut Ave (Kiavi)
- 2352 Menalto Ave (no mortgage account, so funding source is unknown)
- 27 Prague St (Kiavi)
- 3375 17th St #311 (Anchor)
- 340 Vallejo (no mortgage account)
- **492 Umland Dr, Santa Rosa** (Anchor)
- 7426 Mulholland (Kiavi)
- 915 52nd St (Kiavi)

The balance sheet cannot show which of these sold **in 2026** rather than in 2025. **Realized profit per property cannot be computed from the documents provided**, because the P&L is not split by property. I have not estimated it; any figure would be invented.

**Procedure to produce the realized-profit schedule:**

1. Run a *Profit and Loss by Customer* report (or by Class or Location, whichever dimension the company uses for properties) for 1/1–11/9/2026.
2. If properties are not tagged, run *Transaction Detail by Account* for each COGS account, grouped by Name or Memo.
3. For each property sold in 2026, build:
   - Gross price (from the settlement statement)
   - minus seller credits
   - minus commission and closing costs
   - minus relieved basis (acquisition + acquisition closing + rehab + labor + capitalized carry)
   - **= realized gain**
4. Separately list carry (interest, taxes, insurance) expensed after completion.
5. Tie the total of the schedule to Property Sales Revenue ($15,022,500.00) and to Buying Cost ($10,935,000.00).

---

## D. Property Inventory and Capitalization Findings

### D.1 Book (US GAAP) treatment

| Cost type | GAAP rule | Current treatment | Finding |
|---|---|---|---|
| Purchase price and acquisition closing costs | Capitalize (ASC 970-340-25) | Capitalized for unsold properties; $256,561.57 in COGS | Verify that the COGS amount is for 2026 sales only |
| Rehab materials and subcontractors | Capitalize during development | Capitalized for unsold properties; $1,220,331.38 in COGS | Split by property |
| Construction labor (Matrix / team) | Capitalize | $140,451.79 capitalized; $559,169.37 in COGS | Split by property; check for duplication |
| Property taxes and insurance during development | Capitalize while development is in progress (ASC 970-340-25-8) | Mostly expensed | Split by property |
| Interest on property debt | Capitalize during the active development period (ASC 835-20) | **$0 capitalized; $407,908.61 expensed** | PROBABLE understatement of inventory |
| Loan and refinance fees | Debt issuance cost, deducted from debt and amortized (ASC 835-30) | Three different treatments (COGS, inventory, closing costs) | CONFIRMED inconsistency |
| Carry after construction is complete (listed for sale) | Expense as incurred | Unknown | Policy needed |
| G&A, acquisition marketing, VA, office | Expense | Mostly correct; VA wages misclassified in COGS | CONFIRMED |

**Population at risk** (COGS cost types that may belong to unsold properties): **$2,469,790.48**. This is an **upper bound, not an estimate.**

| Component | Amount |
|---|---:|
| Rehab & Holding | 1,220,331.38 |
| Construction Labor – Matrix | 559,169.37 |
| Interest – Mortgage | 407,908.61 |
| Closing Cost – Acquisition | 256,561.57 |
| Property Taxes | 22,468.85 |
| Loan Fees | 3,350.70 |
| **Total** | **2,469,790.48** |

Every dollar of it that relates to a property unsold at 11/9/2026 overstates the net loss and understates inventory one-for-one.

### D.2 Tax (IRC §263A) treatment

- **Small-business exemption, IRC §263A(i):** a taxpayer that is not a tax shelter and meets the IRC §448(c) gross-receipts test is exempt from §263A, including the §263A(f) interest-capitalization rules. The test uses the 3-year average and the inflation-adjusted threshold; confirm the exact 2026 figure with the CPA.
  - Equity Track's own receipts are about $15.3M YTD.
  - **However, §448(c)(2) requires aggregation** with entities under common control (§52(a)/(b)). Juan Diaz's other entities (Prescott Development, Matrix Group One, Peninsula Plumbing, Daliaz) must be tested together.
  - "Tax shelter" status also matters. A corporation that allocates more than 35% of losses to limited or passive owners can fail the test; this is relevant if the "investor contribution" structure is in fact equity.
- **Even if exempt from §263A:** real estate held for resale is not "inventory" under §471 for tax purposes. Acquisition costs and **direct improvement costs** are still capitalized to each property's basis under §263(a)/§1016 and recovered only at sale. The exemption removes the requirement to capitalize *indirect* costs and interest. **It does not permit expensing rehab costs.**
- **The "263A Adjustment – Other Assets" of –$370,786.00 [BS p.6] is CONFIRMED as an improper book presentation:**
  - It is a contra-asset that is not tied to any property, so it will never be relieved when properties sell.
  - If it is the CPA's tax-basis entry (for example, reversing UNICAP indirect costs or adopting the §263A(i) exemption with a §481(a) adjustment), it belongs in the **tax workpapers / Schedule M-1**, not in the GAAP ledger.
  - **Action:** obtain the CPA's JE, the year, and the computation. For books, either allocate it to specific properties (if it truly adjusts their basis) or reverse it against retained earnings as a prior-period item (CPA approval required).

### D.3 Answers to the eight capitalization questions

| # | Question | Answer from the evidence |
|---|---|---|
| 1 | Are renovation expenses incorrectly on the P&L? | **Probable.** $1.22M of rehab and $559K of labor are in COGS while unsold properties are under rehab. The split is unverifiable without the GL. |
| 2 | Are property costs missing from inventory? | **Probable.** Interest: $0 capitalized on any unsold property. Woodhaven: $0 labor. Waste disposal ($16,747.49) is in Other Expenses. |
| 3 | Are costs assigned to the wrong property? | **Probable.** 441 Vera ($1,944.17) is a Prescott property. 820 28th refinance costs are in inventory. |
| 4 | Are construction costs recorded twice? | **Verify.** Matrix labor in COGS vs. "Construction Team Wages" in inventory; Wise VA vs. Iriga labor; Home Depot card payments (Section E). |
| 5 | Are sold-property costs still on the balance sheet? | **Minor, confirmed:** 519 Orizaba $211.83. All other sold properties are at $0. |
| 6 | Are unsold-property costs expensed prematurely? | **Probable.** See #1. |
| 7 | Are holding costs treated consistently? | **No (CONFIRMED).** Holding costs are capitalized on 972 Norton ($6,654.64) and 460 5th ($38.20), absent on the others, and $22K of property taxes plus about $78K of insurance and utilities are in COGS and opex. |
| 8 | Are overhead allocations reasonable? | **No (CONFIRMED).** The PPC "allocation" nets to zero inside opex, and no allocation policy is documented. |

---

## E. Bank and Credit Card Reconciliation Findings

**No bank statement, card statement, or reconciliation report was provided.** Nothing below is a confirmation that any account is reconciled.

### E.1 Balance-level observations [BS p.1, p.6–7]

| Account | Balance | Observation | Priority |
|---|---:|---|---|
| **WELLS FARGO (8251)** | **679,256.60** | 84% of all cash. A material balance must be reconciled to the 10/31 statement and rolled forward to 11/9. Review uncleared items older than 60 days and any deposits coded to Other Income, revenue, or equity. | HIGH |
| Equity Track – 52 Paramount Ter (2832) | 81,588.81 | Project account. Confirm the source of funds (Teo Valencia investor money vs. loan draws). | MED |
| Relay 5776 – Rehab & Holding / 4444 Opex / 1760 Marketing | 40,184.49 / 213.80 / 0.01 | Reconcile. | MED |
| **WF 8263 – 8715 D St** | **8,819.04** | **Bank account for a property reported on Juan's personal return**, carried as corporate cash. Commingling. | HIGH |
| Umpqua 1576, 170 Rockridge 1149, WF 0002 – 820 28th | 0.00 | Confirm closed. If still open, confirm a $0 statement balance. | LOW |
| **Negative credit-card balances** | Citi –1,520.75; Discover –4,294.24; **Home Depot 1511/6852 –3,982.20** | **Total –$9,797.19.** These indicate one of: payments recorded twice (once as a transfer and once as an expense, or downloaded twice), charges never imported, or refunds booked as payments. If charges are missing, **expenses are understated.** | HIGH |
| Amex 2001 / BOA 2406 & 0475 / Capital One 2680 / Capital One CC / WF 6215 / WF 3269 | 65,550.63 / 51,637.49 / 12,152.71 / 28,897.05 / 28,919.36 / 258.92 | Agree each to its statement. "Capital One CC" has no last-4 identifier, so it may be a duplicate account for the same card as 2680. | MED |
| Home Depot 5253 / 5880 & 8087 | 29,924.24 / 2,162.61 | See E.2. | HIGH |
| Interest Expense – Credit Cards | 11,313.38 | This is about 5.4% of the $209,705.82 card balance in 10 months, so the company is revolving balances while holding $810K in cash. Financing decision, not an error. | INFO |

### E.2 Home Depot focused procedure

Home Depot balances net to $28,104.65 across three account groups, one of them negative. Steps:

1. **Export Pro Xtra purchase history** (all cards: 1511, 6852, 5253, 5880, 8087) for 1/1/2025–11/9/2026, with job-name/PO fields. Export consumer-card statements for the same period.
2. In QBO, run **Transaction Detail by Account** for each Home Depot liability account and for every expense or inventory account a Home Depot charge hits.
3. **Match** on date, amount, and last-4. Flag:
   - (a) QBO charges with no Pro Xtra or receipt match
   - (b) receipts not in QBO
   - (c) the same amount on the same date on two cards or in two accounts (duplicates)
   - (d) returns: credits in QBO that are not matched to the original purchase property
   - (e) charges coded to opex (Repairs & Maintenance, Office, Supplies) instead of a property
4. **For card 1511/6852 (–$3,982.20):** list every payment applied in 2026, and match each to the Wells Fargo or Relay withdrawal. A payment recorded both as a card payment and as an expense is the classic cause of a negative balance.
5. **Charges with a missing receipt:** do **not** expense them by default. Assign each to a property using the Pro Xtra job name, store location vs. property address, delivery address, and dates vs. that property's rehab schedule. If it still cannot be assigned, hold it in a "Materials – Unassigned" suspense account and get a decision from the project manager.
6. Document the conclusion for each item; the CPA will ask for it.

### E.3 Other balance-sheet items tied to cash processes

- **Accounts Payable –$2,660.50:** a vendor credit or prepayment not applied, or a bill paid twice (once through Pay Bills and once by direct expense). Run *A/P Aging Detail* and *Unapplied credits*.
- **Accounts Receivable $312.63:** age it and resolve.
- **2025 RAM ProMaster 2500 loan –$864.90:** overpayment, or payments not split between principal and interest. Get the lender amortization schedule and true up principal vs. Interest Expense – Vehicle Loans.

---

## F. Intercompany and Payroll Findings

### F.1 Intercompany balances [BS pp.1–2, 8]

| Entity | Balances on Equity Track's books | Problem | Status |
|---|---|---|---|
| **Peninsula Plumbing Solutions** | "Due From Peninsula" group: +$27,761.81 (parent $19,646.00 + Marketing $48,417.83 – Operating Expenses $37,769.24 – Payroll $2,532.78) **and** a separate "Peninsula Plumbing Solutions, Inc." asset of **–$133,730.68** | Two accounts for the same counter-party. **Net position –$105,968.87**, meaning Equity Track owes Peninsula roughly $106K. A liability is being shown as a negative asset. | CONFIRMED (presentation); amount VERIFY with Peninsula's books |
| **Matrix Group One** | "Due from Matrix Group One" **–$28,128.73** (asset) **and** "Matrix Group" **+$131,661.98** in **equity** | An intercompany balance cannot be equity unless Matrix is a shareholder. Combined, Equity Track appears to owe Matrix about $159,790.71. Also review the markup on the $559,169.37 of Matrix labor plus $140,451.79 capitalized. | CONFIRMED (presentation); amount VERIFY |
| **Prescott Development** | Parent –$61,762.63, plus sub-accounts (441 Vera $9,761.06; 449 Vera $29,830.51; 751 27th St Rehab –$11,315.84; 751 27th St Wages $10,323.70) = **–$23,163.20** | A negative "Due from" is a payable. Also 441 Vera has $1,944.17 sitting in Equity Track inventory. | CONFIRMED (sign); see F.2 |
| **Daliaz Investments** | "Due from Daliaz" **–$72,733.66 in equity** | A debit balance in equity behaves like a receivable. If Daliaz owes Equity Track, it is an asset of $72,733.66. If Daliaz is Juan's vehicle and the money was paid on his behalf, it is a distribution. | CONFIRMED (presentation); nature VERIFY |
| **Equity Track (Iriga Office)** | "Due From" $17,336.72 | If the Iriga office is a branch of the same entity, a receivable from itself is not valid. If it is a separate entity, rename it and reconcile. | VERIFY |

### F.2 The $27,770.58 Prescott Development transfer (October 2026)

I could not see this transaction because the GL was not available. Arithmetic from the balance sheet:

- **If** the $27,770.58 receipt was credited to "Due from Prescott Development," then before the transfer the net receivable was **–$23,163.20 + $27,770.58 = $4,607.38**.
- That would mean Prescott **overpaid by $23,163.20**, *or* Equity Track has paid Prescott costs that were never charged to the receivable. The $1,944.17 for 441 Vera sitting in Equity Track inventory is one example. Payroll for Prescott's 751 27th St crew run through Equity Track's payroll is another possibility.
- The P&L shows "Other Income/Loss" of $18,384.97, which is **less than** $27,770.58, so the transfer was **not** booked entirely to Other Income. It may have been split.

**Do not classify this transfer until the following are done:**

1. Pull the Wells Fargo or Relay deposit, and see what account it was coded to.
2. Pull Prescott's GL "Due to Equity Track" account and agree it line by line to Equity Track's "Due from Prescott" (parent plus four sub-accounts).
3. Obtain the supporting schedule Prescott used to compute $27,770.58 (it is not a round number, so it was likely a reimbursement schedule).
4. Classify accordingly. A reimbursement of costs Equity Track paid for Prescott is a credit to the receivable, **not income**. If no agreement supports it, it is a loan or advance (credit to a "Due to Prescott" liability).

### F.3 Owner, investor, and lender accounts in equity and long-term liabilities

| Item | Amount | Issue | Status |
|---|---:|---|---|
| Northpoint Bank (under 8715 D St) | 525,817.03 | **A mortgage recorded in equity.** If Equity Track is not the borrower, remove it entirely along with the property. If it is the borrower, it is a liability. | CONFIRMED |
| United Wholesale Mortgage (under 8125 Cottonmill) | 307,000.00 | Same as above. | CONFIRMED |
| Personal properties in equity (100 Palm, 8125 Cottonmill, 816 22nd, 8715 D St) | –1,460,073.07 net | These properties are reported on Juan's personal return. Corporate payments for them are distributions (C-corp: constructive dividends; S-corp: distributions reducing basis). They should be **closed into "Owner's Pay & Personal Expenses" / Distributions**, not carried as separate property balances in corporate equity. | CONFIRMED |
| **Payable to NewRez LLC** | 528,750.00 | NewRez is a residential mortgage servicer. It is not mapped to any property in the "Mortgages" section. It may relate to a personal residence (100 Palm?). | VERIFY — HIGH |
| Payable to Manuel Martin / Manuel Morfin | 200,000.00 / 500,000.00 | Private notes. Obtain the promissory notes, rates, and collateral. Accrue interest to 11/9. Determine whether "Interest – Shareholder Loan" is really interest on these notes. | VERIFY |
| Investor Contribution – Teo Valencia – 52 Paramount Ter | 250,000.00 | In a corporation, "contribution" in equity implies issued stock. If the agreement is a loan or a profit-share on one deal, it is a **liability** (plus accrued interest or profit share). | VERIFY — HIGH |
| Business Loan – Cherry Ann Hombre | 2,500.00 | A loan from an individual. Obtain documentation. | VERIFY |
| Owner's Investment / Owner's Pay & Personal Expenses | 3,186,239.54 / –2,678,532.99 | Large, gross balances. Confirm the entity's tax classification (C vs. S). Confirm whether "Owner's Investment" includes amounts meant as **shareholder loans** (this ties to the $32,083.37 of shareholder-loan interest). | VERIFY |

### F.4 Payroll and labor

1. **No payroll liability accounts exist** (no accrued wages, withholdings, or employer taxes), even though there is $103,321.85 of opex wages, $140,451.79 + $10,323.70 of construction-team wages, $14,033.27 of payroll tax, and Philippine statutory contributions. If payroll runs through a full-service provider that impounds taxes on the pay date, $0 can be correct *on a pay date*. On 11/9 there will almost certainly be accrued wages for a partial pay period. **VERIFY.**
2. **Payroll tax ($14,033.27) is in COGS while opex wages are in opex.** Payroll tax should follow its wages. Re-allocate between COGS, inventory, and opex based on the payroll register. Also confirm that employee-side withholdings are not being expensed. At 13.6% of opex wages, the ratio is high for employer-only taxes.
3. **Matrix Group One:**
   - $559,169.37 is expensed as "Construction Labor – Matrix," and separately $140,451.79 is capitalized as "Construction Team Wages."
   - Confirm whether Matrix *invoices* Equity Track (third-party style, possibly with a markup) or whether Equity Track runs the crew's payroll itself. If both happen, there is duplication.
   - Obtain the Matrix invoices, the markup agreement, and timesheets by property.
   - Any markup paid to a commonly controlled entity has related-party disclosure and tax implications.
4. **Wise VA wages ($38,448.51) and the Iriga office (Labor Cost $69,413.44, 13th Month Pay $12,922.46, statutory contributions, and other items):**
   - Determine whether the Wise payments **fund** the Iriga payroll. If so, booking both the transfer (as VA wages) and the payroll report (as Iriga labor) is a **duplicate**.
   - Check whether US withholding or 1042-S reporting applies to foreign contractors, and whether Philippine employer registration applies if Iriga is a branch.
5. **Employee reimbursements:** run *Expenses by Vendor* for every employee name and confirm that none are coded to wages or Contractors.
6. **Payments for affiliates:** the "Due From Peninsula – Payroll" (–$2,532.78) and "751 27th St – Construction Team Wages" (Prescott) accounts show that Equity Track pays some payroll on behalf of affiliates. Confirm that every such run is charged out in full.

---

## G. Detailed Audit Findings

| # | Priority | Account / Transaction | Amount | Finding | Status | Financial impact | Recommended correction |
|---|---|---|---:|---|---|---|---|
| 1 | **High** | COGS: Rehab & Holding, Matrix Labor, Interest, Acq. Closing, Prop. Taxes, Loan Fees | 2,469,790.48 (upper bound) | Unsold-property costs may be expensed; no interest capitalized on any unsold property | PROBABLE | Net loss overstated by up to the portion tied to unsold properties; inventory understated by the same amount | Split by property; reclass the unsold portion to Inventory sub-accounts |
| 2 | **High** | Equity: personal properties and two mortgages | –1,460,073.07 net (incl. Northpoint 525,817.03 and UWM 307,000.00) | Personal assets and debts in corporate books | CONFIRMED | Balance sheet and equity misstated; no P&L effect | Close to Distributions; remove the mortgages if Equity Track is not the borrower (CPA approval) |
| 3 | **High** | 263A Adjustment – Other Assets | –370,786.00 | Tax-only entry in GAAP books, not tied to any property | CONFIRMED | Assets understated (book) | Obtain the CPA JE; allocate or reverse through retained earnings |
| 4 | **High** | Peninsula: two accounts | +27,761.81 / –133,730.68 | Duplicate intercompany accounts; net payable shown as negative asset | CONFIRMED | Assets and liabilities misstated by about $106K (gross-up) | Merge; reconcile to Peninsula's books |
| 5 | **High** | Matrix: asset and equity | –28,128.73 / +131,661.98 | Intercompany balance in equity | CONFIRMED | Equity overstated, liabilities understated | Reclass to Due to Matrix after reconciliation |
| 6 | **High** | Taxes Paid | 120,220.29 | Nature unknown; possibly income, transfer, or personal tax | VERIFY | Pretax income may be understated by up to $120K | Reclass per the support |
| 7 | **High** | Wells Fargo 8251 | 679,256.60 | No reconciliation evidence | VERIFY | Cash and any miscoded items | Reconcile to the statement |
| 8 | **High** | Negative credit cards (Citi, Discover, HD 1511/6852) | –9,797.19 | Likely duplicate payments or missing charges | VERIFY | Expenses possibly understated | Reconcile each card |
| 9 | **High** | Interest Expense – Shareholder Loan | 32,083.37 | No shareholder-loan liability exists | CONFIRMED inconsistency | Possible distribution recorded as expense | Tie to a note, or reclass to distributions |
| 10 | **High** | Prescott: Due from Prescott, and the $27,770.58 transfer | –23,163.20 | Negative receivable; transfer classification unknown | VERIFY | Up to $27,770.58 of misclassification risk | Two-sided reconciliation (F.2) |
| 11 | **High** | Teo Valencia investor contribution | 250,000.00 | Equity vs. liability | VERIFY | Debt and equity classification; possible unaccrued profit share | Review the agreement |
| 12 | **High** | Payable to NewRez | 528,750.00 | Not linked to any property | VERIFY | Liability may not belong to Equity Track | Obtain the loan documents |
| 13 | **Med** | Depreciation | 0.00 recorded on ~567,046 gross | No 2026 book depreciation | CONFIRMED | Net loss **understated** for book purposes | Record YTD depreciation per the book policy |
| 14 | **Med** | Virtual Team – Wise VA Wages | 38,448.51 | Overhead classified in COGS | CONFIRMED | Gross profit understated by $38,448.51; net income unchanged | Reclass to opex |
| 15 | **Med** | Marketing Allocation PPC | ±35,000.00 | Self-cancelling entry within opex | CONFIRMED | None (ineffective entry) | Reverse; book a real allocation only if supported |
| 16 | **Med** | Prior Period Loan Reconciliation – CPA Review | 12,363.75 | Open suspense from prior period | CONFIRMED | Retained earnings or interest | Resolve with the CPA |
| 17 | **Med** | 1782 Woodhaven closing costs | 164,120.40 | 14.9% of purchase price | VERIFY | Basis vs. debt-cost misclassification | Rebuild from the settlement statement |
| 18 | **Med** | 820 28th refinance closing costs | 33,671.33 | Debt cost capitalized to property | CONFIRMED (account title) | Inventory overstated; debt overstated | Reclass to a contra-debt account and amortize |
| 19 | **Med** | Payroll liabilities | none | No accruals | VERIFY | Liabilities and expense understated | Accrue at period end |
| 20 | **Med** | Payroll Tax in COGS | 14,033.27 | Does not follow its wages | PROBABLE | Gross profit and inventory allocation | Allocate per the payroll register |
| 21 | **Med** | Daliaz in equity | –72,733.66 | Receivable or distribution in equity | CONFIRMED (presentation) | Equity and assets | Reclass after confirming its nature |
| 22 | **Med** | 506 N Cesar Chavez | 24,229.75 | Unsupported inventory with no loan | VERIFY | If it is a dead deal, net loss understated by $24,229.75 | Expense, or move to EMD |
| 23 | **Med** | Waste Disposal Fees | 16,747.49 | Rehab cost in Other Expenses | PROBABLE | Classification; capitalize if for an unsold property | Reclass to the property |
| 24 | **Med** | Insurance / Utilities / Repairs / Permits | 86,358.60 | May include property holding costs | VERIFY | Same as #1 | Split by property |
| 25 | **Med** | Fixed assets: 1977 Rolls Royce, Kawasaki, UTV, Honda Accord | 35,183.90 | Personal-use risk | VERIFY | Assets and depreciation | Document business use, or distribute |
| 26 | **Med** | Wise VA vs. Iriga labor | 38,448.51 / 69,413.44 | Possible duplicate | VERIFY | Expense possibly overstated | Match the Wise transfers to the Iriga payroll |
| 27 | **Low** | 441 Vera in Equity Track inventory | 1,944.17 | Prescott property | PROBABLE | Inventory overstated; receivable understated | Reclass |
| 28 | **Low** | 519 Orizaba residual | 211.83 | Sold property, residual not relieved | PROBABLE | Net loss understated by $211.83 | Relieve to COGS |
| 29 | **Low** | A/P –2,660.50; RAM loan –864.90; EMD "5475" –500.00 | — | Wrong-sign balances | CONFIRMED | Minor | Investigate and clear |
| 30 | **Low** | Prepaid Estate Tax; Medical | 3,700.00 / 88.20 | Likely personal | VERIFY | Minor | Reclass to distributions |
| 31 | **Low** | Penalties & Settlements | 41,533.61 | Tax non-deductibility | VERIFY | Tax only | Tag for the M-1 adjustment |
| 32 | **Low** | Parent-account postings; account naming; duplicate depreciation sections | — | Chart-of-accounts hygiene | CONFIRMED | None | Clean up the chart of accounts |

---

## H. Proposed Adjusting Journal Entries

**None of these entries have been posted. Each requires your approval, and the CPA's approval where noted.** Exact amounts are given only where the reports themselves support the amount. All other entries are templates whose amounts come from the procedure listed.

### H.1 Entries supported by the reports (amounts known)

| AJE | Date | Debit | Credit | Amount | Support | Net income effect |
|---|---|---|---|---:|---|---:|
| AJE-1 | 11/9/2026 | Opex: Office / G&A – Virtual Team (new account) | COGS: Virtual Team – Wise VA Wages | 38,448.51 | [PL p.1] account title. Hold if the duplication test (#26) changes the amount. | 0 (gross profit +38,448.51) |
| AJE-2 | 11/9/2026 | Marketing Allocation Offset – PPC | Property Marketing Allocation – PPC | 35,000.00 | [PL p.2]. Reverses a self-cancelling entry. | 0 |
| AJE-3 | 11/9/2026 | Due from Prescott – 441 Vera – Rehab & Holding | Inventory – 441 Vera – Rehab & Holding | 1,944.17 | [BS p.2, p.4]. **Confirm** that 441 Vera is Prescott's property. | 0 |
| AJE-4 | 11/9/2026 | COGS: Rehab & Holding Costs (519 Orizaba) | Inventory – 519 Orizaba Ave | 211.83 | [BS p.4]. **Confirm** the sale date and that no further costs are expected. | –211.83 |
| AJE-5 | 11/9/2026 | Peninsula Plumbing Solutions, Inc. (the –133,730.68 account) | Due to Peninsula Plumbing (new liability account) | 133,730.68 | [BS p.5]. Presentation only. **Merge with the "Due From Peninsula" group after reconciling to Peninsula's books.** | 0 |

### H.2 Template entries (amounts come from the procedures)

| AJE | Entry | Amount source |
|---|---|---|
| AJE-6 | Dr Inventory – [property] / Rehab, Labor, Holding, Capitalized Interest; Cr COGS – Rehab & Holding / Construction Labor – Matrix / Interest – Mortgage / Property Taxes / Closing Cost – Acquisition | Transaction Detail by Account for each COGS line, tagged by property; include only properties unsold at 11/9 and only costs incurred during active development |
| AJE-7 | Dr Depreciation Expense – [asset]; Cr Accumulated Depreciation – [asset] | Fixed-asset register under the book policy. Also reconcile the lump-sum "Accumulated Depreciation – General" (–538,173.68) into the per-asset sub-accounts. |
| AJE-8 | Dr Owner's Pay & Personal Expenses (Distributions); Cr 100 Palm / 8125 Cottonmill / 816 22nd / 8715 D St equity accounts. Remove Northpoint ($525,817.03) and UWM ($307,000.00) if not Equity Track debt. | **Prior-period / equity reclass. CPA approval required.** |
| AJE-9 | 263A Adjustment: reverse to Retained Earnings, or allocate to specific properties | CPA's original JE |
| AJE-10 | Dr Discount on Notes Payable – 820 28th Kiavi (contra-debt); Cr Inventory – 820 28th – Refinance 2026 Closing Costs | $33,671.33 less any portion that is true property cost (title, recording) per the refinance settlement statement |
| AJE-11 | Dr Interest expense or capitalized interest; Cr Accrued Interest – Martin / Morfin / Anchor / Kiavi / ARC | Note terms and loan statements, days since last payment |
| AJE-12 | Dr Wages and Payroll Tax (or Inventory); Cr Accrued Payroll / Payroll Liabilities | Payroll register: days worked but unpaid at 11/9 |
| AJE-13 | Matrix: Dr Matrix Group (equity) 131,661.98; Cr Due to Matrix Group One | After reconciliation with Matrix's books |
| AJE-14 | Daliaz: Dr Due from Daliaz (asset) or Distributions 72,733.66; Cr Due from Daliaz (equity) | After determining its nature |
| AJE-15 | Taxes Paid: reclass to Income Tax Expense / Distributions / Selling Cost / Inventory | Payee detail for the $120,220.29 |

---

## I. Adjusted Profit & Loss

| | Amount |
|---|---:|
| **Originally reported net income (loss)** [PL p.3] | **(332,977.90)** |
| Confirmed adjustments with a net-income effect | |
| — AJE-4: 519 Orizaba residual (probable, small) | (211.83) |
| **Adjusted net income (loss), confirmed basis** | **(333,189.73)** |
| Reclasses with no net-income effect (AJE-1, AJE-2): gross profit restated from 977,878.00 to **1,016,326.51**; operating expenses from 1,313,225.95 to **1,351,674.46** | — |

**Potential adjustments under investigation.** These are deliberately **not** added to the figure above.

| Item | Direction | Size / bound |
|---|---|---|
| Capitalization of unsold-property costs (#1) | Reduces the loss | Up to 2,469,790.48 (upper bound) |
| Property holding costs in opex and Other Expenses (#23, #24) | Reduces the loss | Up to 103,106.09 |
| Taxes Paid (#6) | Reduces the pretax loss if income, personal, or property tax | Up to 120,220.29 |
| Shareholder-loan interest (#9) | Reduces the loss if a distribution | Up to 32,083.37 |
| Missing book depreciation (#13) | Increases the loss | Illustrative only: 2025-vintage vehicles and equipment of $491,347.01 on 5-year straight line ≈ $98,269/yr, or about $84K for 10.3 months. Actual amount depends on the book policy, in-service dates, and salvage values. |
| 506 N Cesar Chavez write-off (#22) | Increases the loss | 24,229.75 |
| Missing credit-card charges (#8) | Increases the loss | Up to 9,797.19 |
| Accrued interest and payroll (#19, AJE-11, AJE-12) | Increases the loss | Not quantifiable without the notes and payroll register |

**Net direction:** on the evidence available, the **likely** direction of correction is that the reported loss is **overstated** for GAAP purposes, mainly because of capitalization. But the bound is wide (from about +$2.7M to about –$0.12M). **A reliable adjusted net income cannot be stated until task 1 in Section J is complete.**

---

## J. Controller's Action Plan (prioritized QuickBooks cleanup)

"Before CPA" means the task must be complete before the books go to the external CPA.

| # | Priority | Account / transaction | Amount | What to investigate | Required support | Recommended correction | Expected impact |
|---|---|---|---:|---|---|---|---|
| 1 | **High – Before CPA** | All COGS cost lines | 2,469,790.48 | Tag every 2026 COGS transaction to a property; split sold vs. unsold at 11/9 | GL detail, settlement statements, rehab schedules | AJE-6 for unsold properties; write a capitalization policy (GAAP and tax) | Net income, inventory, gross margin |
| 2 | **High – Before CPA** | Wells Fargo 8251 and all other bank accounts | 679,256.60 (810,062.75 total) | Reconcile through 10/31, then roll forward to 11/9 | Bank statements, QBO reconciliation reports | Correct miscoded deposits and withdrawals | Cash, income classification |
| 3 | **High – Before CPA** | All credit cards, especially the negative ones and Home Depot | 209,705.82 net; –9,797.19 negatives | Statement-to-QBO matching, payment duplication, Home Depot procedure (E.2) | Card statements, Pro Xtra export | Remove duplicates, add missing charges, assign to properties | Expenses, inventory |
| 4 | **High – Before CPA** | Property sales | 15,022,500.00 | Agree each sale to its final settlement statement; check cut-off; build the realized-profit schedule | Closing statements, payoff letters | Correct revenue and COGS by property | Revenue, gross profit |
| 5 | **High – Before CPA** | Intercompany: Peninsula, Matrix, Prescott (incl. $27,770.58), Daliaz | Net about –106K / –160K / –23K / 72.7K | Two-sided reconciliation with each entity | Counter-party GLs, agreements | AJE-5, 13, 14; one Due To/From account per entity | Balance sheet; possibly P&L |
| 6 | **High – Before CPA** | Personal properties, Northpoint, UWM, NewRez | 1,460,073.07 / 525,817.03 / 307,000.00 / 528,750.00 | Who is the legal borrower and owner? | Deeds, notes | AJE-8 (CPA approval) | Equity, liabilities |
| 7 | **High – Before CPA** | 263A Adjustment; Prior Period Loan Rec | –370,786.00 / 12,363.75 | Source JEs and computations | CPA's 2025 AJE list | AJE-9; clear the suspense account | Assets, retained earnings |
| 8 | **High – Before CPA** | Taxes Paid; Shareholder-loan interest | 120,220.29 / 32,083.37 | Payee-level detail | Tax notices, notes | AJE-15; tie the interest to a note | Pretax income |
| 9 | **High – Before CPA** | Teo Valencia investor; Martin and Morfin notes; Cherry Ann Hombre | 250,000 / 700,000 / 2,500 | Instrument terms | Signed agreements | Correct debt vs. equity; accrue interest | Liabilities, interest |
| 10 | **Med – Before CPA** | Payroll: Matrix, construction team, Wise, Iriga, payroll tax | 559,169.37 / 150,775.49 / 38,448.51 / 121,661.45 / 14,033.27 | Duplication, markup, allocation by property, missing liabilities | Payroll registers, Matrix invoices, Wise statements | AJE-1, AJE-12; reallocate payroll tax | Gross profit, inventory, liabilities |
| 11 | **Med – Before CPA** | Fixed assets and depreciation | 567,046.00 gross / –538,173.68 accum. dep. | Rebuild the per-asset register (book vs. tax); personal-use vehicles | Purchase invoices, 2025 depreciation schedule | AJE-7 | Net income (book) |
| 12 | **Med** | Woodhaven, 820 28th, 972 Norton, 460 5th acquisition entries | 164,120.40 / 33,671.33 / 980,000.00 / 930,003.05 | Rebuild acquisition basis from settlement statements; flip vs. rental intent | Settlement statements, loan documents | AJE-10; reclass to rental if applicable | Inventory, debt |
| 13 | **Med** | 506 N Cesar Chavez; EMD schedule (incl. 1284 N San Pedro 24,300, 5022 Heyer 25,500, 364 Madison 19,500) | 24,229.75 / 74,800.00 | Status of each deal | Purchase agreements, escrow letters | Write off dead deals; reclass completed ones | Net income, assets |
| 14 | **Low** | 441 Vera; 519 Orizaba; A/P; RAM loan; EMD 5475 | small | Item-level | GL | AJE-3, AJE-4; clear | Minor |
| 15 | **Low** | Chart of accounts hygiene | — | Parent postings, duplicate depreciation sections, "Closings Costs" typo, consistent property sub-accounts (Acquisition / Closing / Labor / Rehab / Holding / Capitalized Interest) | — | Restructure | Reporting quality |

---

## K. Final CPA Conclusion

1. **Is the reported net loss reliable?**
   No. The –$332,977.90 net loss depends on an undocumented split of $2.47M of property costs between COGS and inventory. It also omits depreciation and accruals, and includes items of unknown nature (Taxes Paid $120K, shareholder-loan interest $32K).
2. **Which expenses are incorrectly classified?**
   - Confirmed: Wise VA wages in COGS ($38,448.51); the PPC allocation that nets to zero ($35,000); refinance closing costs in inventory ($33,671.33); shareholder-loan interest with no shareholder loan ($32,083.37).
   - Probable: payroll tax in COGS ($14,033.27); waste disposal in Other Expenses ($16,747.49); and the unsold-property share of COGS.
3. **Are property costs correctly capitalized?**
   No consistent policy is evident. Interest is never capitalized, holding costs are capitalized on only two properties, and three different treatments of financing costs exist. There is also a –$370,786 "263A" contra-asset that is not tied to any property.
4. **Are sold-property profits correctly recognized?**
   Cannot be determined. Inventory relief looks clean (sold properties are at $0, except a $211.83 residual on 519 Orizaba). But flip-only gross margin of 4.4%, against a 27% purchase-to-sale spread, requires a by-property schedule tied to the settlement statements.
5. **Are bank and credit card accounts reconciled?**
   No evidence was provided that they are. Three cards carry negative balances (–$9,797.19), A/P is negative, and a personal-property bank account is in corporate cash.
6. **Are intercompany transactions accurate?**
   No. Peninsula has duplicate accounts (net about –$106K). Matrix and Daliaz balances sit in equity. The Prescott balance is negative, and the $27,770.58 transfer is unreconciled.
7. **Are there unresolved prior-year errors?**
   Yes. The "Prior Period Loan Reconciliation – CPA Review" ($12,363.75), the "263A Adjustment" (–$370,786.00), and the lump-sum accumulated depreciation (–$538,173.68) that is not tied to assets. **The 2025 loss of ~$587,775 could not be verified.** No 2025 statements were provided, and retained earnings of $1,256,500.15 cannot be rolled forward without them. Do not book any prior-period correction until the CPA confirms the filed 2025 figures.
8. **What is the known or estimated total impact?**
   - Confirmed net-income effect: –$211.83.
   - Confirmed reclasses with no net-income effect: gross profit +$38,448.51, plus balance-sheet presentation of about $1.9M.
   - Unresolved exposure: up to about $2.7M that would reduce the loss, and at least about $0.12M that would increase it (illustrative depreciation, 506 N Cesar Chavez, missing card charges).
   - The likely net direction is that the **loss is overstated**, but this cannot be quantified responsibly without the GL.
9. **Which adjustments must be done before submission?**
   Section J, tasks 1–11. At minimum:
   - capitalization split
   - bank and card reconciliations
   - settlement-statement tie-out
   - intercompany reconciliations
   - personal-property and mortgage cleanup
   - clearing the suspense and 263A accounts
   - Taxes Paid and shareholder-interest support
   - debt and equity instrument review
   - payroll allocation and accruals
   - depreciation
10. **What additional documents or tests are required?**
    - GL and Transaction Detail by Account (1/1/2025–11/9/2026)
    - P&L by property (class, location, or customer) and by month, with prior-year comparison
    - All bank and card statements and QBO reconciliation reports
    - Every 2026 purchase, sale, and refinance settlement statement
    - Lender statements and payoff letters
    - Private-note and investor agreements
    - Payroll registers, Matrix invoices, and the Wise and Iriga payroll
    - Intercompany GLs for Prescott, Matrix, Peninsula, and Daliaz
    - 2025 filed return, CPA AJEs, and the 2025 closing trial balance
    - Fixed-asset and depreciation schedule
    - Home Depot Pro Xtra history
    - Confirmation of the entity's tax status and the §448(c) aggregation group

---

*Prepared from the two QuickBooks reports listed in Section 0 only. Every figure is cited to those reports or computed from them as shown. No transaction-level records were examined, and no changes were made in QuickBooks.*
