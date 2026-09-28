'use strict';
// Lender draw and loan reconciliation: submitted -> approved -> funded -> recorded, plus loan balance vs lender statement.
const { daysBetween } = require('../lib/util');

/**
 * @param loans [{id, lender, entity_id, project_id, commitment_cents, opening_balance_cents, lender_statement_balance_cents, lender_statement_date}]
 * @param draws [{id, loan_id, number, submitted_date, submitted_cents, approved_cents, holdback_cents, funded_cents, funded_date, expected_date}]
 * @param drawTxns ledger rows of type 'draw' [{id, entity_id, date, amount_cents, memo, document_id, source_row}]
 * @param asOf 'YYYY-MM-DD'
 */
function drawReport({ loans, draws, drawTxns, asOf, matchWindowDays = 10 }) {
  const used = new Set();
  const out = loans.map(loan => {
    const ds = draws.filter(d => d.loan_id === loan.id).sort((a, b) => a.number - b.number).map(d => {
      const txn = d.funded_cents ? drawTxns.find(t => !used.has(t.id) && t.entity_id === loan.entity_id && t.amount_cents === d.funded_cents
        && Math.abs(daysBetween(d.funded_date, t.date)) <= matchWindowDays) : null;
      if (txn) used.add(txn.id);
      const approved = d.approved_cents;
      const issues = [];
      if (approved != null && approved < d.submitted_cents) issues.push(`Lender approved ${d.submitted_cents - approved} cents less than submitted.`);
      if (d.funded_cents != null && approved != null && d.funded_cents !== approved - (d.holdback_cents || 0)) issues.push('Funded amount differs from approved less holdback.');
      if (d.funded_cents && !txn) issues.push('Funded but not recorded in the books.');
      if (txn && txn.date.slice(0, 7) !== d.funded_date.slice(0, 7)) issues.push(`Recorded in ${txn.date.slice(0, 7)} but funded in ${d.funded_date.slice(0, 7)}.`);
      if (!d.funded_cents && d.expected_date && d.expected_date < asOf) issues.push(`Expected by ${d.expected_date} and not funded yet.`);
      const fundedLate = d.funded_date && d.expected_date ? daysBetween(d.expected_date, d.funded_date) : null;
      return {
        ...d, recorded_txn: txn || null, recorded_date: txn?.date || null,
        short_cents: approved != null ? d.submitted_cents - approved : null,
        days_after_expected: fundedLate, status: !d.funded_cents ? 'pending' : txn ? 'recorded' : 'unrecorded', issues,
      };
    });
    const recordedDraws = ds.filter(d => d.recorded_txn).reduce((s, d) => s + d.funded_cents, 0);
    const bookBalance = loan.opening_balance_cents + recordedDraws;
    const fundedTotal = ds.reduce((s, d) => s + (d.funded_cents || 0), 0);
    return {
      loan, draws: ds,
      book_balance_cents: bookBalance,
      lender_balance_cents: loan.lender_statement_balance_cents,
      difference_cents: loan.lender_statement_balance_cents == null ? null : loan.lender_statement_balance_cents - bookBalance,
      available_to_draw_cents: loan.commitment_cents - loan.opening_balance_cents - fundedTotal,
      formula: 'Book balance = opening balance + draws recorded in the books; compare with the lender statement',
    };
  });
  return { as_of: asOf, loans: out };
}

module.exports = { drawReport };
