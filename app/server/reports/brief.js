'use strict';
// Juan's executive brief. Rule: a number without a source is not shown; it becomes "Unknown".
// Every figure carries citations (report, period, source file/row) and a basis: fact (from books/statements)
// or estimate (with its assumption). Stale or incomplete data is labelled on each line.
const D = require('./data');
const { asOfDate } = require('../db');
const { fmt, addDays, sha256, nowISO } = require('../lib/util');

const SEV = { high: 3, medium: 2, low: 1 };

/** Build one claim. A value with no citations is replaced by "Unknown". */
function claim({ label, value_cents = null, text = null, citations = [], basis = 'fact', warnings = [], link = null }) {
  const cited = citations.filter(Boolean);
  if (value_cents !== null && !cited.length) {
    return { label, value_cents: null, text: 'Unknown: no reviewed source for this number.', citations: [], basis: 'unknown', warnings: [...warnings, 'Refused: number had no source.'], link };
  }
  return { label, value_cents, text, citations: cited, basis, warnings, link };
}

/** Walk a finished brief and blank any number that lacks a citation. Defense in depth for any future section. */
function enforceCitations(brief) {
  for (const s of brief.sections) s.items = s.items.map(i => (i.value_cents !== null && !(i.citations || []).length ? claim({ ...i, citations: [] }) : i));
  return brief;
}

