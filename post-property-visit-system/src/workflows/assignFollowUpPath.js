// ============================================================================
// assignFollowUpPath.js
// ----------------------------------------------------------------------------
// Given a seller classification, return the follow-up "play": who owns it,
// how fast, what they do, the campaign name, and the concrete follow-up date.
//
// If no classification is available yet, we fall back to DEFAULT_FOLLOW_UP so a
// lead can NEVER silently die in the CRM (that's a named failure mode).
// ============================================================================

import { FOLLOW_UP_RULES, DEFAULT_FOLLOW_UP } from '../config/followupRules.js';
import { findClassification } from '../config/classifications.js';

// Add `days` calendar days to a YYYY-MM-DD string and return YYYY-MM-DD.
// timingDays === 0 means "same day" => returns the visit date unchanged.
export function computeFollowUpDate(visitDate, days) {
  if (days == null) return ''; // special cadence (e.g. 30/60/90) — leave blank
  if (!visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return '';
  const base = new Date(`${visitDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * @param {string} classificationValue - a classification key OR label
 * @param {string} visitDate - YYYY-MM-DD, used to compute the follow-up date
 * @param {number|null} overrideDays - if Juan's memo gave explicit timing
 *   (e.g. "follow up in 2 weeks"), pass it here to override the rule's default.
 * @returns {object} the follow-up play
 */
export function assignFollowUpPath(classificationValue, visitDate, overrideDays = null) {
  const classification = findClassification(classificationValue);

  if (!classification) {
    const days = overrideDays != null ? overrideDays : DEFAULT_FOLLOW_UP.timingDays;
    return {
      classification: 'Unclassified',
      owner: DEFAULT_FOLLOW_UP.owner,
      timing: DEFAULT_FOLLOW_UP.timing,
      action: DEFAULT_FOLLOW_UP.action,
      sequence: DEFAULT_FOLLOW_UP.sequence,
      follow_up_date: computeFollowUpDate(visitDate, days),
    };
  }

  const rule = FOLLOW_UP_RULES[classification.key];
  const days = overrideDays != null ? overrideDays : rule.timingDays;

  return {
    classification: classification.label,
    owner: rule.owner,
    timing: rule.timing,
    action: rule.action,
    sequence: rule.sequence,
    follow_up_date: computeFollowUpDate(visitDate, days),
  };
}
