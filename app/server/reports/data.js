'use strict';
// Loads inputs for the pure calculations from the database and attaches source references,
// so every reported number can be traced to a file and row.
const { reconcile } = require('../calc/reconcile');
const { projectReport } = require('../calc/project');
const { aging } = require('../calc/aging');
const { cashForecast } = require('../calc/forecast');
const { intercompany } = require('../calc/intercompany');
const { drawReport } = require('../calc/draws');
const { asOfDate } = require('../db');
const { daysBetween } = require('../lib/util');

const TXN_SELECT = `SELECT t.*, v.name AS vendor_name, a.subtype AS account_subtype, a.number AS account_number, a.name AS account_name,
  d.filename AS filename FROM transactions t
  LEFT JOIN vendors v ON v.id = t.vendor_id LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN source_documents d ON d.id = t.document_id`;

/** Standard source reference for a staged transaction or bank line. */
const ref = (row, kind = 'txn') => ({ kind, id: row.id, document_id: row.document_id, filename: row.filename || null, row: row.source_row, batch_id: row.batch_id });

function txns(db, where = '1=1', ...params) {
  return db.all(`${TXN_SELECT} WHERE ${where} ORDER BY t.date, t.id`, ...params);
}

function ledgerCash(db, bankAccountId, asOf = asOfDate(db)) {
  const ba = db.get('SELECT * FROM bank_accounts WHERE id = ?', bankAccountId);
  const items = txns(db, 't.bank_account_id = ? AND t.date > ? AND t.date <= ?', bankAccountId, ba.opening_date || '0000-00-00', asOf);
  return {
    bank_account: ba, amount_cents: ba.opening_balance_cents + items.reduce((s, t) => s + t.amount_cents, 0),
    items, opening_cents: ba.opening_balance_cents, opening_date: ba.opening_date,
    formula: `Opening balance on ${ba.opening_date} + ${items.length} ledger rows through ${asOf}`,
  };
}

function reconciliationFor(db, statementId) {
  const st = db.get(`SELECT s.*, d.filename FROM bank_statements s LEFT JOIN source_documents d ON d.id = s.document_id WHERE s.id = ?`, statementId);
  if (!st) return null;
  const ba = db.get('SELECT * FROM bank_accounts WHERE id = ?', st.bank_account_id);
  const ledgerItems = txns(db, 't.bank_account_id = ? AND t.date > ? AND t.date <= ?', ba.id, ba.opening_date || '0000-00-00', st.period_end)
    .map(t => ({ ...t, source: ref(t) }));
  const bankLines = db.all(`SELECT l.*, d.filename FROM bank_lines l LEFT JOIN source_documents d ON d.id = l.document_id
                            WHERE l.statement_id = ? ORDER BY l.date, l.source_row`, st.id).map(l => ({ ...l, source: ref(l, 'bank_line') }));
  const explanations = Object.fromEntries(db.all('SELECT * FROM recon_explanations WHERE statement_id = ?', st.id).map(e => [e.item_key, e]));
  const result = reconcile({ statement: st, ledgerOpeningCents: ba.opening_balance_cents, ledgerItems, bankLines, explanations });
  const rec = db.get('SELECT * FROM reconciliations WHERE statement_id = ?', st.id);
  return { bank_account: ba, statement: st, ...result, workpaper: rec || null };
}

function openIssueFlags(db) {
  const map = {};
  for (const i of db.all(`SELECT * FROM issues WHERE status != 'resolved'`)) {
    for (const e of JSON.parse(i.evidence_json)) {
      if (e.ref?.kind === 'txn' && e.flag !== false) (map[e.ref.id] = map[e.ref.id] || []).push({ issue_id: i.id, type: i.type });
    }
  }
  // Only duplicates and wrong-entity rows are "flagged" amounts in the project view.
  for (const k of Object.keys(map)) {
    map[k] = map[k].filter(f => ['duplicate_invoice', 'wrong_entity'].includes(f.type));
    if (!map[k].length) delete map[k];
  }
  return map;
}

function projectReportFor(db, projectId) {
  const project = db.get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!project) return null;
  const report = projectReport({
    project,
    budgets: db.all('SELECT * FROM budgets WHERE project_id = ?', projectId),
    txns: txns(db, 't.project_id = ?', projectId),
    commitments: db.all('SELECT c.*, v.name AS vendor_name FROM commitments c LEFT JOIN vendors v ON v.id = c.vendor_id WHERE c.project_id = ?', projectId),
    forecasts: db.all('SELECT * FROM forecasts WHERE project_id = ?', projectId),
    flaggedTxnIds: openIssueFlags(db),
  });
  return { ...report, as_of: asOfDate(db) };
}

function openBills(db, entityId) {
  return txns(db, `t.type = 'bill' AND t.paid = 0 ${entityId ? 'AND t.entity_id = ?' : ''}`, ...(entityId ? [entityId] : []))
    .map(t => ({ id: t.id, name: t.vendor_name, vendor: t.vendor_name, invoice_no: t.invoice_no, date: t.date, due_date: t.due_date, amount_cents: t.amount_cents, entity_id: t.entity_id, project_id: t.project_id, source: ref(t) }));
}

