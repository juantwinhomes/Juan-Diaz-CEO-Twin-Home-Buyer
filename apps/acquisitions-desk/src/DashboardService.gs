/**
 * DashboardService.gs — Today tab, work queue, Waiting on Juan, rep snapshot, Juan management view.
 * Everything is computed from the database on request; nothing is hard-coded.
 */

function buildWorkQueue_(ctx, leads) {
  var q = { overdue: [], due_today: [], upcoming: [], no_due_date: [], no_next_action: [] };
  leads.forEach(function (l) {
    if (!l.is_live) return;
    var item = { lead_id: l.lead_id, address: l.address, status: l.status, status_label: l.status_label, assigned_to: l.assigned_to,
      assigned_name: l.assigned_name, next_action: l.next_action, due_date: l.due_date, version: l.version, flag_juan: l.flag_juan,
      compliance_mailer_check: l.compliance_mailer_check, days_untouched: l.days_untouched, due_state: l.due_state };
    if (l.due_state === 'OVERDUE') { item.days_overdue = daysBetween_(l.due_date, ctx.today); q.overdue.push(item); }
    else if (l.due_state === 'DUE_TODAY') q.due_today.push(item);
    else if (l.due_state === 'UPCOMING') { if (daysBetween_(ctx.today, l.due_date) <= 7) q.upcoming.push(item); }
    else if (l.due_state === 'NO_DUE_DATE') q.no_due_date.push(item);
    else if (l.due_state === 'NO_NEXT_ACTION') q.no_next_action.push(item);
  });
  var byDue = function (a, b) { return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0; };
  q.overdue.sort(byDue); q.upcoming.sort(byDue);
  q.no_next_action.sort(function (a, b) { return b.days_untouched - a.days_untouched; });
  q.counts = { overdue: q.overdue.length, due_today: q.due_today.length, upcoming: q.upcoming.length, no_due_date: q.no_due_date.length, no_next_action: q.no_next_action.length };
  return q;
}
function getWorkQueue() {
  return guarded_('getWorkQueue', function (user) {
    var ctx = leadContext_(), leads = readTable_(SHEETS.LEADS).rows.map(function (l) { return enrichLead_(l, ctx); });
    return ok_(buildWorkQueue_(ctx, leads));
  }, { capability: 'view_leads' });
}

/** Active leads with flag_juan or compliance: property, status, rep, reason, latest note, time flagged. */
function buildWaitingOnJuan_(ctx, leads) {
  var flagged = leads.filter(function (l) { return l.is_live && (l.flag_juan || l.compliance_mailer_check); });
  var acts = getRecentActivityFor_(flagged.map(function (l) { return l.lead_id; }), 0);
  var flagEvent = function (a) { return a.action_type === 'FLAGGED_FOR_JUAN' || a.action_type === 'COMPLIANCE_FLAGGED'; };
  var stale = flagged.filter(function (l) { return !(acts[l.lead_id] || []).some(flagEvent); });
  if (stale.length) { // flagged longer ago than the tail reaches — read history for just those
    var older = getAllActivityFor_(stale.map(function (l) { return l.lead_id; }), 0);
    Object.keys(older).forEach(function (k) { acts[k] = older[k]; });
  }
  return flagged.map(function (l) {
    var hist = acts[l.lead_id] || [], flaggedAt = '', lastNote = '';
    for (var i = hist.length - 1; i >= 0; i--) {
      var a = hist[i];
      if (!flaggedAt && (a.action_type === 'FLAGGED_FOR_JUAN' || a.action_type === 'COMPLIANCE_FLAGGED')) flaggedAt = a.timestamp_utc;
      if (!lastNote && (a.action_type === 'NOTE_ADDED' || a.action_type === 'COMPLIANCE_FLAGGED' || a.action_type === 'FLAGGED_FOR_JUAN')) lastNote = a.display;
    }
    return { lead_id: l.lead_id, address: l.address, status: l.status, status_label: l.status_label, assigned_to: l.assigned_to, assigned_name: l.assigned_name,
      reason: l.compliance_mailer_check ? 'Mailer or check mentioned' : 'Flagged for Juan', compliance: l.compliance_mailer_check, flag: l.flag_juan,
      last_note: lastNote, flagged_at: flaggedAt, version: l.version };
  }).sort(function (a, b) { return (b.compliance ? 1 : 0) - (a.compliance ? 1 : 0) || (a.flagged_at < b.flagged_at ? -1 : 1); });
}

