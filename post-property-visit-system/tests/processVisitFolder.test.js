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
import { buildScanFromDrive, classifyDriveFile } from '../src/services/googleDriveService.js';
import { buildScanFromVoicenote, cleanVoicenoteTranscript } from '../src/services/voicenotesService.js';
import { toReiBlackBookPayload } from '../src/services/crmService.js';
import { buildNotifications, toEmail, topSeverity } from '../src/services/notificationService.js';
import { buildKpiRecord, generateWeeklyReport } from '../src/services/kpiService.js';
import { sendToReiBlackBook } from '../src/services/webhookSender.js';
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

// -------------------- Phase 2: Google Drive --------------------

test('classifyDriveFile uses MIME type (HEIC photo, mp4 video, m4a audio)', () => {
  assert.equal(classifyDriveFile({ title: 'IMG_0167.HEIC', mimeType: 'image/heif' }), 'photo');
  assert.equal(classifyDriveFile({ title: 'clip.mp4', mimeType: 'video/mp4' }), 'video');
  assert.equal(classifyDriveFile({ title: 'memo.m4a', mimeType: 'audio/mp4' }), 'audio');
  assert.equal(classifyDriveFile({ title: 'deal.pdf', mimeType: 'application/pdf' }), 'document');
  assert.equal(classifyDriveFile({ title: 'notes', mimeType: 'application/vnd.google-apps.document' }), 'document');
  // Falls back to extension when MIME is unhelpful.
  assert.equal(classifyDriveFile({ title: 'photo.jpg', mimeType: '' }), 'photo');
});

test('buildScanFromDrive normalizes a Drive listing to the scan shape', () => {
  const scan = buildScanFromDrive({
    folderId: 'abc123',
    folderTitle: '2026-07-04 - 55 Elm St - John Roe',
    viewUrl: 'https://drive.google.com/drive/folders/abc123',
    files: [
      { title: 'front.HEIC', mimeType: 'image/heif' },
      { title: 'kitchen.jpg', mimeType: 'image/jpeg' },
      { title: 'walkthrough.mp4', mimeType: 'video/mp4' },
      { title: 'voice-note-transcript.txt', mimeType: 'text/plain' },
    ],
    transcriptText: 'Went inside 55 Elm. Seller wants 300k, we are at 250k. Pursue, follow up in 3 days.',
  });
  assert.equal(scan.source, 'google_drive');
  assert.equal(scan.property_address, '55 Elm St');
  assert.equal(scan.seller_name, 'John Roe');
  assert.equal(scan.counts.photo, 2);
  assert.equal(scan.counts.video, 1);
  assert.equal(scan.transcript_file, 'voice-note-transcript.txt');
});

test('buildScanFromDrive falls back to createdTime when folder name has no date', () => {
  const scan = buildScanFromDrive({
    folderTitle: '123 main st ',
    createdTime: '2026-07-04T22:10:09.822Z',
    files: [{ title: 'IMG_0167.HEIC', mimeType: 'image/heif' }],
  });
  assert.equal(scan.visit_date, '2026-07-04');
  assert.equal(scan.property_address, '123 main st');
  assert.equal(scan.counts.photo, 1);
});

test('end-to-end debrief on a Drive folder with missing memo flags the gaps', () => {
  const scan = buildScanFromDrive({
    folderTitle: '123 main st ',
    createdTime: '2026-07-04T22:10:09.822Z',
    files: [{ title: 'IMG_0167.HEIC', mimeType: 'image/heif' }],
  });
  const d = createPostVisitDebrief(scan, { visitTrigger: 'Property Visit Completed' });
  assert.equal(d.voice_memo_received, 'No');
  assert.equal(d.documentation_score.voice_memo_received, 'No');
  assert.ok(d.missing_items.some((m) => /Voice memo/.test(m)));
  // Default follow-up path prevents the lead from dying in CRM.
  assert.equal(d.recommended_owner, 'Acquisition Ops Coordinator');
  assert.equal(d.follow_up_date, '2026-07-05'); // createdTime + 1 default day
});

// -------------------- Phase 3: Voicenotes --------------------

