'use strict';
// Pilot acceptance checks from Juan's brief, run against the synthetic scenario.
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshDb, user, sample } = require('./helpers');
const importer = require('../server/import/importer');
const D = require('../server/reports/data');
const W = require('../server/workflow');
const { buildBrief } = require('../server/reports/brief');
const { runRules } = require('../server/rules/exceptions');

const issuesOf = (db, type) => db.all('SELECT * FROM issues WHERE type = ?', type).map(i => ({ ...i, evidence: JSON.parse(i.evidence_json) }));

test('1. Demo import catches a duplicate invoice and a wrong-entity expense, keeping source row links', () => {
  const db = freshDb();
  const apDoc = db.get(`SELECT * FROM source_documents WHERE filename = 'synthetic-thb-ap-bills-2026-09.csv'`);

  const [dup] = issuesOf(db, 'duplicate_invoice');
  assert.ok(dup, 'duplicate invoice flagged');
  assert.match(dup.title, /INV-1001 \/ INV1001/);
  const lines = dup.evidence.map(e => e.ref.row).sort();
  assert.deepEqual(lines, [2, 5], 'links to CSV lines 2 and 5 (header is line 1)');
  assert.ok(dup.evidence.every(e => e.ref.document_id === apDoc.id && e.ref.filename === apDoc.filename));

  const [wrong] = issuesOf(db, 'wrong_entity');
  assert.ok(wrong, 'wrong-entity expense flagged');
  assert.equal(wrong.entity_id, 'ENT-MG1');
  assert.equal(wrong.project_id, 'PRJ-THB-0001');
  assert.equal(wrong.evidence[0].ref.row, 10);
  assert.equal(wrong.evidence[0].ref.document_id, apDoc.id);

  // The batch is committed but not "ready" while those questions are open.
  const batch = db.get('SELECT * FROM import_batches WHERE document_id = ?', apDoc.id);
  assert.equal(batch.status, 'committed');
  assert.equal(batch.ready, 0);

  // The preview itself shows both problems before anything is imported (re-export of the same bills).
  const reexport = Buffer.concat([sample('synthetic-thb-ap-bills-2026-09.csv'), Buffer.from('\n')]);
  const p = importer.preview(db, user(db, 'U-KRISTINE'), { kind: 'ap_bills', filename: 'reexport.csv', buffer: reexport, entityId: 'ENT-THB' });
  assert.ok(p.summary.duplicate_count >= 10, 'every re-exported bill matches one already in the books');
  assert.equal(p.summary.wrong_entity_count, 1);
});

test('1b. The exact same file cannot be imported twice', () => {
  const db = freshDb();
  assert.throws(() => importer.preview(db, user(db, 'U-KRISTINE'), { kind: 'ap_bills', filename: 'again.csv', buffer: sample('synthetic-thb-ap-bills-2026-09.csv'), entityId: 'ENT-THB' }),
    e => e.status === 409 && /already imported/.test(e.message));
});

test('1c. Control-total mismatch, missing statement rows and bad rows block commit', () => {
  const db = freshDb();
  const k = user(db, 'U-KRISTINE');
  const csv = Buffer.from('Date,Type,Entity,Account,Bank Account,Amount\n2026-09-02,expense,ENT-THB,6200,BA-THB-OP,-10.00\n');
  const p = importer.preview(db, k, { kind: 'ledger', filename: 'x.csv', buffer: csv, controlTotalCents: -2000, expectedRows: 2 });
  assert.equal(p.summary.can_commit, false);
  assert.ok(p.summary.blocking.some(b => /control total/.test(b)));
  assert.ok(p.summary.blocking.some(b => /Expected 2 rows/.test(b)));
  assert.throws(() => importer.commit(db, k, p.batch_id), e => e.status === 409);

  // Statement with a row removed no longer ties to the closing balance.
  const text = sample('synthetic-thb-bank-statement-2026-09.csv').toString().split('\n').filter(l => !l.includes('MONTHLY SERVICE FEE')).join('\n');
  const s = importer.preview(db, k, { kind: 'bank_statement', filename: 'short.csv', buffer: Buffer.from(text), bankAccountId: 'BA-THB-OP', statement: { opening_cents: 5200000, closing_cents: 4825000 } });
  assert.equal(s.summary.can_commit, false);
  assert.ok(s.summary.blocking.some(b => /Pages or rows may be missing/.test(b)));

  const bad = importer.preview(db, k, { kind: 'ledger', filename: 'bad.csv', buffer: Buffer.from('Date,Type,Entity,Account,Amount,Project\n2026-13-40,expense,ENT-NOPE,9999,abc,PRJ-NONE\n') });
  assert.equal(bad.summary.error_rows, 1);
  assert.ok(bad.rows[0].errors.length >= 3);
});

