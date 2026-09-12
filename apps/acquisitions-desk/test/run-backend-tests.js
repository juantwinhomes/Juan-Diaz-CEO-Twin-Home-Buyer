#!/usr/bin/env node
/**
 * Runs the Apps Script backend under the Node emulation:
 *  1. setupDatabase() from scratch  2. the in-code suite (Tests.gs)  3. identity / role / multi-user tests that
 *  need identity switching  4. API surface check  5. backup + trigger  6. 8,000-lead pagination sanity.
 */
const path = require('path'); const { createMocks, loadBackend } = require('./gas-mock');
const SRC = path.join(__dirname, '..', 'src'); const PUBLIC = require('../docs/public-functions.json');
const OWNER = 'seth@twinhomebuyer.com';
const { ctx, state } = createMocks({ active: OWNER, effective: OWNER, htmlDir: SRC });
loadBackend(ctx, SRC);
const results = []; let failed = 0;
function test(name, fn) { try { fn(); results.push(['PASS', name]); } catch (e) { failed++; results.push(['FAIL', name, e.message]); } }
const as = (email) => { state.identity.active = email; ctx._dbCache.tables = {}; };
const ok = (r, m) => { if (!r || r.ok !== true) throw new Error((m || 'expected ok') + ': ' + JSON.stringify(r).slice(0, 300)); return r.data; };
const bad = (r, code, m) => { if (!r || r.ok !== false || (code && r.code !== code)) throw new Error((m || 'expected ' + code) + ': ' + JSON.stringify(r).slice(0, 300)); return r; };
const assert = (c, m) => { if (!c) throw new Error(m); };

