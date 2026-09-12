/**
 * ToolService.gs — TOOL_INVENTORY, TOOL_TRAINING (one row per user/tool), TOOL_RUNS (append-only; undo marks UNDONE).
 */

function publicTool_(t) { var o = {}; HEADERS.TOOL_INVENTORY.forEach(function (h) { o[h] = t[h] === undefined ? '' : toStr_(t[h]); }); return o; }
function isDailyTool_(t, ymd) {
  var c = toStr_(t.cadence);
  if (c === 'Every day') return true;
  if (c === 'Every weekday') { var p = ymd.split('-'); var dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); return dow >= 1 && dow <= 5; }
  return false;
}
function runsByDate_() {
  var m = {};
  readTable_(SHEETS.TOOL_RUNS).rows.forEach(function (r) { if (toStr_(r.status) !== 'DONE') return; (m[toStr_(r.business_date)] = m[toStr_(r.business_date)] || {})[toStr_(r.tool_id)] = r; });
  return m;
}
/** Streak: consecutive business days (ending today) where every tool required that day has a DONE run. */
function computeStreak_(tools, runs, today) {
  var count = 0, day = today;
  for (var i = 0; i < 366; i++) {
    var req = tools.filter(function (t) { return isDailyTool_(t, day); });
    if (req.length) {
      var all = req.every(function (t) { return runs[day] && runs[day][toStr_(t.tool_id)]; });
      if (!all) { if (day === today) { day = shiftDateString_(day, -1); continue; } break; } // today may still be in progress
      count++;
    }
    day = shiftDateString_(day, -1);
  }
  return count;
}
function buildToolsToday_(ctx) {
  var tools = readTable_(SHEETS.TOOL_INVENTORY).rows.filter(function (t) { return toStr_(t.status) !== 'Retired'; });
  var runs = runsByDate_(), today = ctx.today;
  var req = tools.filter(function (t) { return isDailyTool_(t, today); });
  var items = req.map(function (t) {
    var r = runs[today] && runs[today][toStr_(t.tool_id)];
    return { tool_id: toStr_(t.tool_id), name: toStr_(t.name), operator: toStr_(t.operator), expected_output: toStr_(t.expected_output), cadence: toStr_(t.cadence),
      done: !!r, run_id: r ? toStr_(r.run_id) : '', run_by: r ? toStr_(r.run_by) : '', run_by_name: r ? userDisplayName_(r.run_by) : '', run_at: r ? toStr_(r.run_at) : '', result: r ? toStr_(r.result) : '' };
  });
  return { business_date: today, required: items.length, done: items.filter(function (i) { return i.done; }).length, streak: computeStreak_(tools, runs, today), items: items };
}

function getTools() {
  return guarded_('getTools', function (user) {
    var ctx = leadContext_(), s = ctx.settings;
    var tools = readTable_(SHEETS.TOOL_INVENTORY).rows.map(publicTool_);
    var training = {}; readTable_(SHEETS.TOOL_TRAINING).rows.forEach(function (r) { if (!toBool_(r.trained)) return; (training[toStr_(r.tool_id)] = training[toStr_(r.tool_id)] || []).push({ user_id: toStr_(r.user_id), name: userDisplayName_(r.user_id), certified_date: toStr_(r.certified_date) }); });
    tools.forEach(function (t) { t.trained = training[t.tool_id] || []; t.is_daily = TOOL_DAILY_CADENCE.indexOf(t.cadence) > -1; });
    var order = TOOL_STATUS; tools.sort(function (a, b) { return order.indexOf(a.status) - order.indexOf(b.status) || a.name.localeCompare(b.name); });
    var pillars = PILLARS.map(function (p) { return { id: p.id, name: p.name, what: p.what, state: s['pillar_' + p.id] || PILLAR_STATES[0] }; });
    var asked = {}; BUILDERS.forEach(function (b) { asked[b] = s['asked_' + b] || ''; });
    // One chip per person: a name that appears twice keeps the row someone can actually sign in as.
    var seen = {}, people = [];
    getUsersTable_().rows.forEach(function (u) {
      var name = toStr_(u.name), key = name.trim().toLowerCase(); if (!key) return;
      var row = { user_id: toStr_(u.user_id), name: name, role: toStr_(u.role), active: toBool_(u.active) };
      if (!(key in seen)) { seen[key] = people.length; people.push(row); return; }
      var kept = people[seen[key]];
      if (!kept.active && row.active) people[seen[key]] = row;
    });
    return ok_({ tools: tools, pillars: pillars, asked: asked, builders: BUILDERS, people: people, tools_today: buildToolsToday_(ctx),
      enums: { status: TOOL_STATUS, recommendation: TOOL_RECOMMENDATION, cadence: TOOL_CADENCE, verdict: TOOL_VERDICT, pillar_states: PILLAR_STATES } });
  }, { capability: 'view_tools' });
}

