/**
 * Tests.gs — the required test suite (spec §61–71). Runs inside Apps Script (owner, from the editor) against the
 * configured database using TEST records, and also under the Node harness in test/. Returns a PASS/FAIL report.
 * Identity-switching tests (unauthorized / inactive users) can only run under the Node harness or by hand — see DEPLOY.md.
 */

function assert_(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
function assertOk_(r, msg) { assert_(r && r.ok === true, (msg || 'expected ok') + ' — got ' + JSON.stringify(r).slice(0, 300)); return r.data; }
function assertFail_(r, code, msg) { assert_(r && r.ok === false && (!code || r.code === code), (msg || 'expected failure ' + code) + ' — got ' + JSON.stringify(r).slice(0, 300)); return r; }

function runAllTests() {
  requireOwnerSession_();
  var results = [], suite = testSuite_();
  Object.keys(suite).forEach(function (name) {
    try { suite[name](); results.push({ test: name, status: 'PASS' }); }
    catch (e) { results.push({ test: name, status: 'FAIL', error: String(e && e.message || e) }); }
  });
  try { archiveTestData(); } catch (e) {}
  var failed = results.filter(function (r) { return r.status === 'FAIL'; }).length;
  var report = { passed: results.length - failed, failed: failed, results: results };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function testSuite_() {
  var T = {};
  var stamp = randomToken_(4);
  var addr = function (s) { return 'TEST - ' + s + ' ' + stamp; };
  // Phone numbers unique per run: duplicate detection also looks at archived leads (on purpose), so a previous run's
  // archived TEST leads must not collide with this one.
  var base = 2000 + Math.floor(Math.random() * 7000);
  var phone = function (i) { return '510-555-' + String(base + i); };

  T['persistence: create lead, reload, still there'] = function () {
    var l = assertOk_(createLead({ address: addr('100 Main Street'), seller_name: 'R. Nunez', phone: phone(0), source: 'PPC', equity_note: 'owned free and clear' }));
    assert_(/^LEAD-\d{8}-[A-Z0-9]{5}$/.test(l.lead_id), 'permanent id format ' + l.lead_id);
    _dbCache.tables = {}; // simulate a fresh request
    var again = assertOk_(getLead(l.lead_id));
    assert_(again.address === l.address && again.version === 1 && again.status === 'NEW', 'lead persisted with version 1');
    assert_(again.activity.length === 1 && again.activity[0].action_type === 'LEAD_CREATED', 'LEAD_CREATED activity written');
  };
  T['bulk import: added / duplicates / failed summary'] = function () {
    var text = [addr('200 Oak Ave') + ', A. Seller, ' + phone(1) + ', TV, probate', addr('200 Oak Ave') + ', dup, ' + phone(1) + ', TV', ', no address, 555', addr('201 Oak Avenue') + ', B, ' + phone(2) + ', PPL'].join('\n');
    var s = assertOk_(addBulkLeads(text));
    assert_(s.added === 2, 'added 2 got ' + s.added); assert_(s.duplicates_skipped === 1, 'dup skipped 1'); assert_(s.failed === 1 && s.failures[0].line === 3, 'failed row reported with line number');
    var s2 = assertOk_(addBulkLeads(addr('200 oak avenue') + ', same house normalized'));
    assert_(s2.duplicates_skipped === 1 && s2.added === 0, 'normalized address duplicate detected');
  };
  T['status change writes LEADS + LEAD_ACTIVITY and bumps version'] = function () {
    var l = assertOk_(createLead({ address: addr('300 Pine St') }));
    var u = assertOk_(updateLead(l.lead_id, { status: 'CONTACT_MADE' }, l.version));
    assert_(u.status === 'CONTACT_MADE' && u.version === 2, 'status + version');
    var full = assertOk_(getLead(l.lead_id));
    var sc = full.activity.filter(function (a) { return a.action_type === 'STATUS_CHANGED'; });
    assert_(sc.length === 1 && sc[0].old_value === 'NEW' && sc[0].new_value === 'CONTACT_MADE' && sc[0].user_id, 'STATUS_CHANGED with user identity');
    assertFail_(updateLead(l.lead_id, { status: 'BOGUS' }, u.version), 'VALIDATION_ERROR', 'invalid status rejected');
    assertFail_(updateLead(l.lead_id, { flag_juan: true }, u.version), 'VALIDATION_ERROR', 'flag not patchable via updateLead');
  };
  T['optimistic concurrency: stale version is rejected, other change survives (TEST B)'] = function () {
    var l = assertOk_(createLead({ address: addr('400 Elm St') }));
    var v10 = l.version;
    var b = assertOk_(updateLead(l.lead_id, { seller_name: 'User B wrote this' }, v10));
    assert_(b.version === v10 + 1, 'B saved → version bumped');
    var a = assertFail_(updateLead(l.lead_id, { seller_name: 'User A stale write' }, v10), 'CONFLICT_RECORD_CHANGED', 'A with stale version gets conflict');
    assert_(a.data && a.data.seller_name === 'User B wrote this' && a.data.version === v10 + 1, 'conflict returns latest server copy');
    var now = assertOk_(getLead(l.lead_id)); assert_(now.seller_name === 'User B wrote this', 'B not erased');
  };
  T['different leads edited back to back both survive (TEST A)'] = function () {
    var l1 = assertOk_(createLead({ address: addr('500 First St') })), l2 = assertOk_(createLead({ address: addr('501 Second St') }));
    assertOk_(updateLead(l1.lead_id, { next_action: 'Call seller' }, l1.version)); assertOk_(updateLead(l2.lead_id, { next_action: 'Drive by' }, l2.version));
    _dbCache.tables = {};
    assert_(assertOk_(getLead(l1.lead_id)).next_action === 'Call seller' && assertOk_(getLead(l2.lead_id)).next_action === 'Drive by', 'both changes persisted');
  };
  T['notes, attempts, next action, due date'] = function () {
    var l = assertOk_(createLead({ address: addr('600 Cedar St') }));
    var n = assertOk_(addLeadNote(l.lead_id, 'Spoke to seller, wants to sell by December'));
    assert_(n.recent_activity.some(function (a) { return a.action_type === 'NOTE_ADDED' && a.display.indexOf('December') > -1; }), 'note in thread');
    var a1 = assertOk_(logAttempt(l.lead_id, 'no answer')); var a2 = assertOk_(logAttempt(l.lead_id, ''));
    assert_(a1.contact_attempts === 1 && a2.contact_attempts === 2, 'attempts count');
    assertFail_(addLeadNote(l.lead_id, '   '), 'VALIDATION_ERROR', 'blank note rejected');
    var na = assertOk_(setNextAction(l.lead_id, 'Send offer', '2026-12-01', a2.version));
    assert_(na.next_action === 'Send offer' && na.due_date === '2026-12-01', 'next action + due saved');
    assertFail_(setNextAction(l.lead_id, 'x', '12/01/2026', na.version), 'VALIDATION_ERROR', 'bad date rejected');
    var full = assertOk_(getLead(l.lead_id));
    ['NOTE_ADDED', 'CALL_ATTEMPT', 'NEXT_ACTION_CHANGED', 'DUE_DATE_CHANGED'].forEach(function (t) { assert_(full.activity.some(function (a) { return a.action_type === t; }), t + ' recorded'); });
  };
  T['work queue: overdue / due today / upcoming / no due / no next action'] = function () {
    var today = todayBusinessDate_();
    var over = assertOk_(createLead({ address: addr('700 Overdue Rd') })); assertOk_(setNextAction(over.lead_id, 'Call', shiftDateString_(today, -2), over.version));
    var due = assertOk_(createLead({ address: addr('701 Due Rd') })); assertOk_(setNextAction(due.lead_id, 'Call', today, due.version));
    var fut = assertOk_(createLead({ address: addr('702 Future Rd') })); assertOk_(setNextAction(fut.lead_id, 'Call', shiftDateString_(today, 3), fut.version));
    var none = assertOk_(createLead({ address: addr('703 Nothing Rd') }));
    var nodue = assertOk_(createLead({ address: addr('704 NoDue Rd') })); assertOk_(setNextAction(nodue.lead_id, 'Pull comps', '', nodue.version));
    var q = assertOk_(getWorkQueue());
    var has = function (list, id) { return list.some(function (i) { return i.lead_id === id; }); };
    assert_(has(q.overdue, over.lead_id) && q.overdue.filter(function (i) { return i.lead_id === over.lead_id; })[0].days_overdue === 2, 'overdue with days');
    assert_(has(q.due_today, due.lead_id), 'due today'); assert_(has(q.upcoming, fut.lead_id), 'upcoming');
    assert_(has(q.no_next_action, none.lead_id), 'NO NEXT ACTION flagged'); assert_(has(q.no_due_date, nodue.lead_id), 'NO DUE DATE flagged');
    // Mark done without a follow-up → lead moves to NO NEXT ACTION, does not disappear
    var d = assertOk_(completeNextAction(due.lead_id, '', '', null));
    assert_(d.due_state === 'NO_NEXT_ACTION', 'after done without follow-up → NO_NEXT_ACTION');
    var q2 = assertOk_(getWorkQueue()); assert_(has(q2.no_next_action, due.lead_id) && !has(q2.due_today, due.lead_id), 'queue reflects mark done');
    var full = assertOk_(getLead(due.lead_id)); assert_(full.activity.some(function (a) { return a.action_type === 'NEXT_ACTION_DONE' && a.old_value === 'Call'; }), 'NEXT_ACTION_DONE recorded');
  };
  T['compliance: mailer/check sets both flags, activity, Waiting on Juan, not deleted'] = function () {
    var l = assertOk_(createLead({ address: addr('800 Mailer Ln') }));
    var c = assertOk_(setComplianceFlag(l.lead_id, true, ''));
    assert_(c.compliance_mailer_check === true && c.flag_juan === true, 'both flags stored');
    var t = assertOk_(getTodayDashboard());
    var w = t.waiting_on_juan.filter(function (x) { return x.lead_id === l.lead_id; })[0];
    assert_(w && w.reason === 'Mailer or check mentioned' && w.flagged_at, 'appears in Waiting on Juan with reason and time');
    var full = assertOk_(getLead(l.lead_id));
    assert_(full.activity.some(function (a) { return a.action_type === 'COMPLIANCE_FLAGGED'; }), 'COMPLIANCE_FLAGGED activity');
    assert_(full.is_live && full.status === 'NEW', 'lead not archived or deleted');
    var cleared = assertOk_(setComplianceFlag(l.lead_id, false, '')); assert_(cleared.compliance_mailer_check === false && cleared.flag_juan === true, 'clearing compliance keeps Juan flag until cleared explicitly');
    var f = assertOk_(setJuanFlag(l.lead_id, false, '')); assert_(f.flag_juan === false, 'Juan flag cleared');
  };
  T['archive removes from live list, keeps history, restore returns it'] = function () {
    var l = assertOk_(createLead({ address: addr('900 Archive Ct') }));
    assertOk_(addLeadNote(l.lead_id, 'history must survive'));
    var a = assertOk_(archiveLead(l.lead_id, 'ARCHIVED_NO_EQUITY', 'underwater', null));
    assert_(a.status === 'ARCHIVED_NO_EQUITY' && !a.is_live, 'archived');
    var live = assertOk_(listLeads({ filter: 'live', search: '900 Archive Ct ' + stamp })); assert_(live.total === 0, 'not in live list');
    var arch = assertOk_(listLeads({ filter: 'archived', search: '900 Archive Ct ' + stamp })); assert_(arch.total === 1, 'in archived list');
    var full = assertOk_(getLead(l.lead_id)); assert_(full.activity.some(function (x) { return x.action_type === 'NOTE_ADDED'; }) && full.activity.some(function (x) { return x.action_type === 'ARCHIVED'; }), 'history intact');
    var r = assertOk_(restoreLead(l.lead_id, 'INVESTIGATING', null)); assert_(r.is_live && r.status === 'INVESTIGATING' && r.archive_reason === '', 'restored');
    assertFail_(archiveLead(l.lead_id, 'CLOSED', '', null), 'VALIDATION_ERROR', 'archive needs an archive status');
  };
  T['underwriting: MAO and offer room use SETTINGS percentage'] = function () {
    var l = assertOk_(createLead({ address: addr('1000 Value Way') }));
    var pct = getSettingNumber_('mao_percentage', 70);
    var u = assertOk_(updateLead(l.lead_id, { arv: 500000, repairs: 40000, asking_price: 300000, offer: 290000 }, l.version));
    assert_(u.mao === Math.round(500000 * pct / 100 - 40000), 'MAO = ARV × pct − repairs (' + u.mao + ')');
    assert_(u.offer_room === u.mao - 300000, 'offer room = MAO − asking');
    assertFail_(updateLead(l.lead_id, { arv: 'abc' }, u.version), 'VALIDATION_ERROR', 'non-numeric ARV rejected');
    assertFail_(updateLead(l.lead_id, { repairs: -5 }, u.version), 'VALIDATION_ERROR', 'negative rejected');
    var full = assertOk_(getLead(l.lead_id));
    assert_(full.activity.filter(function (a) { return a.action_type === 'UNDERWRITING_CHANGED'; }).length === 3 && full.activity.some(function (a) { return a.action_type === 'OFFER_CHANGED'; }), 'underwriting + offer activity');
  };
  T['appointments: set date creates APPOINTMENTS row, outcome completes it, LEADS summary synced'] = function () {
    var l = assertOk_(createLead({ address: addr('1100 Visit Blvd') }));
    var d = shiftDateString_(todayBusinessDate_(), 2);
    var u = assertOk_(updateLead(l.lead_id, { appointment_date: d }, l.version));
    assert_(u.appointment_date === d, 'lead summary date');
    var full = assertOk_(getLead(l.lead_id));
    assert_(full.appointments.length === 1 && full.appointments[0].status === 'SCHEDULED' && full.appointments[0].appointment_date === d, 'APPOINTMENTS row created');
    assert_(full.activity.some(function (a) { return a.action_type === 'APPOINTMENT_SET'; }), 'APPOINTMENT_SET activity');
    var o = assertOk_(updateLead(l.lead_id, { appointment_outcome: 'Offer made' }, u.version));
    var full2 = assertOk_(getLead(l.lead_id));
    assert_(o.appointment_outcome === 'Offer made' && full2.appointments[0].status === 'COMPLETED' && full2.appointments[0].outcome === 'Offer made', 'outcome completes appointment');
    var d2 = shiftDateString_(d, 5); assertOk_(updateLead(l.lead_id, { appointment_date: d2 }, o.version));
    var full3 = assertOk_(getLead(l.lead_id)); assert_(full3.appointments.length === 2, 'new appointment after a completed one keeps history');
    assertFail_(updateLead(l.lead_id, { appointment_outcome: 'Maybe' }, full3.version), 'VALIDATION_ERROR', 'unknown outcome rejected');
    var up = assertOk_(listAppointments({ from: todayBusinessDate_(), to: shiftDateString_(todayBusinessDate_(), 14) }));
    assert_(up.items.some(function (a) { return a.lead_id === l.lead_id && a.address === l.address; }), 'upcoming appointments list');
  };
  T['daily metrics: upsert by business date, math on Numbers tab'] = function () {
    var today = todayBusinessDate_();
    var before = assertOk_(getNumbersDashboard({ days: 30 }));
    var prev = assertOk_(getDailyMetrics(today));
    var data = { tv_spend: 1000, ppc_spend: 500, ppl_spend: 250, other_spend: 250, new_leads: 20, inbound_calls: 30, missed_calls: 10, sellers_reached: 10, appointments_set: 4, contracts_signed: 2, contracts_fell_out: 1, deals_closed: 1, minutes_to_first_call: 12 };
    var m = assertOk_(saveDailyMetrics(today, data)); assert_(m.total_spend === 2000 && m.business_date === today, 'saved today');
    var m2 = assertOk_(saveDailyMetrics(today, { new_leads: 25 })); assert_(m2.new_leads === 25 && m2.tv_spend === 1000, 'second save updates same row, keeps other fields');
    var rows = readTable_(SHEETS.DAILY_METRICS).rows.filter(function (r) { return toStr_(r.business_date) === today; }); assert_(rows.length === 1, 'exactly one row for today');
    assertFail_(saveDailyMetrics(today, { new_leads: -1 }), 'VALIDATION_ERROR', 'negative rejected');
    assertFail_(saveDailyMetrics(shiftDateString_(today, 1), { new_leads: 1 }), 'VALIDATION_ERROR', 'future date rejected');
    // Isolate the math: compute expected from the whole 30-day window (other days may exist in the DB).
    var n = assertOk_(getNumbersDashboard({ days: 30 })), f = n.funnel;
    var win = readTable_(SHEETS.DAILY_METRICS).rows.filter(function (r) { return toStr_(r.business_date) >= f.from && toStr_(r.business_date) <= f.to; });
    var sp = win.reduce(function (t, r) { return t + spendOf_(r); }, 0), nl = sumField_(win, 'new_leads'), ap = sumField_(win, 'appointments_set'), ct = sumField_(win, 'contracts_signed'), cl = sumField_(win, 'deals_closed');
    var miss = sumField_(win, 'missed_calls'), calls = sumField_(win, 'inbound_calls'), fell = sumField_(win, 'contracts_fell_out');
    assert_(f.spend === sp && f.new_leads === nl, 'spend/leads totals');
    assert_(Math.abs(f.cost_per_lead - sp / nl) < 1e-9, 'cost per lead'); assert_(Math.abs(f.cost_per_appointment - sp / ap) < 1e-9, 'cost per appointment');
    assert_(Math.abs(f.cost_per_contract - sp / ct) < 1e-9, 'cost per contract'); assert_(Math.abs(f.cost_per_close - sp / cl) < 1e-9, 'cost per close');
    assert_(f.missed_call_rate === Math.round(miss / (calls + miss) * 100), 'missed call rate'); assert_(f.fallout_pct === Math.round(fell / ct * 100), 'fallout pct');
    assert_(f.conv_close === Math.round(cl / ct * 100), 'contract→close conversion');
    var target = getSettingNumber_('monthly_deal_target', 0), p = n.pace;
    var mo = readTable_(SHEETS.DAILY_METRICS).rows.filter(function (r) { return toStr_(r.business_date) >= monthStartOf_(today) && toStr_(r.business_date) <= today; });
    assert_(p.closed === sumField_(mo, 'deals_closed') && p.target === target, 'pace closed/target');
    assert_(p.expected_to_date === Math.round(target * dayOfMonthOf_(today) / daysInMonthOf_(today) * 10) / 10, 'pace expected to date');
    saveDailyMetrics(today, METRIC_FIELDS.reduce(function (o, k) { o[k] = (prev && prev[k] != null) ? prev[k] : ''; return o; }, {})); // restore real numbers or leave the day blank
    assert_(before.today === n.today, 'same business date');
  };
  T['tools: create, operator, cadence, training, run today, undo keeps row, streak'] = function () {
    var t = assertOk_(createTool({ name: 'TEST tool ' + stamp, built_by: 'Seth', link: 'https://example.com/tool', description: 'test' }));
    assertFail_(createTool({ name: 'bad link', link: 'javascript:alert(1)' }), 'VALIDATION_ERROR', 'bad url rejected');
    var u = assertOk_(updateTool(t.tool_id, { operator: 'Cherry', cadence: 'Every day', steps: '1. open 2. run', expected_output: 'a list' }));
    assert_(u.operator === 'Cherry' && u.cadence === 'Every day', 'tool saved');
    var me = getCurrentUser_();
    assertOk_(setToolTraining(t.tool_id, me.user_id, true, ''));
    var tools = assertOk_(getTools()); var mine = tools.tools.filter(function (x) { return x.tool_id === t.tool_id; })[0];
    assert_(mine.trained.length === 1 && mine.trained[0].user_id === me.user_id, 'training saved as a row');
    assertOk_(setToolTraining(t.tool_id, me.user_id, true, '')); tools = assertOk_(getTools()); assert_(tools.tools.filter(function (x) { return x.tool_id === t.tool_id; })[0].trained.length === 1, 'no duplicate training rows');
    var run = assertOk_(logToolRun(t.tool_id, 'ran fine', '')); var item = run.tools_today.items.filter(function (i) { return i.tool_id === t.tool_id; })[0];
    assert_(item && item.done && item.run_by === me.user_id && run.tools_today.business_date === todayBusinessDate_(), 'run recorded on business date by me');
    var before = readTable_(SHEETS.TOOL_RUNS).rows.length;
    var und = assertOk_(undoToolRun(t.tool_id)); assert_(!und.tools_today.items.filter(function (i) { return i.tool_id === t.tool_id; })[0].done, 'undone');
    assert_(readTable_(SHEETS.TOOL_RUNS).rows.length === before, 'undo did not delete the row');
    assertOk_(logToolRun(t.tool_id, '', ''));
    var s = assertOk_(getRunsToday()); assert_(s.done >= 1 && typeof s.streak === 'number', 'runs today + streak computed');
    assertOk_(updateTool(t.tool_id, { cadence: 'Not set', status: 'Retired' }));
  };
  T['settings: MAO configurable, bad values rejected, pillars saved'] = function () {
    var s = assertOk_(getSettings()); assert_(s.mao_percentage >= 30 && s.business_timezone, 'settings loaded');
    assertFail_(saveSetting('mao_percentage', 5), 'VALIDATION_ERROR', 'MAO range enforced');
    assertFail_(saveSetting('not_a_setting', 1), 'VALIDATION_ERROR', 'unknown key rejected');
    assertOk_(saveSetting('pillar_p_score', 'Partly running')); assert_(assertOk_(getTools()).pillars.filter(function (p) { return p.id === 'p_score'; })[0].state === 'Partly running', 'pillar saved');
    assertOk_(saveSetting('monthly_deal_target', s.monthly_deal_target));
  };
  T['rep snapshot + Juan dashboard reflect today\'s activity'] = function () {
    var me = getCurrentUser_();
    var l = assertOk_(createLead({ address: addr('1200 Manager View') })); assertOk_(logAttempt(l.lead_id, '')); assertOk_(addLeadNote(l.lead_id, 'note for snapshot'));
    var snap = assertOk_(getRepSnapshot()).reps.filter(function (r) { return r.user_id === me.user_id; })[0];
    assert_(snap && snap.attempts >= 1 && snap.notes >= 1 && snap.leads_touched >= 1 && snap.last_activity, 'my snapshot counts');
    var j = assertOk_(getJuanDashboard());
    assert_(j.totals_today.attempts >= 1 && j.changes_today.some(function (c) { return c.lead_id === l.lead_id; }) && j.pace && j.channels.length === 4, 'Juan dashboard populated');
  };
  T['xss: html in seller data is stored raw and escaped client-side (server returns strings)'] = function () {
    var l = assertOk_(createLead({ address: addr('1300 <script>alert(1)</script> St'), seller_name: '"><img src=x onerror=alert(1)>' }));
    var g = assertOk_(getLead(l.lead_id)); assert_(g.seller_name.indexOf('<img') > -1, 'server stores text verbatim; UI escapes');
  };
  T['audit_ log has entries for login/create/archive; error log helper writes'] = function () {
    var a = assertOk_(getAuditLog(200));
    assert_(a.some(function (r) { return r.action === 'LEAD_CREATED'; }) && a.some(function (r) { return r.action === 'ARCHIVED'; }), 'audit_ rows present');
    logError_('testSuite', getCurrentUser_(), new Error('synthetic test error'), 'TEST', 'x');
    assert_(readTable_(SHEETS.ERROR_LOG).rows.some(function (r) { return toStr_(r.error).indexOf('synthetic') > -1; }), 'error logged');
  };
  return T;
}
