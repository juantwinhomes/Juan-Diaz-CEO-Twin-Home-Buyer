'use strict';
// Bank reconciliation. Pure function: same inputs always give the same result.
//
//   Adjusted bank = statement closing balance + uncleared ledger items (deposits in transit - outstanding checks)
//   Adjusted book = ledger balance + bank-only items (fees, interest, unrecorded deposits)
//   Unexplained difference = adjusted bank - adjusted book
//
// An account is reconciled only when the statement ties, the unexplained difference is $0.00,
// every unmatched item has a human explanation, and no bank-only item still needs a ledger entry.
const { daysBetween } = require('../lib/util');

const normRef = r => String(r || '').replace(/^0+/, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** One-to-one matching: exact amount + same reference first, then exact amount + nearest date within the window. */
function matchItems(ledgerItems, bankLines, { dateWindowDays = 5 } = {}) {
  const usedL = new Set(), usedB = new Set(), matched = [];
  for (const b of bankLines) {
    if (!b.ref) continue;
    const l = ledgerItems.find(l => !usedL.has(l.id) && l.amount_cents === b.amount_cents && l.ref && normRef(l.ref) === normRef(b.ref));
    if (l) { usedL.add(l.id); usedB.add(b.id); matched.push({ ledger: l, bank: b, rule: 'amount + reference' }); }
  }
  for (const b of bankLines) {
    if (usedB.has(b.id)) continue;
    const candidates = ledgerItems
      .filter(l => !usedL.has(l.id) && l.amount_cents === b.amount_cents && Math.abs(daysBetween(l.date, b.date)) <= dateWindowDays)
      .sort((x, y) => Math.abs(daysBetween(x.date, b.date)) - Math.abs(daysBetween(y.date, b.date)));
    if (candidates[0]) { usedL.add(candidates[0].id); usedB.add(b.id); matched.push({ ledger: candidates[0], bank: b, rule: `amount + date within ${dateWindowDays} days` }); }
  }
  return {
    matched,
    ledgerOnly: ledgerItems.filter(l => !usedL.has(l.id)),
    bankOnly: bankLines.filter(b => !usedB.has(b.id)),
  };
}

/**
 * @param statement {opening_cents, closing_cents, period_start, period_end}
 * @param ledgerOpeningCents  ledger balance at the start of tracking
 * @param ledgerItems  bank-affecting ledger transactions up to period end [{id, date, amount_cents, ref, ...}]
 * @param bankLines  statement lines [{id, date, amount_cents, ref, description, ...}]
 * @param explanations  map item_key -> {explanation, treatment}
 */
function reconcile({ statement, ledgerOpeningCents, ledgerItems, bankLines, explanations = {}, dateWindowDays = 5 }) {
  const reasons = [];
  const linesTotal = bankLines.reduce((s, l) => s + l.amount_cents, 0);
  const ties = statement.opening_cents + linesTotal === statement.closing_cents;
  if (!ties) reasons.push('Statement lines do not add up to the statement closing balance. A page or rows may be missing.');

  const inPeriod = ledgerItems.filter(l => l.date <= statement.period_end);
  const ledgerBalance = ledgerOpeningCents + inPeriod.reduce((s, l) => s + l.amount_cents, 0);
  const { matched, ledgerOnly, bankOnly } = matchItems(inPeriod, bankLines, { dateWindowDays });

  const withExpl = (item, side) => {
    const key = `${side}:${item.id}`;
    return { ...item, item_key: key, side, explanation: explanations[key] || null };
  };
  const outstanding = ledgerOnly.map(l => withExpl(l, 'ledger'));
  const bankOnlyItems = bankOnly.map(b => withExpl(b, 'bank'));

  const outstandingTotal = outstanding.reduce((s, l) => s + l.amount_cents, 0);
  const bankOnlyTotal = bankOnlyItems.reduce((s, b) => s + b.amount_cents, 0);
  const adjustedBank = statement.closing_cents + outstandingTotal;
  const adjustedBook = ledgerBalance + bankOnlyTotal;
  const unexplained = adjustedBank - adjustedBook;

  const unexplainedItems = [...outstanding, ...bankOnlyItems].filter(i => !i.explanation);
  const needsEntry = bankOnlyItems.filter(i => i.explanation && i.explanation.treatment !== 'outstanding');
  const errors = outstanding.filter(i => i.explanation && i.explanation.treatment === 'error_to_fix');
  const badOutstanding = bankOnlyItems.filter(i => i.explanation && i.explanation.treatment === 'outstanding');

  if (unexplained !== 0) reasons.push(`Unexplained difference of ${unexplained} cents between adjusted bank and adjusted book.`);
  if (unexplainedItems.length) reasons.push(`${unexplainedItems.length} unmatched item(s) have no explanation yet.`);
  if (needsEntry.length) reasons.push(`${needsEntry.length} bank item(s) still need to be recorded in the books.`);
  if (errors.length) reasons.push(`${errors.length} ledger item(s) are marked as errors to fix.`);
  if (badOutstanding.length) reasons.push('A bank-only item cannot be "outstanding". It already cleared the bank; it needs a ledger entry.');

  const counts = { deposits_in_transit: outstanding.filter(i => i.amount_cents > 0), outstanding_checks: outstanding.filter(i => i.amount_cents < 0) };
  return {
    period: { start: statement.period_start, end: statement.period_end },
    statement: { opening_cents: statement.opening_cents, closing_cents: statement.closing_cents, lines_total_cents: linesTotal, ties },
    ledger_balance_cents: ledgerBalance,
    matched: matched.map(m => ({ ledger_id: m.ledger.id, bank_id: m.bank.id, amount_cents: m.bank.amount_cents, ledger_date: m.ledger.date, bank_date: m.bank.date, rule: m.rule, ledger: m.ledger, bank: m.bank })),
    outstanding,
    deposits_in_transit_cents: counts.deposits_in_transit.reduce((s, i) => s + i.amount_cents, 0),
    outstanding_checks_cents: counts.outstanding_checks.reduce((s, i) => s + i.amount_cents, 0),
    bank_only: bankOnlyItems,
    bank_only_total_cents: bankOnlyTotal,
    adjusted_bank_cents: adjustedBank,
    adjusted_book_cents: adjustedBook,
    unexplained_difference_cents: unexplained,
    equation: `Adjusted bank ${statement.closing_cents} + (${outstandingTotal}) = ${adjustedBank}; Adjusted book ${ledgerBalance} + (${bankOnlyTotal}) = ${adjustedBook}; difference ${unexplained}`,
    reconciled: reasons.length === 0,
    reasons,
  };
}

module.exports = { reconcile, matchItems };
