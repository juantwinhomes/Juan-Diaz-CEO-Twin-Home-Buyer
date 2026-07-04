// ============================================================================
// createPostVisitDebrief.js
// ----------------------------------------------------------------------------
// The BRAIN. Takes the folder inventory + the extracted memo facts and produces
// the complete debrief JSON (the OUTPUT SCHEMA in the spec), including:
//   - seller classification & follow-up path
//   - documentation score & missing items
//   - a short, factual CRM-ready summary
//   - operations notes and KPI-ready fields
//
// This function does NOT touch Google Drive, CRM, or any API. It is pure logic
// on plain objects, which is exactly what makes Phase 1 safe to test.
// ============================================================================

import { blankDebrief } from '../config/fields.js';
import { extractFromTranscript } from '../services/voiceNoteService.js';
import { generateDocumentationScore } from './generateDocumentationScore.js';
import { assignFollowUpPath } from './assignFollowUpPath.js';
import { findClassification } from '../config/classifications.js';

// Build a stable visit_id from date + address (no external ID service needed).
function makeVisitId(date, address) {
  const slug = (address || 'unknown-address')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${date || 'nodate'}_${slug}`;
}

// Map the extractor's deal_status to a plain visit_result string.
function deriveVisitResult(scan, extraction) {
  if (extraction.entered_property === 'No') {
    // Distinguish no-show vs no-entry vs simply didn't enter.
    const t = (scan.transcript_text || '').toLowerCase();
    if (/no-show|no show|didn'?t show|seller wasn'?t/.test(t)) return 'Seller no-show';
    if (/no entry|no access|locked|couldn'?t get in|could not get in/.test(t)) return 'No entry at door';
    return 'Visit completed — did not enter';
  }
  if (extraction.deal_status === 'Under Contract') return 'Under contract';
  if (extraction.deal_status === 'Passing') return 'Visit completed — pass';
  if (extraction.deal_status === 'Pursuing') return 'Visit completed — possible deal';
  if (extraction.deal_status === 'Nurturing') return 'Visit completed — nurture';
  return 'Visit completed';
}

// Compose the short CRM-ready summary (format from operationsDebriefPrompt.md).
function buildCrmSummary(d) {
  const line = (label, value) => `${label}: ${value || 'Unknown'}`;
  return [
    'POST-VISIT DEBRIEF',
    line('Property', d.property_address),
    line('Seller', d.seller_name),
    line('Visit Outcome', d.visit_result),
    line('Entered Property', d.entered_property),
    line('Deal Status', d.deal_status),
    line('Seller Classification', d.seller_classification),
    line('Seller Asking Price', d.seller_asking_price),
    line('Likely Offer Range', d.likely_offer_range),
    line('Repair Concerns', d.repair_concerns.length ? d.repair_concerns.join('; ') : 'None noted'),
    line('Motivation / Urgency', `${d.motivation_score}${d.urgency && d.urgency !== 'Unknown' ? ` / ${d.urgency}` : ''}`),
    line('Decision Maker', d.decision_maker),
    line('Main Objection', d.main_objection),
    line('Next Action', d.next_best_action),
    line('Follow-Up Date', d.follow_up_date),
    line('Documentation Status', d.missing_items.length ? `Incomplete (${d.missing_items.length} item(s) missing)` : 'Complete'),
    line('Missing Items', d.missing_items.length ? d.missing_items.join('; ') : 'None'),
    line('Operations Notes', d.operations_notes),
  ].join('\n');
}

/**
 * @param {object} scan - output of processVisitFolder()
 * @param {object} [options]
 * @param {string} [options.transcriptOverride] - use this text instead of the
 *   transcript found in the folder (handy for testing / manual entry).
 * @param {string} [options.classificationOverride] - coordinator's manual
 *   classification (key or label) that wins over the AI/heuristic guess.
 * @param {string} [options.visitTrigger] - which trigger started this visit.
 * @returns {object} the full debrief matching the output JSON schema.
 */
export function createPostVisitDebrief(scan, options = {}) {
  const transcript = options.transcriptOverride ?? scan.transcript_text ?? '';
  const extraction = extractFromTranscript(transcript);

  const d = blankDebrief();

  // --- identity (folder name is authoritative; memo fills gaps) --------------
  d.property_address = scan.property_address || (extraction.property_address !== 'Unknown' ? extraction.property_address : '');
  d.seller_name = scan.seller_name || (extraction.seller_name !== 'Unknown' ? extraction.seller_name : '');
  d.visit_date = scan.visit_date || '';
  d.visit_id = makeVisitId(d.visit_date, d.property_address);

  // --- core facts from the memo ----------------------------------------------
  d.entered_property = extraction.entered_property;
  d.deal_status = extraction.deal_status;
  d.visit_result = deriveVisitResult(scan, extraction);
  d.seller_asking_price = extraction.seller_asking_price;
  d.likely_offer_range = extraction.likely_offer_range;
  d.repair_concerns = extraction.repair_concerns;
  d.motivation_score = extraction.motivation_score;
  d.urgency = extraction.urgency;
  d.decision_maker = extraction.decision_maker;
  d.main_objection = extraction.main_objection;
  d.next_best_action = extraction.next_best_action;
  d.pass_reason = extraction.deal_status === 'Passing' ? extraction.pass_reason : '';

  // --- voice memo received? --------------------------------------------------
  // Received if we have transcript text OR an audio file in the folder.
  d.voice_memo_received = transcript.trim() || scan.has_audio ? 'Yes' : 'No';

  // --- upload presence from folder scan --------------------------------------
  d.photos_uploaded = scan.has_photos ? 'Yes' : 'No';
  d.video_uploaded = scan.has_video ? 'Yes' : 'No';

  // --- seller classification (manual override wins) --------------------------
  const chosen = options.classificationOverride
    ? findClassification(options.classificationOverride)
    : findClassification(extraction.suggested_classification);
  d.seller_classification = chosen ? chosen.label : '';

  // --- follow-up path (uses memo timing if Juan gave it) ---------------------
  const followUp = assignFollowUpPath(d.seller_classification, d.visit_date, extraction.follow_up_days);
  d.follow_up_date = followUp.follow_up_date;
  d.recommended_owner = followUp.owner;
  d.recommended_follow_up_sequence = followUp.sequence;
  if (d.next_best_action === 'Unknown' || !d.next_best_action) {
    d.next_best_action = followUp.action;
  }

  // --- documentation score & required flags ----------------------------------
  const docScore = generateDocumentationScore(d);
  d.documentation_score = docScore.documentation_score;
  d.missing_items = docScore.missing_items;
  d.photos_required = docScore.photos_required;
  d.video_required = docScore.video_required;

  // --- operations notes (auto-generated hints for the coordinator) -----------
  const notes = [];
  if (d.voice_memo_received === 'No') notes.push('No voice memo captured — request a 60-second update from Juan today.');
  if (!chosen) notes.push('Classification could not be auto-determined — coordinator must classify before end of day.');
  if (options.visitTrigger) notes.push(`Trigger: ${options.visitTrigger}.`);
  if (extraction.follow_up_timing && extraction.follow_up_timing !== 'Unknown') {
    notes.push(`Juan requested follow-up ${extraction.follow_up_timing}.`);
  }
  d.operations_notes = notes.join(' ') || 'No action items flagged by the system.';

  // --- CRM-ready summary (built last so it sees the final fields) ------------
  d.crm_ready_summary = buildCrmSummary(d);

  return d;
}