test('cleanVoicenoteTranscript strips <br/> and collapses whitespace', () => {
  const cleaned = cleanVoicenoteTranscript('Line one. <br/>Line two.  <br />  Three.');
  assert.equal(cleaned, 'Line one. Line two. Three.');
});

test('extractor pulls the street address from the memo itself', () => {
  const e = extractFromTranscript('All right, 1940 41st Avenue, Oakland, California. Going to buy this.');
  assert.equal(e.property_address, '1940 41st Avenue, Oakland');
  assert.equal(e.deal_status, 'Pursuing');
});

test('buildScanFromVoicenote makes a scan from a note (memo counts as audio)', () => {
  const scan = buildScanFromVoicenote({
    note: {
      uuid: 'NLEjAE7B',
      title: '1940 41st Ave visit',
      date: '2026-07-04T21:59:00Z',
      transcript: 'All right, 1940 41st Avenue, Oakland. <br/>Going to buy this property.',
    },
  });
  assert.equal(scan.source, 'voicenotes');
  assert.equal(scan.has_audio, true);
  assert.equal(scan.counts.audio, 1);
  assert.equal(scan.visit_date, '2026-07-04');
  assert.match(scan.transcript_text, /Going to buy/);
});

test('end-to-end Voicenote debrief: real thin memo extracts address + pursuing', () => {
  const scan = buildScanFromVoicenote({
    note: {
      uuid: 'NLEjAE7B',
      title: '1940 41st Avenue Oakland property visit',
      date: '2026-07-04T21:59:00Z',
      transcript:
        "All right, 1940 41st Avenue, Oakland, California. <br/>I am here. The property appears to be in good condition. <br/>I think we're going to move forward with this. I think we are going to buy this property.",
    },
  });
  const d = createPostVisitDebrief(scan, { visitTrigger: 'Voice Memo Received' });
  assert.equal(d.property_address, '1940 41st Avenue, Oakland');
  assert.equal(d.voice_memo_received, 'Yes');
  assert.equal(d.deal_status, 'Pursuing');
  // Seller stance was NOT stated, so classification is honestly left for a human.
  assert.equal(d.seller_classification, '');
  assert.ok(d.missing_items.some((m) => /classification/i.test(m)));
  assert.equal(d.follow_up_date, '2026-07-05');
});

test('Voicenote can merge with a Drive folder for combined media + memo', () => {
  const scan = buildScanFromVoicenote({
    note: {
      uuid: 'x1',
      title: 'memo',
      date: '2026-07-04T10:00:00Z',
      transcript: 'Went inside 4710 Blum. Seller wants 550k, we are at 450k. Pursue, follow up in 2 weeks.',
    },
    drive: {
      folderTitle: '2026-07-04 - 4710 Blum Rd - Maria Santos',
      files: [
        { title: 'front.jpg', mimeType: 'image/jpeg' },
        { title: 'walkthrough.mp4', mimeType: 'video/mp4' },
      ],
    },
  });
  assert.equal(scan.source, 'voicenotes+drive');
  assert.equal(scan.has_photos, true);
  assert.equal(scan.has_video, true);
  assert.equal(scan.has_audio, true);
  const d = createPostVisitDebrief(scan, { visitTrigger: 'Property Visit Completed' });
  assert.equal(d.property_address, '4710 Blum Rd');
  assert.equal(d.seller_name, 'Maria Santos');
  assert.equal(d.deal_status, 'Pursuing');
});

test('aiDebriefService defaults to the local engine (no key required)', () => {
  const scan = buildScanFromVoicenote({
    note: { uuid: 'y1', title: 't', date: '2026-07-04T10:00:00Z', transcript: 'Going to buy 10 Oak St.' },
  });
  // options.engine omitted -> local parser -> synchronous plain object, no throw.
  const d = createPostVisitDebrief(scan, {});
  assert.equal(d.deal_status, 'Pursuing');
});

// -------------------- Phase 4: REI BlackBook output --------------------

