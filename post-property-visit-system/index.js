// ============================================================================
// index.js — entry point (Phases 1 & 2)
// ----------------------------------------------------------------------------
// Runs the full pipeline on ONE property-visit folder and prints a readable
// summary + writes the full debrief JSON to src/data/sampleDebriefOutput.json.
//
// The SOURCE of the folder can be local disk (Phase 1) or a Google Drive
// listing snapshot (Phase 2). Both produce the same "scan" object, so the
// brain (createPostVisitDebrief) is identical either way.
//
// Usage:
//   node index.js                              # local sample folder
//   node index.js "path/to/visit-folder"       # a specific local folder
//   node index.js --drive src/data/driveVisitInput.json   # a Drive snapshot
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processVisitFolder } from './src/workflows/processVisitFolder.js';
import { buildScanFromDrive } from './src/services/googleDriveService.js';
import { createPostVisitDebrief } from './src/workflows/createPostVisitDebrief.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Decide the source and return { scan, options, label } for the pipeline.
function getScanAndOptions() {
  const args = process.argv.slice(2);

  // --- Google Drive snapshot mode -------------------------------------------
  if (args[0] === '--drive') {
    const jsonPath = args[1] || path.join(__dirname, 'src', 'data', 'driveVisitInput.json');
    const abs = path.isAbsolute(jsonPath) ? jsonPath : path.join(__dirname, jsonPath);
    const input = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const scan = buildScanFromDrive(input);
    return {
      scan,
      options: {
        transcriptOverride: input.transcriptText || null,
        classificationOverride: input.classification_override || null,
        visitTrigger: input.visit_trigger || 'Property Visit Completed',
      },
      label: `Phase 2 (Google Drive) — ${scan.view_url || scan.folder_id}`,
    };
  }

  // --- Local folder mode -----------------------------------------------------
  let input;
  if (args[0]) {
    input = { visit_folder: args[0], visit_trigger: 'Property Visit Completed', transcript_override: null, classification_override: null };
  } else {
    input = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'data', 'sampleVisitInput.json'), 'utf8'));
  }
  const folderPath = path.isAbsolute(input.visit_folder)
    ? input.visit_folder
    : path.join(__dirname, input.visit_folder);
  const scan = processVisitFolder(folderPath);
  return {
    scan,
    options: {
      transcriptOverride: input.transcript_override,
      classificationOverride: input.classification_override,
      visitTrigger: input.visit_trigger,
    },
    label: `Phase 1 (local) — ${folderPath}`,
  };
}

function main() {
  const { scan, options, label } = getScanAndOptions();

  console.log('='.repeat(70));
  console.log('POST-PROPERTY VISIT CONVERSION SYSTEM');
  console.log('='.repeat(70));
  console.log(`Source: ${label}\n`);

  console.log('FOLDER SCAN');
  console.log(`  Folder:     ${scan.folder_name}`);
  console.log(`  Property:   ${scan.property_address || '(not in folder name)'}`);
  console.log(`  Seller:     ${scan.seller_name || '(not in folder name)'}`);
  console.log(`  Visit date: ${scan.visit_date || '(not in folder name)'}`);
  console.log(`  Photos: ${scan.counts.photo} | Video: ${scan.counts.video} | Audio: ${scan.counts.audio} | Docs: ${scan.counts.document}`);
  console.log(`  Transcript found: ${scan.transcript_file || 'NONE'}\n`);

  const debrief = createPostVisitDebrief(scan, options);

  console.log(debrief.crm_ready_summary);
  console.log('\nDOCUMENTATION SCORE');
  for (const [k, v] of Object.entries(debrief.documentation_score)) {
    const mark = v === 'Yes' || v === 'Not Required' ? '✓' : '✗';
    console.log(`  ${mark} ${k}: ${v}`);
  }

  if (debrief.missing_items.length) {
    console.log('\n⚠️  MISSING ITEMS');
    for (const item of debrief.missing_items) console.log(`  - ${item}`);
  }

  console.log('\nFOLLOW-UP');
  console.log(`  Owner:    ${debrief.recommended_owner}`);
  console.log(`  Sequence: ${debrief.recommended_follow_up_sequence}`);
  console.log(`  Date:     ${debrief.follow_up_date || '(special cadence)'}`);

  const outPath = path.join(__dirname, 'src', 'data', 'sampleDebriefOutput.json');
  fs.writeFileSync(outPath, `${JSON.stringify(debrief, null, 2)}\n`);
  console.log(`\n✅ Full debrief JSON written to: ${path.relative(__dirname, outPath)}`);
  console.log('='.repeat(70));
}

main();
