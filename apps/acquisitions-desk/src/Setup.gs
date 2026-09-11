/**
 * Setup.gs — one-time / repair utilities run from the Apps Script editor by the owner.
 * setupDatabase() is idempotent: it creates what is missing and never destroys existing data.
 * These are public so they can be run from the editor, but each one refuses to run for anyone but the script owner.
 */

/** Only the account that owns/deploys the script may run setup utilities (active user == effective user). */
function isOwnerSession_() {
  var active = getActiveEmail_(), effective = '';
  try { effective = trimStr_(Session.getEffectiveUser().getEmail()).toLowerCase(); } catch (e) {}
  return !!active && active === effective;
}
function requireOwnerSession_() {
  var active = getActiveEmail_(), effective = '';
  try { effective = trimStr_(Session.getEffectiveUser().getEmail()).toLowerCase(); } catch (e) {}
  if (!active || !effective || active !== effective) throw accessDenied_('Setup utilities can only be run by the script owner from the Apps Script editor.');
  return active;
}
function setupUser_() {
  var email = getActiveEmail_();
  var u = null; try { u = getCurrentUser_(); } catch (e) {}
  return u || { user_id: 'SYSTEM_SETUP', name: 'Setup (' + (email || 'owner') + ')', email: email, role: 'ADMIN', permission_level: 100, capabilities: capabilitiesForRole_('ADMIN') };
}

/**
 * Creates the Master Database (or repairs the configured one): all sheets, exact headers, seeds, protection.
 * Returns a summary object. Safe to run again at any time.
 */
