#!/usr/bin/env node
/**
 * Apps Script exposes EVERY top-level function to google.script.run unless its name ends with "_".
 * This script renames every non-public function to NAME_ across src/*.gs so only the allow-listed API is callable.
 * Idempotent. Also writes docs/public-functions.json (consumed by the test harness and DEPLOY.md).
 */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const PUBLIC = [
  'doGet','include','bootstrapApp','refreshView','whoAmI',
  'getLead','listLeads','createLead','addBulkLeads','updateLead','assignLead','logAttempt','addLeadNote','setNextAction',
  'completeNextAction','markOfferSent','getDashboards','setJuanFlag','setComplianceFlag','archiveLead','restoreLead',
  'createAppointment','updateAppointment','listAppointments',
  'getTodayDashboard','getJuanDashboard','getRepSnapshot','getWorkQueue',
  'getDailyMetrics','saveDailyMetrics','getNumbersDashboard',
  'getTools','createTool','updateTool','setToolTraining','logToolRun','undoToolRun','getRunsToday',
  'getSettings','saveSetting','getUsers','createUser','updateUser','disableUser',
  'createDatabaseBackup','getBackupLog','getAuditLog','getErrorLog','runDailyBackup',
  'setupDatabase','configureDatabase','setEnvironment','installTriggers','bootstrapAdmin','createTestData','archiveTestData',
  'resetDevelopmentDatabase','dedupeDailyMetrics', 'previewWhiteboardUpdate', 'applyWhiteboardUpdate', 'previewTidyNotes', 'applyTidyNotes','runAllTests'
];
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).map(f => path.join(SRC, f));
const sources = Object.fromEntries(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const declared = new Set();
for (const s of Object.values(sources)) for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) declared.add(m[1]);
const toRename = [...declared].filter(n => !PUBLIC.includes(n) && !n.endsWith('_'));
for (const f of files) {
  let s = sources[f];
  for (const n of toRename) {
    // skip property access (.name), object keys (name:), and already-suffixed names
    s = s.replace(new RegExp(`(?<![\\w$.])${n}(?![\\w$_])(?!\\s*:)`, 'g'), n + '_');
  }
  if (s !== sources[f]) fs.writeFileSync(f, s);
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'public-functions.json'), JSON.stringify(PUBLIC, null, 2));
const missing = PUBLIC.filter(n => !declared.has(n));
console.log(`renamed ${toRename.length} internal functions; public API = ${PUBLIC.length} functions` + (missing.length ? `; MISSING public declarations: ${missing.join(', ')}` : ''));
