'use strict';
// Project cost report and profit bridge.
//
// Cost status for every line:
//   actual_paid      - paid (expense, check, or a bill marked paid) or a posted journal (e.g. purchase closing statement)
//   incurred_unpaid  - a bill in the books that isn't paid yet
//   committed        - a signed contract / PO not yet billed (commitments table)
//   forecast         - an estimate of remaining cost, always with a written assumption
//
// Profit = sale proceeds - acquisition - rehab - financing - holding - closing - commissions - other allocated costs.

const COST_CATEGORIES = ['acquisition', 'rehab', 'materials', 'labor', 'financing', 'holding', 'closing', 'commission', 'other'];
const COST_TYPES = new Set(['bill', 'expense', 'check', 'journal', 'deposit']);

/** Cost amount (positive = cost) for a transaction. Bank-side rows are signed by cash (money out is negative). */
function costCents(t) {
  if (t.type === 'bill' || t.type === 'journal') return t.amount_cents;
  return -t.amount_cents; // expense/check money out -> positive cost; refund deposit -> negative cost
}

function isCostLine(t) {
  return t.project_id && t.category && COST_CATEGORIES.includes(t.category) && COST_TYPES.has(t.type);
}

/**
 * @param project row, @param budgets [{category, amount_cents}], @param txns all txns for the project,
 * @param commitments [{id, category, amount_cents, billed_cents, description}], @param forecasts [{category, amount_cents, assumption}]
 * @param flaggedTxnIds map txnId -> [issue labels] for open exceptions (possible duplicates, wrong entity)
 */
function projectReport({ project, budgets, txns, commitments = [], forecasts = [], flaggedTxnIds = {} }) {
  const lines = txns.filter(isCostLine).map(t => ({
    txn_id: t.id, date: t.date, category: t.category, vendor: t.vendor_name || null, invoice_no: t.invoice_no, memo: t.memo,
    entity_id: t.entity_id, amount_cents: costCents(t),
    status: t.type === 'bill' && !t.paid ? 'incurred_unpaid' : 'actual_paid',
    source: { document_id: t.document_id, filename: t.filename || null, row: t.source_row, batch_id: t.batch_id },
    flags: flaggedTxnIds[t.id] || [],
  }));

  const cats = new Set([...budgets.map(b => b.category), ...lines.map(l => l.category), ...commitments.map(c => c.category), ...forecasts.map(f => f.category)]);
  const rows = [...cats].sort((a, b) => COST_CATEGORIES.indexOf(a) - COST_CATEGORIES.indexOf(b)).map(category => {
    const ls = lines.filter(l => l.category === category);
    const paid = ls.filter(l => l.status === 'actual_paid').reduce((s, l) => s + l.amount_cents, 0);
    const unpaid = ls.filter(l => l.status === 'incurred_unpaid').reduce((s, l) => s + l.amount_cents, 0);
    const committed = commitments.filter(c => c.category === category).reduce((s, c) => s + Math.max(0, c.amount_cents - c.billed_cents), 0);
    const forecast = forecasts.filter(f => f.category === category).reduce((s, f) => s + f.amount_cents, 0);
    const flagged = ls.filter(l => l.flags.length).reduce((s, l) => s + l.amount_cents, 0);
    const budget = budgets.find(b => b.category === category)?.amount_cents ?? null;
    const projected = paid + unpaid + committed + forecast;
    return {
      category, budget_cents: budget, actual_paid_cents: paid, incurred_unpaid_cents: unpaid, actual_to_date_cents: paid + unpaid,
      committed_cents: committed, forecast_remaining_cents: forecast, projected_total_cents: projected,
      variance_cents: budget === null ? null : budget - projected,
      flagged_cents: flagged, projected_excluding_flagged_cents: projected - flagged,
    };
  });

  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const totals = {
    budget_cents: sum('budget_cents'), actual_paid_cents: sum('actual_paid_cents'), incurred_unpaid_cents: sum('incurred_unpaid_cents'),
    actual_to_date_cents: sum('actual_to_date_cents'), committed_cents: sum('committed_cents'), forecast_remaining_cents: sum('forecast_remaining_cents'),
    projected_total_cents: sum('projected_total_cents'), flagged_cents: sum('flagged_cents'),
  };
  totals.variance_cents = totals.budget_cents - totals.projected_total_cents;

  // Tie-out: category actuals must equal the sum of the listed transaction lines.
  const lineTotal = lines.reduce((s, l) => s + l.amount_cents, 0);
  const tieOut = { lines_total_cents: lineTotal, category_actuals_cents: totals.actual_to_date_cents, ties: lineTotal === totals.actual_to_date_cents };

  // Revenue side.
  const saleTxns = txns.filter(t => t.project_id && t.category === 'sale');
  const invoiced = txns.filter(t => t.project_id && t.type === 'invoice').reduce((s, t) => s + t.amount_cents, 0);
  let proceeds, proceedsBasis, proceedsNote;
  if (saleTxns.length) {
    proceeds = saleTxns.reduce((s, t) => s + Math.abs(t.amount_cents), 0); proceedsBasis = 'actual'; proceedsNote = 'Recorded sale proceeds';
  } else if (project.kind === 'flip') {
    proceeds = project.expected_sale_cents; proceedsBasis = 'estimate'; proceedsNote = 'Expected sale price (estimate, not a signed contract)';
  } else {
    proceeds = project.contract_value_cents; proceedsBasis = 'contract'; proceedsNote = `Contract value; ${invoiced} cents invoiced to date`;
  }

  const byCat = Object.fromEntries(rows.map(r => [r.category, r]));
  const bridge = {
    proceeds_cents: proceeds, proceeds_basis: proceedsBasis, proceeds_note: proceedsNote,
    costs: rows.map(r => ({ category: r.category, actual_to_date_cents: r.actual_to_date_cents, projected_total_cents: r.projected_total_cents })),
    profit_actual_to_date_cents: proceeds == null ? null : proceeds - totals.actual_to_date_cents,
    profit_projected_cents: proceeds == null ? null : proceeds - totals.projected_total_cents,
    profit_projected_excluding_flagged_cents: proceeds == null ? null : proceeds - (totals.projected_total_cents - totals.flagged_cents),
    formula: 'Profit = proceeds - (actual paid + incurred unpaid + committed + forecast remaining) across all cost categories',
  };

  // Sensitivity at three sale prices. Commission and seller closing costs scale with price at the budgeted rates.
  let sensitivity = null;
  if (project.kind === 'flip' && proceeds) {
    const rate = cat => (byCat[cat]?.projected_total_cents || 0) / proceeds;
    const fixed = totals.projected_total_cents - (byCat.commission?.projected_total_cents || 0) - (byCat.closing?.projected_total_cents || 0);
    sensitivity = [-0.05, 0, 0.05].map(pct => {
      const price = Math.round(proceeds * (1 + pct));
      const variable = Math.round(price * (rate('commission') + rate('closing')));
      return { label: pct === 0 ? 'Expected' : `${pct > 0 ? '+' : ''}${pct * 100}%`, sale_price_cents: price, total_cost_cents: fixed + variable, profit_cents: price - fixed - variable };
    });
  }

  return { project, rows, totals, lines, commitments, forecasts, tie_out: tieOut, bridge, sensitivity, invoiced_cents: invoiced };
}

module.exports = { projectReport, costCents, isCostLine, COST_CATEGORIES };