function validateToolPatch_(patch) {
  var out = {};
  Object.keys(patch).forEach(function (k) {
    if (TOOL_PATCHABLE.indexOf(k) < 0) throw validationError_('Field cannot be changed: ' + k);
    var v = k === 'steps' ? toStr_(patch[k]).trim() : trimStr_(patch[k]);
    if (k === 'name' && !v) throw validationError_('Name is required.');
    if (k === 'status' && TOOL_STATUS.indexOf(v) < 0) throw validationError_('Unknown tool status.');
    if (k === 'recommendation' && TOOL_RECOMMENDATION.indexOf(v) < 0) throw validationError_('Unknown recommendation.');
    if (k === 'cadence' && TOOL_CADENCE.indexOf(v) < 0) throw validationError_('Unknown cadence.');
    if (k === 'verdict' && TOOL_VERDICT.indexOf(v) < 0) throw validationError_('Unknown verdict.');
    if (k === 'link' && v && !isValidUrl_(v)) throw validationError_('Link must start with http:// or https://');
    if (TOOL_DATE_FIELDS.indexOf(k) > -1) { out[k] = normalizeDate_(v, getBusinessTimezone_()); return; }
    assertLen_(v, k === 'steps' ? MAX_LEN.steps : k === 'link' ? MAX_LEN.url : k === 'description' ? 1000 : MAX_LEN.short, k.replace(/_/g, ' '));
    out[k] = v;
  });
  return out;
}
function createTool(data) {
  return guarded_('createTool', function (user) {
    var p = validateToolPatch_(data || {}); if (!p.name) throw validationError_('Name is required.');
    var rec = withLock_(function () {
      var ts = nowUtcIso_();
      var rec = { tool_id: generateId_('TOOL', function (id) { return findRowNumberById_(SHEETS.TOOL_INVENTORY, id) > 0; }), name: p.name, description: p.description || '', built_by: p.built_by || '',
        operator: p.operator || '', backup_operator: p.backup_operator || '', status: p.status || 'Unconfirmed', steps: p.steps || '', expected_output: p.expected_output || '',
        cadence: p.cadence || 'Not set', link: p.link || '', recommendation: p.recommendation || 'Decide', handoff_date: p.handoff_date || '', verdict: p.verdict || 'Not handed over yet',
        proof_last_week: p.proof_last_week || '', asked_date: p.asked_date || '', created_at: ts, updated_at: ts };
      appendRowObject_(SHEETS.TOOL_INVENTORY, rec); return rec;
    });
    audit_(user, 'TOOL', rec.tool_id, 'TOOL_CREATED', { name: rec.name });
    return ok_(publicTool_(rec), 'Added. Now set its steps, cadence and who runs it.');
  }, { capability: 'manage_tools' });
}
function updateTool(toolId, patch) {
  return guarded_('updateTool', function (user) {
    var p = validateToolPatch_(patch || {}); if (!Object.keys(p).length) throw validationError_('Nothing to update.');
    var rec = withLock_(function () { return updateRowById_(SHEETS.TOOL_INVENTORY, toolId, function (t) { Object.keys(p).forEach(function (k) { t[k] = p[k]; }); t.updated_at = nowUtcIso_(); return t; }); });
    audit_(user, 'TOOL', toolId, 'TOOL_UPDATED', p);
    return ok_(publicTool_(rec), 'Saved');
  }, { capability: 'manage_tools', entityType: 'TOOL', entityId: toolId });
}
function setToolTraining(toolId, userId, trained, notes) {
  return guarded_('setToolTraining', function (user) {
    if (!findUserById_(userId)) throw validationError_('Unknown team member.');
    if (findRowNumberById_(SHEETS.TOOL_INVENTORY, toolId) < 0) throw notFound_('Tool not found.');
    var tr = toBool_(trained);
    withLock_(function () {
      var rows = readTable_(SHEETS.TOOL_TRAINING).rows.filter(function (r) { return toStr_(r.tool_id) === toStr_(toolId) && toStr_(r.user_id) === toStr_(userId); });
      var ts = nowUtcIso_();
      if (rows.length) updateRowById_(SHEETS.TOOL_TRAINING, rows[0].record_id, function (r) { r.trained = tr; r.certified_date = tr ? businessDateOf_(new Date()) : ''; r.certified_by = user.user_id; r.notes = trimStr_(notes); return r; });
      else appendRowObject_(SHEETS.TOOL_TRAINING, { record_id: generateId_('TRN'), tool_id: toolId, user_id: userId, trained: tr, certified_date: tr ? businessDateOf_(new Date()) : '', certified_by: user.user_id, notes: trimStr_(notes) });
    });
    audit_(user, 'TOOL', toolId, 'TRAINING_SET', { user_id: userId, trained: tr });
    return ok_({ tool_id: toolId, user_id: userId, trained: tr }, tr ? userDisplayName_(userId) + ' marked trained' : userDisplayName_(userId) + ' removed');
  }, { capability: 'manage_tools', entityType: 'TOOL', entityId: toolId });
}
function logToolRun(toolId, result, proof) {
  return guarded_('logToolRun', function (user) {
    if (findRowNumberById_(SHEETS.TOOL_INVENTORY, toolId) < 0) throw notFound_('Tool not found.');
    assertLen_(result, 1000, 'Result'); assertLen_(proof, MAX_LEN.url, 'Proof');
    var ctx = leadContext_();
    var rec = withLock_(function () {
      var existing = runsByDate_()[ctx.today]; if (existing && existing[toStr_(toolId)]) return existing[toStr_(toolId)];
      var rec = { run_id: generateId_('RUN'), tool_id: toolId, business_date: ctx.today, run_by: user.user_id, run_at: nowUtcIso_(), status: 'DONE', result: trimStr_(result), proof: trimStr_(proof) };
      appendRowObject_(SHEETS.TOOL_RUNS, rec); return rec;
    });
    return ok_({ run: rec, tools_today: buildToolsToday_(ctx) }, 'Marked run');
  }, { capability: 'run_tools', entityType: 'TOOL', entityId: toolId });
}
/** Undo keeps the row (status UNDONE) so history is never destroyed. */
function undoToolRun(toolId) {
  return guarded_('undoToolRun', function (user) {
    var ctx = leadContext_();
    withLock_(function () {
      var r = runsByDate_()[ctx.today] && runsByDate_()[ctx.today][toStr_(toolId)];
      if (!r) return;
      if (toStr_(r.run_by) !== user.user_id && !hasCapability_(user, 'manage_tools')) throw accessDenied_('Only the person who marked it, or a manager, can undo it.');
      updateRowById_(SHEETS.TOOL_RUNS, r.run_id, function (x) { x.status = 'UNDONE'; x.result = (toStr_(x.result) + ' [undone by ' + user.name + ']').trim(); return x; });
    });
    return ok_({ tools_today: buildToolsToday_(ctx) }, 'Undone');
  }, { capability: 'run_tools', entityType: 'TOOL', entityId: toolId });
}
function getRunsToday() { return guarded_('getRunsToday', function (user) { return ok_(buildToolsToday_(leadContext_())); }, { capability: 'view_tools' }); }
