// ============================================================================
// crmService.js  (REI BlackBook)
// ----------------------------------------------------------------------------
// Turns a completed debrief into a REI BlackBook-ready payload.
//
// REI BlackBook ingests external data through Zapier / incoming webhooks: you
// paste a webhook URL and choose which fields to send. It is TAG-DRIVEN
// (seller type, source, motivation hot/warm/cold), plus custom fields, a note,
// and a follow-up task. So this module outputs:
//   - contact:          the person/property fields
//   - tags:             classification, motivation, deal-status, source tags
//   - custom_fields:    the structured deal facts
//   - note:             the human-readable CRM summary
//   - follow_up_task:   owner + due date
//   - webhook_payload:  a FLAT, all-string object ready to POST to a Zapier
//                       catch hook or REI BlackBook webhook (Phase 7).
//
// PHASE 4: build + inspect the payload with sample data (no network).
// PHASE 7: POST webhook_payload to your Zapier/REI BlackBook webhook URL.
// ============================================================================

// Suggested REI BlackBook pipeline stage per seller classification.
const STAGE_BY_CLASSIFICATION = {
  'Ready Now': 'Offer / Contract',
  'Wants More Money': 'Negotiating',
  'Family Decision': 'Follow-Up',
  'Shopping Offers': 'Negotiating',
  'Title / Legal Issue': 'Due Diligence',
  'Tenant / Access Issue': 'Follow-Up',
  'Long-Term Nurture': 'Nurture',
  Pass: 'Dead / Archive',
};

// Motivation score (x/10) -> REI BlackBook hot/warm/cold tag.
function motivationTag(motivationScore) {
  const m = String(motivationScore).match(/(\d{1,2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n >= 8) return 'motivation:hot';
  if (n >= 5) return 'motivation:warm';
  return 'motivation:cold';
}

// Split "Maria Santos" -> { first, last }. Handles single names gracefully.
function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * @param {object} d - a completed debrief (createPostVisitDebrief output)
 * @param {object} [opts]
 * @param {string} [opts.driveFolderUrl] - link to the property's Drive folder
 * @param {string} [opts.sellerPhone] - seller phone; REI BlackBook matches the
 *   existing contact by phone or email, so include one to UPDATE (not duplicate).
 * @param {string} [opts.sellerEmail] - seller email (same matching purpose)
 * @returns {object} REI BlackBook-ready structures (see module header)
 */
export function toReiBlackBookPayload(d, opts = {}) {
  const { first, last } = splitName(d.seller_name);
  const stage = STAGE_BY_CLASSIFICATION[d.seller_classification] || 'Needs Review';
  const sellerPhone = opts.sellerPhone || d.seller_phone || '';
  const sellerEmail = opts.sellerEmail || d.seller_email || '';

  // --- tags ------------------------------------------------------------------
  const tags = ['seller', 'source:post-visit-system'];
  if (d.seller_classification) tags.push(`classification:${d.seller_classification}`);
  if (d.deal_status && d.deal_status !== 'Unknown') tags.push(`status:${d.deal_status}`);
  const motTag = motivationTag(d.motivation_score);
  if (motTag) tags.push(motTag);
  if (d.deal_status === 'Passing' || d.seller_classification === 'Pass') tags.push('pass');
  if (d.missing_items.length) tags.push('docs:incomplete');

  // --- custom fields ---------------------------------------------------------
  const custom_fields = {
    visit_id: d.visit_id,
    visit_date: d.visit_date,
    visit_result: d.visit_result,
    entered_property: d.entered_property,
    deal_status: d.deal_status,
    seller_classification: d.seller_classification || 'Unclassified',
    seller_asking_price: d.seller_asking_price,
    likely_offer_range: d.likely_offer_range,
    repair_concerns: d.repair_concerns.join('; ') || 'None noted',
    motivation_score: d.motivation_score,
    urgency: d.urgency,
    decision_maker: d.decision_maker,
    main_objection: d.main_objection,
    next_best_action: d.next_best_action,
    follow_up_date: d.follow_up_date,
    pass_reason: d.pass_reason,
    documentation_status: d.missing_items.length
      ? `Incomplete (${d.missing_items.length} missing)`
      : 'Complete',
    missing_items: d.missing_items.join('; ') || 'None',
    drive_folder_url: opts.driveFolderUrl || '',
  };

  // --- follow-up task --------------------------------------------------------
  const follow_up_task = {
    title: `Follow up: ${d.property_address || 'property'} — ${d.recommended_follow_up_sequence}`,
    owner: d.recommended_owner,
    due_date: d.follow_up_date,
    action: d.next_best_action,
  };

  // --- flat, all-string webhook payload (direct REI BlackBook / Zapier) ------
  // contact_email / contact_phone are the MATCH KEYS REI BlackBook uses to
  // create-or-update the right contact. Include at least one to avoid duplicates.
  const webhook_payload = {
    source: 'Post-Visit Conversion System',
    contact_first_name: first,
    contact_last_name: last,
    contact_full_name: d.seller_name || 'Unknown',
    contact_email: sellerEmail,
    contact_phone: sellerPhone,
    property_address: d.property_address || '',
    pipeline_stage: stage,
    tags: tags.join(','),
    note: d.crm_ready_summary,
    ...Object.fromEntries(
      Object.entries(custom_fields).map(([k, v]) => [k, v == null ? '' : String(v)]),
    ),
    follow_up_task_title: follow_up_task.title,
    follow_up_task_owner: follow_up_task.owner,
    follow_up_task_due_date: follow_up_task.due_date || '',
  };

  return {
    contact: {
      first_name: first,
      last_name: last,
      full_name: d.seller_name || 'Unknown',
      email: sellerEmail,
      phone: sellerPhone,
      property_address: d.property_address || '',
    },
    pipeline_stage: stage,
    tags,
    custom_fields,
    note: d.crm_ready_summary,
    follow_up_task,
    webhook_payload,
  };
}
