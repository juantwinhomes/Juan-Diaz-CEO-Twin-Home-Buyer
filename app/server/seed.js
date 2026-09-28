'use strict';
// Seeds a clearly labelled SYNTHETIC scenario. Every name, address and amount is made up.
// The four entity names come from Juan's brief and are marked "unverified" until confirmed in Setup.
//
// Scenario (September 2026): a house flip (PRJ-THB-0001), a plumbing repipe job (PRJ-PPS-0001), a duplicate
// invoice, a wrong-entity expense, a missing receipt, a lender draw that was funded but not booked, an
// intercompany transfer recorded at the wrong amount, a stale receivable, a vendor bank-detail change,
// a negative cash week, and one entity with stale data.
const fs = require('node:fs');
const path = require('node:path');
const importer = require('./import/importer');
const { runRules } = require('./rules/exceptions');
const { ensureClose, requestPayment, prepareTask } = require('./workflow');
const { nowISO } = require('./lib/util');
const { audit } = require('./audit');

const SAMPLES = path.join(__dirname, '..', 'samples');
const c = d => Math.round(d * 100);

const ENTITIES = [
  { id: 'ENT-THB', name: 'Twin Home Buyer / Equity Track', notes: 'House flips. Confirm legal name and whether Equity Track is a separate entity.' },
  { id: 'ENT-MG1', name: 'Matrix Group One', notes: 'Confirm what this entity does.' },
  { id: 'ENT-PPS', name: 'Peninsula Plumbing Solutions', notes: 'Plumbing jobs.' },
  { id: 'ENT-ETPH', name: 'Equity Track PH', notes: 'Confirm what this entity does and where it operates.' },
];

// Same starter chart for each entity. Replace with each company's real chart of accounts from QuickBooks.
const CHART = [
  ['1000', 'Operating Checking', 'asset', 'bank'], ['1200', 'Accounts Receivable', 'asset', 'ar'],
  ['1310', 'Property Held for Sale - Acquisition', 'asset', 'property'], ['1320', 'Property Held for Sale - Rehab', 'asset', 'property'],
  ['1330', 'Property Held for Sale - Carrying Costs', 'asset', 'property'], ['1500', 'Due From Affiliates', 'asset', 'due_from'],
  ['2000', 'Accounts Payable', 'liability', 'ap'], ['2150', 'Due To Affiliates', 'liability', 'due_to'], ['2500', 'Loans Payable', 'liability', 'loan'],
  ['3000', "Owner's Equity", 'equity', null], ['4000', 'Revenue', 'income', null],
  ['5100', 'Job Materials', 'expense', 'job_cost'], ['5200', 'Job Labor', 'expense', 'job_cost'],
  ['6100', 'Bank Fees', 'expense', null], ['6200', 'Office & Admin', 'expense', null], ['6300', 'Payroll - Overhead', 'expense', 'payroll'],
];

const USERS = [
  { id: 'U-KRISTINE', name: 'Kristine', roles: 'learner,preparer' },
  { id: 'U-REVIEWER', name: 'CPA Reviewer (placeholder)', roles: 'reviewer' },
  { id: 'U-JUAN', name: 'Juan Diaz', roles: 'executive' },
  { id: 'U-ADMIN', name: 'Admin', roles: 'admin' },
];

const POLICIES = [
  ['POL-BASIS', 'Accounting basis', 'Do we keep the books on accrual or cash basis, for each entity?', null],
  ['POL-CAP', 'Capitalizing property costs', 'Are rehab, financing and holding costs on flips added to property cost (inventory) or expensed? What is the threshold?', null],
  ['POL-LOAN', 'Loan fees and interest', 'How are points, lender fees and interest during rehab recorded?', null],
  ['POL-IC', 'Intercompany', 'Every transfer between entities is recorded in both companies the same day as a due-to / due-from, with matching amounts. Balances are matched monthly.', 'Internal control, pending CPA confirmation of settlement terms.'],
  ['POL-APPR', 'Bill approval', 'Bills of $1,000 or more need approval from the property or job owner before payment.', 'Demo value. Replace with the real approval matrix.'],
  ['POL-RCPT', 'Receipts', 'Card and debit expenses of $75 or more need a receipt attached.', 'Demo value. Confirm with the CPA.'],
  ['POL-VBANK', 'Vendor bank changes', 'Bank-detail changes are verified by calling the vendor at the number already on file. A second person approves before any payment.', 'Internal control.'],
  ['POL-SOD', 'Separation of duties', 'The person who prepares or requests something never approves it. No one creates a vendor, changes its bank details and releases payment alone.', 'Internal control.'],
  ['POL-FCST', 'Cash forecast', 'Forecast lines are marked known or estimate. Receivables over 90 days are excluded until collection is confirmed.', 'Internal practice.'],
  ['POL-LENDER', 'Lender reporting', 'Anything sent to a lender is reviewed by the CPA or an authorized signer.', 'Internal control.'],
  ['POL-PAYROLL', 'Payroll controls', 'Who approves payroll, and how are payroll liabilities reconciled?', null],
];

