'use strict';
// Human workflow: issue dispositions, reconciliation sign-off, month-end close, payment and journal approvals,
// vendor bank verification, report review and training sign-off. Every action is permission-checked,
// separation-of-duties checked, and audited. Nothing here writes to QuickBooks.
const auth = require('./auth');
const D = require('./reports/data');
const { audit } = require('./audit');
const { asOfDate } = require('./db');
const { newId, nowISO, fmt, HttpError, sha256 } = require('./lib/util');

// ---------------- Issues ----------------
const DISPOSITIONS = ['open', 'waiting_on_owner', 'escalated', 'resolved'];

function updateIssue(db, user, id, patch) {
  auth.require(user, 'issue.work');
  const issue = db.get('SELECT * FROM issues WHERE id = ?', id);
  if (!issue) throw new HttpError(404, 'Issue not found.');
  const changes = {};
  if (patch.status !== undefined) {
    if (!DISPOSITIONS.includes(patch.status)) throw new HttpError(400, `Status must be one of ${DISPOSITIONS.join(', ')}.`);
    const note = (patch.human_conclusion ?? issue.human_conclusion ?? '').trim();
    if (patch.status === 'resolved' && note.length < 10) {
      throw new HttpError(400, 'To resolve, write what you found and the evidence (at least a sentence).');
    }
    if (['waiting_on_owner', 'escalated'].includes(patch.status) && !(patch.human_conclusion || '').trim()) {
      throw new HttpError(400, 'Say who you are waiting on or why you escalated.');
    }
    changes.status = patch.status;
    changes.disposition_by = user.id;
    changes.disposition_at = nowISO();
  }
  for (const k of ['human_conclusion', 'ai_hypothesis', 'assignee_id', 'due_date']) if (patch[k] !== undefined) changes[k] = patch[k] || null;
  if (!Object.keys(changes).length) return issue;
  const cols = Object.keys(changes);
  db.run(`UPDATE issues SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map(c => changes[c]), id);
  audit(db, user.id, patch.status ? 'issue.disposition' : 'issue.update', 'issue', id, { from: issue.status, ...changes });
  return db.get('SELECT * FROM issues WHERE id = ?', id);
}

// ---------------- Reconciliation ----------------
function explainReconItem(db, user, statementId, itemKey, explanation, treatment) {
  auth.require(user, 'recon.prepare');
  if (!explanation || explanation.trim().length < 5) throw new HttpError(400, 'Write an explanation for this item.');
  if (!['outstanding', 'needs_entry', 'error_to_fix'].includes(treatment)) throw new HttpError(400, 'Choose a treatment.');
  const rec = D.reconciliationFor(db, statementId);
  if (!rec) throw new HttpError(404, 'Statement not found.');
  const item = [...rec.outstanding, ...rec.bank_only].find(i => i.item_key === itemKey);
  if (!item) throw new HttpError(404, 'That item is not unmatched on this statement.');
  if (item.side === 'bank' && treatment === 'outstanding') {
    throw new HttpError(400, 'A bank-only item already cleared the bank. It needs a ledger entry, not "outstanding".');
  }
  db.run(`INSERT INTO recon_explanations(statement_id, item_key, explanation, treatment, explained_by, explained_at) VALUES (?,?,?,?,?,?)
          ON CONFLICT(statement_id, item_key) DO UPDATE SET explanation = excluded.explanation, treatment = excluded.treatment,
          explained_by = excluded.explained_by, explained_at = excluded.explained_at`, statementId, itemKey, explanation.trim(), treatment, user.id, nowISO());
  audit(db, user.id, 'recon.explain', 'bank_statement', statementId, { item_key: itemKey, treatment, explanation });
  return D.reconciliationFor(db, statementId);
}

function prepareRecon(db, user, statementId) {
  auth.require(user, 'recon.prepare');
  const rec = D.reconciliationFor(db, statementId);
  if (!rec) throw new HttpError(404, 'Statement not found.');
  if (!rec.reconciled) throw new HttpError(409, 'This account is not reconciled yet.', rec.reasons);
  const snapshot = JSON.stringify({ ...rec, workpaper: undefined });
  db.run(`INSERT INTO reconciliations(id, statement_id, status, result_json, prepared_by, prepared_at) VALUES (?,?, 'prepared', ?,?,?)
          ON CONFLICT(statement_id) DO UPDATE SET status = 'prepared', result_json = excluded.result_json, prepared_by = excluded.prepared_by,
          prepared_at = excluded.prepared_at, reviewed_by = NULL, reviewed_at = NULL`, newId('REC'), statementId, snapshot, user.id, nowISO());
  audit(db, user.id, 'recon.prepare', 'bank_statement', statementId, { adjusted_bank_cents: rec.adjusted_bank_cents, adjusted_book_cents: rec.adjusted_book_cents });
  return D.reconciliationFor(db, statementId);
}

function reviewRecon(db, user, statementId) {
  auth.require(user, 'recon.review');
  const w = db.get('SELECT * FROM reconciliations WHERE statement_id = ?', statementId);
  if (!w || w.status !== 'prepared') throw new HttpError(409, 'The preparer must prepare this reconciliation first.');
  auth.requireIndependent(user, [w.prepared_by], 'reconciliation');
  const rec = D.reconciliationFor(db, statementId);
  if (!rec.reconciled) throw new HttpError(409, 'The data changed since it was prepared and it no longer reconciles.', rec.reasons);
  db.run(`UPDATE reconciliations SET status = 'reviewed', reviewed_by = ?, reviewed_at = ? WHERE id = ?`, user.id, nowISO(), w.id);
  audit(db, user.id, 'recon.review', 'bank_statement', statementId, {});
  return D.reconciliationFor(db, statementId);
}

// ---------------- Month-end close ----------------
const CLOSE_TEMPLATE = [
  { key: 'bank_feed', title: 'Clear the bank feed and the Uncategorized / Ask My Accountant accounts' },
  { key: 'bank_recon', title: 'Reconcile every bank and card account to the statement', auto: true },
  { key: 'loan_recon', title: 'Tie every loan balance to the lender statement', auto: true },
  { key: 'accruals', title: 'Record accruals for work done but not yet billed' },
  { key: 'intercompany', title: 'Match intercompany balances with each affiliate', auto: true },
  { key: 'ap_ar', title: 'Review A/P and A/R aging for errors and stale items' },
  { key: 'payroll', title: 'Reconcile payroll liabilities to payroll reports' },
  { key: 'exceptions', title: 'No open high-severity exceptions for this entity', auto: true },
  { key: 'pl_review', title: 'Review the P&L against last month and budget; explain big changes' },
];

function ensureClose(db, entityId, period) {
  let c = db.get('SELECT * FROM close_periods WHERE entity_id = ? AND period = ?', entityId, period);
  if (!c) {
    const id = `CLS-${entityId}-${period}`;
    db.run('INSERT INTO close_periods(id, entity_id, period) VALUES (?,?,?)', id, entityId, period);
    CLOSE_TEMPLATE.forEach((t, i) => db.run('INSERT INTO close_tasks(id, close_id, key, title, sort) VALUES (?,?,?,?,?)', `${id}-${t.key}`, id, t.key, t.title, i));
    c = db.get('SELECT * FROM close_periods WHERE id = ?', id);
  }
  return c;
}

function autoCheck(db, entityId, period, key) {
  const periodEnd = `${period}-31`;
  if (key === 'bank_recon') {
    const banks = db.all(`SELECT * FROM bank_accounts WHERE entity_id = ? AND kind IN ('bank','card')`, entityId);
    const problems = [];
    for (const b of banks) {
      const st = db.get(`SELECT * FROM bank_statements WHERE bank_account_id = ? AND substr(period_end, 1, 7) = ? ORDER BY period_end DESC LIMIT 1`, b.id, period);
      if (!st) { problems.push(`${b.name}: no statement imported for ${period}.`); continue; }
      const w = db.get('SELECT * FROM reconciliations WHERE statement_id = ?', st.id);
      if (!w || w.status !== 'reviewed') problems.push(`${b.name}: reconciliation not reviewed.`);
    }
    return { pass: problems.length === 0, detail: problems.length ? problems : [`${banks.length} account(s) reconciled and reviewed.`] };
  }
  if (key === 'loan_recon') {
    const loans = D.drawsFor(db, periodEnd).loans.filter(l => l.loan.entity_id === entityId);
    const bad = loans.filter(l => l.difference_cents);
    return { pass: bad.length === 0, detail: bad.length ? bad.map(l => `${l.loan.lender}: books ${fmt(l.book_balance_cents)} vs lender ${fmt(l.lender_balance_cents)}.`) : [`${loans.length} loan(s) tie to lender statements.`] };
  }
  if (key === 'intercompany') {
    const pairs = D.intercompanyFor(db).pairs.filter(p => p.entity_a === entityId || p.entity_b === entityId);
    const bad = pairs.filter(p => !p.matches);
    return { pass: bad.length === 0, detail: bad.length ? bad.map(p => `${p.entity_a} ↔ ${p.entity_b} off by ${fmt(Math.abs(p.difference_cents))}.`) : [`${pairs.length} pair(s) match.`] };
  }
  if (key === 'exceptions') {
    const open = db.all(`SELECT * FROM issues WHERE entity_id = ? AND severity = 'high' AND status != 'resolved'`, entityId);
    return { pass: open.length === 0, detail: open.length ? open.map(i => `${i.id}: ${i.title}`) : ['No open high-severity exceptions.'] };
  }
  return null;
}

function closeStatus(db, entityId, period) {
  const c = ensureClose(db, entityId, period);
  const tasks = db.all('SELECT * FROM close_tasks WHERE close_id = ? ORDER BY sort', c.id).map(t => {
    const tpl = CLOSE_TEMPLATE.find(x => x.key === t.key);
    return { ...t, auto: !!tpl?.auto, check: tpl?.auto ? autoCheck(db, entityId, period, t.key) : null };
  });
  const blockers = [];
  for (const t of tasks) {
    if (!t.prepared_by) blockers.push(`Not prepared: ${t.title}`);
    else if (!t.reviewed_by) blockers.push(`Not reviewed: ${t.title}`);
    if (t.check && !t.check.pass) blockers.push(`Check failing: ${t.title}`);
  }
  return { close: c, entity: db.get('SELECT * FROM entities WHERE id = ?', entityId), tasks, blockers, can_sign_off: c.status === 'open' && blockers.length === 0 };
}

function prepareTask(db, user, taskId, evidence) {
  auth.require(user, 'close.prepare');
  const t = db.get('SELECT t.*, c.entity_id, c.period, c.status AS close_status FROM close_tasks t JOIN close_periods c ON c.id = t.close_id WHERE t.id = ?', taskId);
  if (!t) throw new HttpError(404, 'Task not found.');
  if (t.close_status === 'closed') throw new HttpError(409, 'This period is closed.');
  if (!evidence || evidence.trim().length < 5) throw new HttpError(400, 'Describe the evidence (workpaper, report, file) for this step.');
  const check = autoCheck(db, t.entity_id, t.period, t.key);
  if (check && !check.pass) throw new HttpError(409, 'The automatic check for this step is failing.', check.detail);
  db.run('UPDATE close_tasks SET evidence = ?, prepared_by = ?, prepared_at = ?, reviewed_by = NULL, reviewed_at = NULL WHERE id = ?', evidence.trim(), user.id, nowISO(), taskId);
  audit(db, user.id, 'close.task_prepared', 'close_task', taskId, { evidence });
}

function reviewTask(db, user, taskId, note) {
  auth.require(user, 'close.review');
  const t = db.get('SELECT * FROM close_tasks WHERE id = ?', taskId);
  if (!t) throw new HttpError(404, 'Task not found.');
  if (!t.prepared_by) throw new HttpError(409, 'This step has not been prepared yet.');
  auth.requireIndependent(user, [t.prepared_by], 'close step');
  db.run('UPDATE close_tasks SET reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?', user.id, nowISO(), note || null, taskId);
  audit(db, user.id, 'close.task_reviewed', 'close_task', taskId, { note });
}

function signOffClose(db, user, entityId, period, note) {
  auth.require(user, 'close.signoff');
  const s = closeStatus(db, entityId, period);
  if (s.close.status === 'closed') throw new HttpError(409, 'Already closed.');
  auth.requireIndependent(user, s.tasks.map(t => t.prepared_by), 'close');
  if (s.blockers.length) throw new HttpError(409, 'The close has open items.', s.blockers);
  db.tx(() => {
    db.run(`UPDATE close_periods SET status = 'closed', signed_off_by = ?, signed_off_at = ? WHERE id = ?`, user.id, nowISO(), s.close.id);
    db.run(`INSERT INTO approvals(id, object_type, object_id, requested_by, approver_id, decision, note, decided_at) VALUES (?, 'close', ?, ?, ?, 'approved', ?, ?)`,
      newId('APR'), s.close.id, s.tasks[0]?.prepared_by || null, user.id, note || null, nowISO());
  });
  audit(db, user.id, 'close.signed_off', 'close_period', s.close.id, { note, reminder: 'Set the closing date and password in QuickBooks Online.' });
  return closeStatus(db, entityId, period);
}

// ---------------- Payments ----------------
function requestPayment(db, user, billId) {
  auth.require(user, 'payment.request');
  const bill = db.get(`SELECT * FROM transactions WHERE id = ? AND type = 'bill'`, billId);
  if (!bill) throw new HttpError(404, 'Bill not found.');
  if (bill.paid) throw new HttpError(409, 'This bill is already paid.');
  if (db.get(`SELECT id FROM payments WHERE bill_id = ? AND status != 'rejected'`, billId)) throw new HttpError(409, 'A payment request already exists for this bill.');
  const id = newId('PAY');
  db.run(`INSERT INTO payments(id, entity_id, vendor_id, bill_id, amount_cents, requested_by, requested_at) VALUES (?,?,?,?,?,?,?)`,
    id, bill.entity_id, bill.vendor_id, bill.id, bill.amount_cents, user.id, nowISO());
  audit(db, user.id, 'payment.requested', 'payment', id, { bill_id: billId, amount_cents: bill.amount_cents });
  return db.get('SELECT * FROM payments WHERE id = ?', id);
}

function decidePayment(db, user, paymentId, decision, note) {
  auth.require(user, 'payment.approve');
  const p = db.get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p) throw new HttpError(404, 'Payment not found.');
  if (p.status !== 'requested') throw new HttpError(409, `Already ${p.status}.`);
  const bill = db.get('SELECT t.*, b.created_by AS entered_by FROM transactions t LEFT JOIN import_batches b ON b.id = t.batch_id WHERE t.id = ?', p.bill_id);
  const vendor = db.get('SELECT * FROM vendors WHERE id = ?', p.vendor_id);
  auth.requireIndependent(user, [p.requested_by, bill?.entered_by, vendor?.created_by], 'payment');
  if (decision === 'approved') {
    if (vendor?.bank_changed_at && !vendor.bank_change_verified_by) {
      throw new HttpError(409, `${vendor.name}'s bank details changed on ${vendor.bank_changed_at.slice(0, 10)} and haven't been verified. Verify by call-back before approving.`);
    }
    const dup = db.all(`SELECT * FROM issues WHERE type IN ('duplicate_invoice','missing_approval') AND status != 'resolved'`)
      .find(i => JSON.parse(i.evidence_json).some(e => e.ref?.id === p.bill_id));
    if (dup) throw new HttpError(409, `Open exception ${dup.id} on this bill: ${dup.title}. Resolve it first.`);
  }
  if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'Decision must be approved or rejected.');
  db.tx(() => {
    db.run('UPDATE payments SET status = ? WHERE id = ?', decision, paymentId);
    db.run(`INSERT INTO approvals(id, object_type, object_id, requested_by, approver_id, decision, note, decided_at) VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)`,
      newId('APR'), paymentId, p.requested_by, user.id, decision, note || null, nowISO());
  });
  audit(db, user.id, `payment.${decision}`, 'payment', paymentId, { note, reminder: 'Release the payment in the bank or QuickBooks. This app does not move money.' });
  return db.get('SELECT * FROM payments WHERE id = ?', paymentId);
}

function verifyVendorBank(db, user, vendorId, note) {
  auth.require(user, 'vendor.verify_bank');
  const v = db.get('SELECT * FROM vendors WHERE id = ?', vendorId);
  if (!v || !v.bank_changed_at) throw new HttpError(404, 'No pending bank change for this vendor.');
  if (!note || note.trim().length < 10) throw new HttpError(400, 'Record who you called, at what number on file, and what they confirmed.');
  auth.requireIndependent(user, [v.created_by], 'vendor bank change');
  db.run('UPDATE vendors SET bank_change_verified_by = ? WHERE id = ?', user.id, vendorId);
  db.run(`INSERT INTO approvals(id, object_type, object_id, approver_id, decision, note, decided_at) VALUES (?, 'vendor_bank_change', ?, ?, 'approved', ?, ?)`,
    newId('APR'), vendorId, user.id, note.trim(), nowISO());
  audit(db, user.id, 'vendor.bank_change_verified', 'vendor', vendorId, { note });
}

// ---------------- Journal entry proposals ----------------
function proposeJournal(db, user, { entity_id, date, memo, lines, source_ref }) {
  auth.require(user, 'journal.propose');
  if (!Array.isArray(lines) || lines.length < 2) throw new HttpError(400, 'A journal entry needs at least two lines.');
  const dr = lines.reduce((s, l) => s + (l.debit_cents || 0), 0), cr = lines.reduce((s, l) => s + (l.credit_cents || 0), 0);
  if (dr !== cr || dr === 0) throw new HttpError(400, `Debits (${fmt(dr)}) must equal credits (${fmt(cr)}).`);
  for (const l of lines) {
    const a = db.get('SELECT * FROM accounts WHERE id = ? AND entity_id = ?', l.account_id, entity_id);
    if (!a) throw new HttpError(400, `Account ${l.account_id} isn't in ${entity_id}'s chart of accounts.`);
  }
  if (!memo || !source_ref) throw new HttpError(400, 'Give a memo and the source document or issue that supports it.');
  const id = newId('JE');
  db.run(`INSERT INTO journal_proposals(id, entity_id, date, memo, lines_json, amount_cents, source_ref, prepared_by, prepared_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    id, entity_id, date, memo, JSON.stringify(lines), dr, source_ref, user.id, nowISO());
  audit(db, user.id, 'journal.proposed', 'journal_proposal', id, { amount_cents: dr, source_ref });
  return db.get('SELECT * FROM journal_proposals WHERE id = ?', id);
}

