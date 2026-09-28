'use strict';
// Deterministic exception rules. A flag is a question, not an accusation: each one carries evidence
// (links to source rows), a severity, a suggested next step, an owner and a due date.
// Rules are idempotent: each finding has a stable rule_key, so re-running never duplicates an issue
// and never reopens one a person already resolved.
const D = require('../reports/data');
const { asOfDate } = require('../db');
const { fmt, addDays, daysBetween, normInvoice, newId, nowISO } = require('../lib/util');
const { audit } = require('../audit');

const LESSON_FOR = {
  duplicate_invoice: 'm2', wrong_entity: 'm1', missing_project: 'm3', missing_receipt: 'm2', missing_approval: 'm2',
  unmatched_bank_item: 'm2', unrecorded_draw: 'm3', draw_short_funded: 'm3', loan_balance_mismatch: 'm4', cost_overrun: 'm3',
  negative_cash: 'm5', stale_receivable: 'm5', vendor_bank_change: 'm2', intercompany_mismatch: 'm4', stale_data: 'm5',
};

function findings(db) {
  const asOf = asOfDate(db);
  const out = [];
  const add = f => out.push({ lesson_id: LESSON_FOR[f.type], ...f });
  const all = D.txns(db);
  const txnRef = t => D.ref(t);
  const receiptMin = db.setting('receipt_required_over_cents', 7500);
  const approvalMin = db.setting('approval_required_over_cents', 100000);

  // 1. Duplicate invoice candidates: same vendor + same normalized invoice number.
  const groups = new Map();
  for (const t of all.filter(t => t.type === 'bill' && t.invoice_no && t.vendor_id)) {
    const k = `${t.vendor_id}|${normInvoice(t.invoice_no)}`;
    groups.set(k, [...(groups.get(k) || []), t]);
  }
  for (const [k, ts] of groups) {
    if (ts.length < 2) continue;
    const [first, ...rest] = ts;
    add({
      rule_key: `dup:${k}`, type: 'duplicate_invoice', severity: 'high', entity_id: first.entity_id, project_id: first.project_id,
      amount_cents: rest.reduce((s, t) => s + t.amount_cents, 0),
      title: `Possible duplicate bill: ${first.vendor_name} ${ts.map(t => t.invoice_no).join(' / ')}`,
      evidence: [
        { label: `Original: ${first.invoice_no}, ${fmt(first.amount_cents)}, dated ${first.date}${first.paid ? ', paid' : ''}`, ref: txnRef(first), flag: false },
        ...rest.map(t => ({ label: `Candidate: ${t.invoice_no}, ${fmt(t.amount_cents)}, dated ${t.date}${t.paid ? ', paid' : ', unpaid'}`, ref: txnRef(t), hold: !t.paid })),
      ],
      suggested_step: 'Compare both invoices line by line. Ask the vendor for a statement. Hold payment on the later one until confirmed.',
    });
  }

  // 2. Wrong entity: the project belongs to a different entity than the books the row is in.
  const projects = Object.fromEntries(db.all('SELECT * FROM projects').map(p => [p.id, p]));
  for (const t of all.filter(t => t.project_id && projects[t.project_id] && projects[t.project_id].entity_id !== t.entity_id)) {
    const p = projects[t.project_id];
    add({
      rule_key: `wrongent:${t.id}`, type: 'wrong_entity', severity: 'high', entity_id: t.entity_id, project_id: p.id, amount_cents: Math.abs(t.amount_cents),
      title: `${fmt(Math.abs(t.amount_cents))} ${t.vendor_name || ''} bill for ${p.id} is booked in ${t.entity_id}, but ${p.id} belongs to ${p.entity_id}`,
      evidence: [{ label: `Row booked to ${t.entity_id}, project ${p.id}`, ref: txnRef(t) }, { label: `Project dictionary: ${p.id} is owned by ${p.entity_id}`, ref: { kind: 'project', id: p.id } }],
      suggested_step: `Confirm which company received the work. If it's ${p.entity_id}'s, move the bill in QuickBooks, or record it as an intercompany charge with matching entries in both companies.`,
    });
  }

  // 3. Missing project on property / job-cost accounts.
  for (const t of all.filter(t => !t.project_id && ['property', 'job_cost'].includes(t.account_subtype))) {
    add({
      rule_key: `noproj:${t.id}`, type: 'missing_project', severity: 'medium', entity_id: t.entity_id, amount_cents: Math.abs(t.amount_cents),
      title: `${fmt(Math.abs(t.amount_cents))} coded to ${t.account_number} ${t.account_name} with no project`,
      evidence: [{ label: `${t.date} ${t.vendor_name || t.memo || ''}`, ref: txnRef(t) }],
      suggested_step: 'Find the property or job from the invoice or the person who bought it, then add the project in QuickBooks.',
    });
  }

  // 4. Missing receipt on card / debit expenses over the threshold.
  for (const t of all.filter(t => t.type === 'expense' && Math.abs(t.amount_cents) >= receiptMin && !JSON.parse(t.flags || '[]').includes('receipt_on_file') && !t.receipt_document_id)) {
    add({
      rule_key: `norcpt:${t.id}`, type: 'missing_receipt', severity: 'medium', entity_id: t.entity_id, project_id: t.project_id, amount_cents: Math.abs(t.amount_cents),
      title: `Missing receipt: ${t.vendor_name || t.memo} ${fmt(Math.abs(t.amount_cents))} on ${t.date}`,
      evidence: [{ label: 'Expense with no receipt attached', ref: txnRef(t) }],
      suggested_step: 'Ask the cardholder for the receipt and attach it in QuickBooks. If it can’t be found, get a signed missing-receipt form.',
    });
  }

  // 5. Missing approval on bills over the approval threshold.
  for (const t of all.filter(t => t.type === 'bill' && t.amount_cents >= approvalMin && !t.approved_by)) {
    add({
      rule_key: `noappr:${t.id}`, type: 'missing_approval', severity: t.paid ? 'medium' : 'high', entity_id: t.entity_id, project_id: t.project_id, amount_cents: t.amount_cents,
      title: `No approval recorded: ${t.vendor_name} ${t.invoice_no} ${fmt(t.amount_cents)}${t.paid ? ' (already paid)' : ''}`,
      evidence: [{ label: `Bill over the ${fmt(approvalMin)} approval threshold`, ref: txnRef(t) }],
      suggested_step: 'Get approval from the property or job owner before paying. If already paid, document after-the-fact approval.',
    });
  }

  // 6. Unmatched bank items from each latest statement.
  for (const st of db.all('SELECT * FROM bank_statements')) {
    const rec = D.reconciliationFor(db, st.id);
    for (const i of rec.bank_only.filter(i => !i.explanation || i.explanation.treatment !== 'outstanding')) {
      add({
        rule_key: `bankonly:${i.id}`, type: 'unmatched_bank_item', severity: Math.abs(i.amount_cents) >= 100000 ? 'high' : 'low',
        entity_id: rec.bank_account.entity_id, amount_cents: Math.abs(i.amount_cents),
        title: `Bank shows ${fmt(i.amount_cents)} "${i.description}" on ${i.date} with no matching book entry`,
        evidence: [{ label: `Statement line (${rec.bank_account.name})`, ref: i.source }],
        suggested_step: 'Find what it is. If it is real, record it in QuickBooks, re-export, and re-run the reconciliation.',
      });
    }
  }

  // 7–9. Lender draws and loan balances.
  for (const L of D.drawsFor(db, asOf).loans) {
    for (const d of L.draws) {
      if (d.status === 'unrecorded') {
        add({
          rule_key: `drawunrec:${d.id}`, type: 'unrecorded_draw', severity: 'high', entity_id: L.loan.entity_id, project_id: d.project_id, amount_cents: d.funded_cents,
          title: `Draw #${d.number} (${fmt(d.funded_cents)}) funded ${d.funded_date} but not in the books${d.expected_date ? `; expected ${d.expected_date}` : ''}`,
          evidence: [{ label: `Draw log: submitted ${fmt(d.submitted_cents)} on ${d.submitted_date}, approved ${fmt(d.approved_cents)}, funded ${fmt(d.funded_cents)} on ${d.funded_date}`, ref: { kind: 'draw', id: d.id } },
            { label: `Loan book balance ${fmt(L.book_balance_cents)} vs lender statement ${fmt(L.lender_balance_cents)}`, ref: { kind: 'loan', id: L.loan.id } }],
          suggested_step: 'Record the draw in QuickBooks in the period it was funded (cash up, loan payable up). Then re-import and re-reconcile.',
        });
      }
      if (d.short_cents > 0) {
        add({
          rule_key: `drawshort:${d.id}`, type: 'draw_short_funded', severity: 'medium', entity_id: L.loan.entity_id, project_id: d.project_id, amount_cents: d.short_cents,
          title: `Draw #${d.number}: lender approved ${fmt(d.approved_cents)} of ${fmt(d.submitted_cents)} submitted (${fmt(d.short_cents)} short)`,
          evidence: [{ label: 'Draw log', ref: { kind: 'draw', id: d.id } }],
          suggested_step: 'Get the lender’s draw approval letter. Find which cost lines were cut or held back, and whether they can be resubmitted.',
        });
      }
    }
    if (L.difference_cents) {
      add({
        rule_key: `loandiff:${L.loan.id}`, type: 'loan_balance_mismatch', severity: 'high', entity_id: L.loan.entity_id, project_id: L.loan.project_id, amount_cents: Math.abs(L.difference_cents),
        title: `${L.loan.lender} loan: books ${fmt(L.book_balance_cents)}, lender says ${fmt(L.lender_balance_cents)} (difference ${fmt(L.difference_cents)})`,
        evidence: [{ label: `Lender statement dated ${L.loan.lender_statement_date}`, ref: { kind: 'loan', id: L.loan.id } }],
        suggested_step: 'Tie every draw and payment to the lender statement. Unrecorded debt goes on the balance sheet before close.',
      });
    }
  }

  // 10. Cost overruns by project category (projected = actual + committed + forecast).
  for (const p of Object.values(projects)) {
    const rpt = D.projectReportFor(db, p.id);
    for (const r of rpt.rows.filter(r => r.budget_cents !== null && r.variance_cents < 0)) {
      add({
        rule_key: `overrun:${p.id}:${r.category}`, type: 'cost_overrun', severity: -r.variance_cents >= 250000 ? 'high' : 'medium', entity_id: p.entity_id, project_id: p.id,
        amount_cents: -r.variance_cents,
        title: `${p.id} ${r.category} projected ${fmt(r.projected_total_cents)} vs budget ${fmt(r.budget_cents)} (${fmt(-r.variance_cents)} over)`,
        evidence: [{ label: `Actual ${fmt(r.actual_to_date_cents)} + committed ${fmt(r.committed_cents)} + forecast ${fmt(r.forecast_remaining_cents)}${r.flagged_cents ? `; includes ${fmt(r.flagged_cents)} under review` : ''}`, ref: { kind: 'project', id: p.id } }],
        suggested_step: 'Confirm the forecast with the project lead. Juan decides whether to approve the overrun, cut scope, or change the sale price.',
      });
    }
  }

  // 11. Negative cash weeks in the 13-week forecast.
  for (const e of db.all('SELECT * FROM entities')) {
    const fc = D.forecastFor(db, e.id, asOf);
    if (fc.negative_weeks.length) {
      const w = fc.negative_weeks[0];
      add({
        rule_key: `negcash:${e.id}:${w.week_start}`, type: 'negative_cash', severity: 'high', entity_id: e.id, amount_cents: -fc.minimum.closing_cents,
        title: `${e.name}: forecast cash goes negative (${fmt(w.closing_cents)}) the week of ${w.week_start}`,
        evidence: [{ label: `13-week forecast; lowest ${fmt(fc.minimum.closing_cents)} in week ${fc.minimum.week}`, ref: { kind: 'forecast', id: e.id } }],
        suggested_step: 'Check the assumptions first. Then give Juan options: move a payment date, speed up a collection, or fund a documented intercompany loan.',
      });
    }
  }

  // 12. Stale receivables.
  const staleDays = db.setting('stale_receivable_days', 90);
  for (const r of D.arAging(db, null, asOf).rows.filter(r => r.days_past_due > staleDays)) {
    add({
      rule_key: `stalear:${r.id}`, type: 'stale_receivable', severity: 'medium', entity_id: r.entity_id, project_id: r.project_id, amount_cents: r.amount_cents,
      title: `${r.customer} invoice ${r.invoice_no} ${fmt(r.amount_cents)} is ${r.days_past_due} days past due`,
      evidence: [{ label: `Due ${r.due_date}`, ref: r.source }],
      suggested_step: 'Call the customer and send a statement. Ask the CPA whether an allowance for doubtful accounts is needed.',
    });
  }

  // 13. Vendor bank-detail changes not independently verified, with money about to go out.
  for (const v of db.all('SELECT * FROM vendors WHERE bank_changed_at IS NOT NULL AND bank_change_verified_by IS NULL')) {
    if (daysBetween(v.bank_changed_at.slice(0, 10), asOf) > 90) continue;
    const bills = all.filter(t => t.vendor_id === v.id && t.type === 'bill' && !t.paid);
    const payments = db.all(`SELECT * FROM payments WHERE vendor_id = ? AND status = 'requested'`, v.id);
    if (!bills.length && !payments.length) continue;
    add({
      rule_key: `vbank:${v.id}:${v.bank_changed_at}`, type: 'vendor_bank_change', severity: 'high', entity_id: bills[0]?.entity_id, amount_cents: bills.reduce((s, t) => s + t.amount_cents, 0),
      title: `${v.name} changed bank details on ${v.bank_changed_at.slice(0, 10)}; ${fmt(bills.reduce((s, t) => s + t.amount_cents, 0))} in open bills`,
      evidence: [{ label: 'Vendor record: bank details changed, not verified', ref: { kind: 'vendor', id: v.id } }, ...bills.map(t => ({ label: `Open bill ${t.invoice_no}`, ref: txnRef(t) }))],
      suggested_step: 'Call the vendor at the phone number already on file (not one from the change request). A second person verifies before any payment.',
    });
  }

  // 14. Intercompany mismatches.
  for (const p of D.intercompanyFor(db).pairs.filter(p => !p.matches)) {
    add({
      rule_key: `ic:${p.entity_a}:${p.entity_b}`, type: 'intercompany_mismatch', severity: 'high', entity_id: p.entity_a, amount_cents: Math.abs(p.difference_cents),
      title: `Intercompany ${p.entity_a} ↔ ${p.entity_b} off by ${fmt(Math.abs(p.difference_cents))}`,
      evidence: [...p.a_lines, ...p.b_lines].map(t => ({ label: `${t.entity_id} ${t.date} ${t.memo || ''} ${fmt(t.net_cents)}`, ref: t.source, flag: false })),
      suggested_step: 'Compare the transfer on both bank statements. Correct the side that doesn’t match the bank.',
    });
  }

  // 15. Stale or missing data.
  for (const f of D.freshness(db, asOf).filter(f => f.stale)) {
    add({
      rule_key: `stale:${f.entity_id}:${f.last_retrieved_at || 'never'}`, type: 'stale_data', severity: 'low', entity_id: f.entity_id,
      title: f.last_retrieved_at ? `${f.entity_name}: latest export is ${f.age_days} days old` : `${f.entity_name}: no exports imported yet`,
      evidence: [{ label: 'Import manifest', ref: { kind: 'freshness', id: f.entity_id } }],
      suggested_step: 'Export the ledger and bank activity from QuickBooks and import them.',
    });
  }
  return out;
}

