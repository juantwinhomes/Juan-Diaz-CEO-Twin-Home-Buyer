// ============================================================================
// generateDocumentationScore.js
// ----------------------------------------------------------------------------
// Scores how complete a visit's documentation is across 7 fields, each rated
// "Yes" | "No" | "Not Required", and builds a list of missing_items.
//
// The logic respects the decision map:
//   - If Juan did NOT enter, photos/video are "Not Required".
//   - If it's a pass / hard-pass, photos/video are "Not Required".
//   - If pursuing (viable deal) or under contract, photos/video are REQUIRED
//     and score "No" until uploads exist.
// ============================================================================

import { FULL_DOC_CHECKLIST } from '../config/fields.js';

// Small helper: choose Yes / No / Not Required.
function score(required, present) {
  if (!required) return 'Not Required';
  return present ? 'Yes' : 'No';
}

/**
 * @param {object} d - a partially-filled debrief. We read these fields:
 *   entered_property, deal_status, seller_classification,
 *   voice_memo_received, photos_uploaded, video_uploaded,
 *   next_best_action, follow_up_date, visit_result
 * @returns {{ documentation_score: object, missing_items: string[],
 *             photos_required: string, video_required: string }}
 */
export function generateDocumentationScore(d) {
  const entered = d.entered_property === 'Yes';
  const passing = d.deal_status === 'Passing';
  const underContract = d.deal_status === 'Under Contract';
  const pursuing = d.deal_status === 'Pursuing';

  // Photos/video are required only for a viable (pursuing) or under-contract
  // deal AND only when Juan actually got inside.
  const fullDocsRequired = (pursuing || underContract) && entered;

  const photosRequired = fullDocsRequired;
  const videoRequired = fullDocsRequired;

  const voiceMemoReceived = !!d.voice_memo_received && d.voice_memo_received !== 'No';
  const photosPresent = d.photos_uploaded === 'Yes' || d.photos_uploaded === true;
  const videoPresent = d.video_uploaded === 'Yes' || d.video_uploaded === true;

  const documentation_score = {
    // A voice memo/update is ALWAYS required — it's Juan's captured judgment.
    voice_memo_received: score(true, voiceMemoReceived),
    // Visit outcome recorded = we have a visit_result string.
    visit_outcome_recorded: score(true, !!d.visit_result),
    // Seller classified = a non-empty classification is set.
    seller_classified: score(true, !!d.seller_classification),
    photos_uploaded_if_required: score(photosRequired, photosPresent),
    video_uploaded_if_required: score(videoRequired, videoPresent),
    next_action_assigned: score(true, !!d.next_best_action && d.next_best_action !== 'Unknown'),
    // A follow-up date is required unless this is a hard pass with no follow-up.
    follow_up_date_set: score(!passing, !!d.follow_up_date),
  };

  // Build the human-readable list of what's missing / needs attention.
  const missing_items = [];
  if (documentation_score.voice_memo_received === 'No') {
    missing_items.push('Voice memo / update from Juan');
  }
  if (documentation_score.seller_classified === 'No') {
    missing_items.push('Seller classification');
  }
  if (documentation_score.next_action_assigned === 'No') {
    missing_items.push('Next best action');
  }
  if (documentation_score.follow_up_date_set === 'No') {
    missing_items.push('Follow-up date');
  }
  if (documentation_score.photos_uploaded_if_required === 'No') {
    // List the full photo checklist so the coordinator knows the target.
    missing_items.push(
      `Photos (required for viable deal): ${FULL_DOC_CHECKLIST.filter((i) => i.includes('photo')).join(', ')}`,
    );
  }
  if (documentation_score.video_uploaded_if_required === 'No') {
    missing_items.push('30-60 second walkthrough video');
  }
  if (passing && !d.pass_reason) {
    missing_items.push('Pass reason (required before closing)');
  }

  return {
    documentation_score,
    missing_items,
    photos_required: photosRequired ? 'Yes' : 'No',
    video_required: videoRequired ? 'Yes' : 'No',
  };
}
