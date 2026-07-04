// ============================================================================
// fields.js
// ----------------------------------------------------------------------------
// Central definitions for the whole system:
//   - which file extensions count as photo / video / audio / document
//   - the "full documentation package" checklist
//   - the 7 documentation-score fields
//   - a blank debrief JSON template (the canonical output shape)
//
// Everything else in the codebase reads from here, so there is ONE place to
// change a rule instead of hunting through the code.
// ============================================================================

// Which file extensions the folder scanner treats as each media type.
// Lowercased comparisons happen in the scanner, so keep these lowercase.
export const FILE_TYPES = {
  photo: ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif'],
  video: ['.mp4', '.mov', '.m4v', '.avi', '.webm'],
  audio: ['.m4a', '.mp3', '.wav', '.aac', '.ogg'],
  document: ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
};

// A transcript is a special document: plain-text version of Juan's voice memo.
// The scanner flags any file whose name contains one of these markers.
export const TRANSCRIPT_MARKERS = ['transcript', 'voice-note', 'voicenote', 'memo'];

// The minimum "full documentation package" required for a viable / under-contract
// deal. Used to build the missing_items list when full docs are required.
export const FULL_DOC_CHECKLIST = [
  'Front exterior photo',
  'Street view / neighborhood photo',
  'Kitchen photo',
  'Bathroom photo',
  'Living room / main interior photo',
  '30-60 second walkthrough video',
  '2-5 minute voice memo',
];

// The 7 fields that make up every documentation score.
// Each is scored "Yes" | "No" | "Not Required".
export const DOCUMENTATION_SCORE_FIELDS = [
  'voice_memo_received',
  'visit_outcome_recorded',
  'seller_classified',
  'photos_uploaded_if_required',
  'video_uploaded_if_required',
  'next_action_assigned',
  'follow_up_date_set',
];

// The canonical output shape. createPostVisitDebrief() fills a copy of this.
// Keeping it here means the JSON schema is documented in code and never drifts.
export function blankDebrief() {
  return {
    visit_id: '',
    property_address: '',
    seller_name: '',
    visit_date: '',
    visit_result: '',
    entered_property: '',
    deal_status: '',
    seller_classification: '',
    seller_asking_price: '',
    likely_offer_range: '',
    repair_concerns: [],
    motivation_score: '',
    urgency: '',
    decision_maker: '',
    main_objection: '',
    next_best_action: '',
    follow_up_date: '',
    photos_required: '',
    photos_uploaded: '',
    video_required: '',
    video_uploaded: '',
    voice_memo_received: '',
    pass_reason: '',
    documentation_score: {
      voice_memo_received: '',
      visit_outcome_recorded: '',
      seller_classified: '',
      photos_uploaded_if_required: '',
      video_uploaded_if_required: '',
      next_action_assigned: '',
      follow_up_date_set: '',
    },
    operations_notes: '',
    crm_ready_summary: '',
    missing_items: [],
    recommended_owner: '',
    recommended_follow_up_sequence: '',
  };
}
