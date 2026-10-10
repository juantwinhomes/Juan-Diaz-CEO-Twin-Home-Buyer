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

**Employee:** opens the link (or their personal link) while signed in to Claude → selects their name → enters the personal access code HR gave them → reads *Understanding Your Monthly Compensation* → reviews the contract → draws or types a signature, previews it, ticks the consent box → submits → sees "Awaiting Juan's signature" → later opens the page the same way and sees *Your Employment Contract Is Complete* with View and Download buttons. On a shared or department account they click *Not you? Exit* when done.

**HR (the artifact owner, accounting@twinhomebuyer.com):** uploads Juan's drafted contract PDFs → enters each employee's birthdate → previews and issues (issuing creates the employee's access code) → copies each employee's code or ready-made message from **Access codes** and sends it privately → watches signing status → downloads PDFs one at a time or as a ZIP, or saves them to the HR Contracts folder in Google Drive → exports the activity history as CSV.

**Juan:** opens the same link with his own Claude account → sees the four status groups → ticks the contracts waiting for him → *Review and Sign Selected Contracts* → checks the list of exact versions (contract ID, version, SHA-256) → draws or types his signature → types his name → ticks the authorization → signs them all at once. A document that fails is listed by name with the reason and keeps its status.

## Setup (one time)

1. **Share the artifact.** In the artifact's Share menu:
   - Juan Diaz: **Editor**.
   - Every Claude account employees will use, including shared department accounts: **Contributor**. These accounts must be members of the company's Claude organization (Team or Enterprise plan). Claude treats people outside the organization as view-only, so they can read but cannot sign.
   - Nobody else gets Editor. Editors can read every record.
   - Do not turn on public link sharing.
2. **Designate Juan.** Juan opens the page and clicks *Request signatory role*. HR approves it under **Access codes → Designate as signatory**.
3. **Upload contracts.** HR → Contracts → upload Juan's PDFs from the Drive `CONTRACT` folder. Each file is matched to an employee by the name in its opening paragraph.
4. **Complete each record.** Open each employee, enter the birthdate, check the parsed terms, then **Issue for employee signature**. Issuing creates a personal access code.
5. **Set the Drive folder.** Settings → paste the HR Contracts folder link.
6. **Send each employee their own message** from **Access codes → Copy message** through a private channel. It contains the link, their name and their code; it never contains pay details.

## How privacy is enforced

The page's HTML and scripts are identical for everyone and contain no employee data. All records live in the artifact's database, and Claude's servers apply these access rules before any data reaches a browser:

| Path | Who can read | Who can write |
| --- | --- | --- |
| `public/directory` | everyone signed in (names only) | HR |
| `hr/**` (birthdates, codes, all contracts, signatures, signed PDFs) | HR and Juan | HR and Juan |
| `vault/<id>/d/*` (one employee's contract, pay figures, signed PDF) | whoever has that employee's access code, HR, Juan | HR and Juan |
| `vsign/<id>/d/signature` (that employee's signature and consent) | whoever has the code, HR, Juan | whoever has the code (Contributor accounts) |
| `claims/<account>` (Juan's signatory request) | that account, HR, Juan | that account |
| `activity/<account>` | that person, HR, Juan | that person |
| `signatory/<account>/**` (Juan's batch authorizations) | Juan | Juan |

So an employee who opens developer tools, edits the URL, changes the dropdown, or picks another person's name still receives nothing but their own record: the server returns other employees' documents as if they did not exist. The page has no AI chat, so no assistant can be asked about anyone's pay.

**The access code is the key.** Each employee's records are stored under an identifier derived from their personal access code (12 random letters and numbers, about 59 bits, not based on the birthdate or employee ID). The database cannot list these records, not even for the owner; a record can only be opened by someone who supplies the matching code, and the page checks that the name selected belongs to that code. Codes work on shared department accounts because they do not depend on who is signed in. Anyone holding an employee's code can open that employee's contract, so codes must be handed out privately. HR can replace a code at any time, which makes the old one stop working. Employees cannot change their contract, salary or status: those records accept writes from HR and Juan only.

## Signing records

- **Exact version.** Each uploaded PDF gets a SHA-256 fingerprint. The employee's signature, Juan's batch authorization and the final PDF all record the contract ID, version number and fingerprint. If the contract changes after someone reviews it, signing stops for that document.
- **Employee signature lock.** As soon as HR or Juan has the page open, the employee's signature is copied into the HR record, which the employee cannot write. Any later change the employee makes to their own signature record is ignored.
- **Batch authorization.** Before signing, Juan's authorization (the list of contracts with versions and fingerprints, the consent text and his typed name) is written to his private signatory record. His signature image is applied only to the contracts in that batch and is not kept for reuse.
- **Contract format.** Juan's drafts are re-typeset in the company onboarding-packet layout: 8.5 × 13 in long-bond page, the Equity Track PH header banner on every page, Arial-style type (Liberation Sans), ruled sections, and stacked signature blocks with Signature and Date lines. The wording comes only from Juan's draft. The only additions are the letterhead phone and email lines, the "Signature:" labels and page numbers. When a draft is uploaded, the app reads the formatted PDF back and compares it with the draft character by character; a contract that fails this check cannot be issued. HR can open Juan's original draft next to the formatted version at any time.
- **Final PDF.** The signed PDF is the formatted contract the employee reviewed, unchanged, with both signatures, both dates and a reference footer stamped on. It contains no pay explanation, verification step or activity log. It is stored in the artifact database with its fingerprint and checked against it on every download.
- **File names.** HR copies: `EmployeeCode_FullName_EmploymentContract_YYYY-MM-DD.pdf` (for example `MS-170701_Maria-Santos_EmploymentContract_2026-10-12.pdf`).

## Limits to know about

- **Codes are bearer keys.** Whoever has a code can open and sign that contract. The signature record notes which Claude account was signed in, but on a shared department account that does not identify the person. Hand codes out privately and replace any code that may have leaked.

- **Every signing account must be in the company's Claude organization.** Individual or shared department accounts both work if they have Contributor access. If that is not possible, this artifact cannot collect signatures. The smallest alternative that keeps the same privacy model is a small hosted app with per-employee sign-in and row-level security, such as Supabase (email magic-link sign-in, Postgres row-level security, private storage bucket), or a dedicated e-signature service such as Dropbox Sign or DocuSign, which offer signer authentication, bulk signing and certificates of completion.
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