function setupDatabase() {
  requireOwnerSession_();
  var props = PropertiesService.getScriptProperties(), id = props.getProperty(PROP_DB_ID), ss, created = false;
  if (id) { ss = SpreadsheetApp.openById(id); }
  else { ss = SpreadsheetApp.create(DB_NAME); props.setProperty(PROP_DB_ID, ss.getId()); created = true; }
  _dbCache = { ss: ss, sheets: {}, headers: {}, tables: {} };
  var report = { spreadsheet_id: ss.getId(), spreadsheet_url: ss.getUrl(), created: created, sheets: [], seeded: {} };
  try { ss.setSpreadsheetTimeZone(DEFAULT_SETTINGS.business_timezone); } catch (e) {}
  Object.keys(SHEETS).forEach(function (k) { report.sheets.push(ensureSheet_(ss, SHEETS[k], HEADERS[k])); });
  // Remove the default empty "Sheet1" only if we created the file and it is untouched.
  var def = ss.getSheetByName('Sheet1'); if (def && created && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  _dbCache = { ss: ss, sheets: {}, headers: {}, tables: {} };
  report.seeded.settings = seedSettings_();
  report.seeded.users = seedUsers_();
  report.seeded.tools = seedTools_();
  report.protection = protectDatabase_(ss);
  if (!props.getProperty(PROP_ENV)) props.setProperty(PROP_ENV, 'production');
  report.env = props.getProperty(PROP_ENV);
  safeAudit_(setupUser_(), 'SYSTEM', ss.getId(), 'SETUP_DATABASE', { created: created, sheets: report.sheets.length });
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
/** Point the script at an existing spreadsheet (e.g. one uploaded to Drive), then repair/seed it. */
function configureDatabase(spreadsheetId) {
  requireOwnerSession_();
  if (!spreadsheetId) throw validationError_('spreadsheetId is required');
  SpreadsheetApp.openById(spreadsheetId); // throws if inaccessible
  PropertiesService.getScriptProperties().setProperty(PROP_DB_ID, spreadsheetId);
  _dbCache = { ss: null, sheets: {}, headers: {}, tables: {} };
  return setupDatabase();
}
function setEnvironment(env) {
  requireOwnerSession_();
  if (env !== 'production' && env !== 'development') throw validationError_('env must be production or development');
  PropertiesService.getScriptProperties().setProperty(PROP_ENV, env); return env;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name), status = 'ok_';
  if (!sh) { sh = ss.insertSheet(name); status = 'created'; }
  var lastCol = sh.getLastColumn();
  var existing = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return toStr_(h).trim(); }) : [];
  if (!existing.filter(function (h) { return h; }).length) { sh.getRange(1, 1, 1, headers.length).setValues([headers]); existing = headers.slice(); if (status === 'ok_') status = 'headers written'; }
  else {
    var missing = headers.filter(function (h) { return existing.indexOf(h) < 0; });
    if (missing.length) { var start = existing.filter(function (h) { return h; }).length + 1; sh.getRange(1, start, 1, missing.length).setValues([missing]); status = 'added columns: ' + missing.join(', '); }
  }
  var width = Math.max(sh.getLastColumn(), headers.length);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#17223B').setFontColor('#FFFFFF');
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
  // Plain-text format so yyyy-MM-dd strings and ISO timestamps are stored exactly as written (no date coercion).
  try { sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), width).setNumberFormat('@'); } catch (e) {}
  return { sheet: name, status: status };
}
function seedSettings_() {
  var t = readTable_(SHEETS.SETTINGS), have = {}; t.rows.forEach(function (r) { have[toStr_(r.setting_key)] = true; });
  var added = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (!have[k]) { appendRowObject_(SHEETS.SETTINGS, { setting_key: k, setting_value: DEFAULT_SETTINGS[k], updated_by: 'SYSTEM_SETUP', updated_at: nowUtcIso_() }); added.push(k); } });
  // app_version always reflects the deployed code
  upsertSetting_('app_version', APP_VERSION, null);
  return added;
}
function seedUsers_() {
  var t = readTable_(SHEETS.USERS); if (t.rows.length) return 'skipped (USERS already has ' + t.rows.length + ' rows)';
  var ts = nowUtcIso_(), rows = SEED_USERS.map(function (u) {
    return { user_id: 'USR-' + u.name.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/g, ''), name: u.name, email: u.email, team: u.team, role: u.role,
      active: !!(u.active && u.email), permission_level: PERMISSION_LEVEL[u.role], created_at: ts, updated_at: ts };
  });
  appendRowObjects_(SHEETS.USERS, rows);
  return rows.length + ' users seeded; ' + rows.filter(function (r) { return !r.email; }).length + ' need an email before they can log in';
}
function seedTools_() {
  var t = readTable_(SHEETS.TOOL_INVENTORY); if (t.rows.length) return 'skipped (TOOL_INVENTORY already has ' + t.rows.length + ' rows)';
  var ts = nowUtcIso_(), rows = SEED_TOOLS.map(function (s) {
    return { tool_id: s.tool_id, name: s.name, description: s.description || '', built_by: s.built_by || '', operator: s.operator || '', backup_operator: '',
      status: 'Unconfirmed', steps: '', expected_output: '', cadence: s.cadence || 'Not set', link: s.link || '', recommendation: 'Decide', handoff_date: '',
      verdict: 'Not handed over yet', proof_last_week: '', asked_date: '', created_at: ts, updated_at: ts };
  });
  appendRowObjects_(SHEETS.TOOL_INVENTORY, rows);
  return rows.length + ' tools seeded';
}
/** Protect every sheet so only the owner (and the script, which runs as the owner) can edit cells directly. */
function protectDatabase_(ss) {
  var out = [];
  ss.getSheets().forEach(function (sh) {
    try {
      var existing = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      var p = existing.length ? existing[0] : sh.protect();
      p.setDescription(APP_NAME + ' — edit through the dashboard, not here');
      var me = Session.getEffectiveUser();
      p.removeEditors(p.getEditors()); if (p.canDomainEdit()) p.setDomainEdit(false);
      try { p.addEditor(me); } catch (e) {}
      out.push(sh.getName() + ': protected');
    } catch (e) { out.push(sh.getName() + ': protection failed — ' + e.message); }
  });
  return out;
}

/** Daily backup trigger (03:00 in the script timezone). Idempotent. */
function installTriggers() {
  requireOwnerSession_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runDailyBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runDailyBackup').timeBased().everyDays(1).atHour(3).create();
  safeAudit_(setupUser_(), 'SYSTEM', 'runDailyBackup', 'TRIGGER_INSTALLED', {});
  return 'Daily backup trigger installed (runDailyBackup, daily at 03:00 ' + Session.getScriptTimeZone() + ').';
}

