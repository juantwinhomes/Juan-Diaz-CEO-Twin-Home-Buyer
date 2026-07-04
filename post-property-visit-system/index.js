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
import { buildScanFromVoicenote } from './src/services/voicenotesService.js';
import { createPostVisitDebrief } from './src/workflows/createPostVisitDebrief.js';
import { toReiBlackBookPayload } from './src/services/crmService.js';
import { buildNotifications, toEmail, topSeverity } from './src/services/notificationService.js';
import { buildKpiRecord, generateWeeklyReport, renderWeeklyReport } from './src/services/kpiService.js';

const KPI_LOG = 'src/data/kpiVisitsLog.jsonl';

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

  // --- Voicenotes mode -------------------------------------------------------
  if (args[0] === '--voicenote') {
    const jsonPath = args[1] || path.join(__dirname, 'src', 'data', 'voicenoteVisitInput.json');
    const abs = path.isAbsolute(jsonPath) ? jsonPath : path.join(__dirname, jsonPath);
    const input = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const scan = buildScanFromVoicenote(input);
    return {
      scan,
      options: {
        classificationOverride: input.classification_override || null,
        visitTrigger: input.visit_trigger || 'Voice Memo Received',
      },
      label: `Phase 3 (Voicenotes) — ${scan.folder_name || scan.folder_path}`,
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

// Read a JSONL log file into an array of records (ignoring blank lines).
function readJsonl(absPath) {
  if (!fs.existsSync(absPath)) return [];
  return fs
    .readFileSync(absPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// `node index.js --report [logPath] [start] [end]`
function runReport(args) {
  const logPath = args[1] && !/^\d{4}-\d{2}-\d{2}$/.test(args[1]) ? args[1] : KPI_LOG;
  const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const abs = path.isAbsolute(logPath) ? logPath : path.join(__dirname, logPath);
  const records = readJsonl(abs);

  console.log('='.repeat(70));
  console.log('POST-PROPERTY VISIT CONVERSION SYSTEM — Weekly KPI Review');
  console.log('='.repeat(70));
  console.log(`Source log: ${path.relative(__dirname, abs)} (${records.length} records)\n`);

  const report = generateWeeklyReport(records, { start: dates[0], end: dates[1] });
  console.log(renderWeeklyReport(report));

  const outPath = path.join(__dirname, 'src', 'data', 'weeklyReview.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n✅ Weekly review written to: ${path.relative(__dirname, outPath)}`);
  console.log('='.repeat(70));
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--report') {
    runReport(argv);
    return;
  }

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

  // --- Phase 4: REI BlackBook-ready output -----------------------------------
  const crm = toReiBlackBookPayload(debrief, { driveFolderUrl: scan.view_url || '' });
  console.log('\nREI BLACKBOOK PREVIEW');
  console.log(`  Contact:  ${crm.contact.full_name} — ${crm.contact.property_address || '(no address)'}`);
  console.log(`  Stage:    ${crm.pipeline_stage}`);
  console.log(`  Tags:     ${crm.tags.join(', ')}`);
  console.log(`  Task:     ${crm.follow_up_task.title} (due ${crm.follow_up_task.due_date || 'n/a'}, owner ${crm.follow_up_task.owner})`);
  const crmPath = path.join(__dirname, 'src', 'data', 'reiBlackBookPayload.json');
  fs.writeFileSync(crmPath, `${JSON.stringify(crm, null, 2)}\n`);
  console.log(`✅ REI BlackBook payload written to: ${path.relative(__dirname, crmPath)}`);

  // --- Phase 6: log this visit for weekly KPI review -------------------------
  const alerts = buildNotifications(debrief);
  fs.appendFileSync(
    path.join(__dirname, KPI_LOG),
    `${JSON.stringify(buildKpiRecord(debrief, alerts))}\n`,
  );

  // --- Phase 5: missing-documentation notifications --------------------------
  console.log('\nNOTIFICATIONS');
  if (!alerts.length) {
    console.log('  ✓ No documentation gaps — nothing to alert.');
  } else {
    console.log(`  Severity: ${topSeverity(alerts).toUpperCase()}  (${alerts.length} alert(s))`);
    for (const a of alerts) {
      console.log(`  [${a.severity.toUpperCase()}] ${a.message}`);
      console.log(`         → ${a.role} (${a.to}); fix: ${a.fix}`);
    }
    const email = toEmail(debrief, alerts);
    console.log(`\n  ✉️  Draft email ready (NOT sent): "${email.subject}"`);
    console.log(`      To: ${email.to.join(', ')}`);

    // Append to a local alert log so ops always has a record (no keys needed).
    const stamp = new Date().toISOString();
    const logLine = `${stamp} [${topSeverity(alerts).toUpperCase()}] ${debrief.property_address || 'property'} — ${alerts.map((a) => a.code).join(', ')}\n`;
    fs.appendFileSync(path.join(__dirname, 'src', 'data', 'alerts.log'), logLine);
    console.log('  📝 Appended to src/data/alerts.log');
  }
  console.log('='.repeat(70));
}

main();