function buildBrief(db) {
  const asOf = asOfDate(db);
  const fresh = D.freshness(db, asOf);
  const freshBy = Object.fromEntries(fresh.map(f => [f.entity_id, f]));
  const entities = db.all('SELECT * FROM entities ORDER BY id');
  const users = Object.fromEntries(db.all('SELECT id, name FROM users').map(u => [u.id, u.name]));
  const entWarn = id => {
    const f = freshBy[id]; const w = [];
    if (!f) return w;
    if (f.stale) w.push(f.last_retrieved_at ? `Data is ${f.age_days} days old.` : 'No data imported.');
    if (f.unreconciled_bank_accounts.length) w.push('Bank not reconciled.');
    if (f.batches_not_ready.length) w.push('Imports have open questions.');
    return w;
  };
  const batchCite = (id, extra = {}) => ({ report: 'Import manifest', ...extra, batch_id: id });

  // 1. Cash today (book balance per entity, with bank statement balance where we have one).
  const cash = [];
  for (const e of entities) {
    for (const b of db.all(`SELECT * FROM bank_accounts WHERE entity_id = ? AND kind = 'bank'`, e.id)) {
      const lc = D.ledgerCash(db, b.id, asOf);
      const batches = [...new Set(lc.items.map(t => t.batch_id))];
      const cites = lc.items.length || b.opening_balance_cents ? [{ report: 'Ledger cash', period: `through ${asOf}`, bank_account: b.id, formula: lc.formula, batches, retrieved_at: freshBy[e.id]?.last_retrieved_at }] : [];
      const st = D.latestStatement(db, b.id);
      cash.push(claim({ label: `${e.name} · ${b.name} (books)`, value_cents: lc.amount_cents, citations: cites, warnings: entWarn(e.id), link: st ? `#/reports/recon/${st.id}` : null }));
      if (st) {
        const doc = db.get('SELECT filename FROM source_documents WHERE id = ?', st.document_id);
        cash.push(claim({ label: `${e.name} · ${b.name} (bank statement ${st.period_end})`, value_cents: st.closing_cents, citations: [{ report: 'Bank statement', period: `${st.period_start} to ${st.period_end}`, filename: doc?.filename, statement_id: st.id }], link: `#/reports/recon/${st.id}` }));
      }
    }
  }

  // 2. Cash forecast: lowest point in 13 weeks per entity.
  const forecast = entities.map(e => {
    const fc = D.forecastFor(db, e.id, asOf);
    const w = [...entWarn(e.id)];
    if (!fc.start.reconciled) w.push('Starting cash is not reconciled.');
    if (fc.estimate_share > 0.5) w.push(`${Math.round(fc.estimate_share * 100)}% of forecast dollars are estimates.`);
    return claim({
      label: `${e.name}: lowest week`, value_cents: fc.minimum.closing_cents, basis: 'estimate',
      text: `Week of ${fc.minimum.week_start}${fc.negative_weeks.length ? ` · ${fc.negative_weeks.length} week(s) below zero` : ''}`,
      citations: [{ report: '13-week cash forecast', period: `${fc.weeks[0].start} to ${fc.weeks[12].end}`, entity: e.id, formula: fc.formula }], warnings: w, link: `#/reports/forecast/${e.id}`,
    });
  });

  // 3. Money owed to us.
  const owed = entities.map(e => {
    const ar = D.arAging(db, e.id, asOf);
    if (!ar.rows.length) return null;
    return claim({
      label: `${e.name}: receivables`, value_cents: ar.totals.total, text: ar.totals.d90_plus ? `${fmt(ar.totals.d90_plus)} is over 90 days` : null,
      citations: [{ report: 'A/R aging', period: `as of ${asOf}`, entity: e.id, rows: ar.rows.map(r => r.source) }], warnings: entWarn(e.id), link: `#/reports/aging/ar`,
    });
  }).filter(Boolean);

  // 4. Bills due: past due + next 14 days.
  const horizon = addDays(asOf, 14);
  const bills = entities.map(e => {
    const ap = D.apAging(db, e.id, asOf);
    const due = ap.rows.filter(r => r.due_date <= horizon);
    if (!due.length) return null;
    const past = due.filter(r => r.days_past_due > 0).reduce((s, r) => s + r.amount_cents, 0);
    return claim({
      label: `${e.name}: due by ${horizon}`, value_cents: due.reduce((s, r) => s + r.amount_cents, 0), text: past ? `${fmt(past)} already past due` : null,
      citations: [{ report: 'A/P aging', period: `as of ${asOf}`, entity: e.id, rows: due.map(r => r.source) }], warnings: entWarn(e.id), link: `#/reports/aging/ap`,
    });
  }).filter(Boolean);

  // 5. Project overruns and outlook.
  const projects = db.all('SELECT * FROM projects ORDER BY id').map(p => {
    const r = D.projectReportFor(db, p.id);
    const over = r.rows.filter(x => x.variance_cents !== null && x.variance_cents < 0);
    return claim({
      label: `${p.id} ${p.name}`, value_cents: r.totals.variance_cents, basis: 'estimate',
      text: `${over.length ? `Over budget in ${over.map(o => `${o.category} (${fmt(-o.variance_cents)})`).join(', ')}. ` : 'On budget. '}Projected profit ${fmt(r.bridge.profit_projected_cents)}${r.totals.flagged_cents ? `; ${fmt(r.totals.flagged_cents)} of costs are under review` : ''}.`,
      citations: [{ report: 'Project budget vs actual', period: `as of ${asOf}`, project: p.id, lines: r.lines.length, ties: r.tie_out.ties }], warnings: entWarn(p.entity_id), link: `#/reports/project/${p.id}`,
    });
  });

  // 6. Lender draws.
  const draws = D.drawsFor(db, asOf).loans.map(L => claim({
    label: `${L.loan.lender} (${L.loan.project_id || L.loan.entity_id})`, value_cents: L.difference_cents ?? null,
    text: [
      ...L.draws.filter(d => d.status !== 'recorded').map(d => `Draw #${d.number}: ${d.status}${d.funded_cents ? ` ${fmt(d.funded_cents)} on ${d.funded_date}` : d.expected_date ? `, expected ${d.expected_date}` : ''}`),
      `Books ${fmt(L.book_balance_cents)} vs lender ${fmt(L.lender_balance_cents)}`,
    ].join(' · '),
    citations: [{ report: 'Draw and loan reconciliation', period: `lender statement ${L.loan.lender_statement_date}`, loan: L.loan.id }], link: '#/reports/draws',
  }));

  // 7. Exceptions and top 3 issues.
  const open = db.all(`SELECT * FROM issues WHERE status != 'resolved'`);
  // Skip issues that are the same dollars in the same entity as one already picked (one root cause seen several ways).
  const picked = [];
  for (const i of open.sort((a, b) => SEV[b.severity] - SEV[a.severity] || (b.amount_cents || 0) - (a.amount_cents || 0))) {
    if (picked.length === 3) break;
    if (picked.some(p => p.entity_id === i.entity_id && p.amount_cents && p.amount_cents === i.amount_cents)) continue;
    picked.push(i);
  }
  const topIssues = picked.map(i => ({
    id: i.id, title: i.title, severity: i.severity, amount_cents: i.amount_cents, owner: users[i.assignee_id] || 'Unassigned', due_date: i.due_date,
    status: i.status, action: i.suggested_step, evidence: JSON.parse(i.evidence_json), link: `#/exceptions/${i.id}`,
  }));
  const exceptions = ['high', 'medium', 'low'].map(sev => {
    const list = open.filter(i => i.severity === sev);
    return claim({ label: `${sev[0].toUpperCase() + sev.slice(1)} severity open`, value_cents: null, text: `${list.length} open${list.length ? `, ${fmt(list.reduce((s, i) => s + (i.amount_cents || 0), 0))} involved` : ''}`, citations: [{ report: 'Exception queue', period: `as of ${asOf}` }], link: '#/exceptions' });
  });

  // 8. Three decisions, derived from open issues in priority order.
  const PRIORITY = ['negative_cash', 'vendor_bank_change', 'cost_overrun', 'unrecorded_draw', 'loan_balance_mismatch', 'intercompany_mismatch', 'duplicate_invoice', 'wrong_entity'];
  const QUESTION = {
    negative_cash: i => `${i.title}. Choose: move a payment date, speed up a collection, or approve a documented intercompany loan.`,
    vendor_bank_change: i => `${i.title}. Approve payment only after an independent call-back verifies the new account.`,
    cost_overrun: i => `${i.title}. Approve the overrun, cut scope, or revisit the sale price.`,
    unrecorded_draw: i => `${i.title}. Confirm the draw terms so it can be booked before close.`,
    loan_balance_mismatch: i => `${i.title}. Confirm the lender balance before any lender reporting.`,
    intercompany_mismatch: i => `${i.title}. Confirm which company's books are right.`,
    duplicate_invoice: i => `${i.title}. Hold payment until the vendor confirms.`,
    wrong_entity: i => `${i.title}. Confirm which company owns this cost.`,
  };
  const decisions = [];
  for (const type of PRIORITY) {
    const i = open.filter(x => x.type === type).sort((a, b) => (b.amount_cents || 0) - (a.amount_cents || 0))[0];
    if (i && decisions.length < 3) decisions.push({ issue_id: i.id, question: QUESTION[type](i), amount_cents: i.amount_cents, citations: [{ report: 'Exception queue', issue: i.id }], link: `#/exceptions/${i.id}` });
  }

  const brief = {
    as_of: asOf, generated_at: nowISO(),
    completeness: { entities: fresh, complete: fresh.every(f => f.complete) },
    sections: [
      { key: 'cash_today', question: 'How much cash do we have today?', items: cash },
      { key: 'cash_forecast', question: 'What is the lowest cash in the next 13 weeks?', items: forecast },
      { key: 'money_owed', question: 'Who owes us money?', items: owed },
      { key: 'bills_due', question: 'What bills are due?', items: bills },
      { key: 'projects', question: 'Are projects on budget?', items: projects },
      { key: 'draws', question: 'Where are lender draws?', items: draws },
      { key: 'exceptions', question: 'What exceptions are open?', items: exceptions },
    ],
    top_issues: topIssues,
    decisions,
  };
  enforceCitations(brief);
  // Status: reviewed only if a reviewer approved a saved version with identical numbers.
  const fingerprint = sha256(JSON.stringify({ s: brief.sections, d: brief.decisions }));
  const last = db.get(`SELECT * FROM report_versions WHERE kind = 'brief' ORDER BY created_at DESC LIMIT 1`);
  const lastReviewed = db.get(`SELECT * FROM report_versions WHERE kind = 'brief' AND status = 'reviewed' ORDER BY reviewed_at DESC LIMIT 1`);
  const lastFp = v => { if (!v) return null; const c = JSON.parse(v.content_json); return sha256(JSON.stringify({ s: c.sections, d: c.decisions })); };
  brief.fingerprint = fingerprint;
  brief.status = lastReviewed && lastFp(lastReviewed) === fingerprint ? 'reviewed' : 'draft';
  brief.latest_version = last ? { id: last.id, status: last.status, created_at: last.created_at, matches_live: lastFp(last) === fingerprint } : null;
  brief.last_reviewed = lastReviewed ? { id: lastReviewed.id, reviewed_at: lastReviewed.reviewed_at, reviewed_by: users[lastReviewed.reviewed_by] } : null;
  return brief;
}

module.exports = { buildBrief, claim, enforceCitations };
