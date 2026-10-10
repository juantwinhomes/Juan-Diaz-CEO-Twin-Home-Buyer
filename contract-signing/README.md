# Equity Track contract signing

A small Claude Artifact for Equity Track Inc. Philippines. Employees review their own pay explanation and sign their own employment contract. Juan Diaz signs completed contracts in one batch. HR keeps the signed PDFs and the activity history.

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and styles (navy and white, Iriga contract typography) |
| `app.js` | Employee, HR and signatory screens |
| `core.js` | PDF parsing, onboarding-format layout and wording check, payroll estimate, employee codes, signature stamping. No employee data. |
| `assets/` | Header banner from the onboarding packet and the Liberation Sans fonts (SIL Open Font License) used in the contract PDF |
| `tests/core.test.js` | Checks for `core.js`. Contract PDFs are passed as arguments and never committed. |

## How each person uses it

**Employee:** opens the link while signed in to Claude → selects their name → enters their birthdate → waits for HR to confirm (usually minutes) → reads *Understanding Your Monthly Compensation* → reviews the contract → draws or types a signature, previews it, ticks the consent box → submits → sees "Awaiting Juan's signature" → later sees *Your Employment Contract Is Complete* with View and Download buttons.

**HR (the artifact owner, accounting@twinhomebuyer.com):** uploads Juan's drafted contract PDFs → enters each employee's birthdate (and optionally email) → previews and issues → approves access requests → watches signing status → downloads PDFs one at a time or as a ZIP, or saves them to the HR Contracts folder in Google Drive → exports the activity history as CSV.

**Juan:** opens the same link with his own Claude account → sees the four status groups → ticks the contracts waiting for him → *Review and Sign Selected Contracts* → checks the list of exact versions (contract ID, version, SHA-256) → draws or types his signature → types his name → ticks the authorization → signs them all at once. A document that fails is listed by name with the reason and keeps its status.

## Setup (one time)

1. **Share the artifact.** In the artifact's Share menu:
   - Juan Diaz: **Editor**.
   - Every employee: **Contributor**. Employees must be members of the company's Claude organization (Team or Enterprise plan). Claude treats people outside the organization as view-only, so they can read but cannot sign.
   - Nobody else gets Editor. Editors can read every record.
   - Do not turn on public link sharing.
2. **Designate Juan.** Juan opens the page and clicks *Request signatory role*. HR approves it under **Access requests → Designate as signatory**.
3. **Upload contracts.** HR → Contracts → upload Juan's PDFs from the Drive `CONTRACT` folder. Each file is matched to an employee by the name in its opening paragraph.
4. **Complete each record.** Open each employee, enter the birthdate, check the parsed terms, then **Issue for employee signature**.
5. **Set the Drive folder.** Settings → paste the HR Contracts folder link.
6. **Send employees the link** through your usual channel. The message should contain only the link, never pay details.

## How privacy is enforced

The page's HTML and scripts are identical for everyone and contain no employee data. All records live in the artifact's database, and Claude's servers apply these access rules before any data reaches a browser:

