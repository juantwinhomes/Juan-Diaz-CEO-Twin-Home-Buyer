// ============================================================================
// googleDriveService.js
// ----------------------------------------------------------------------------
// Turns a Google Drive folder LISTING into the exact same "scan" object that
// processVisitFolder.js produces from a local folder. Because the shape matches,
// createPostVisitDebrief() (the brain) works on Drive data with zero changes.
//
// HOW THE DATA GETS HERE (Phase 2, no service account):
//   This Claude session is connected to Google Drive. Claude fetches the folder
//   listing + transcript text via the Drive tools and writes them into
//   src/data/driveVisitInput.json. This module then normalizes that JSON.
//
// PHASE 7 (full automation): add a fetchDriveFolder(folderId) here that calls
//   the googleapis SDK with a service-account key (see .env.example) and returns
//   the same { folderTitle, files, transcriptText } shape. Everything below stays.
// ============================================================================

import { FILE_TYPES, TRANSCRIPT_MARKERS } from '../config/fields.js';
import { parseFolderName } from '../workflows/processVisitFolder.js';

// Classify a Drive file by MIME type first (most reliable — Drive always sends
// it, e.g. "image/heif"), then fall back to the file extension.
export function classifyDriveFile(file) {
  const mime = (file.mimeType || '').toLowerCase();

  if (mime === 'application/vnd.google-apps.folder') return 'folder';
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  // Common document MIME types (PDFs, Office, Google Docs/Sheets/Slides, text).
  if (
    mime === 'application/pdf' ||
    mime === 'text/plain' ||
    mime.startsWith('application/vnd.google-apps.') ||
    mime.startsWith('application/vnd.openxmlformats') ||
    mime.startsWith('application/msword')
  ) {
    return 'document';
  }

  // Fallback: use the extension from the title (matches Phase 1 local logic).
  const title = (file.title || file.name || '').toLowerCase();
  const dot = title.lastIndexOf('.');
  const ext = dot >= 0 ? title.slice(dot) : '';
  for (const [type, extensions] of Object.entries(FILE_TYPES)) {
    if (extensions.includes(ext)) return type;
  }
  return 'other';
}

// Does this Drive file look like Juan's voice-memo transcript?
function looksLikeTranscript(file) {
  const title = (file.title || file.name || '').toLowerCase();
  const mime = (file.mimeType || '').toLowerCase();
  const isTextish =
    mime === 'text/plain' ||
    mime === 'application/vnd.google-apps.document' ||
    title.endsWith('.txt');
  return isTextish && TRANSCRIPT_MARKERS.some((m) => title.includes(m));
}

/**
 * Normalize a Drive folder listing into the standard scan object.
 *
 * @param {object} input
 * @param {string} input.folderTitle - the Drive folder's title
 * @param {string} [input.folderId]  - the Drive folder id (kept for reference)
 * @param {string} [input.viewUrl]   - Drive URL for humans
 * @param {Array<{title?:string,name?:string,mimeType?:string}>} input.files
 * @param {string} [input.transcriptText] - transcript already fetched by Claude
 * @param {string} [input.transcriptFileName]
 * @param {string} [input.createdTime] - Drive folder createdTime (RFC 3339);
 *   used as the visit_date fallback when the folder name has no date.
 * @returns {object} scan object identical in shape to processVisitFolder()
 */
export function buildScanFromDrive(input) {
  const folderTitle = (input.folderTitle || '').trim();
  const parsed = parseFolderName(folderTitle);

  // If the folder name has no date, fall back to the Drive creation date so a
  // follow-up date can still be computed. (Real dates beat "today" guesses.)
  let visitDate = parsed.visit_date;
  if (!visitDate && input.createdTime && /^\d{4}-\d{2}-\d{2}/.test(input.createdTime)) {
    visitDate = input.createdTime.slice(0, 10);
  }

  const counts = { photo: 0, video: 0, audio: 0, document: 0, other: 0 };
  const files = { photo: [], video: [], audio: [], document: [], other: [] };

  let transcriptFile = input.transcriptFileName || null;
  let transcriptText = input.transcriptText || null;

  for (const f of input.files || []) {
    const type = classifyDriveFile(f);
    if (type === 'folder') continue; // ignore nested subfolders
    const name = f.title || f.name || '(untitled)';
    counts[type] += 1;
    files[type].push(name);
    if (!transcriptFile && looksLikeTranscript(f)) transcriptFile = name;
  }

  return {
    source: 'google_drive',
    folder_id: input.folderId || '',
    view_url: input.viewUrl || '',
    folder_path: input.viewUrl || input.folderId || folderTitle,
    folder_name: folderTitle,
    visit_date: visitDate,
    property_address: parsed.property_address,
    seller_name: parsed.seller_name,
    counts,
    files,
    has_photos: counts.photo > 0,
    has_video: counts.video > 0,
    has_audio: counts.audio > 0,
    has_documents: counts.document > 0,
    transcript_file: transcriptFile,
    transcript_text: transcriptText,
  };
}
