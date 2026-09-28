'use strict';
// AP / AR aging by days past due as of a date.
const { daysBetween } = require('../lib/util');

const BUCKETS = [
  { key: 'current', label: 'Current', test: d => d <= 0 },
  { key: 'd1_30', label: '1–30', test: d => d >= 1 && d <= 30 },
  { key: 'd31_60', label: '31–60', test: d => d >= 31 && d <= 60 },
  { key: 'd61_90', label: '61–90', test: d => d >= 61 && d <= 90 },
  { key: 'd90_plus', label: 'Over 90', test: d => d > 90 },
];

/** items: [{id, name, due_date, date, amount_cents, entity_id, ...}] (open items only) */
function aging(items, asOf) {
  const rows = items.map(i => {
    const due = i.due_date || i.date;
    const days = daysBetween(due, asOf);
    return { ...i, days_past_due: days, bucket: BUCKETS.find(b => b.test(days)).key };
  }).sort((a, b) => b.days_past_due - a.days_past_due);
  const totals = Object.fromEntries(BUCKETS.map(b => [b.key, rows.filter(r => r.bucket === b.key).reduce((s, r) => s + r.amount_cents, 0)]));
  totals.total = rows.reduce((s, r) => s + r.amount_cents, 0);
  return { as_of: asOf, buckets: BUCKETS.map(({ key, label }) => ({ key, label })), rows, totals };
}

module.exports = { aging, BUCKETS };
