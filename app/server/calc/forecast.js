'use strict';
// Rolling 13-week cash forecast. Every line says whether it is KNOWN (in the books / signed) or an ESTIMATE,
// with its assumption and source. Weeks run Monday to Sunday starting the week of the as-of date.
const { addDays, weekStart, daysBetween } = require('../lib/util');

/**
 * @param asOf 'YYYY-MM-DD'
 * @param startCash {amount_cents, label, source}
 * @param adjustments known cash already in the bank but not in the books yet [{amount_cents, label, source}]
 * @param apBills unpaid bills [{id, vendor, due_date, amount_cents, source, on_hold_reason?}]
 * @param arInvoices open invoices [{id, customer, due_date, amount_cents, source}]
 * @param assumptions [{id, label, amount_cents, frequency, start_date, end_date, assumption}]
 * @param expectedDraws [{id, label, expected_date, amount_cents, source}]
 */
function cashForecast({ asOf, startCash, adjustments = [], apBills = [], arInvoices = [], assumptions = [], expectedDraws = [], collectionLagDays = 14, staleReceivableDays = 90, weeks = 13 }) {
  const first = weekStart(asOf);
  const weekList = Array.from({ length: weeks }, (_, i) => ({ index: i + 1, start: addDays(first, i * 7), end: addDays(first, i * 7 + 6), lines: [] }));
  const lastDay = weekList[weekList.length - 1].end;
  const excluded = [];
  const place = (date, line) => {
    const d = date < first ? first : date;
    const w = weekList.find(w => d >= w.start && d <= w.end);
    if (w) w.lines.push({ ...line, date });
    else excluded.push({ ...line, date, reason: 'Falls after the 13-week window.' });
  };

  for (const a of adjustments) place(first, { ...a, basis: 'known', kind: 'bank_not_in_books' });

  for (const b of apBills) {
    if (b.on_hold_reason) { excluded.push({ ...b, amount_cents: -b.amount_cents, basis: 'known', reason: b.on_hold_reason }); continue; }
    const pastDue = b.due_date < asOf;
    place(b.due_date, {
      label: `Pay ${b.vendor} ${b.invoice_no || ''}`.trim(), amount_cents: -b.amount_cents, basis: 'known', kind: 'ap',
      assumption: pastDue ? 'Past due: assumed paid this week.' : 'Paid on due date.', source: b.source,
    });
  }

  for (const inv of arInvoices) {
    const past = daysBetween(inv.due_date, asOf);
    if (past > staleReceivableDays) {
      excluded.push({ ...inv, basis: 'estimate', reason: `Over ${staleReceivableDays} days past due. Not counted until collection is confirmed.` });
      continue;
    }
    const expected = addDays(inv.due_date < asOf ? asOf : inv.due_date, collectionLagDays);
    place(expected, {
      label: `Collect ${inv.customer} ${inv.invoice_no || ''}`.trim(), amount_cents: inv.amount_cents, basis: 'estimate', kind: 'ar',
      assumption: `Collected ${collectionLagDays} days after due date.`, source: inv.source,
    });
  }

  for (const d of expectedDraws) {
    place(d.expected_date, { label: d.label, amount_cents: d.amount_cents, basis: 'estimate', kind: 'draw', assumption: `Lender funds by ${d.expected_date}.`, source: d.source });
  }

  for (const a of assumptions) {
    const step = { weekly: 7, biweekly: 14 }[a.frequency];
    const end = a.end_date && a.end_date < lastDay ? a.end_date : lastDay;
    const dates = [];
    if (a.frequency === 'once') dates.push(a.start_date);
    else if (a.frequency === 'monthly') {
      for (let d = a.start_date; d <= end;) {
        dates.push(d);
        const [y, m, day] = d.split('-').map(Number);
        const next = new Date(Date.UTC(y, m, Math.min(day, 28)));
        d = next.toISOString().slice(0, 10);
      }
    } else for (let d = a.start_date; d <= end; d = addDays(d, step)) dates.push(d);
    for (const d of dates) {
      if (d < first && a.frequency !== 'once') continue;
      place(d, { label: a.label, amount_cents: a.amount_cents, basis: 'estimate', kind: 'assumption', assumption: a.assumption, source: { assumption_id: a.id } });
    }
  }

  let running = startCash.amount_cents;
  for (const w of weekList) {
    w.opening_cents = running;
    w.inflows_cents = w.lines.filter(l => l.amount_cents > 0).reduce((s, l) => s + l.amount_cents, 0);
    w.outflows_cents = w.lines.filter(l => l.amount_cents < 0).reduce((s, l) => s + l.amount_cents, 0);
    running += w.inflows_cents + w.outflows_cents;
    w.closing_cents = running;
    w.lines.sort((a, b) => a.date.localeCompare(b.date));
  }
  const min = weekList.reduce((m, w) => (w.closing_cents < m.closing_cents ? w : m), weekList[0]);
  return {
    as_of: asOf, start: startCash, weeks: weekList, excluded,
    minimum: { week: min.index, week_start: min.start, closing_cents: min.closing_cents },
    negative_weeks: weekList.filter(w => w.closing_cents < 0).map(w => ({ week: w.index, week_start: w.start, closing_cents: w.closing_cents })),
    estimate_share: (() => {
      const all = weekList.flatMap(w => w.lines);
      const est = all.filter(l => l.basis === 'estimate').reduce((s, l) => s + Math.abs(l.amount_cents), 0);
      const tot = all.reduce((s, l) => s + Math.abs(l.amount_cents), 0);
      return tot ? est / tot : 0;
    })(),
    formula: 'Closing cash = opening cash + inflows + outflows, week by week',
  };
}

module.exports = { cashForecast };
