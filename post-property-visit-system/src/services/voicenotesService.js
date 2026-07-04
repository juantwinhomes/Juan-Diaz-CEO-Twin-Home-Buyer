// ============================================================================
// voicenotesService.js
// ----------------------------------------------------------------------------
// Turns a Voicenotes note into the standard "scan" object the brain consumes.
//
// HOW THE DATA GETS HERE (Phase 3, no keys):
//   This Claude session is connected to Voicenotes. Claude fetches the note
//   (title, transcript, date) via the Voicenotes tools and writes it into
//   src/data/voicenoteVisitInput.json. This module cleans + normalizes it.
//
// A visit's photos/videos usually live in Google Drive while the voice memo
// lives in Voicenotes. So buildScanFromVoicenote() can OPTIONALLY merge a Drive
// snapshot (drive input) to combine the memo with the media in one debrief.
// ============================================================================

import { buildScanFromDrive } from './googleDriveService.js';

// Voicenotes transcripts can contain <br/> tags and HTML entities. Clean them
// into plain text so the extractor reads natural sentences.
export function cleanVoicenoteTranscript(raw) {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ') // <br/> -> space
    .replace(/<[^>]+>/g, ' ') // strip any other HTML tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/**
 * @param {object} input
 * @param {object} input.note - { uuid, title, transcript, date }
 * @param {object} [input.drive] - optional Drive snapshot (see googleDriveService)
 *   to merge photos/video/docs with the memo.
 * @param {string} [input.visit_trigger]
 * @returns {object} scan object identical in shape to processVisitFolder()
 */
export function buildScanFromVoicenote(input) {
  const note = input.note || {};
  const transcript = cleanVoicenoteTranscript(note.transcript || '');
  const noteDate = typeof note.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(note.date)
    ? note.date.slice(0, 10)
    : '';

  // Start from the Drive media if provided; otherwise an empty media inventory.
  let base;
  if (input.drive) {
    base = buildScanFromDrive(input.drive);
  } else {
    base = {
      source: 'voicenotes',
      folder_id: '',
      view_url: '',
      folder_path: `voicenote:${note.uuid || ''}`,
      folder_name: note.title || '',
      visit_date: '',
      property_address: '',
      seller_name: '',
      counts: { photo: 0, video: 0, audio: 0, document: 0, other: 0 },
      files: { photo: [], video: [], audio: [], document: [], other: [] },
      has_photos: false,
      has_video: false,
      has_audio: false,
      has_documents: false,
      transcript_file: null,
      transcript_text: null,
    };
  }

  // The Voicenote IS the voice memo: count it as audio and supply the transcript.
  base.source = input.drive ? 'voicenotes+drive' : 'voicenotes';
  base.counts.audio += 1;
  base.files.audio.push(note.title ? `Voicenote: ${note.title}` : 'Voicenote');
  base.has_audio = true;
  base.transcript_file = note.title ? `Voicenote: ${note.title}` : 'Voicenote';
  base.transcript_text = transcript;

  // Visit date: prefer Drive/folder date, then the note's recording date.
  if (!base.visit_date) base.visit_date = noteDate;

  return base;
}
