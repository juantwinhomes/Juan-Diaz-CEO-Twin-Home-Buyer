// ============================================================================
// followupRules.js
// ----------------------------------------------------------------------------
// The follow-up "play" for each seller classification: who owns it, how fast
// they must act, and what they do. assignFollowUpPath.js reads this map.
//
// timingDays = how many BUSINESS-ish days out the follow-up date should land.
//   0  => same day
//   null => handled by a special cadence (e.g. 30/60/90 nurture)
// ============================================================================

export const FOLLOW_UP_RULES = {
  READY_NOW: {
    owner: 'Acquisition / Juan',
    timing: 'Same day',
    timingDays: 0,
    action: 'Push offer, contract, or final decision.',
    sequence: 'Same-Day Offer Push',
  },
  WANTS_MORE_MONEY: {
    owner: 'Acquisition Ops Coordinator',
    timing: '2-3 business days',
    timingDays: 3,
    action: 'Price objection follow-up and market reality message.',
    sequence: 'Price Objection Sequence',
  },
  FAMILY_DECISION: {
    owner: 'Acquisition Ops Coordinator',
    timing: '3-7 days',
    timingDays: 5,
    action: 'Follow up after family discussion.',
    sequence: 'Family-Decision Follow-Up',
  },
  SHOPPING_OFFERS: {
    owner: 'Acquisition / Sales',
    timing: '1-3 business days',
    timingDays: 2,
    action: 'Competitive proof-of-close follow-up.',
    sequence: 'Competitive Proof-of-Close',
  },
  TITLE_LEGAL_ISSUE: {
    owner: 'TC / Title Research',
    timing: 'Same day or next business day',
    timingDays: 1,
    action: 'Open title/legal research task.',
    sequence: 'Title / Legal Research',
  },
  TENANT_ACCESS_ISSUE: {
    owner: 'Acquisition Ops Coordinator',
    timing: 'Same day or next business day',
    timingDays: 1,
    action: 'Create access plan and seller/tenant follow-up.',
    sequence: 'Access Plan Follow-Up',
  },
  LONG_TERM_NURTURE: {
    owner: 'CRM Automation',
    timing: '30 / 60 / 90 days',
    timingDays: 30,
    action: 'Add to nurture sequence.',
    sequence: '30/60/90 Nurture',
  },
  PASS: {
    owner: 'Acquisition Ops Coordinator',
    timing: 'Same day',
    timingDays: 0,
    action: 'Record pass reason and close or long-term review.',
    sequence: 'Pass / Archive',
  },
};

// Default fallback play used when no classification is available yet.
// This is the "No next action" failure-mode fix: never let a lead die in CRM.
export const DEFAULT_FOLLOW_UP = {
  owner: 'Acquisition Ops Coordinator',
  timing: 'Next business day',
  timingDays: 1,
  action: 'Classify seller and set next action (auto-created default task).',
  sequence: 'Unclassified — Needs Review',
};