const DUE_DAYS = { high: 2, medium: 5, low: 10 };

/** Run all rules and upsert issues. Returns counts. */
function runRules(db, userId = null) {
  const asOf = asOfDate(db);
  const defaultAssignee = db.setting('default_assignee', null);
  const found = findings(db);
  let created = 0, updated = 0;
  db.tx(() => {
    for (const f of found) {
      const existing = db.get('SELECT * FROM issues WHERE rule_key = ?', f.rule_key);
      if (existing) {
        if (existing.status !== 'resolved') {
          db.run('UPDATE issues SET title=?, severity=?, amount_cents=?, evidence_json=?, suggested_step=? WHERE id=?',
            f.title, f.severity, f.amount_cents ?? null, JSON.stringify(f.evidence), f.suggested_step, existing.id);
          updated++;
        }
        continue;
      }
      const id = newId('ISS');
      db.run(`INSERT INTO issues(id, rule_key, type, severity, title, entity_id, project_id, amount_cents, evidence_json, suggested_step, lesson_id,
              assignee_id, due_date, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'open', ?)`,
        id, f.rule_key, f.type, f.severity, f.title, f.entity_id || null, f.project_id || null, f.amount_cents ?? null, JSON.stringify(f.evidence),
        f.suggested_step, f.lesson_id || null, defaultAssignee, addDays(asOf, DUE_DAYS[f.severity]), nowISO());
      created++;
    }
  });
  db.setSetting('active_rule_keys', found.map(f => f.rule_key));
  audit(db, userId, 'rules.run', 'issues', null, { findings: found.length, created, updated });
  return { findings: found.length, created, updated };
}

module.exports = { runRules, findings, LESSON_FOR };
