// ============================================================================
// processVisitFolder.js
// ----------------------------------------------------------------------------
// Scans a single property-visit folder on the LOCAL disk and reports what's
// inside: how many photos / videos / audio files / documents, whether a
// transcript exists, and the address/seller/date parsed from the folder name.
//
// PHASE 1: reads a local folder (our fake "Google Drive" folder).
// PHASE 2: googleDriveService.js will produce the SAME shape from real Drive,
//          so processVisitFolder() stays the single entry point.
//
// Folder-name convention:  YYYY-MM-DD - PROPERTY ADDRESS - SELLER NAME
// Example:                 2026-07-04 - 4710 Blum Rd - Maria Santos
// Missing/odd file names are fine — we count by extension, not by exact name.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { FILE_TYPES, TRANSCRIPT_MARKERS } from '../config/fields.js';

// Which media bucket does this extension belong to? Returns null if unknown.
function classifyExtension(ext) {
  const e = ext.toLowerCase();
  for (const [type, extensions] of Object.entries(FILE_TYPES)) {
    if (extensions.includes(e)) return type;
  }
  return null;
}

// Parse "YYYY-MM-DD - Address - Seller" into pieces. Any part may be missing.
export function parseFolderName(folderName) {
  const parts = folderName.split(' - ').map((p) => p.trim());
  const result = { visit_date: '', property_address: '', seller_name: '' };
  if (parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
    result.visit_date = parts[0];
    result.property_address = parts[1] || '';
    result.seller_name = parts[2] || '';
  } else {
    // No leading date — treat first part as address, second as seller.
    result.property_address = parts[0] || '';
    result.seller_name = parts[1] || '';
  }
  return result;
}

/**
 * Scan a visit folder and return a structured inventory.
 * @param {string} folderPath - path to the property-visit folder
 * @returns {object} inventory + parsed folder-name fields
 */
export function processVisitFolder(folderPath) {
  const absPath = path.resolve(folderPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    throw new Error(`Visit folder not found or not a directory: ${absPath}`);
  }

  const folderName = path.basename(absPath);
  const parsed = parseFolderName(folderName);

  const counts = { photo: 0, video: 0, audio: 0, document: 0, other: 0 };
  const files = { photo: [], video: [], audio: [], document: [], other: [] };
  let transcriptFile = null;
  let transcriptText = null;

  for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.startsWith('.')) continue; // skip hidden files like .DS_Store

    const ext = path.extname(name);
    const type = classifyExtension(ext) || 'other';
    counts[type] += 1;
    files[type].push(name);

    // Detect the transcript: a .txt whose name looks like a memo/transcript.
    const lowerName = name.toLowerCase();
    const looksLikeTranscript =
      ext.toLowerCase() === '.txt' &&
      TRANSCRIPT_MARKERS.some((marker) => lowerName.includes(marker));
    if (looksLikeTranscript && !transcriptFile) {
      transcriptFile = name;
      transcriptText = fs.readFileSync(path.join(absPath, name), 'utf8');
    }
  }

  return {
    folder_path: absPath,
    folder_name: folderName,
    visit_date: parsed.visit_date,
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
