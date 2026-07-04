// ============================================================================
// processVisitFolder.test.js
// ----------------------------------------------------------------------------
// Phase 1 tests, using Node's built-in test runner (no dependencies).
// Run with:  npm test     (which runs `node --test`)
//
// These prove the BRAIN is correct on known input before we ever connect it to
// Google Drive or a CRM.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { processVisitFolder, parseFolderName } from '../src/workflows/processVisitFolder.js';
import { createPostVisitDebrief } from '../src/workflows/createPostVisitDebrief.js';
import { extractFromTranscript } from '../src/services/voiceNoteService.js';
import { assignFollowUpPath, computeFollowUpDate } from '../src/workflows/assignFollowUpPath.js';
import { generateDocumentationScore } from '../src/workflows/generateDocumentationScore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FOLDER = path.join(
  __dirname,
  '..',
  'sample-visits',
  '2026-07-04 - 4710 Blum Rd - Maria Santos',
);

test('parseFolderName reads date, address, and seller', () => {
  const p = parseFolderName('2026-07-04 - 4710 Blum Rd - Maria Santos');
  assert.equal(p.visit_date, '2026-07-04');
  assert.equal(p.property_address, '4710 Blum Rd');
  assert.equal(p.seller_name, 'Maria Santos');
});

test('processVisitFolder counts media and finds the transcript', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  assert.equal(scan.property_address, '4710 Blum Rd');
  assert.equal(scan.seller_name, 'Maria Santos');
  assert.ok(scan.counts.photo >= 5, 'should count the photos');
  assert.equal(scan.counts.video, 1);
  assert.equal(scan.counts.audio, 1);
  assert.ok(scan.transcript_file, 'should find a transcript file');
  assert.match(scan.transcript_text, /4710 Blum/);
});

test('extractFromTranscript pulls the key facts and never invents', () => {
  const e = extractFromTranscript(
    'Just left 4710 Blum. Went inside and walked through. Seller wants 550k. ' +
      'I think we are closer to 450k. Wife is the decision maker. Roof is rough. ' +
      'They need to talk to their son. Motivation is 6 out of 10. Let us pursue and follow up in 2 weeks.',
  );
  assert.equal(e.entered_property, 'Yes');
  assert.equal(e.deal_status, 'Pursuing');
  assert.equal(e.seller_asking_price, '$550,000');
  assert.equal(e.likely_offer_range, '$450,000');
  assert.equal(e.motivation_score, '6/10');
  assert.equal(e.decision_maker, 'wife');
  assert.equal(e.follow_up_days, 14);
  assert.ok(e.repair_concerns.some((r) => /roof/i.test(r)));
  assert.equal(e.suggested_classification, 'Family Decision');
});

test('empty transcript returns all Unknown (no invention)', () => {
  const e = extractFromTranscript('');
  assert.equal(e.entered_property, 'Unknown');
  assert.equal(e.seller_asking_price, 'Unknown');
  assert.deepEqual(e.repair_concerns, []);
});

test('computeFollowUpDate adds days correctly', () => {
  assert.equal(computeFollowUpDate('2026-07-04', 14), '2026-07-18');
  assert.equal(computeFollowUpDate('2026-07-04', 0), '2026-07-04');
  assert.equal(computeFollowUpDate('2026-07-04', null), '');
});

test('assignFollowUpPath maps classification to the right owner', () => {
  const ready = assignFollowUpPath('Ready Now', '2026-07-04');
  assert.equal(ready.owner, 'Acquisition / Juan');
  assert.equal(ready.follow_up_date, '2026-07-04');

  const unknown = assignFollowUpPath('', '2026-07-04');
  assert.equal(unknown.classification, 'Unclassified');
  assert.equal(unknown.follow_up_date, '2026-07-05'); // default: next business day
});

test('documentation score requires photos/video for a viable entered deal', () => {
  const res = generateDocumentationScore({
    entered_property: 'Yes',
    deal_status: 'Pursuing',
    seller_classification: 'Family Decision',
    voice_memo_received: 'Yes',
    photos_uploaded: 'No',
    video_uploaded: 'No',
    next_best_action: 'Prepare offer',
    follow_up_date: '2026-07-18',
    visit_result: 'Visit completed — possible deal',
  });
  assert.equal(res.photos_required, 'Yes');
  assert.equal(res.documentation_score.photos_uploaded_if_required, 'No');
  assert.ok(res.missing_items.some((m) => /Photos/.test(m)));
});

test('documentation score does NOT require photos when Juan did not enter', () => {
  const res = generateDocumentationScore({
    entered_property: 'No',
    deal_status: 'Nurturing',
    seller_classification: 'Long-Term Nurture',
    voice_memo_received: 'Yes',
    photos_uploaded: 'No',
    video_uploaded: 'No',
    next_best_action: 'Follow up',
    follow_up_date: '2026-08-03',
    visit_result: 'No entry at door',
  });
  assert.equal(res.photos_required, 'No');
  assert.equal(res.documentation_score.photos_uploaded_if_required, 'Not Required');
});

test('end-to-end debrief on the sample folder is complete and correct', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan, { visitTrigger: 'Property Visit Completed' });

  assert.equal(d.property_address, '4710 Blum Rd');
  assert.equal(d.seller_name, 'Maria Santos');
  assert.equal(d.visit_date, '2026-07-04');
  assert.equal(d.entered_property, 'Yes');
  assert.equal(d.deal_status, 'Pursuing');
  assert.equal(d.seller_classification, 'Family Decision');
  assert.equal(d.seller_asking_price, '$550,000');
  assert.equal(d.likely_offer_range, '$450,000');
  assert.equal(d.voice_memo_received, 'Yes');
  assert.equal(d.photos_uploaded, 'Yes');
  assert.equal(d.video_uploaded, 'Yes');
  assert.equal(d.follow_up_date, '2026-07-18'); // 2 weeks after visit
  assert.equal(d.recommended_owner, 'Acquisition Ops Coordinator');
  // Full docs present, so nothing critical should be missing.
  assert.equal(d.documentation_score.photos_uploaded_if_required, 'Yes');
  assert.equal(d.documentation_score.video_uploaded_if_required, 'Yes');
  assert.ok(d.crm_ready_summary.includes('POST-VISIT DEBRIEF'));
});

test('a no-entry visit produces a valid debrief with photos not required', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan, {
    transcriptOverride:
      'Nobody home at 12 Oak St, no entry. Seller was a no-show. Nurture and follow up next week.',
    visitTrigger: 'Seller no-show',
  });
  assert.equal(d.entered_property, 'No');
  assert.equal(d.photos_required, 'No');
  assert.equal(d.documentation_score.photos_uploaded_if_required, 'Not Required');
  assert.ok(d.follow_up_date, 'should still set a follow-up date');
});