function openInvoices(db, entityId) {
  // An invoice is open unless a matching invoice_payment references the same invoice number.
  const paid = new Set(db.all(`SELECT entity_id || '|' || invoice_no AS k FROM transactions WHERE type = 'invoice_payment' AND invoice_no IS NOT NULL`).map(r => r.k));
  return txns(db, `t.type = 'invoice' ${entityId ? 'AND t.entity_id = ?' : ''}`, ...(entityId ? [entityId] : []))
    .filter(t => !paid.has(`${t.entity_id}|${t.invoice_no}`))
    .map(t => ({ id: t.id, name: t.customer, customer: t.customer, invoice_no: t.invoice_no, date: t.date, due_date: t.due_date, amount_cents: t.amount_cents, entity_id: t.entity_id, project_id: t.project_id, source: ref(t) }));
}

const apAging = (db, entityId, asOf = asOfDate(db)) => aging(openBills(db, entityId), asOf);
const arAging = (db, entityId, asOf = asOfDate(db)) => aging(openInvoices(db, entityId), asOf);

function latestStatement(db, bankAccountId) {
  return db.get('SELECT * FROM bank_statements WHERE bank_account_id = ? ORDER BY period_end DESC LIMIT 1', bankAccountId);
}

function forecastFor(db, entityId, asOf = asOfDate(db)) {
  const banks = db.all(`SELECT * FROM bank_accounts WHERE entity_id = ? AND kind = 'bank'`, entityId);
  let start = 0; const startSources = []; const adjustments = []; let reconciled = true;
  for (const b of banks) {
    const cash = ledgerCash(db, b.id, asOf);
    start += cash.amount_cents;
    startSources.push({ kind: 'ledger_balance', bank_account_id: b.id, formula: cash.formula, rows: cash.items.length });
    const st = latestStatement(db, b.id);
    const rec = st ? reconciliationFor(db, st.id) : null;
    if (!rec || !rec.reconciled) reconciled = false;
    // Items that already cleared the bank but aren't in the books yet (e.g. an unrecorded draw) are known cash.
    for (const i of rec?.bank_only || []) {
      adjustments.push({ label: `In bank, not in books: ${i.description}`, amount_cents: i.amount_cents, source: i.source });
    }
  }
  const dupHold = new Set(db.all(`SELECT evidence_json FROM issues WHERE type = 'duplicate_invoice' AND status != 'resolved'`)
    .flatMap(i => JSON.parse(i.evidence_json).filter(e => e.hold).map(e => e.ref.id)));
  const apBills = openBills(db, entityId).map(b => dupHold.has(b.id) ? { ...b, on_hold_reason: 'On hold: possible duplicate invoice under review.' } : b);
  const expectedDraws = db.all(`SELECT d.*, l.entity_id, l.lender FROM draws d JOIN loans l ON l.id = d.loan_id
                                WHERE l.entity_id = ? AND d.funded_cents IS NULL AND d.expected_date IS NOT NULL`, entityId)
    .map(d => ({ id: d.id, label: `Draw #${d.number} from ${d.lender}`, expected_date: d.expected_date, amount_cents: d.approved_cents ?? d.submitted_cents, source: { kind: 'draw', id: d.id } }));
  const assumptions = db.all('SELECT * FROM cash_assumptions WHERE entity_id = ?', entityId);
  const result = cashForecast({
    asOf, startCash: { amount_cents: start, label: 'Book cash (ledger)', sources: startSources, reconciled },
    adjustments, apBills, arInvoices: openInvoices(db, entityId), assumptions, expectedDraws,
    collectionLagDays: db.setting('collection_lag_days', 14),
  });
  return { entity_id: entityId, ...result };
}

function drawsFor(db, asOf = asOfDate(db)) {
  return drawReport({
    loans: db.all('SELECT * FROM loans'), draws: db.all('SELECT * FROM draws'),
    drawTxns: txns(db, `t.type = 'draw'`).map(t => ({ ...t, source: ref(t) })), asOf,
  });
}

function intercompanyFor(db) {
  return intercompany(txns(db, 't.counterparty_entity_id IS NOT NULL').map(t => ({ ...t, source: ref(t) })), db.all('SELECT * FROM entities ORDER BY id'));
}

/** Data freshness and completeness per entity. */
function freshness(db, asOf = asOfDate(db)) {
  const staleDays = db.setting('stale_after_days', 7);
  return db.all('SELECT * FROM entities ORDER BY id').map(e => {
    const batches = db.all(`SELECT * FROM import_batches WHERE status = 'committed' AND (entity_id = ? OR bank_account_id IN (SELECT id FROM bank_accounts WHERE entity_id = ?)
                            OR id IN (SELECT DISTINCT batch_id FROM transactions WHERE entity_id = ?)) ORDER BY retrieved_at DESC`, e.id, e.id, e.id);
    const last = batches[0]?.retrieved_at || null;
    const age = last ? daysBetween(last.slice(0, 10), asOf) : null;
    const banks = db.all(`SELECT * FROM bank_accounts WHERE entity_id = ? AND kind = 'bank'`, e.id);
    const unreconciled = banks.filter(b => { const st = latestStatement(db, b.id); return !st || !reconciliationFor(db, st.id).reconciled; }).map(b => b.id);
    const notReady = batches.filter(b => !b.ready).map(b => b.id);
    return {
      entity_id: e.id, entity_name: e.name, last_retrieved_at: last, age_days: age,
      stale: last === null || age > staleDays, unreconciled_bank_accounts: unreconciled, batches_not_ready: notReady,
      complete: last !== null && age <= staleDays && unreconciled.length === 0 && notReady.length === 0,
    };
  });
}

module.exports = { txns, ref, ledgerCash, reconciliationFor, projectReportFor, apAging, arAging, openBills, openInvoices, forecastFor, drawsFor, intercompanyFor, freshness, latestStatement };