/** Per-rep activity snapshot for a business date, plus assigned/overdue counts from LEADS. */
function buildRepSnapshot_(ctx, leads, businessDate) {
  var users = getUsersTable_().rows, byUser = {};
  users.forEach(function (u) {
    byUser[toStr_(u.user_id)] = { user_id: toStr_(u.user_id), name: toStr_(u.name), role: toStr_(u.role), active: toBool_(u.active), leads_touched: 0, _touched: {},
      attempts: 0, notes: 0, status_changes: 0, appointments: 0, contracts: 0, closes: 0, imports: 0, other: 0, last_activity: '', active_assigned: 0, overdue_assigned: 0, no_next_action_assigned: 0 };
  });
  getActivityOnDate_(businessDate).forEach(function (a) {
    var r = byUser[toStr_(a.user_id)]; if (!r) { r = byUser[toStr_(a.user_id)] = { user_id: toStr_(a.user_id), name: toStr_(a.user_name), role: '', active: false, leads_touched: 0, _touched: {}, attempts: 0, notes: 0, status_changes: 0, appointments: 0, contracts: 0, closes: 0, imports: 0, other: 0, last_activity: '', active_assigned: 0, overdue_assigned: 0, no_next_action_assigned: 0 }; }
    r._touched[a.lead_id] = true;
    switch (a.action_type) {
      case 'CALL_ATTEMPT': r.attempts++; break;
      case 'NOTE_ADDED': r.notes++; break;
      case 'STATUS_CHANGED': r.status_changes++; if (a.new_value === 'UNDER_CONTRACT') r.contracts++; if (a.new_value === 'CLOSED') r.closes++; break;
      case 'ARCHIVED': case 'RESTORED': r.status_changes++; break;
      case 'APPOINTMENT_SET': r.appointments++; break;
      case 'LEAD_IMPORTED': case 'LEAD_CREATED': r.imports++; break;
      default: r.other++;
    }
    if (toStr_(a.timestamp_utc) > r.last_activity) r.last_activity = toStr_(a.timestamp_utc);
  });
  leads.forEach(function (l) {
    if (!l.is_live || !l.assigned_to) return; var r = byUser[l.assigned_to]; if (!r) return;
    r.active_assigned++; if (l.due_state === 'OVERDUE') r.overdue_assigned++; if (l.due_state === 'NO_NEXT_ACTION') r.no_next_action_assigned++;
  });
  return Object.keys(byUser).map(function (k) { var r = byUser[k]; r.leads_touched = Object.keys(r._touched).length; delete r._touched;
    r.total_actions = r.attempts + r.notes + r.status_changes + r.appointments + r.imports + r.other; return r; })
    .filter(function (r) { return r.active || r.total_actions > 0 || r.active_assigned > 0; })
    .sort(function (a, b) { return b.total_actions - a.total_actions || a.name.localeCompare(b.name); });
}
function getRepSnapshot(businessDate) {
  return guarded_('getRepSnapshot', function (user) {
    var ctx = leadContext_(), d = businessDate ? normalizeDate_(businessDate, ctx.tz) : ctx.today;
    var leads = readTable_(SHEETS.LEADS).rows.map(function (l) { return enrichLead_(l, ctx); });
    return ok_({ business_date: d, reps: buildRepSnapshot_(ctx, leads, d) });
  }, { capability: 'view_leads' });
}