test('setupDatabase creates all 12 sheets with exact headers, seeds settings/users/tools', () => {
  const rep = ctx.setupDatabase();
  const ss = state.spreadsheets[rep.spreadsheet_id];
  for (const k of Object.keys(ctx.SHEETS)) { const sh = ss.getSheetByName(ctx.SHEETS[k]); assert(sh, 'sheet ' + k); const hdr = sh.getRange(1, 1, 1, ctx.HEADERS[k].length).getValues()[0]; assert(JSON.stringify(hdr) === JSON.stringify(ctx.HEADERS[k]), 'headers ' + k + ' ' + hdr); }
  assert(ss.getSheetByName('USERS').getLastRow() === 1 + ctx.SEED_USERS.length, 'users seeded'); assert(ss.getSheetByName('TOOL_INVENTORY').getLastRow() === 1 + ctx.SEED_TOOLS.length, 'tools seeded');
  assert(ctx.getSettingValue_('mao_percentage') === '70' && ctx.getSettingValue_('auto_refresh_seconds') === '30' && ctx.getSettingValue_('stale_lead_days') === '7', 'default settings');
  const again = ctx.setupDatabase(); assert(!again.created && again.seeded.users.indexOf('no new people') === 0, 'idempotent re-run adds nobody: ' + again.seeded.users);
  assert(ss.getSheetByName('USERS').getLastRow() === 1 + ctx.SEED_USERS.length, 'still one row per person after a re-run');
  assert(ss.getSheets().every(s => s.protections.length === 1), 'every sheet protected');
});
test('upgrade: an existing sheet with last release\'s headers gets the new columns appended, rows still read', () => {
  as(OWNER); const ss = ctx._dbCache.ss; const old = ctx.HEADERS.LEADS.filter(h => h !== 'exit_strategy' && h !== 'disposition' && h !== 'purchase_price');
  const first = ctx.ensureSheet_(ss, 'LEADS_V1', old); assert(/created/.test(first.status), 'fixture created: ' + JSON.stringify(first));
  ss.getSheetByName('LEADS_V1').appendRow(old.map(h => h === 'lead_id' ? 'LEAD-X' : h === 'address' ? '1 Old St' : ''));
  const up = ctx.ensureSheet_(ss, 'LEADS_V1', ctx.HEADERS.LEADS); assert(/added columns: exit_strategy, disposition, purchase_price/.test(up.status), 'columns appended: ' + up.status);
  const sh = ss.getSheetByName('LEADS_V1'); const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  assert(hdr.indexOf('exit_strategy') === old.length && hdr.indexOf('disposition') === old.length + 1 && hdr.indexOf('purchase_price') === old.length + 2 && hdr.indexOf('address') === 1, 'new columns at the end, old order untouched');
  assert(sh.getRange(2, 1, 1, 2).getValues()[0][1] === '1 Old St', 'existing row intact');
  const again = ctx.ensureSheet_(ss, 'LEADS_V1', ctx.HEADERS.LEADS); assert(again.status === 'ok', 'idempotent');
});
test('team top-up: a re-run adds only missing people and never touches an existing row', () => {
  as(OWNER); const sh = ctx._dbCache.ss.getSheetByName('USERS');
  const before = ok(ctx.getUsers()); const kristine = before.find(u => u.name === 'Kristine');
  ok(ctx.updateUser(kristine.user_id, { team: 'Finance', role: 'MANAGER' }));   // an admin set this by hand
  const last = sh.getLastRow();
  sh.deleteRow(before.findIndex(u => u.name === 'Marieflor') + 2);              // someone is missing from the sheet
  ctx._dbCache.tables = {}; ctx._dbCache.activityTail = null; ctx.cachedTableRemove_('USERS');
  const rep = ctx.setupDatabase().seeded.users;
  assert(/^1 added/.test(rep), 'exactly one person added back: ' + rep);
  assert(sh.getLastRow() === last, 'row count back to where it was');
  const after = ok(ctx.getUsers());
  assert(after.filter(u => u.name === 'Marieflor').length === 1, 'Marieflor restored once');
  const k = after.find(u => u.name === 'Kristine');
  assert(k.team === 'Finance' && k.role === 'MANAGER', "the admin's own edit survived the re-run");
});
test('API surface: every global function is public-listed or private (ends with _)', () => {
  const fns = Object.keys(ctx).filter(k => typeof ctx[k] === 'function' && /^[a-zA-Z]/.test(k) && !['Date','Math','JSON','Object','Array','String','Number','Boolean','RegExp','Error','isFinite','isNaN','parseInt','parseFloat','encodeURIComponent','decodeURIComponent','AppError'].includes(k) && !k.endsWith('_'));
  const leaks = fns.filter(f => !PUBLIC.includes(f)); assert(!leaks.length, 'exposed: ' + leaks.join(','));
  const missing = PUBLIC.filter(p => typeof ctx[p] !== 'function'); assert(!missing.length, 'missing: ' + missing);
  assert(typeof ctx.writeRowObject_ === 'function' && typeof ctx.writeRowObject === 'undefined', 'generic writes are private');
});
test('profile photo: directory photo returned for the signed-in account, cached, default silhouette → blank', () => {
  as(OWNER); ctx.__state.photos[OWNER] = 'https://lh3.googleusercontent.com/a/seth=s100'; ctx.__state.cache = {}; ctx.__state.peopleCalls = 0;
  const b1 = ok(ctx.bootstrapApp()); assert(b1.user.photo_url === 'https://lh3.googleusercontent.com/a/seth=s100', 'photo on bootstrap: ' + b1.user.photo_url);
  ok(ctx.bootstrapApp()); assert(ctx.__state.peopleCalls === 1, 'second bootstrap served from cache');
  assert(ctx.profilePhotoUrl_('cherry@twinhomebuyer.com') === '' && ctx.profilePhotoUrl_('') === '', 'default silhouette and blank email → no photo');
});
test('identity: owner (Seth, ADMIN) bootstraps; LOGIN audited', () => { const b = ok(ctx.bootstrapApp()); assert(b.user.email === OWNER && b.user.role === 'ADMIN' && b.settings.mao_percentage === 70 && b.users.length >= 10 && b.today, 'bootstrap'); assert(ctx.readTable_('AUDIT_LOG').rows.some(r => r.action === 'LOGIN' && r.user_email === OWNER), 'login audited'); });
test('identity: unknown Google account → ACCESS_DENIED, audited, doGet shows no data', () => {
  as('stranger@gmail.com'); bad(ctx.bootstrapApp(), 'ACCESS_DENIED'); bad(ctx.listLeads({}), 'ACCESS_DENIED');
  const html = ctx.doGet({}).getContent(); assert(html.indexOf('ACCESS DENIED') > -1 && html.indexOf('view-leads') < 0 && html.indexOf('LEAD-') < 0, 'denied page without data');
  assert(ctx.readTable_('AUDIT_LOG').rows.some(r => r.action === 'ACCESS_DENIED' && r.entity_id === 'stranger@gmail.com'), 'failed access audited');
  const w = ok(ctx.whoAmI()); assert(w.resolved === false && w.code === 'ACCESS_DENIED', 'whoAmI reports denial');
});
test('identity: no email → IDENTITY_UNAVAILABLE (no fallback to a dropdown)', () => { as(''); bad(ctx.bootstrapApp(), 'IDENTITY_UNAVAILABLE'); const html = ctx.doGet({}).getContent(); assert(html.indexOf('IDENTITY UNAVAILABLE') > -1, 'page'); });
test('identity: inactive USERS record → ACCESS_DENIED; user with email but active=false stays out', () => {
  as(OWNER); const users = ok(ctx.getUsers()); const david = users.find(u => u.name === 'David'); assert(david && david.needs_email && !david.active, 'David needs email');
  ok(ctx.updateUser(david.user_id, { email: 'david.test@example.com', active: false }));
  as('david.test@example.com'); bad(ctx.bootstrapApp(), 'ACCESS_DENIED', 'inactive denied');
  as(OWNER); ok(ctx.updateUser(david.user_id, { active: true })); as('david.test@example.com'); const b = ok(ctx.bootstrapApp()); assert(b.user.role === 'REP' && b.user.name === 'David', 'active now');
});
test('in-code suite (Tests.gs) passes', () => { as(OWNER); const rep = ctx.runAllTests(); const f = rep.results.filter(r => r.status === 'FAIL'); assert(!f.length, JSON.stringify(f, null, 1)); results.push(['INFO', `Tests.gs: ${rep.passed} passed`]); });

