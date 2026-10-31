/**
 * Retell webhook receiver for seller practice calls.
 * Paste into the Apps Script of the "Seller practice calls" Google Sheet and deploy as a web app
 * (Execute as: Me, Who has access: Anyone). Retell posts call_started, call_ended and
 * call_analyzed; only call_analyzed is kept, one row per call.
 */
var CHECKS = ['no_price', 'according_to_source', 'visit_booked', 'honest_advice', 'no_pressure', 'story_ok'];
var HEAD = ['Received (PT)', 'Call ID', 'Agent', 'From number', 'Rep name', 'Started (PT)', 'Minutes']
  .concat(CHECKS).concat(['Passed', 'Coach note', 'Transcript', 'Recording']);

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_('bad json'); }
  if (body.event !== 'call_analyzed' || !body.call) return out_('ignored');
  var c = body.call, a = (c.call_analysis && c.call_analysis.custom_analysis_data) || {};
  var sh = sheet_();
  if (alreadyHave_(sh, c.call_id)) return out_('duplicate');
  var checks = CHECKS.map(function (k) { return a[k] === true || a[k] === 'true'; });
  var mins = c.end_timestamp && c.start_timestamp ? Math.round((c.end_timestamp - c.start_timestamp) / 6000) / 10 : '';
  sh.appendRow([pt_(Date.now()), c.call_id, c.agent_name || c.agent_id || '', c.from_number || '', a.rep_name || '',
    c.start_timestamp ? pt_(c.start_timestamp) : '', mins]
    .concat(checks).concat([checks.every(Boolean), a.coach_note || '', (c.transcript || '').slice(0, 45000), c.recording_url || '']));
  return out_('ok');
}

function sheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Calls') || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Calls');
  if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.setFrozenRows(1); }
  return sh;
}
function alreadyHave_(sh, id) {
  if (!id || sh.getLastRow() < 2) return false;
  return sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().some(function (r) { return r[0] === id; });
}
function pt_(ms) { return Utilities.formatDate(new Date(ms), 'America/Los_Angeles', 'yyyy-MM-dd HH:mm'); }
function out_(t) { return ContentService.createTextOutput(t); }