test('2. Reconciliation finds the unmatched bank items and cannot pass while anything is unexplained', () => {
  const db = freshDb();
  const k = user(db, 'U-KRISTINE'), rev = user(db, 'U-REVIEWER');
  const st = db.get('SELECT * FROM bank_statements');
  let r = D.reconciliationFor(db, st.id);

  assert.equal(r.statement.ties, true);
  assert.equal(r.ledger_balance_cents, 2802500);
  assert.equal(r.adjusted_bank_cents, 4600000);       // 48,250 - 3,400 + 1,150
  assert.equal(r.adjusted_book_cents, 4600000);       // 28,025 + 18,000 - 25
  assert.equal(r.unexplained_difference_cents, 0);
  assert.deepEqual(r.bank_only.map(i => i.amount_cents).sort((a, b) => a - b), [-2500, 1800000]);
  assert.deepEqual(r.outstanding.map(i => i.amount_cents).sort((a, b) => a - b), [-340000, 115000]);
  assert.equal(r.reconciled, false, 'zero difference is not enough: items are unexplained');
  assert.equal(issuesOf(db, 'unmatched_bank_item').length, 2);
  assert.throws(() => W.prepareRecon(db, k, st.id), e => e.status === 409);

  // Explaining a bank-only item as "needs entry" still doesn't pass: the books must be fixed.
  for (const i of r.bank_only) W.explainReconItem(db, k, st.id, i.item_key, 'Real bank item; record in QuickBooks.', 'needs_entry');
  for (const i of r.outstanding) W.explainReconItem(db, k, st.id, i.item_key, 'Cleared the bank in early October.', 'outstanding');
  r = D.reconciliationFor(db, st.id);
  assert.equal(r.reconciled, false);
  assert.ok(r.reasons.some(x => /still need to be recorded/.test(x)));
  assert.throws(() => W.explainReconItem(db, k, st.id, r.bank_only[0].item_key, 'try to hide it', 'outstanding'), e => e.status === 400);

  // Record the entries in the ledger (re-export from QuickBooks) and it reconciles.
  const p = importer.preview(db, k, { kind: 'ledger', filename: 'adj.csv', buffer: sample('synthetic-thb-ledger-adjustments-2026-09.csv'), entityId: 'ENT-THB' });
  importer.commit(db, k, p.batch_id);
  r = D.reconciliationFor(db, st.id);
  assert.equal(r.bank_only.length, 0);
  assert.equal(r.ledger_balance_cents, 4600000);
  assert.equal(r.reconciled, true);

  W.prepareRecon(db, k, st.id);
  assert.throws(() => W.reviewRecon(db, k, st.id), e => e.status === 403, 'preparer cannot review her own work');
  W.reviewRecon(db, rev, st.id);
  assert.equal(db.get('SELECT status FROM reconciliations WHERE statement_id = ?', st.id).status, 'reviewed');
});