function decideJournal(db, user, id, decision, note) {
  auth.require(user, 'journal.approve');
  const je = db.get('SELECT * FROM journal_proposals WHERE id = ?', id);
  if (!je) throw new HttpError(404, 'Journal proposal not found.');
  if (je.status !== 'proposed') throw new HttpError(409, `Already ${je.status}.`);
  auth.requireIndependent(user, [je.prepared_by], 'journal entry');
  if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'Decision must be approved or rejected.');
  db.tx(() => {
    db.run('UPDATE journal_proposals SET status = ? WHERE id = ?', decision, id);
    db.run(`INSERT INTO approvals(id, object_type, object_id, requested_by, approver_id, decision, note, decided_at) VALUES (?, 'journal_entry', ?, ?, ?, ?, ?, ?)`,
      newId('APR'), id, je.prepared_by, user.id, decision, note || null, nowISO());
  });
  audit(db, user.id, `journal.${decision}`, 'journal_proposal', id, { note, reminder: 'Enter the approved entry in QuickBooks Online. This app never posts to the ledger.' });
  return db.get('SELECT * FROM journal_proposals WHERE id = ?', id);
}

// ---------------- Report versions ----------------
function saveReportVersion(db, user, kind, scope, content) {
  const id = newId('RPT');
  const json = JSON.stringify(content);
  db.run(`INSERT INTO report_versions(id, kind, scope, content_json, status, created_by, created_at) VALUES (?,?,?,?, 'draft', ?, ?)`, id, kind, scope || null, json, user.id, nowISO());
  audit(db, user.id, 'report.saved', 'report_version', id, { kind, scope, sha256: sha256(json) });
  return db.get('SELECT * FROM report_versions WHERE id = ?', id);
}