// Multi-user tests with real identity switching
let leadA, leadB, mgr;
test('setup users: manager Cherry (seeded) + rep David', () => { as(OWNER); mgr = ok(ctx.getUsers()).find(u => u.name === 'Cherry'); assert(mgr.active && mgr.email === 'cherry@twinhomebuyer.com', 'Cherry active manager'); });
test('TEST A: two users edit two different leads at the same time — both survive, each attributed', () => {
  as(OWNER); leadA = ok(ctx.createLead({ address: 'TEST - 1 Alpha St', source: 'TV' })); leadB = ok(ctx.createLead({ address: 'TEST - 2 Beta St', source: 'PPC' }));
  as('cherry@twinhomebuyer.com'); const ra = ok(ctx.updateLead(leadA.lead_id, { next_action: 'Cherry calls' }, leadA.version));
  as('david.test@example.com'); const rb = ok(ctx.updateLead(leadB.lead_id, { next_action: 'David drives by' }, leadB.version));
  as(OWNER); const a = ok(ctx.getLead(leadA.lead_id)), b = ok(ctx.getLead(leadB.lead_id));
  assert(a.next_action === 'Cherry calls' && b.next_action === 'David drives by', 'both persisted');
  assert(a.updated_by === mgr.user_id && a.activity.at(-1).user_email === 'cherry@twinhomebuyer.com', 'A attributed to Cherry'); assert(b.activity.at(-1).user_email === 'david.test@example.com', 'B attributed to David');
});
test('TEST B: same lead, stale version → CONFLICT_RECORD_CHANGED, first writer not erased', () => {
  as(OWNER); const l = ok(ctx.createLead({ address: 'TEST - 3 Gamma St' })); const v = l.version;
  as('david.test@example.com'); ok(ctx.updateLead(l.lead_id, { seller_name: 'David saved first' }, v));
  as('cherry@twinhomebuyer.com'); const c = bad(ctx.updateLead(l.lead_id, { seller_name: 'Cherry stale' }, v), 'CONFLICT_RECORD_CHANGED'); assert(c.data.seller_name === 'David saved first' && c.data.version === v + 1, 'latest copy returned');
  const retry = ok(ctx.updateLead(l.lead_id, { seller_name: 'Cherry after review' }, c.data.version)); assert(retry.version === v + 2, 'retry with fresh version succeeds');
});
test('cross-user visibility: Cherry\'s change shows in David\'s next refresh', () => {
  as('cherry@twinhomebuyer.com'); ok(ctx.addLeadNote(leadA.lead_id, 'visible to everyone'));
  as('david.test@example.com'); const l = ok(ctx.refreshView('leads', { filter: 'live', search: '1 Alpha' })); assert(l.items[0].recent_activity.some(a => a.display === 'visible to everyone'), 'note visible');
});
test('roles: REP cannot manage users/settings/reassign, TECHNICAL cannot work leads, MANAGER can assign', () => {
  as('david.test@example.com'); bad(ctx.createUser({ name: 'x' }), 'ACCESS_DENIED'); bad(ctx.saveSetting('mao_percentage', 65), 'ACCESS_DENIED'); bad(ctx.saveSetting('monthly_deal_target', 5), 'ACCESS_DENIED');
  bad(ctx.assignLead(leadA.lead_id, mgr.user_id, null), 'ACCESS_DENIED', 'rep cannot assign to others'); const me = ok(ctx.bootstrapApp()).user;
  ok(ctx.assignLead(leadB.lead_id, me.user_id, null), 'rep can claim'); bad(ctx.restoreLead(leadB.lead_id, 'NEW', null), 'ACCESS_DENIED', 'rep cannot restore'); bad(ctx.getJuanDashboard(), 'ACCESS_DENIED', 'rep no team view'); assert(ok(ctx.getTodayDashboard()).juan === undefined, 'a rep gets no team data inside today either');
  as('cherry@twinhomebuyer.com'); const r = ok(ctx.assignLead(leadB.lead_id, mgr.user_id, null)); assert(r.assigned_to === mgr.user_id && r.assigned_name === 'Cherry', 'manager reassigns'); ok(ctx.saveSetting('monthly_deal_target', 4)); bad(ctx.saveSetting('mao_percentage', 65), 'ACCESS_DENIED', 'manager cannot change MAO'); ok(ctx.getJuanDashboard());
  as(OWNER); const tech = ok(ctx.createUser({ name: 'Tech Tester', email: 'tech.test@example.com', role: 'TECHNICAL' })); as('tech.test@example.com'); bad(ctx.addLeadNote(leadA.lead_id, 'x'), 'ACCESS_DENIED'); ok(ctx.getTools()); ok(ctx.updateTool('plbids', { steps: 'documented' }));
  as(OWNER); ok(ctx.saveSetting('mao_percentage', 65)); const l = ok(ctx.updateLead(leadA.lead_id, { arv: 100000, repairs: 0 }, ok(ctx.getLead(leadA.lead_id)).version)); assert(l.mao === 65000, 'MAO uses new setting'); ok(ctx.saveSetting('mao_percentage', 70)); ok(ctx.saveSetting('monthly_deal_target', 3));
});
test('activity attribution per action type for David', () => {
  as('david.test@example.com'); const l = ok(ctx.createLead({ address: 'TEST - 4 Delta St' })); const me = ok(ctx.bootstrapApp()).user;
  ok(ctx.updateLead(l.lead_id, { status: 'INVESTIGATING' }, 1)); ok(ctx.addLeadNote(l.lead_id, 'n')); ok(ctx.logAttempt(l.lead_id, '')); ok(ctx.assignLead(l.lead_id, me.user_id, null)); ok(ctx.setNextAction(l.lead_id, 'call', ctx.todayBusinessDate_(), null));
  ok(ctx.updateLead(l.lead_id, { appointment_date: ctx.shiftDateString_(ctx.todayBusinessDate_(), 1) }, null)); ok(ctx.setJuanFlag(l.lead_id, true, '')); ok(ctx.setComplianceFlag(l.lead_id, true, '')); ok(ctx.archiveLead(l.lead_id, 'ARCHIVED_BAD_DATA', 'test', null));
  const acts = ok(ctx.getLead(l.lead_id)).activity; const types = new Set(acts.map(a => a.action_type));
  ['LEAD_CREATED','STATUS_CHANGED','NOTE_ADDED','CALL_ATTEMPT','ASSIGNED','NEXT_ACTION_CHANGED','DUE_DATE_CHANGED','APPOINTMENT_SET','FLAGGED_FOR_JUAN','COMPLIANCE_FLAGGED','ARCHIVED'].forEach(t => assert(types.has(t), 'missing ' + t));
  assert(acts.every(a => a.user_id === me.user_id && a.user_name === 'David'), 'all attributed to David');
  as(OWNER); const j = ok(ctx.getJuanDashboard()); const d = j.who_worked.find(r => r.user_id === me.user_id); assert(d && d.attempts >= 1 && d.notes >= 1 && d.status_changes >= 2, 'Juan sees David worked');
});
test('backup: creates a Drive copy in the backup folder, logs BACKUP_LOG; trigger installs; non-admin refused', () => {
  as(OWNER); const r = ok(ctx.createDatabaseBackup()); const f = state.drive.files[r.file_id]; assert(f && f.name.indexOf('THB Acquisitions Desk Backup - ') === 0, 'copy named ' + (f && f.name));
  assert(state.drive.folders.some(fo => fo.name === 'THB Acquisitions Desk Backups' && fo.id === f.folder), 'in backup folder'); assert(ctx.readTable_('BACKUP_LOG').rows.some(b => b.backup_file_id === r.file_id && b.status === 'SUCCESS'), 'logged');
  assert(ctx.installTriggers().indexOf('installed') > -1 && state.triggers.length === 1 && state.triggers[0].fn === 'runDailyBackup', 'trigger'); ctx.installTriggers(); assert(state.triggers.length === 1, 'idempotent');
  as('david.test@example.com'); bad(ctx.createDatabaseBackup(), 'ACCESS_DENIED'); bad(ctx.runDailyBackup(), 'ACCESS_DENIED'); bad(ctx.setupDatabase && (() => { try { return ctx.setupDatabase(); } catch (e) { return { ok: false, code: e.code }; } })(), 'ACCESS_DENIED', 'setup refused for non-owner');
});
test('scale: 8,000 leads — live board returns only live, archived paginated ≤200 with has_more, timing', () => {
  as(OWNER); const user = ctx.getCurrentUser_(); const rows = []; const ts = new Date().toISOString();
  for (let i = 0; i < 8000; i++) rows.push({ lead_id: 'LEAD-20260101-' + i.toString(36).toUpperCase().padStart(5, '0'), address: `${100 + i} Volume St Oakland`, seller_name: 'S' + i, phone: '', source: ['TV','PPC','PPL','Other'][i % 4], equity_note: '', status: i % 40 === 0 ? 'INVESTIGATING' : 'ARCHIVED_NO_EQUITY', assigned_to: '', team: '', flag_juan: false, compliance_mailer_check: false, contact_attempts: 0, next_action: '', due_date: '', arv: '', repairs: '', asking_price: '', offer: '', appointment_date: '', appointment_outcome: '', archive_reason: '', created_by: user.user_id, created_at: ts, updated_by: user.user_id, updated_at: ts, last_touched_at: ts, version: 1 });
  ctx.appendRowObjects_('LEADS', rows); ctx._dbCache.tables = {};
  let t0 = Date.now(); const live = ok(ctx.listLeads({ filter: 'live', page_size: 200 })); const tLive = Date.now() - t0;
  assert(live.items.every(l => l.is_live) && live.tally.archived >= 7800, 'live only'); assert(live.items.length <= 200, 'page cap');
  const arch = ok(ctx.listLeads({ filter: 'archived', page: 1, page_size: 150 })); assert(arch.items.length === 150 && arch.has_more && arch.total >= 7800, 'paginated'); const p2 = ok(ctx.listLeads({ filter: 'archived', page: 2, page_size: 150 })); assert(p2.items[0].lead_id !== arch.items[0].lead_id, 'page 2 differs');
  const s = ok(ctx.listLeads({ filter: 'all', search: '7999 Volume' })); assert(s.total === 1, 'server-side search');
  t0 = Date.now(); const upd = ok(ctx.updateLead(rows[40].lead_id, { next_action: 'targeted write' }, 1)); const tUpd = Date.now() - t0; assert(upd.next_action === 'targeted write', 'targeted write on row among 8000');
  ctx._dbCache.tables = {}; const q = ok(ctx.getTodayDashboard()); assert(q.work_queue.counts.no_next_action >= 190, 'queue over volume');
  results.push(['INFO', `8,000 leads: listLeads(live) ${tLive}ms, updateLead ${tUpd}ms (Node emulation; Sheets adds I/O)`]);
});
test('date coercion: yyyy-MM-dd written to a non-plain cell round-trips as the same string', () => {
  const ss = state.spreadsheets[state.props.THB_DB_SPREADSHEET_ID]; const sh = ss.getSheetByName('LEADS'); sh._fmt.clear(); sh._plainCols.clear();
  as(OWNER); const l = ok(ctx.createLead({ address: 'TEST - 5 Date Coercion Rd' })); ok(ctx.setNextAction(l.lead_id, 'x', '2026-12-31', 1)); ctx._dbCache.tables = {};
  const raw = sh.getRange(ctx.findRowNumberById_('LEADS', l.lead_id), ctx.colIndex_('LEADS', 'due_date')).getValue(); assert(raw instanceof Date, 'cell was coerced to Date by the sheet');
  assert(ok(ctx.getLead(l.lead_id)).due_date === '2026-12-31', 'read back as string');
});
test('dashboards: follow-up on-time uses the due date stored at completion; role gate', () => {
  as(OWNER); const today = ctx.todayBusinessDate_(); const before = ok(ctx.getDashboards({ period: '8w' })).discipline.followups_done; const l = ok(ctx.createLead({ address: 'TEST - 7 Followup Way' }));
  ok(ctx.setNextAction(l.lead_id, 'Call', ctx.shiftDateString_(today, -2), l.version)); ok(ctx.completeNextAction(l.lead_id, 'Next', today, null)); // late
  ok(ctx.completeNextAction(l.lead_id, '', '', null)); // on time (due today)
  const d = ok(ctx.getDashboards({ period: '8w' })); assert(d.discipline.followups_done === before + 2 && d.discipline.followup_on_time_pct < 100, 'late + on-time counted: ' + JSON.stringify([d.discipline.followups_done, d.discipline.followup_on_time_pct]));
  as('tech.test@example.com'); ok(ctx.getDashboards({})); bad(ctx.markOfferSent(l.lead_id), 'ACCESS_DENIED');
  as('stranger@gmail.com'); bad(ctx.getDashboards({}), 'ACCESS_DENIED');
});
test('date coercion on an ID column: a Date cell in DAILY_METRICS.business_date is still found and updated in place', () => {
  const ss = state.spreadsheets[state.props.THB_DB_SPREADSHEET_ID]; const sh = ss.getSheetByName('DAILY_METRICS'); sh._fmt.clear(); sh._plainCols.clear();
  as(OWNER); const today = ctx.todayBusinessDate_(); const before = sh.getLastRow();
  ok(ctx.saveDailyMetrics(today, { tv_spend: 11 })); ctx._dbCache.tables = {};
  const raw = sh.getRange(ctx.findRowNumberById_('DAILY_METRICS', today), 1).getValue(); assert(raw instanceof Date || raw === today, 'id cell coerced (or plain) — got ' + raw);
  const m2 = ok(ctx.saveDailyMetrics(today, { new_leads: 7 })); assert(m2.tv_spend === 11 && m2.new_leads === 7, 'second save merged into same row');
  assert(sh.getLastRow() <= before + 1, 'no duplicate row appended'); assert(ok(ctx.getDailyMetrics(today)).tv_spend === 11, 'getDailyMetrics finds the coerced row');
  // simulate the pre-fix duplicate and repair it
  ctx.appendRowObject_('DAILY_METRICS', { business_date: today, tv_spend: 99, new_leads: '', created_by: 'x', created_at: '2000-01-01T00:00:00.000Z', updated_by: 'x', updated_at: '2000-01-01T00:00:00.000Z' });
  const msg = ctx.dedupeDailyMetrics(); assert(msg.indexOf('cleared') > -1, msg); ctx._dbCache.tables = {};
  const rows = ctx.readTable_('DAILY_METRICS').rows.filter(r => r.business_date === today); assert(rows.length === 1 && Number(rows[0].tv_spend) === 11, 'one row left, newest kept');
});
as(OWNER); try { ctx.archiveTestData(); } catch (e) {}
for (const r of results) console.log(r[0].padEnd(5), r[1], r[2] ? '\n      ' + r[2] : '');
console.log(`\n${results.filter(r => r[0] === 'PASS').length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