test('2b. A reconciliation with an unexplained difference never passes, even with every item explained', () => {
  const { reconcile } = require('../server/calc/reconcile');
  // Books started $5.00 higher than the bank: every line matches, yet $5.00 is unexplained.
  const r = reconcile({
    statement: { opening_cents: 0, closing_cents: 10000, period_start: '2026-09-01', period_end: '2026-09-30' },
    ledgerOpeningCents: 500,
    ledgerItems: [{ id: 'L1', date: '2026-09-05', amount_cents: 10000 }],
    bankLines: [{ id: 'B1', date: '2026-09-05', amount_cents: 10000 }],
  });
  assert.equal(r.matched.length, 1);
  assert.equal(r.unexplained_difference_cents, -500);
  assert.equal(r.reconciled, false);
  assert.ok(r.reasons.some(x => /Unexplained difference/.test(x)));
});

test('3. Project report ties to transaction detail and labels actual, committed and forecast', () => {
  const db = freshDb();
  const r = D.projectReportFor(db, 'PRJ-THB-0001');
  assert.equal(r.tie_out.ties, true);
  const lineSum = r.lines.reduce((s, l) => s + l.amount_cents, 0);
  assert.equal(lineSum, r.totals.actual_to_date_cents);
  assert.ok(r.lines.every(l => ['actual_paid', 'incurred_unpaid'].includes(l.status) && l.source.document_id && l.source.row));

  const rehab = r.rows.find(x => x.category === 'rehab');
  assert.equal(rehab.actual_paid_cents, 3296500);      // paid bills 32,840 + debit card 1,275 - refund 1,150
  assert.equal(rehab.incurred_unpaid_cents, 1761000);  // 6,400 + 7,250 + 2,100 + 1,860 unpaid bills
  assert.equal(rehab.committed_cents, 950000);
  assert.equal(rehab.forecast_remaining_cents, 1200000);
  assert.equal(rehab.projected_total_cents, 7207500);
  assert.equal(rehab.flagged_cents, 850000, 'possible duplicate 6,400 + wrong-entity 2,100 are shown as under review');

  // Profit = 385,000 - 356,245 projected cost.
  assert.equal(r.bridge.proceeds_basis, 'estimate');
  assert.equal(r.bridge.profit_projected_cents, 2875500);
  assert.equal(r.bridge.profit_projected_excluding_flagged_cents, 2875500 + 850000);
  assert.equal(r.sensitivity.length, 3);
});

test('4. No learner can approve her own payment, journal entry or close', () => {
  const db = freshDb();
  const k = user(db, 'U-KRISTINE'), rev = user(db, 'U-REVIEWER'), juan = user(db, 'U-JUAN');
  const pay = db.get('SELECT * FROM payments');
  assert.throws(() => W.decidePayment(db, k, pay.id, 'approved'), e => e.status === 403);

  const je = W.proposeJournal(db, k, { entity_id: 'ENT-THB', date: '2026-09-30', memo: 'Record bank fee', source_ref: 'bank statement line 11',
    lines: [{ account_id: 'ENT-THB-6100', debit_cents: 2500 }, { account_id: 'ENT-THB-1000', credit_cents: 2500 }] });
  assert.throws(() => W.decideJournal(db, k, je.id, 'approved'), e => e.status === 403);
  assert.throws(() => W.signOffClose(db, k, 'ENT-THB', '2026-09'), e => e.status === 403);
  assert.throws(() => W.reviewTask(db, k, 'CLS-ENT-THB-2026-09-bank_feed'), e => e.status === 403);

  // A reviewer can approve the journal proposal (it is still only a proposal; nothing posts to QuickBooks).
  assert.equal(W.decideJournal(db, rev, je.id, 'approved').status, 'approved');
  assert.throws(() => W.proposeJournal(db, k, { entity_id: 'ENT-THB', date: '2026-09-30', memo: 'x', source_ref: 'y', lines: [{ account_id: 'ENT-THB-6100', debit_cents: 100 }, { account_id: 'ENT-THB-1000', credit_cents: 99 }] }), e => e.status === 400, 'unbalanced entry rejected');

  // Even Juan can't approve a payment to a vendor whose bank details changed until someone verifies by call-back.
  assert.throws(() => W.decidePayment(db, juan, pay.id, 'approved'), e => e.status === 409 && /bank details changed/.test(e.message));
  assert.throws(() => W.verifyVendorBank(db, k, 'VEN-ELECTRIC', 'Called the number on file'), e => e.status === 403);
  W.verifyVendorBank(db, rev, 'VEN-ELECTRIC', 'Called Sample Electric at the number on file; controller confirmed new account.');
  assert.equal(W.decidePayment(db, juan, pay.id, 'approved').status, 'approved');
  assert.ok(db.get(`SELECT * FROM approvals WHERE object_type = 'payment' AND approver_id = 'U-JUAN'`));
});