function reviewReportVersion(db, user, id) {
  auth.require(user, 'report.review');
  const r = db.get('SELECT * FROM report_versions WHERE id = ?', id);
  if (!r) throw new HttpError(404, 'Report version not found.');
  auth.requireIndependent(user, [r.created_by], 'report');
  db.run(`UPDATE report_versions SET status = 'reviewed', reviewed_by = ?, reviewed_at = ? WHERE id = ?`, user.id, nowISO(), id);
  audit(db, user.id, 'report.reviewed', 'report_version', id, { kind: r.kind });
  return db.get('SELECT * FROM report_versions WHERE id = ?', id);
}

// ---------------- Training sign-off ----------------
function signOffModule(db, user, { module_id, learner_id, rubric, passed, note }) {
  auth.require(user, 'module.signoff');
  auth.requireIndependent(user, [learner_id], 'training module');
  if (!note || note.trim().length < 5) throw new HttpError(400, 'Add a reviewer note: what was checked and what to practice.');
  db.run(`INSERT INTO signoffs(module_id, learner_id, reviewer_id, rubric_json, passed, note, signed_at) VALUES (?,?,?,?,?,?,?)`,
    module_id, learner_id, user.id, JSON.stringify(rubric || []), passed ? 1 : 0, note.trim(), nowISO());
  if (!passed) {
    db.run('INSERT INTO mistakes(user_id, module_id, description, corrected_procedure, source, created_at) VALUES (?,?,?,?,?,?)',
      learner_id, module_id, `Reviewer did not pass the hands-on task: ${note.trim()}`, null, 'reviewer', nowISO());
  }
  audit(db, user.id, 'module.signoff', 'module', module_id, { learner_id, passed: !!passed, note });
}

module.exports = {
  updateIssue, explainReconItem, prepareRecon, reviewRecon, CLOSE_TEMPLATE, ensureClose, closeStatus, prepareTask, reviewTask, signOffClose,
  requestPayment, decidePayment, verifyVendorBank, proposeJournal, decideJournal, saveReportVersion, reviewReportVersion, signOffModule,
};
