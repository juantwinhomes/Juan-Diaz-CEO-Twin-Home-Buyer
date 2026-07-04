// ============================================================================
// classifications.js
// ----------------------------------------------------------------------------
// The 8 seller classifications. Each entry is the single source of truth for:
//   - key:      machine value stored on the debrief
//   - label:    human-readable name
//   - meaning:  what it means in plain English
//   - followUp: the one-line follow-up intent (details live in followupRules.js)
//   - keywords: words in Juan's memo that HINT at this classification. The
//               local extractor (Phase 1) uses these to make a first guess.
//               A human coordinator can always override the guess.
// ============================================================================

export const CLASSIFICATIONS = [
  {
    key: 'READY_NOW',
    label: 'Ready Now',
    meaning: 'Seller is close to signing or verbally aligned.',
    followUp: 'Same-day offer / contract push.',
    keywords: ['ready to sign', 'wants to sell now', 'let\'s do it', 'sign today', 'verbally agreed', 'accepted'],
  },
  {
    key: 'WANTS_MORE_MONEY',
    label: 'Wants More Money',
    meaning: 'Seller price is above our number but motivation exists.',
    followUp: 'Price objection sequence and market update.',
    keywords: ['wants more', 'too low', 'price gap', 'higher price', 'not enough', 'holding out for'],
  },
  {
    key: 'FAMILY_DECISION',
    label: 'Family Decision',
    meaning: 'Seller needs spouse, child, sibling, or co-owner approval.',
    followUp: 'Family-decision follow-up sequence.',
    keywords: ['wife', 'husband', 'spouse', 'son', 'daughter', 'brother', 'sister', 'sibling', 'family', 'kids', 'children', 'co-owner', 'talk to their'],
  },
  {
    key: 'SHOPPING_OFFERS',
    label: 'Shopping Offers',
    meaning: 'Seller is comparing buyers.',
    followUp: 'Competitive follow-up and proof-of-close messaging.',
    keywords: ['other offers', 'shopping', 'comparing', 'another buyer', 'other investors', 'getting quotes', 'multiple offers'],
  },
  {
    key: 'TITLE_LEGAL_ISSUE',
    label: 'Title / Legal Issue',
    meaning: 'Ownership, probate, lien, or title uncertainty exists.',
    followUp: 'Assign title research or TC review.',
    keywords: ['probate', 'lien', 'title', 'deed', 'ownership', 'estate', 'inherited', 'legal', 'court', 'divorce'],
  },
  {
    key: 'TENANT_ACCESS_ISSUE',
    label: 'Tenant / Access Issue',
    meaning: 'Unable to inspect or tenant complicates sale.',
    followUp: 'Access plan and seller/tenant follow-up.',
    keywords: ['tenant', 'renter', 'occupied', 'no access', 'could not get in', 'couldn\'t get in', 'no entry', 'locked', 'lease'],
  },
  {
    key: 'LONG_TERM_NURTURE',
    label: 'Long-Term Nurture',
    meaning: 'Seller may sell later, not now.',
    followUp: '30/60/90-day nurture based on timeline.',
    keywords: ['not now', 'later', 'next year', 'few months', 'nurture', 'not ready', 'thinking about it', 'down the road'],
  },
  {
    key: 'PASS',
    label: 'Pass',
    meaning: 'No viable path due to price, condition, motivation, or deal risk.',
    followUp: 'Record pass reason. Set no follow-up or long-term review if appropriate.',
    keywords: ['pass', 'hard pass', 'walk away', 'not a deal', 'no deal', 'dead lead', 'not viable'],
  },
];

// Fast lookup by key.
export const CLASSIFICATION_BY_KEY = Object.fromEntries(
  CLASSIFICATIONS.map((c) => [c.key, c]),
);

// Look up a classification by its human label OR its key (case-insensitive).
// Returns undefined if not found so callers can decide how to handle it.
export function findClassification(value) {
  if (!value) return undefined;
  const needle = String(value).trim().toLowerCase();
  return CLASSIFICATIONS.find(
    (c) => c.key.toLowerCase() === needle || c.label.toLowerCase() === needle,
  );
}