test('5. The brief refuses a number without a source and labels stale or incomplete data', () => {
  const db = freshDb();
  const { claim, enforceCitations } = require('../server/reports/brief');
  const refused = claim({ label: 'Cash', value_cents: 123456, citations: [] });
  assert.equal(refused.value_cents, null);
  assert.equal(refused.basis, 'unknown');
  assert.match(refused.text, /Unknown/);
  const b0 = enforceCitations({ sections: [{ items: [{ label: 'x', value_cents: 5, citations: [], warnings: [] }] }] });
  assert.equal(b0.sections[0].items[0].value_cents, null);

  const b = buildBrief(db);
  for (const s of b.sections) for (const i of s.items) if (i.value_cents !== null) assert.ok(i.citations.length, `${i.label} has a source`);
  const etph = b.sections[0].items.find(i => i.label.startsWith('Equity Track PH'));
  assert.ok(etph.warnings.some(w => /30 days old/.test(w)), 'stale entity is labelled');
  assert.equal(b.completeness.complete, false);
  assert.equal(b.status, 'draft');
  assert.equal(b.sections.length, 7);
  assert.equal(b.decisions.length, 3);

  // Draft until a reviewer (not the preparer, not a learner) marks the same numbers reviewed.
  const k = user(db, 'U-KRISTINE'), rev = user(db, 'U-REVIEWER');
  const v = W.saveReportVersion(db, k, 'brief', null, b);
  assert.throws(() => W.reviewReportVersion(db, k, v.id), e => e.status === 403);
  W.reviewReportVersion(db, rev, v.id);
  assert.equal(buildBrief(db).status, 'reviewed');
});