test('toReiBlackBookPayload maps a full deal to contact, tags, stage, task', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan, { visitTrigger: 'Property Visit Completed' });
  const crm = toReiBlackBookPayload(d, { driveFolderUrl: 'https://drive.google.com/x' });

  assert.equal(crm.contact.first_name, 'Maria');
  assert.equal(crm.contact.last_name, 'Santos');
  assert.equal(crm.pipeline_stage, 'Follow-Up'); // Family Decision -> Follow-Up
  assert.ok(crm.tags.includes('seller'));
  assert.ok(crm.tags.includes('classification:Family Decision'));
  assert.ok(crm.tags.includes('motivation:warm')); // 6/10 -> warm
  assert.equal(crm.follow_up_task.owner, 'Acquisition Ops Coordinator');
  assert.equal(crm.follow_up_task.due_date, '2026-07-18');
});

test('webhook_payload carries contact email/phone as REI BlackBook match keys', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan);
  const { webhook_payload, contact } = toReiBlackBookPayload(d, {
    sellerPhone: '510-555-0142',
    sellerEmail: 'maria@example.com',
  });
  assert.equal(webhook_payload.contact_phone, '510-555-0142');
  assert.equal(webhook_payload.contact_email, 'maria@example.com');
  assert.equal(contact.phone, '510-555-0142');
});

test('webhook_payload is flat and all-string (Zapier/webhook ready)', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan);
  const { webhook_payload } = toReiBlackBookPayload(d);
  for (const [k, v] of Object.entries(webhook_payload)) {
    assert.equal(typeof v, 'string', `field ${k} must be a string for the webhook`);
  }
  assert.equal(webhook_payload.property_address, '4710 Blum Rd');
  assert.equal(webhook_payload.pipeline_stage, 'Follow-Up');
});

test('a pass gets a pass tag and Dead/Archive stage', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan, {
    transcriptOverride: 'Went inside 9 Pine St. Hard pass, condition is too rough and motivation is 1 out of 10.',
    classificationOverride: 'Pass',
  });
  const crm = toReiBlackBookPayload(d);
  assert.equal(crm.pipeline_stage, 'Dead / Archive');
  assert.ok(crm.tags.includes('pass'));
  assert.ok(crm.tags.includes('motivation:cold'));
});

// -------------------- Phase 5: notifications --------------------

test('a complete visit produces zero notifications', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan, { visitTrigger: 'Property Visit Completed' });
  const alerts = buildNotifications(d);
  assert.equal(alerts.length, 0);
  assert.equal(topSeverity(alerts), 'none');
  assert.equal(toEmail(d, alerts), null);
});

test('a missing voice memo raises a HIGH alert routed to the coordinator', () => {
  const d = createPostVisitDebrief(
    buildScanFromDrive({
      folderTitle: '123 main st ',
      createdTime: '2026-07-04T22:10:09.822Z',
      files: [{ title: 'IMG_0167.HEIC', mimeType: 'image/heif' }],
    }),
    { visitTrigger: 'Property Visit Completed' },
  );
  const alerts = buildNotifications(d);
  const memo = alerts.find((a) => a.code === 'NO_VOICE_MEMO');
  assert.ok(memo);
  assert.equal(memo.severity, 'high');
  assert.equal(memo.role, 'coordinator');
});

test('missing photos on a viable deal escalates to Juan', () => {
  // Viable, entered, but no photos uploaded -> photos_required Yes, uploaded No.
  const d = createPostVisitDebrief(
    {
      source: 'test', folder_name: 't', property_address: '5 Test Rd', seller_name: 'X',
      visit_date: '2026-07-04', counts: { photo: 0, video: 0, audio: 0, document: 0, other: 0 },
      files: { photo: [], video: [], audio: [], document: [], other: [] },
      has_photos: false, has_video: false, has_audio: false, has_documents: false,
      transcript_file: null, transcript_text: null,
    },
    {
      transcriptOverride: 'Went inside 5 Test Rd. Wife decides. Seller wants 400k, we are at 350k. Motivation 7 out of 10. Pursue, follow up in 3 days.',
    },
  );
  const alerts = buildNotifications(d);
  const photo = alerts.find((a) => a.code === 'NO_PHOTOS_VIABLE');
  assert.ok(photo, 'should flag missing photos on a viable deal');
  assert.equal(photo.severity, 'high');
  assert.equal(photo.role, 'juan');
  const email = toEmail(d, alerts);
  assert.match(email.subject, /ACTION NEEDED/);
});