/** Everything the Today tab needs in one round trip. */
function getTodayDashboard() {
  return guarded_('getTodayDashboard', function (user) {
    var ctx = leadContext_(), leads = readTable_(SHEETS.LEADS).rows.map(function (l) { return enrichLead_(l, ctx); });
    var metrics = findById_(SHEETS.DAILY_METRICS, ctx.today);
    var out = {
      today: ctx.today, timezone: ctx.tz,
      metrics: metrics ? publicMetrics_(metrics) : null,
      tools_today: buildToolsToday_(ctx),
      work_queue: buildWorkQueue_(ctx, leads),
      waiting_on_juan: buildWaitingOnJuan_(ctx, leads),
      team: buildRepSnapshot_(ctx, leads, ctx.today),
      upcoming_appointments: readTable_(SHEETS.APPOINTMENTS).rows.filter(function (a) { var d = toStr_(a.appointment_date); return d >= ctx.today && d <= shiftDateString_(ctx.today, 7) && a.status !== 'CANCELLED'; })
        .sort(function (x, y) { return cmpStr_(x.appointment_date, y.appointment_date); })
        .map(function (a) { var o = publicAppointment_(a); var l = readTable_(SHEETS.LEADS).byId[toStr_(a.lead_id)]; o.address = l ? l.address : ''; return o; })
    };
    // Managers and admins get the Juan panel in the same response; a rep never sees it in the payload at all.
    if (hasCapability_(user, 'view_team')) { var j = getJuanDashboard(); out.juan = (j && j.ok) ? j.data : null; }
    return ok_(out);
  }, { capability: 'view_leads' });
}

/** Juan's management view: answers "who worked, what changed, what is overdue, how is the month pacing" in one call. */
function getJuanDashboard() {
  return guarded_('getJuanDashboard', function (user) {
    var ctx = leadContext_(), leads = readTable_(SHEETS.LEADS).rows.map(function (l) { return enrichLead_(l, ctx); });
    var todayActs = getActivityOnDate_(ctx.today).sort(function (x, y) { return -cmpStr_(x.timestamp_utc, y.timestamp_utc); });
    var addr = {}; leads.forEach(function (l) { addr[l.lead_id] = l.address; });
    var changes = todayActs.slice(0, 60).map(function (a) { var p = publicActivity_(a); p.address = addr[a.lead_id] || ''; return p; });
    var count = function (type, nv) { return todayActs.filter(function (a) { return a.action_type === type && (nv == null || a.new_value === nv); }).length; };
    var queue = buildWorkQueue_(ctx, leads);
    var numbers = computeNumbers_(ctx, leads);
    return ok_({
      today: ctx.today,
      who_worked: buildRepSnapshot_(ctx, leads, ctx.today),
      changes_today: changes,
      totals_today: { actions: todayActs.length, leads_touched: Object.keys(todayActs.reduce(function (m, a) { m[a.lead_id] = 1; return m; }, {})).length,
        attempts: count('CALL_ATTEMPT'), notes: count('NOTE_ADDED'), appointments_set: count('APPOINTMENT_SET'),
        contracts_signed: count('STATUS_CHANGED', 'UNDER_CONTRACT'), deals_closed: count('STATUS_CHANGED', 'CLOSED') },
      overdue: queue.overdue, no_next_action: queue.no_next_action, needs_juan: buildWaitingOnJuan_(ctx, leads),
      upcoming_appointments: readTable_(SHEETS.APPOINTMENTS).rows.filter(function (a) { var d = toStr_(a.appointment_date); return d >= ctx.today && d <= shiftDateString_(ctx.today, 7) && a.status !== 'CANCELLED'; })
        .map(function (a) { var o = publicAppointment_(a); o.address = addr[toStr_(a.lead_id)] || ''; return o; }),
      pace: numbers.pace, channels: numbers.channels, live_count: leads.filter(function (l) { return l.is_live; }).length
    });
  }, { capability: 'view_team' });
}