| Path | Who can read | Who can write |
| --- | --- | --- |
| `public/directory` | everyone signed in (names only) | HR |
| `hr/**` (birthdates, codes, all contracts, signatures, signed PDFs) | HR and Juan | HR and Juan |
| `issued/<account>/**` (one employee's contract, pay figures, signed PDF) | that employee's account, HR, Juan | HR and Juan |
| `esign/<account>` (that employee's signature and consent) | that employee, HR, Juan | that employee |
| `claims/<account>` (name and birthdate entered) | that employee, HR, Juan | that employee |
| `activity/<account>` | that person, HR, Juan | that person |
| `signatory/<account>/**` (Juan's batch authorizations) | Juan | Juan |

So an employee who opens developer tools, edits the URL, changes the dropdown, or picks another person's name still receives nothing but their own record: the server returns other employees' documents as if they did not exist. The page has no AI chat, so no assistant can be asked about anyone's pay.

**Name and birthdate are not the security.** They identify which record an account is asking for. Access is granted only when HR approves the request, which links that one Claude account to that one record. The Access requests tab shows whether the birthdate matches, the requesting Claude account's name, and whether the record or account is already linked elsewhere. Anyone who knows a coworker's birthdate still cannot see that coworker's contract unless HR approves their account for it.

## Signing records

- **Exact version.** Each uploaded PDF gets a SHA-256 fingerprint. The employee's signature, Juan's batch authorization and the final PDF all record the contract ID, version number and fingerprint. If the contract changes after someone reviews it, signing stops for that document.
- **Employee signature lock.** As soon as HR or Juan has the page open, the employee's signature is copied into the HR record, which the employee cannot write. Any later change the employee makes to their own signature record is ignored.
- **Batch authorization.** Before signing, Juan's authorization (the list of contracts with versions and fingerprints, the consent text and his typed name) is written to his private signatory record. His signature image is applied only to the contracts in that batch and is not kept for reuse.
- **Contract format.** Juan's drafts are re-typeset in the company onboarding-packet layout: 8.5 × 13 in long-bond page, the Equity Track PH header banner on every page, Arial-style type (Liberation Sans), ruled sections, and stacked signature blocks with Signature and Date lines. The wording comes only from Juan's draft. The only additions are the letterhead phone and email lines, the "Signature:" labels and page numbers. When a draft is uploaded, the app reads the formatted PDF back and compares it with the draft character by character; a contract that fails this check cannot be issued. HR can open Juan's original draft next to the formatted version at any time.
- **Final PDF.** The signed PDF is the formatted contract the employee reviewed, unchanged, with both signatures, both dates and a reference footer stamped on. It contains no pay explanation, verification step or activity log. It is stored in the artifact database with its fingerprint and checked against it on every download.
- **File names.** HR copies: `EmployeeCode_FullName_EmploymentContract_YYYY-MM-DD.pdf` (for example `MS-170701_Maria-Santos_EmploymentContract_2026-10-12.pdf`).

## Limits to know about

- **Employees need company Claude accounts.** If employees cannot be added as Contributors in the company's Claude organization, this artifact cannot collect their signatures safely. The smallest alternative that keeps the same privacy model is a small hosted app with per-employee sign-in and row-level security, such as Supabase (email magic-link sign-in, Postgres row-level security, private storage bucket), or a dedicated e-signature service such as Dropbox Sign or DocuSign, which offer signer authentication, bulk signing and certificates of completion.
- **HR as owner has full control.** The artifact owner can read every record and can change the page itself. That is normal for an HR system, but it means the owner account should belong to HR only and be protected with a strong password and two-factor sign-in.
- **Timestamps come from the signer's device**, converted to Philippine time. They are not issued by a trusted time-stamping authority.
- **Signatures are simple electronic signatures** under the Electronic Commerce Act (RA 8792): a drawn or typed mark tied to an authenticated account, explicit consent, and a fingerprint of the exact document. They are not certificate-based digital signatures. Have Philippine counsel confirm this level is acceptable for employment contracts.
- **Notifications are in the page only.** HR sees new signatures and requests live; employees see their status change when they open the page. No email is sent. Send employees only the link, never pay figures.
- **Storage.** Signed PDFs persist in the artifact's database for as long as the artifact exists. Deleting the artifact deletes them, so also keep the Google Drive copies or the ZIP export.
- **Payroll figures are estimates.** HR can edit every rate under Settings. Check them against current SSS, PhilHealth, Pag-IBIG and BIR issuances before employees see them.
- **Data Privacy Act (RA 10173).** Employees are told why their signature and consent are recorded. Keep a privacy notice on file, limit Editor access to Juan, and set a retention period for the activity history and Drive copies.

## Tests

```
npm i pdfjs-dist@3.11.174 pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1   # in any scratch folder
NODE_PATH=<that folder>/node_modules node contract-signing/tests/core.test.js path/to/Contract.pdf
```

Without PDF arguments the script runs only the employee-code, payroll and diff checks.
