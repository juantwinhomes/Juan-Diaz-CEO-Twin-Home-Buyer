// ============================================================================
// index.js — Phase 1 entry point
// ----------------------------------------------------------------------------
// Runs the full local pipeline on ONE property-visit folder:
//   1. Scan the folder (count photos/video/audio/docs, read the transcript).
//   2. Extract facts + classify seller + assign follow-up + score docs.
//   3. Print a readable summary AND write the full JSON to
//      src/data/sampleDebriefOutput.json.
//
// Usage:
//   node index.js                       # uses src/data/sampleVisitInput.json
//   node index.js "path/to/visit-folder"  # process a specific folder
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processVisitFolder } from './src/workflows/processVisitFolder.js';
import { createPostVisitDebrief } from './src/workflows/createPostVisitDebrief.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadInput() {
  const folderArg = process.argv[2];
  if (folderArg) {
    return { visit_folder: folderArg, visit_trigger: 'Property Visit Completed', transcript_override: null, classification_override: null };
  }
  const inputPath = path.join(__dirname, 'src', 'data', 'sampleVisitInput.json');
  return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

function main() {
  const input = loadInput();
  const folderPath = path.isAbsolute(input.visit_folder)
    ? input.visit_folder
    : path.join(__dirname, input.visit_folder);

  console.log('='.repeat(70));
  console.log('POST-PROPERTY VISIT CONVERSION SYSTEM — Phase 1 (local MVP)');
  console.log('='.repeat(70));
  console.log(`Processing folder: ${folderPath}\n`);

  const scan = processVisitFolder(folderPath);

  console.log('FOLDER SCAN');
  console.log(`  Property:   ${scan.property_address}`);
  console.log(`  Seller:     ${scan.seller_name}`);
  console.log(`  Visit date: ${scan.visit_date}`);
  console.log(`  Photos: ${scan.counts.photo} | Video: ${scan.counts.video} | Audio: ${scan.counts.audio} | Docs: ${scan.counts.document}`);
  console.log(`  Transcript found: ${scan.transcript_file || 'NONE'}\n`);

  const debrief = createPostVisitDebrief(scan, {
    transcriptOverride: input.transcript_override,
    classificationOverride: input.classification_override,
    visitTrigger: input.visit_trigger,
  });

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

  // Write the full JSON output for downstream phases / inspection.
  const outPath = path.join(__dirname, 'src', 'data', 'sampleDebriefOutput.json');
  fs.writeFileSync(outPath, `${JSON.stringify(debrief, null, 2)}\n`);
  console.log(`\n✅ Full debrief JSON written to: ${path.relative(__dirname, outPath)}`);
  console.log('='.repeat(70));
}

main();