function seed(db, { log = () => {} } = {}) {
  if (db.get('SELECT COUNT(*) AS n FROM entities').n) { log('Database already has data; skipping seed.'); return false; }
  const now = nowISO();
  db.tx(() => {
    for (const u of USERS) db.run('INSERT INTO users(id, name, roles) VALUES (?,?,?)', u.id, u.name, u.roles);
    for (const e of ENTITIES) {
      db.run('INSERT INTO entities(id, name, ledger, verified, synthetic, notes) VALUES (?,?,?,0,1,?)', e.id, e.name, 'QuickBooks Online', e.notes);
      for (const [num, name, type, sub] of CHART) db.run('INSERT INTO accounts(id, entity_id, number, name, type, subtype) VALUES (?,?,?,?,?,?)', `${e.id}-${num}`, e.id, num, name, type, sub);
    }
    const bank = (id, ent, name, last4, openDate, open) =>
      db.run('INSERT INTO bank_accounts(id, entity_id, name, kind, last4, gl_account_id, opening_date, opening_balance_cents) VALUES (?,?,?,?,?,?,?,?)', id, ent, name, 'bank', last4, `${ent}-1000`, openDate, c(open));
    bank('BA-THB-OP', 'ENT-THB', 'THB Operating ••0001', '0001', '2026-08-31', 52000);
    bank('BA-MG1-OP', 'ENT-MG1', 'MG1 Operating ••0002', '0002', '2026-08-31', 35000);
    bank('BA-PPS-OP', 'ENT-PPS', 'PPS Operating ••0003', '0003', '2026-08-31', 14000);
    bank('BA-ETPH-OP', 'ENT-ETPH', 'ETPH Operating ••0004', '0004', '2026-07-31', 2500);

    db.run(`INSERT INTO projects(id, entity_id, name, address, kind, acquisition_date, lender, status, expected_sale_cents, synthetic)
            VALUES ('PRJ-THB-0001','ENT-THB','Synthetic flip','101 Sample Lane (fictional)','flip','2026-07-15','Sample Capital Lending','rehab',?,1)`, c(385000));
    db.run(`INSERT INTO projects(id, entity_id, name, address, kind, status, contract_value_cents, synthetic)
            VALUES ('PRJ-PPS-0001','ENT-PPS','Synthetic repipe job','22 Example Court (fictional)','plumbing_job','in progress',?,1)`, c(18000));
    const budget = (p, cat, amt) => db.run('INSERT INTO budgets(project_id, category, amount_cents) VALUES (?,?,?)', p, cat, c(amt));
    [['acquisition', 240000], ['rehab', 62000], ['financing', 11500], ['holding', 4300], ['closing', 7700], ['commission', 19250]].forEach(([k, v]) => budget('PRJ-THB-0001', k, v));
    [['materials', 6000], ['labor', 5500]].forEach(([k, v]) => budget('PRJ-PPS-0001', k, v));

    const vendor = (id, name, extra = {}) => db.run('INSERT INTO vendors(id, name, bank_last4, bank_changed_at, created_by, created_at) VALUES (?,?,?,?,?,?)',
      id, name, extra.last4 || null, extra.changed || null, 'U-ADMIN', now);
    vendor('VEN-ELECTRIC', 'Sample Electric LLC', { last4: '7781', changed: '2026-09-20T15:04:00Z' });
    vendor('VEN-COUNTERTOP', 'Sample Countertop Co');

    db.run(`INSERT INTO commitments(id, project_id, vendor_id, category, amount_cents, billed_cents, description) VALUES ('CMT-0001','PRJ-THB-0001','VEN-COUNTERTOP','rehab',?,0,'SYNTHETIC - Quartz countertops, signed contract 9/21, install ~10/23')`, c(9500));
    const fc = (p, cat, amt, why) => db.run('INSERT INTO forecasts(project_id, category, amount_cents, assumption, estimated_by, estimated_at) VALUES (?,?,?,?,?,?)', p, cat, c(amt), why, 'U-KRISTINE', now);
    fc('PRJ-THB-0001', 'rehab', 12000, 'Punch list, flooring labor and final clean, per site-lead walk-through on 9/24.');
    fc('PRJ-THB-0001', 'financing', 5200, 'Interest through a Nov 20 sale at the current balance.');
    fc('PRJ-THB-0001', 'holding', 1560, 'Tax, insurance and utilities, about $520/month to Nov 20.');
    fc('PRJ-THB-0001', 'closing', 7700, 'Seller closing costs at 2% of the expected $385,000 price.');
    fc('PRJ-THB-0001', 'commission', 19250, 'Agent commission at 5% of the expected price.');
    fc('PRJ-PPS-0001', 'materials', 800, 'Trim-out fixtures per job estimate.');
    fc('PRJ-PPS-0001', 'labor', 2000, 'About 40 more labor hours to finish.');

    db.run(`INSERT INTO loans(id, entity_id, project_id, lender, commitment_cents, opening_balance_cents, lender_statement_balance_cents, lender_statement_date, rate_bps, maturity)
            VALUES ('LN-THB-0001','ENT-THB','PRJ-THB-0001','Sample Capital Lending',?,?,?,'2026-09-30',1750,'2027-07-15')`, c(300000), c(192000), c(230000));
    const draw = (id, n, sub, subDate, appr, funded, fDate, exp) => db.run(`INSERT INTO draws(id, loan_id, project_id, number, submitted_date, submitted_cents, approved_cents, holdback_cents, funded_cents, funded_date, expected_date)
            VALUES (?, 'LN-THB-0001', 'PRJ-THB-0001', ?, ?, ?, ?, 0, ?, ?, ?)`, id, n, subDate, c(sub), appr == null ? null : c(appr), funded == null ? null : c(funded), fDate, exp);
    draw('DRW-0001', 1, 20000, '2026-08-05', 20000, 20000, '2026-08-15', '2026-08-15');
    draw('DRW-0002', 2, 20000, '2026-09-10', 18000, 18000, '2026-09-26', '2026-09-19');
    draw('DRW-0003', 3, 25000, null, null, null, null, '2026-10-20');

    const ca = (id, ent, label, amt, freq, start, end, why) => db.run('INSERT INTO cash_assumptions(id, entity_id, label, amount_cents, frequency, start_date, end_date, assumption, owner) VALUES (?,?,?,?,?,?,?,?,?)',
      id, ent, label, c(amt), freq, start, end, why, 'U-KRISTINE');
    ca('CA-01', 'ENT-THB', 'Loan interest', -3100, 'monthly', '2026-10-18', '2026-11-18', 'Interest-only payment per loan terms; confirm with lender statement.');
    ca('CA-02', 'ENT-THB', 'Remaining rehab (forecast to complete)', -3000, 'weekly', '2026-10-12', '2026-11-08', '$12,000 forecast to complete spread over 4 weeks.');
    ca('CA-03', 'ENT-THB', 'Countertop contract', -9500, 'once', '2026-10-30', null, 'Signed contract; billed at install about 10/23, paid net 7.');
    ca('CA-04', 'ENT-THB', 'Holding costs', -520, 'monthly', '2026-10-15', '2026-11-15', 'Tax, insurance, utilities.');
    ca('CA-05', 'ENT-THB', 'Sale of PRJ-THB-0001, net', 103050, 'once', '2026-11-20', null, 'Expected close Nov 20 at $385,000 less 5% commission, 2% closing and a $255,000 loan payoff. Not under contract.');
    ca('CA-06', 'ENT-MG1', 'Office rent', -1200, 'monthly', '2026-10-10', null, 'Lease.');
    ca('CA-07', 'ENT-MG1', 'Management fee', 4800, 'monthly', '2026-10-25', null, 'Same as September.');
    ca('CA-08', 'ENT-PPS', 'Truck, fuel and small tools', -600, 'weekly', '2026-09-28', null, 'Average of the last 8 weeks.');
    ca('CA-09', 'ENT-PPS', 'Payroll', -3800, 'biweekly', '2026-10-10', null, 'Same crew and hours as September.');
    ca('CA-10', 'ENT-PPS', 'New job deposits', 3000, 'biweekly', '2026-11-06', null, 'Two new jobs a month at the usual deposit. Not signed yet.');

    for (const [id, title, q, decision] of POLICIES) {
      db.run('INSERT INTO policies(id, title, question, decision, decided_by, decided_at, status) VALUES (?,?,?,?,?,?,?)',
        id, title, q, decision, decision ? 'U-ADMIN' : null, decision ? now : null, decision ? 'decided' : 'pending');
    }

    db.setSetting('as_of_date', '2026-09-30');
    db.setSetting('demo_mode', true);
    db.setSetting('default_assignee', 'U-KRISTINE');
    db.setSetting('collection_lag_days', 14);
    db.setSetting('stale_after_days', 7);
    db.setSetting('receipt_required_over_cents', 7500);
    db.setSetting('approval_required_over_cents', 100000);
    db.setSetting('ai', { approved: false });
    db.setSetting('setup', {
      entities: null, ledger: 'QuickBooks Online', qbo_plan: null, exports: null, project_ids: null,
      payment_approver: null, journal_approver: null, close_reviewer: null, cpa_reviewer: null,
      data_sources: null, approved_ai_tools: null, pilot: null,
    });
  });

  // Import the sample exports through the real importer so every record keeps its file and row.
  const kristine = db.get(`SELECT * FROM users WHERE id = 'U-KRISTINE'`);
  const imp = (file, kind, opts = {}) => {
    const buffer = fs.readFileSync(path.join(SAMPLES, file));
    const p = importer.preview(db, kristine, { kind, filename: file, buffer, synthetic: true, retrievedAt: '2026-09-30T18:00:00Z', ...opts });
    if (!p.summary.can_commit) throw new Error(`Sample ${file} did not validate: ${JSON.stringify(p.summary.blocking)}`);
    importer.commit(db, kristine, p.batch_id);
    log(`Imported ${file}: ${p.summary.row_count} rows, ${p.summary.warning_count} warnings`);
  };
  imp('synthetic-thb-ledger-2026-09.csv', 'ledger', { entityId: 'ENT-THB' });
  imp('synthetic-thb-ap-bills-2026-09.csv', 'ap_bills', { entityId: 'ENT-THB', controlTotalCents: c(50860), expectedRows: 10 });
  imp('synthetic-thb-bank-statement-2026-09.csv', 'bank_statement', {
    bankAccountId: 'BA-THB-OP', statement: { opening_cents: c(52000), closing_cents: c(48250), period_start: '2026-09-01', period_end: '2026-09-30' },
  });
  imp('synthetic-mg1-ledger-2026-09.csv', 'ledger', { entityId: 'ENT-MG1' });
  imp('synthetic-pps-ledger-2026-09.csv', 'ledger', { entityId: 'ENT-PPS' });
  imp('synthetic-etph-ledger-2026-08.csv', 'ledger', { entityId: 'ENT-ETPH', retrievedAt: '2026-08-31T18:00:00Z' });

  // A payment request Kristine made for the electrician whose bank details just changed.
  const bill = db.get(`SELECT t.id FROM transactions t JOIN vendors v ON v.id = t.vendor_id WHERE v.name = 'Sample Electric LLC' AND t.type = 'bill'`);
  requestPayment(db, kristine, bill.id);

  // September close for the pilot entity, with the first step already prepared.
  ensureClose(db, 'ENT-THB', '2026-09');
  prepareTask(db, kristine, 'CLS-ENT-THB-2026-09-bank_feed', 'Bank feed cleared 9/30; Uncategorized and Ask My Accountant are $0.00 (synthetic).');

  const r = runRules(db, null);
  audit(db, null, 'seed.synthetic', 'database', null, { note: 'Synthetic demo data loaded', ...r });
  log(`Rules: ${r.findings} findings, ${r.created} issues created.`);
  return true;
}

module.exports = { seed };

if (require.main === module) {
  const { openDb } = require('./db');
  const db = openDb();
  seed(db, { log: console.log });
}