/** Adds the account running this (from the editor) to USERS as ADMIN if it is not there yet. */
function bootstrapAdmin() {
  var email = requireOwnerSession_();
  if (findUserByEmail_(email)) return 'Already in USERS: ' + email;
  var ts = nowUtcIso_();
  appendRowObject_(SHEETS.USERS, { user_id: generateId_('USR'), name: email.split('@')[0], email: email, team: 'Technical', role: 'ADMIN', active: true, permission_level: 100, created_at: ts, updated_at: ts });
  return 'Added ' + email + ' as ADMIN. Edit the name in USERS.';
}

/** Safe test records (addresses start with "TEST - "). Returns the created lead ids. */
function createTestData() {
  requireOwnerSession_();
  var user = setupUser_(), ctx = leadContext_(), ids = {};
  var mk = function (label, patch) {
    var d = parseLeadInput_({ address: 'TEST - ' + label, seller_name: 'Test Seller', phone: '', source: 'PPC', equity_note: 'test record' });
    var rec = newLeadRecord_(user, d, leadExists_); Object.keys(patch || {}).forEach(function (k) { rec[k] = patch[k]; });
    appendRowObject_(SHEETS.LEADS, rec); recordActivity_(user, rec.lead_id, ACTION.LEAD_CREATED, '', '', '', 'test data'); ids[label] = rec.lead_id; return rec;
  };
  mk('100 Main Street (overdue)', { next_action: 'Call back', due_date: shiftDateString_(ctx.today, -3) });
  mk('101 Main Street (due today)', { next_action: 'Send offer', due_date: ctx.today });
  mk('102 Main Street (future)', { next_action: 'Follow up', due_date: shiftDateString_(ctx.today, 4) });
  mk('103 Main Street (no next action)', {});
  mk('104 Main Street (no due date)', { next_action: 'Pull comps' });
  mk('105 Main Street (compliance)', { compliance_mailer_check: true, flag_juan: true, next_action: 'Wait for Juan', due_date: ctx.today });
  safeAudit_(user, 'LEAD', 'TEST', 'TEST_DATA_CREATED', ids);
  return ids;
}
/** Archives every TEST lead as bad data (no hard delete). */
function archiveTestData() {
  requireOwnerSession_();
  var user = setupUser_(), n = 0;
  readTable_(SHEETS.LEADS).rows.forEach(function (l) {
    if (toStr_(l.address).indexOf('TEST - ') !== 0 || LIVE_STATUSES.indexOf(toStr_(l.status)) < 0) return;
    mutateLead_(user, l.lead_id, null, function (lead, acts) { acts.push(buildActivity_(user, lead.lead_id, ACTION.ARCHIVED, 'status', lead.status, 'ARCHIVED_BAD_DATA', 'test cleanup')); lead.status = 'ARCHIVED_BAD_DATA'; lead.archive_reason = 'test data'; return true; });
    n++;
  });
  return n + ' test leads archived';
}
/**
 * DEVELOPMENT ONLY: clears data rows (keeps headers, SETTINGS, USERS, TOOL_INVENTORY) in a database whose
 * name contains "DEV" while THB_ENV=development. Refuses to touch anything else.
 */
function resetDevelopmentDatabase() {
  requireOwnerSession_();
  var env = PropertiesService.getScriptProperties().getProperty(PROP_ENV), ss = getDb_();
  if (env !== 'development' || ss.getName().toUpperCase().indexOf('DEV') < 0) throw accessDenied_('Refusing: only allowed when THB_ENV=development and the spreadsheet name contains DEV.');
  ['LEADS', 'LEAD_ACTIVITY', 'APPOINTMENTS', 'DAILY_METRICS', 'TOOL_TRAINING', 'TOOL_RUNS', 'AUDIT_LOG', 'ERROR_LOG', 'BACKUP_LOG'].forEach(function (k) {
    var sh = getSheet_(SHEETS[k]); if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  _dbCache.tables = {};
  return 'Development database cleared.';
}