// -------------------- Phase 6: KPI weekly review --------------------

const KPI_SAMPLE = [
  { visit_id: 'a', visit_date: '2026-07-01', deal_status: 'Pursuing', seller_classification: 'Family Decision', voice_memo_received: 'Yes', photos_required: 'Yes', photos_uploaded: 'Yes', video_required: 'Yes', video_uploaded: 'Yes', recommended_follow_up_sequence: 'Family-Decision Follow-Up', pass_reason: '', main_objection: 'talk to son', alert_codes: [] },
  { visit_id: 'b', visit_date: '2026-07-02', deal_status: 'Pursuing', seller_classification: 'Wants More Money', voice_memo_received: 'Yes', photos_required: 'Yes', photos_uploaded: 'No', video_required: 'Yes', video_uploaded: 'No', recommended_follow_up_sequence: 'Price Objection Sequence', pass_reason: '', main_objection: 'price gap', alert_codes: ['NO_PHOTOS_VIABLE', 'NO_VIDEO_VIABLE'] },
  { visit_id: 'c', visit_date: '2026-07-02', deal_status: 'Under Contract', seller_classification: 'Ready Now', voice_memo_received: 'No', photos_required: 'Yes', photos_uploaded: 'Yes', video_required: 'Yes', video_uploaded: 'No', recommended_follow_up_sequence: 'Same-Day Offer Push', pass_reason: '', main_objection: '', alert_codes: ['NO_VOICE_MEMO', 'NO_VIDEO_VIABLE'] },
];

test('buildKpiRecord captures the report-relevant fields', () => {
  const scan = processVisitFolder(SAMPLE_FOLDER);
  const d = createPostVisitDebrief(scan);
  const rec = buildKpiRecord(d, buildNotifications(d));
  assert.equal(rec.property_address, '4710 Blum Rd');
  assert.equal(rec.deal_status, 'Pursuing');
  assert.ok(Array.isArray(rec.alert_codes));
});

test('generateWeeklyReport computes the spec KPI fields', () => {
  const r = generateWeeklyReport(KPI_SAMPLE);
  assert.equal(r.visits_completed, 3);
  assert.equal(r.pct_with_voice_memo, 67); // 2 of 3
  assert.equal(r.full_package_denominator, 3); // all required visuals
  assert.equal(r.pct_with_full_package_when_required, 33); // only 'a' is complete
  assert.equal(r.under_contract_missing_visual, 1); // 'c' missing video
  assert.equal(r.top_process_failures[0].value, 'NO_VIDEO_VIABLE'); // appears twice
});

test('generateWeeklyReport dedupes by visit_id and filters by date range', () => {
  const withDup = [...KPI_SAMPLE, { ...KPI_SAMPLE[0], deal_status: 'Passing' }];
  const r = generateWeeklyReport(withDup, { start: '2026-07-02', end: '2026-07-02' });
  assert.equal(r.visits_completed, 2); // only 'b' and 'c' fall in range
});

// -------------------- Phase 7: live send (safety) --------------------

test('sendToReiBlackBook dry-runs when no webhook URL is configured', async () => {
  const res = await sendToReiBlackBook({ a: 'b' }, { url: '', live: false });
  assert.equal(res.sent, false);
  assert.equal(res.dryRun, true);
  assert.equal(res.reason, 'no-webhook-url');
});

test('sendToReiBlackBook dry-runs when URL is set but not live', async () => {
  const res = await sendToReiBlackBook({ a: 'b' }, { url: 'https://example.com/hook', live: false });
  assert.equal(res.sent, false);
  assert.equal(res.dryRun, true);
  assert.match(res.reason, /dry-run/);
  // The payload it WOULD send is returned for inspection — still nothing sent.
  assert.deepEqual(res.wouldSend, { a: 'b' });
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