test('6. Juan sees the top three issues with owner, amount, evidence and action', () => {
  const db = freshDb();
  const b = buildBrief(db);
  assert.equal(b.top_issues.length, 3);
  for (const i of b.top_issues) {
    assert.ok(i.owner && i.owner !== 'Unassigned');
    assert.ok(i.amount_cents > 0);
    assert.ok(i.evidence.length);
    assert.ok(i.action);
    assert.match(i.link, /^#\/exceptions\//);
  }
  assert.equal(new Set(b.top_issues.map(i => `${i.entity_id}|${i.amount_cents}`)).size, 3, 'no root cause repeated');
});

test('7. A reviewer can reproduce the calculations and sign off a close', () => {
  const db = freshDb();
  const k = user(db, 'U-KRISTINE'), rev = user(db, 'U-REVIEWER');
  const st = db.get('SELECT * FROM bank_statements');

  // Kristine fixes the books: record the draw and fee, correct the intercompany amount in Matrix Group One.
  importer.commit(db, k, importer.preview(db, k, { kind: 'ledger', filename: 'adj.csv', buffer: sample('synthetic-thb-ledger-adjustments-2026-09.csv'), entityId: 'ENT-THB' }).batch_id);
  const mg1fix = Buffer.from('Date,Type,Entity,Account,Amount,Memo,Counterparty Entity\n2026-09-05,journal,ENT-MG1,1500,1200.00,Correct transfer to THB to 12500 per bank,ENT-THB\n');
  importer.commit(db, k, importer.preview(db, k, { kind: 'ledger', filename: 'mg1-fix.csv', buffer: mg1fix }).batch_id);
  runRules(db, k.id);
  const r = D.reconciliationFor(db, st.id);
  for (const i of r.outstanding) W.explainReconItem(db, k, st.id, i.item_key, 'Cleared the bank in early October.', 'outstanding');

  // Reviewer reproduces the reconciliation from the source rows.
  const rec = D.reconciliationFor(db, st.id);
  const bankSum = rec.matched.reduce((s, m) => s + m.bank.amount_cents, 0) + rec.bank_only.reduce((s, b) => s + b.amount_cents, 0);
  assert.equal(st.opening_cents + bankSum, st.closing_cents);
  assert.equal(rec.ledger_balance_cents, 5200000 + [...rec.matched.map(m => m.ledger), ...rec.outstanding].reduce((s, l) => s + l.amount_cents, 0));
  assert.equal(rec.reconciled, true);
  W.prepareRecon(db, k, st.id);
  W.reviewRecon(db, rev, st.id);
  assert.equal(D.intercompanyFor(db).all_match, true);
  assert.equal(D.drawsFor(db).loans[0].difference_cents, 0);

  // Resolve every open THB high-severity exception with evidence.
  for (const i of db.all(`SELECT * FROM issues WHERE entity_id = 'ENT-THB' AND severity = 'high' AND status != 'resolved'`)) {
    assert.throws(() => W.updateIssue(db, k, i.id, { status: 'resolved' }), e => e.status === 400, 'resolving needs a written conclusion');
    W.updateIssue(db, k, i.id, { status: 'resolved', human_conclusion: `Checked source rows; resolved in QuickBooks (${i.type}).` });
  }

  const s0 = W.closeStatus(db, 'ENT-THB', '2026-09');
  for (const t of s0.tasks.filter(t => !t.prepared_by)) W.prepareTask(db, k, t.id, 'Workpaper saved in the close folder (synthetic).');
  assert.throws(() => W.signOffClose(db, rev, 'ENT-THB', '2026-09'), e => e.status === 409, 'not reviewed yet');
  for (const t of W.closeStatus(db, 'ENT-THB', '2026-09').tasks) W.reviewTask(db, rev, t.id, 'Agreed to support.');
  const done = W.signOffClose(db, rev, 'ENT-THB', '2026-09', 'September close reviewed.');
  assert.equal(done.close.status, 'closed');
  assert.equal(done.close.signed_off_by, 'U-REVIEWER');
  assert.ok(db.get(`SELECT * FROM audit_events WHERE action = 'close.signed_off'`));
});

test('Every import, mapping change, disposition and sign-off writes an audit event', () => {
  const db = freshDb();
  const k = user(db, 'U-KRISTINE');
  const csv = Buffer.from('When,Kind,Co,Acct,Amt\n2026-09-02,expense,ENT-THB,6200,-10.00\n');
  const p = importer.preview(db, k, { kind: 'ledger', filename: 'odd-headers.csv', buffer: csv });
  assert.equal(p.summary.can_commit, false, 'unmapped required columns block');
  const p2 = importer.preview(db, k, { kind: 'ledger', filename: 'odd-headers.csv', buffer: csv, mapping: { date: 'When', type: 'Kind', entity: 'Co', account: 'Acct', amount: 'Amt' } });
  assert.equal(p2.batch_id, p.batch_id);
  assert.equal(p2.summary.can_commit, true);
  importer.commit(db, k, p2.batch_id);
  const iss = db.get(`SELECT * FROM issues WHERE type = 'missing_receipt'`);
  W.updateIssue(db, k, iss.id, { status: 'waiting_on_owner', human_conclusion: 'Asked the cardholder for the receipt.' });
  const actions = db.all('SELECT action FROM audit_events').map(a => a.action);
  for (const a of ['import.preview', 'import.mapping_changed', 'import.commit', 'issue.disposition', 'document.stored', 'rules.run']) assert.ok(actions.includes(a), a);
});
