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
  T['bulk import at a status: under contract / closed land in the right tab, archived refused'] = function () {
    var uc = assertOk_(addBulkLeads(addr('27 Prague St') + ', G. Steele, ' + phone(3) + ', Other, historical deal', { status: 'under_contract' }));
    assert_(uc.added === 1 && uc.status === 'UNDER_CONTRACT', 'imported at UNDER_CONTRACT');
    var cl = assertOk_(addBulkLeads(addr('1464 Sunrise Pkwy') + ', S. Warnock, ' + phone(4) + ', Other', { status: 'CLOSED' }));
    assert_(cl.added === 1, 'imported at CLOSED');
    var board = assertOk_(listLeads({ filter: 'closed', search: addr('1464 Sunrise Pkwy') }));
    assert_(board.items.length === 1 && board.items[0].status === 'CLOSED' && !board.items[0].is_live, 'closed tab shows the acquired property');
    var arch = assertOk_(listLeads({ filter: 'archived', search: addr('1464 Sunrise Pkwy') }));
    assert_(arch.items.length === 0, 'closed is not mixed into archived');
    var live = assertOk_(listLeads({ filter: 'live', search: addr('27 Prague St') }));
    assert_(live.items.length === 1 && live.items[0].status === 'UNDER_CONTRACT', 'under contract stays on the live board');
    var hist = assertOk_(getLead(live.items[0].lead_id));
    assert_(hist.activity.length === 1 && hist.activity[0].action_type === 'LEAD_IMPORTED' && /imported as Under contract/.test(hist.activity[0].note), 'import trail names the status, no fake status change');
    assertFail_(addBulkLeads(addr('9 Nope St') + ', X', { status: 'ARCHIVED_SOLD' }), 'VALIDATION_ERROR');
  };
  T['sources: REI BlackBook spellings normalize, roll up into spend channels; exit strategy + disposition validated'] = function () {
    var a = assertOk_(createLead({ address: addr('11 Source Ave'), source: 'PPC LEAD' })); assert_(a.source === 'PPC', 'PPC LEAD → PPC, got ' + a.source);
    var b = assertOk_(createLead({ address: addr('12 Source Ave'), source: 'DM- Post Card' })); assert_(b.source === 'DM- Post Card', 'unknown spelling kept as typed');
    var c = assertOk_(createLead({ address: addr('13 Source Ave'), source: 'mls lead' })); assert_(c.source === 'Realtor', 'MLS Lead → Realtor');
    var d = assertOk_(createLead({ address: addr('14 Source Ave'), source: 'ppl' })); assert_(d.source === 'Motivated Leads', 'PPL → Motivated Leads');
    var e = assertOk_(createLead({ address: addr('15 Source Ave'), source: 'MLS/Redfin' })); assert_(e.source === 'MLS/Redfin', 'MLS/Redfin is its own source');
    var f = assertOk_(createLead({ address: addr('16 Source Ave'), source: 'property leads' })); assert_(f.source === 'Property Leads', 'Property Leads is its own source');
    assert_(channelOfSource_('MLS/Redfin') === 'other' && channelOfSource_('Property Leads') === 'other', 'both new sources bill to the Other channel');
    assert_(normalizeSource_('MLS Lead') === 'Realtor', 'agent-tagged MLS Lead still means Realtor');
    assert_(channelOfSource_('DM Postcard') === 'mail' && channelOfSource_('DM Checks') === 'mail' && channelOfSource_('SEO') === 'seo' && channelOfSource_('Realtor') === 'other' && channelOfSource_('') === 'other', 'source → channel rollup');
    var u = assertOk_(updateLead(a.lead_id, { exit_strategy: 'Fix & Flip', disposition: 'Under construction', source: 'tv commercial' }, a.version));
    assert_(u.exit_strategy === 'Fix & Flip' && u.disposition === 'Under construction' && u.source === 'TV', 'deal fields saved and source re-normalized');
    assert_((u.new_activity || []).filter(function (x) { return x.action_type === 'FIELD_CHANGED'; }).length === 3, 'each deal field change is its own activity');
    assertFail_(updateLead(a.lead_id, { exit_strategy: 'Airbnb' }, u.version), 'VALIDATION_ERROR');
    assertFail_(updateLead(a.lead_id, { disposition: 'Demolished' }, u.version), 'VALIDATION_ERROR');
    var today = todayBusinessDate_(); var m = assertOk_(saveDailyMetrics(today, { seo_spend: 120, mail_spend: 480 })); assert_(m.seo_spend === 120 && m.mail_spend === 480, 'new spend channels saved');
    var rep = assertOk_(getDashboards({ period: '30d' })).marketing;
    var mail = rep.channels.filter(function (ch) { return ch.channel === 'Direct mail'; })[0], srcs = rep.sources.map(function (s) { return s.source; });
    assert_(mail && mail.spend >= 480 && rep.channels.length === 6, 'six spend channels with direct mail spend');
    assert_(srcs.indexOf('PPC') > -1 && srcs.indexOf('DM Postcard') > -1 && srcs.indexOf('MLS/Redfin') > -1 && srcs.indexOf('Property Leads') > -1 && srcs.indexOf('DM- Post Card') > -1, 'leads by source lists every source plus unknown spellings');
    assert_(rep.sources.length >= LEAD_SOURCES.length, 'every configured source has a row');
    var closedList = assertOk_(listLeads({ filter: 'all', search: addr('11 Source Ave') })); assert_(closedList.items[0].disposition === 'Under construction', 'board rows carry disposition');
    var pp = assertOk_(updateLead(a.lead_id, { purchase_price: 475000 }, closedList.items[0].version));
    assert_(pp.purchase_price === 475000, 'purchase price saved');
    assertFail_(updateLead(a.lead_id, { purchase_price: -1 }, pp.version), 'VALIDATION_ERROR');
    assertFail_(updateLead(a.lead_id, { purchase_price: 'a lot' }, pp.version), 'VALIDATION_ERROR');
  };
  T['activity: summary reads are bounded, full history stays complete'] = function () {
    var l = assertOk_(createLead({ address: addr('900 Tail St') }));
    for (var i = 0; i < 12; i++) assertOk_(addLeadNote(l.lead_id, 'note ' + i));
    var quick = assertOk_(getLead(l.lead_id));
    assert_(quick.activity_complete === false, 'the quick read says it is not the whole history');
    assert_(quick.activity.length === 13, 'recent activity present, got ' + quick.activity.length);
    var full = assertOk_(getLead(l.lead_id, true));
    assert_(full.activity_complete === true && full.activity.length === 13, 'full history complete');
    assert_(full.activity[0].action_type === 'LEAD_CREATED', 'history starts at creation');
    var onDate = getActivityOnDate_(todayBusinessDate_());
    assert_(onDate.filter(function (a) { return a.lead_id === l.lead_id; }).length === 13, "today's activity found through the tail");
    var tail = readActivityTail_(3);
    assert_(tail.length === 3 && tail[2].lead_id === l.lead_id, 'the tail is the newest rows, in order');
  };
  T['today carries the Juan panel for someone allowed to see it'] = function () {
    var t = assertOk_(getTodayDashboard());
    assert_(t.juan && t.juan.totals_today, 'the Juan panel rides along with today, so the client makes one call');
  };
  T['tool dates are real dates, and the team list has one entry per person'] = function () {
    var id = SEED_TOOLS[0].tool_id;
    var t = assertOk_(updateTool(id, { asked_date: '2026-09-01', handoff_date: '' }));
    assert_(t.asked_date === '2026-09-01' && t.handoff_date === '', 'a date saves, a blank clears it');
    assertFail_(updateTool(id, { asked_date: 'last tuesday' }), 'VALIDATION_ERROR');
    assertFail_(updateTool(id, { handoff_date: '2026-02-31' }), 'VALIDATION_ERROR');
    var people = assertOk_(getTools()).people, names = people.map(function (p) { return p.name.toLowerCase(); });
    assert_(names.length === names.filter(function (n, i) { return names.indexOf(n) === i; }).length, 'no name appears twice');
    ['Marieflor', 'Kristine', 'Genesis', 'Christine Joy', 'Darlyn'].forEach(function (n) {
      assert_(names.indexOf(n.toLowerCase()) > -1, n + ' is on the team list');
    });
    assertFail_(createUser({ name: 'Kristine', role: 'REP' }), 'VALIDATION_ERROR', 'a second entry for the same name is refused');
  };
  T['whiteboard: preview writes nothing, apply is logged, a second run changes nothing'] = function () {
    var a = addr('492 Umland Dr Santa Rosa CA');
    var l = assertOk_(addBulkLeads(a + ', R. Walker, ' + phone(7) + ', Other', { status: 'CLOSED' }));
    assert_(l.added === 1, 'fixture property added');
    var row = assertOk_(listLeads({ filter: 'closed', search: a })).items[0];
    var plan = assertOk_(previewWhiteboardUpdate());
    var mine = plan.rows.filter(function (r) { return /Umland/.test(r.property); })[0];
    assert_(mine && /would change/.test(mine.result), 'preview says what it would do: ' + (mine && mine.result));
    assert_(assertOk_(getLead(row.lead_id)).purchase_price === '', 'preview wrote nothing');
    assertOk_(applyWhiteboardUpdate());
    var after = assertOk_(getLead(row.lead_id, true));
    assert_(after.purchase_price === 475000 && after.source === 'Property Leads' && after.disposition === 'Under construction', 'board values written');
    assert_(after.activity.some(function (x) { return x.action_type === 'UNDERWRITING_CHANGED' && x.field_changed === 'purchase_price'; }), 'the change is in the history');
    var second = assertOk_(applyWhiteboardUpdate());
    var again = second.rows.filter(function (r) { return /Umland/.test(r.property); })[0];
    assert_(again.result === 'already matches the board', 'running it twice changes nothing: ' + again.result);
  };
  T['tidy notes: tags go, real notes stay, the email gets its own field'] = function () {
    var t = tidyNote_('Acquired · postcard · liens noted · artscott9600@gmail.com');
    assert_(t.note === 'liens noted' && t.email === 'artscott9600@gmail.com', 'tags dropped, fact kept, email lifted: ' + JSON.stringify(t));
    assert_(tidyNote_('Contract signed · web inquiry · high equity').note === 'high equity', 'only the fact survives');
    assert_(tidyNote_('co-trustee is signing contact').note === 'co-trustee is signing contact', 'a sentence is not a tag');
    assert_(tidyNote_('').note === '' && tidyNote_('').email === '', 'a blank note stays blank');
    var a = addr('77 Tidy St');
    assertOk_(addBulkLeads(a + ', A. Seller, ' + phone(8) + ', TV, Acquired · TV commercial · liens noted · seller@example.com'));
    var before = assertOk_(listLeads({ filter: 'all', search: a })).items[0];
    assertOk_(previewTidyNotes());
    assert_(assertOk_(getLead(before.lead_id)).equity_note === before.equity_note, 'preview wrote nothing');
    assertOk_(applyTidyNotes());
    var after = assertOk_(getLead(before.lead_id));
    assert_(after.equity_note === 'liens noted' && after.seller_email === 'seller@example.com', 'applied: ' + after.equity_note + ' / ' + after.seller_email);
    var second = assertOk_(applyTidyNotes());
    assert_(!second.rows.some(function (r) { return r.property === after.address; }), 'a second run leaves it alone');
    assertFail_(updateLead(after.lead_id, { seller_email: 'not an email' }, after.version), 'VALIDATION_ERROR');
  };
  T['tools carry a type, and only one of the three'] = function () {
    var t = assertOk_(createTool({ name: 'Typed build ' + Date.now(), tool_type: 'Reporting', built_by: 'Seth' }));
    assert_(t.tool_type === 'Reporting', 'type saved on create');
    var u = assertOk_(updateTool(t.tool_id, { tool_type: 'Automation' }));
    assert_(u.tool_type === 'Automation', 'type can be changed');
    assertOk_(updateTool(t.tool_id, { tool_type: '' }));
    assertFail_(updateTool(t.tool_id, { tool_type: 'Marketing' }), 'VALIDATION_ERROR');
    assert_(TOOL_TYPES.length === 3 && TOOL_TYPES.join(',') === 'System,Automation,Reporting', 'the three types');
    assert_(assertOk_(getTools()).tools.some(function (x) { return x.tool_id === t.tool_id && x.tool_type === ''; }), 'a blank type is allowed and comes back blank');
  };
  T['wholesale: an assignment carries a fee, a double close carries both prices'] = function () {
    var a = assertOk_(createLead({ address: addr('5 Assign Way') }));
    var u = assertOk_(updateLead(a.lead_id, { exit_strategy: 'Wholesale - Assignment', purchase_price: 270000, assignment_fee: 85000 }, a.version));
    assert_(u.exit_strategy === 'Wholesale - Assignment' && u.assignment_fee === 85000 && u.purchase_price === 270000, 'assignment saved');
    var d = assertOk_(createLead({ address: addr('6 Double Cl') }));
    var v = assertOk_(updateLead(d.lead_id, { exit_strategy: 'Wholesale - Double Close', purchase_price: 230000, sale_price: 250000 }, d.version));
    assert_(v.exit_strategy === 'Wholesale - Double Close' && v.sale_price - v.purchase_price === 20000, 'double close keeps both prices');
    assert_(EXIT_STRATEGIES.indexOf('Wholesale') < 0, 'the old single Wholesale is no longer offered');
    var legacy = assertOk_(createLead({ address: addr('7 Legacy Rd') }));
    var lg = assertOk_(updateLead(legacy.lead_id, { exit_strategy: 'Wholesale' }, legacy.version));
    assert_(lg.exit_strategy === 'Wholesale', 'a record written before the split can still be saved');
    assertFail_(updateLead(legacy.lead_id, { exit_strategy: 'Wholesale - Assingment' }, lg.version), 'VALIDATION_ERROR');
    assertFail_(updateLead(a.lead_id, { assignment_fee: -5 }, u.version), 'VALIDATION_ERROR');
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
    assert_(n.new_activity.some(function (a) { return a.action_type === 'NOTE_ADDED' && a.display.indexOf('December') > -1; }), 'note in thread');
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
    assert_(j.totals_today.attempts >= 1 && j.changes_today.some(function (c) { return c.lead_id === l.lead_id; }) && j.pace && j.channels.length === CHANNELS.length, 'Juan dashboard populated');
  };
  T['dashboards: one call, six sections, figures agree with the source tables'] = function () {
    var l = assertOk_(createLead({ address: addr('1400 Report Rd'), source: 'PPC' })); var la = assertOk_(logAttempt(l.lead_id, ''));
    assertOk_(updateLead(l.lead_id, { offer: 250000 }, la.version)); var o = assertOk_(markOfferSent(l.lead_id, null, 'verbal offer'));
    assert_(o.new_activity.some(function (a) { return a.action_type === 'OFFER_SENT' && a.display.indexOf('$250,000') > -1; }), 'offer sent recorded with amount');
    ['8w', '30d', 'q'].forEach(function (p) {
      var d = assertOk_(getDashboards({ period: p }));
      ['pace', 'pipeline', 'marketing', 'team', 'discipline', 'appointments'].forEach(function (k) { assert_(d[k], k + ' present for ' + p); });
      assert_(d.labels.length === d.pace.contracts_by_bucket.length && d.labels.length === (p === 'q' ? 3 : p === '30d' ? 5 : 8), 'bucket count for ' + p);
      var mo = readTable_(SHEETS.DAILY_METRICS).rows.filter(function (r) { return toStr_(r.business_date) >= d.from && toStr_(r.business_date) <= d.to; });
      assert_(d.pace.contracts_period === sumField_(mo, 'contracts_signed') && d.pace.closed_period === sumField_(mo, 'deals_closed'), 'pace totals match DAILY_METRICS for ' + p);
      assert_(d.pace.contracts_by_bucket.reduce(function (t, v) { return t + v; }, 0) === d.pace.contracts_period, 'buckets sum to period total');
      assert_(d.pipeline.live === readTable_(SHEETS.LEADS).rows.filter(function (r) { return LIVE_STATUSES.indexOf(toStr_(r.status)) > -1; }).length, 'live count');
      assert_(d.marketing.channels.length === CHANNELS.length && d.marketing.channels.some(function (c) { return c.channel === 'PPC' && c.leads >= 1; }), 'PPC lead counted in marketing');
      assert_(d.pipeline.offers_sent >= 1, 'offer sent counted');
      var me = getCurrentUser_(); var rep = d.team.reps.filter(function (r) { return r.user_id === me.user_id; })[0]; assert_(rep && rep.attempts >= 1 && rep.offers >= 1 && rep.attempts_by_day.length === 7, 'team row for me');
      assert_(d.discipline.calendar.length === daysInMonthOf_(todayBusinessDate_()) && d.discipline.tool_days.length === 14, 'discipline calendar + heat');
      assert_(typeof d.appointments.set === 'number' && Array.isArray(d.appointments.by_rep), 'appointments shape');
    });
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
