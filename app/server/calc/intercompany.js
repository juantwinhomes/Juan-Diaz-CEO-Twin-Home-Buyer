'use strict';
// Intercompany rollforward for each pair of entities. Entity A's net position toward B must be the exact
// opposite of B's net position toward A. Anything else is an error in one of the two sets of books.

/**
 * Net amount the counterparty owes this entity (positive) from one transaction.
 * Bank rows are signed by cash: money sent to an affiliate (-) creates a receivable (+);
 * money received from an affiliate (+) creates a payable (-).
 * Non-bank journal rows carry a positive amount that increases the account's own balance.
 */
function netReceivable(t) {
  if (t.account_subtype === 'due_from') return t.bank_account_id ? -t.amount_cents : t.amount_cents;
  if (t.account_subtype === 'due_to') return -t.amount_cents;
  return 0;
}

/** txns: [{id, entity_id, counterparty_entity_id, account_subtype, amount_cents, bank_account_id, date, document_id, source_row}] */
function intercompany(txns, entities) {
  const ic = txns.filter(t => t.counterparty_entity_id && (t.account_subtype === 'due_from' || t.account_subtype === 'due_to'));
  const pairs = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i].id, b = entities[j].id;
      const aSide = ic.filter(t => t.entity_id === a && t.counterparty_entity_id === b);
      const bSide = ic.filter(t => t.entity_id === b && t.counterparty_entity_id === a);
      if (!aSide.length && !bSide.length) continue;
      const aNet = aSide.reduce((s, t) => s + netReceivable(t), 0);
      const bNet = bSide.reduce((s, t) => s + netReceivable(t), 0);
      pairs.push({
        entity_a: a, entity_b: b,
        a_net_receivable_cents: aNet, b_net_receivable_cents: bNet,
        difference_cents: aNet + bNet,
        matches: aNet + bNet === 0,
        a_lines: aSide.map(t => ({ ...t, net_cents: netReceivable(t) })),
        b_lines: bSide.map(t => ({ ...t, net_cents: netReceivable(t) })),
        formula: `${a} says ${b} owes it ${aNet}; ${b} says ${a} owes it ${bNet}. These must sum to zero.`,
      });
    }
  }
  return { pairs, all_match: pairs.every(p => p.matches) };
}

module.exports = { intercompany, netReceivable };
