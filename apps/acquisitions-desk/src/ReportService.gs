/**
 * ReportService.gs — the Dashboards tab. One call returns all six dashboards for a period so the browser makes
 * one round trip. Everything is computed from the database; business dates drive every bucket.
 *
 * params: { from, to } as yyyy-MM-dd. Charts bucket by day, week or month to suit the span, and every report
 * carries the same totals for the equal window immediately before, so any figure can be read as a movement.
 */

/**
 * The window a report covers, its chart buckets, and the equal window immediately before it to compare against.
 * Dates are taken as given; with none, the last eight weeks. Bucket size follows the span, so a chart never ends
 * up with two bars or ninety.
 */
function periodSpec_(params, today) {
  params = params || {};
  var tz = getBusinessTimezone_();
  var to = normalizeDate_(params.to, tz) || today;
  var from = normalizeDate_(params.from, tz) || shiftDateString_(to, -55);
  if (from > to) { var swap = from; from = to; to = swap; }
  var days = daysBetween_(from, to) + 1, buckets = [], i;
  if (days <= 14) {
    for (i = 0; i < days; i++) { var d = shiftDateString_(from, i); buckets.push({ start: d, end: d, label: monthDay_(d) }); }
  } else if (days <= 140) {
    var ws = from;
    while (ws <= to) { var we = shiftDateString_(ws, 6); buckets.push({ start: ws, end: we > to ? to : we, label: monthDay_(ws) }); ws = shiftDateString_(we, 1); }
  } else {
    var ms = monthStartOf_(from);
    while (ms <= to) {
      var next = monthStartOf_(shiftDateString_(ms, 32)), me = shiftDateString_(next, -1);
      buckets.push({ start: ms < from ? from : ms, end: me > to ? to : me, label: MONTH_ABBR[+ms.slice(5, 7) - 1] });
      ms = next;
    }
  }
  var prevTo = shiftDateString_(from, -1), prevFrom = shiftDateString_(prevTo, -(days - 1));
  return { from: from, to: to, days: days, buckets: buckets, bucket_days: days <= 14 ? 1 : days <= 140 ? 7 : 30,
    prev_from: prevFrom, prev_to: prevTo };
}
var MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** The handful of figures worth putting side by side with the window before. Cheap: it reuses rows already read. */
function windowTotals_(from, to, leads, acts, metrics) {
  var inW = function (d) { return d >= from && d <= to; };
  var m = metrics.filter(function (x) { return inW(toStr_(x.business_date)); });
  var a = acts.filter(function (x) { return inW(toStr_(x.business_date)); });
  var created = leads.filter(function (l) { return inW(toStr_(l.created_at).slice(0, 10)); }).length;
  var spend = m.reduce(function (t, x) { return t + spendOf_(x); }, 0);
  var leadsLogged = sumField_(m, 'new_leads') || created;
  return {
    from: from, to: to,
    leads: leadsLogged,
    attempts: a.filter(function (x) { return x.action_type === 'CALL_ATTEMPT'; }).length,
    appointments: a.filter(function (x) { return x.action_type === 'APPOINTMENT_SET'; }).length,
    offers: a.filter(function (x) { return x.action_type === 'OFFER_SENT'; }).length,
    contracts: sumField_(m, 'contracts_signed'),
    closed: sumField_(m, 'deals_closed'),
    spend: spend,
    cost_per_lead: safeDiv_(spend, leadsLogged)
  };
}
function monthDay_(ymd) { var mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+ymd.slice(5, 7) - 1]; return mon + ' ' + (+ymd.slice(8, 10)); }
function bucketIndex_(spec, ymd) { for (var i = 0; i < spec.buckets.length; i++) if (ymd >= spec.buckets[i].start && ymd <= spec.buckets[i].end) return i; return -1; }
function zeros_(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
function minutesBetween_(aIso, bIso) { var a = new Date(aIso), b = new Date(bIso); if (isNaN(a) || isNaN(b)) return null; return Math.round((b - a) / 60000); }

function getDashboards(params) {
  return guarded_('getDashboards', function (user) {
    params = params || {};
    var ctx = leadContext_(), today = ctx.today, spec = periodSpec_(params, today);
    var leads = readTable_(SHEETS.LEADS).rows.map(function (l) { return enrichLead_(l, ctx); });
    var acts = activitySince_(spec.prev_from), metrics = readTable_(SHEETS.DAILY_METRICS).rows, appts = readTable_(SHEETS.APPOINTMENTS).rows, runs = readTable_(SHEETS.TOOL_RUNS).rows;
    var users = getUsersTable_().rows, nameOf = {}; users.forEach(function (u) { nameOf[toStr_(u.user_id)] = toStr_(u.name); });
    var inRange = function (d) { return d >= spec.from && d <= spec.to; };
    var mIn = metrics.filter(function (m) { return inRange(toStr_(m.business_date)); });
    var aIn = acts.filter(function (a) { return inRange(toStr_(a.business_date)); });
    var labels = spec.buckets.map(function (b) { return b.label; }), N = labels.length;

    /* ---- PACE ---- */
    var numbers = computeNumbers_(ctx, leads, 30), pace = numbers.pace;
    var contractsW = zeros_(N), closedW = zeros_(N), spendW = zeros_(N), fellW = zeros_(N);
    mIn.forEach(function (m) { var i = bucketIndex_(spec, toStr_(m.business_date)); if (i < 0) return; contractsW[i] += toNum_(m.contracts_signed) || 0; closedW[i] += toNum_(m.deals_closed) || 0; fellW[i] += toNum_(m.contracts_fell_out) || 0; spendW[i] += spendOf_(m); });
    var ct = sumField_(mIn, 'contracts_signed'), cl = sumField_(mIn, 'deals_closed'), fo = sumField_(mIn, 'contracts_fell_out');
    var weeklyTarget = Math.round(pace.target * (spec.bucket_days / 30.4) * 100) / 100;

    /* ---- PIPELINE ---- */
    var live = leads.filter(function (l) { return l.is_live; });
    var stageCounts = {}; STATUS_ORDER.forEach(function (s) { stageCounts[s] = 0; }); live.forEach(function (l) { stageCounts[l.status]++; });
    var closedInRange = leads.filter(function (l) { return l.status === 'CLOSED'; }).length;
    var stages = LIVE_STATUSES.map(function (s) { return { key: s, label: STATUS_LABELS[s], count: stageCounts[s] }; }).concat([{ key: 'CLOSED', label: 'Closed', count: closedInRange }]);
    // days in current stage: last STATUS_CHANGED/ARCHIVED/RESTORED/LEAD_CREATED per lead
    var lastStatusAt = {}; acts.forEach(function (a) { if (['STATUS_CHANGED', 'RESTORED', 'LEAD_CREATED', 'LEAD_IMPORTED'].indexOf(a.action_type) > -1) { var k = toStr_(a.lead_id); if (!lastStatusAt[k] || toStr_(a.timestamp_utc) > lastStatusAt[k]) lastStatusAt[k] = toStr_(a.timestamp_utc); } });
    var stageDays = {}, stageN = {}; live.forEach(function (l) { var at = lastStatusAt[l.lead_id] || l.created_at; var d = daysSinceTimestamp_(at, today, ctx.tz); if (d > 3650) return; stageDays[l.status] = (stageDays[l.status] || 0) + d; stageN[l.status] = (stageN[l.status] || 0) + 1; });
    var daysInStage = LIVE_STATUSES.map(function (s) { return { key: s, label: STATUS_LABELS[s], avg_days: stageN[s] ? Math.round(stageDays[s] / stageN[s]) : 0, count: stageN[s] || 0 }; });
    var avgStage = live.length ? Math.round(LIVE_STATUSES.reduce(function (t, s) { return t + (stageDays[s] || 0); }, 0) / Math.max(1, LIVE_STATUSES.reduce(function (t, s) { return t + (stageN[s] || 0); }, 0))) : 0;
    var archivedInRange = aIn.filter(function (a) { return a.action_type === 'ARCHIVED'; }), archReasons = {}; ARCHIVED_STATUSES.forEach(function (s) { archReasons[s] = 0; });
    archivedInRange.forEach(function (a) { if (archReasons[a.new_value] != null) archReasons[a.new_value]++; });
    // stale trend: at each bucket end, live leads (today) whose last activity before that date was 7+ days earlier (approximation on the current live list)
    var lastActBefore = function (leadId, endYmd) { var best = ''; acts.forEach(function (a) { if (toStr_(a.lead_id) === leadId && toStr_(a.business_date) <= endYmd && toStr_(a.business_date) > best) best = toStr_(a.business_date); }); return best; };
    var actByLead = {}; acts.forEach(function (a) { (actByLead[toStr_(a.lead_id)] = actByLead[toStr_(a.lead_id)] || []).push(toStr_(a.business_date)); });
    var staleW = spec.buckets.map(function (b) { var n = 0; live.forEach(function (l) { var ds = actByLead[l.lead_id] || []; var created = toStr_(l.created_at).slice(0, 10); if (created > b.end) return; var last = created; ds.forEach(function (d) { if (d <= b.end && d > last) last = d; }); if (daysBetween_(last, b.end) >= ctx.staleDays) n++; }); return n; });
    var offersSent = aIn.filter(function (a) { return a.action_type === 'OFFER_SENT'; }).length;
    var reached = leads.filter(function (l) { return ['CONTACT_MADE', 'APPOINTMENT_SET', 'UNDER_CONTRACT', 'CLOSED'].indexOf(l.status) > -1 && toStr_(l.created_at).slice(0, 10) >= spec.from; }).length;

    /* ---- MARKETING ---- */
    var chan = CHANNELS.map(function (c) {
      var key = c[0], label = c[1], spend = sumField_(mIn, key + '_spend');
      var ls = leads.filter(function (l) { var d = toStr_(l.created_at).slice(0, 10); return inRange(d) && channelOfSource_(l.source) === key; });
      var ap = ls.filter(function (l) { return ['APPOINTMENT_SET', 'UNDER_CONTRACT', 'CLOSED'].indexOf(l.status) > -1 || l.appointment_date; }).length;
      var lc = ls.filter(function (l) { return ['UNDER_CONTRACT', 'CLOSED'].indexOf(l.status) > -1; }).length, lz = ls.filter(function (l) { return l.status === 'CLOSED'; }).length;
      var spendW2 = zeros_(N), leadsW = zeros_(N); mIn.forEach(function (m) { var i = bucketIndex_(spec, toStr_(m.business_date)); if (i >= 0) spendW2[i] += toNum_(m[key + '_spend']) || 0; }); ls.forEach(function (l) { var i = bucketIndex_(spec, toStr_(l.created_at).slice(0, 10)); if (i >= 0) leadsW[i]++; });
      var cplW = spendW2.map(function (sp, i) { return leadsW[i] ? Math.round(sp / leadsW[i]) : null; });
      return { channel: label, spend: spend, leads: ls.length, cost_per_lead: safeDiv_(spend, ls.length), appointments: ap, cost_per_appointment: safeDiv_(spend, ap), contracts: lc, closed: lz, cost_per_close: safeDiv_(spend, lz), spend_by_bucket: spendW2, leads_by_bucket: leadsW, cpl_by_bucket: cplW };
    });
    var srcMap = {}; leads.forEach(function (l) { var d = toStr_(l.created_at).slice(0, 10); if (!inRange(d)) return; var s = normalizeSource_(l.source) || '(no source)'; var e = srcMap[s] = srcMap[s] || { source: s, leads: 0, appointments: 0, contracts: 0, closed: 0 }; e.leads++; if (['APPOINTMENT_SET', 'UNDER_CONTRACT', 'CLOSED'].indexOf(l.status) > -1 || l.appointment_date) e.appointments++; if (['UNDER_CONTRACT', 'CLOSED'].indexOf(l.status) > -1) e.contracts++; if (l.status === 'CLOSED') e.closed++; });
    var sources = LEAD_SOURCES.map(function (s) { return srcMap[s[0]] || { source: s[0], leads: 0, appointments: 0, contracts: 0, closed: 0 }; }).concat(Object.keys(srcMap).filter(function (k) { return !LEAD_SOURCES.some(function (s) { return s[0] === k; }); }).map(function (k) { return srcMap[k]; }));
    var totalSpend = mIn.reduce(function (t, m) { return t + spendOf_(m); }, 0), totalLeads = sumField_(mIn, 'new_leads'), totalAppts = sumField_(mIn, 'appointments_set');

    /* ---- TEAM ---- */
    var dayLabels = [], dayKeys = []; for (var d = 6; d >= 0; d--) { var k = shiftDateString_(today, -d); dayKeys.push(k); dayLabels.push(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(k + 'T12:00:00Z').getUTCDay()]); }
    var team = {}; users.forEach(function (u) { if (!toBool_(u.active) && toStr_(u.role) === 'TECHNICAL') return; team[toStr_(u.user_id)] = { user_id: toStr_(u.user_id), name: toStr_(u.name), role: toStr_(u.role), active: toBool_(u.active), touched: {}, attempts: 0, notes: 0, moves: 0, appointments: 0, contracts: 0, closes: 0, offers: 0, attempts_by_day: zeros_(7), last_activity: '', active_assigned: 0, overdue_assigned: 0, no_next_action: 0 }; });
    aIn.forEach(function (a) { var r = team[toStr_(a.user_id)]; if (!r) return; r.touched[a.lead_id] = 1;
      switch (a.action_type) { case 'CALL_ATTEMPT': r.attempts++; var di = dayKeys.indexOf(toStr_(a.business_date)); if (di > -1) r.attempts_by_day[di]++; break; case 'NOTE_ADDED': r.notes++; break; case 'STATUS_CHANGED': r.moves++; if (a.new_value === 'UNDER_CONTRACT') r.contracts++; if (a.new_value === 'CLOSED') r.closes++; break; case 'APPOINTMENT_SET': r.appointments++; break; case 'OFFER_SENT': r.offers++; break; }
      if (toStr_(a.timestamp_utc) > r.last_activity) r.last_activity = toStr_(a.timestamp_utc); });
    live.forEach(function (l) { var r = team[l.assigned_to]; if (!r) return; r.active_assigned++; if (l.due_state === 'OVERDUE') r.overdue_assigned++; if (l.due_state === 'NO_NEXT_ACTION') r.no_next_action++; });
    var reps = Object.keys(team).map(function (k) { var r = team[k]; r.leads_touched = Object.keys(r.touched).length; delete r.touched; r.total = r.attempts + r.notes + r.moves + r.appointments + r.offers; return r; })
      .filter(function (r) { return r.active || r.total > 0 || r.active_assigned > 0; }).sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
    var worked = reps.filter(function (r) { return r.total > 0; }).length;

    /* ---- DISCIPLINE ---- */
    var monthStart = monthStartOf_(today), logged = {}; metrics.forEach(function (m) { logged[toStr_(m.business_date)] = toStr_(m.updated_by || m.created_by); });
    var calendar = []; var dim = daysInMonthOf_(today); for (var dd = 1; dd <= dim; dd++) { var k2 = today.slice(0, 8) + String(dd).padStart(2, '0'); calendar.push({ date: k2, state: k2 > today ? 'future' : logged[k2] ? 'logged' : 'missed', by: logged[k2] ? (nameOf[logged[k2]] || logged[k2]) : '' }); }
    var loggedCount = calendar.filter(function (c) { return c.state === 'logged'; }).length, elapsed = dayOfMonthOf_(today);
    var dailyTools = readTable_(SHEETS.TOOL_INVENTORY).rows.filter(function (t) { return toStr_(t.status) !== 'Retired' && TOOL_DAILY_CADENCE.indexOf(toStr_(t.cadence)) > -1; });
    var runMap = runsByDate_(), heatDays = []; for (var h = 13; h >= 0; h--) heatDays.push(shiftDateString_(today, -h));
    var toolHeat = dailyTools.map(function (t) { return { tool_id: toStr_(t.tool_id), name: toStr_(t.name), days: heatDays.map(function (dk) { var req = isDailyTool_(t, dk); var ran = !!(runMap[dk] && runMap[dk][toStr_(t.tool_id)]); return { date: dk, state: dk === today && !ran ? 'pending' : !req ? 'off' : ran ? 'run' : 'missed' }; }) }; });
    var toolMisses = 0; toolHeat.forEach(function (t) { t.days.forEach(function (d) { if (d.state === 'missed') toolMisses++; }); });
    var streak = computeStreak_(readTable_(SHEETS.TOOL_INVENTORY).rows.filter(function (t) { return toStr_(t.status) !== 'Retired'; }), runMap, today);
    var doneActs = aIn.filter(function (a) { return a.action_type === 'NEXT_ACTION_DONE' && a.new_value; });
    var fuW = spec.buckets.map(function (b) { var n = 0, on = 0; doneActs.forEach(function (a) { var d = toStr_(a.business_date); if (d < b.start || d > b.end) return; n++; if (d <= toStr_(a.new_value)) on++; }); return n ? Math.round(on / n * 100) : null; });
    var fuTotal = doneActs.length, fuOn = doneActs.filter(function (a) { return toStr_(a.business_date) <= toStr_(a.new_value); }).length;
    // speed to first call: minutes from lead creation to first CALL_ATTEMPT, for leads created in range
    var firstAttempt = {}; acts.forEach(function (a) { if (a.action_type !== 'CALL_ATTEMPT') return; var k = toStr_(a.lead_id); if (!firstAttempt[k] || toStr_(a.timestamp_utc) < firstAttempt[k]) firstAttempt[k] = toStr_(a.timestamp_utc); });
    var speedW = spec.buckets.map(function (b) { var tot = 0, n = 0; leads.forEach(function (l) { var d = toStr_(l.created_at).slice(0, 10); if (d < b.start || d > b.end || !firstAttempt[l.lead_id]) return; var m = minutesBetween_(l.created_at, firstAttempt[l.lead_id]); if (m == null || m < 0) return; tot += m; n++; }); return n ? Math.round(tot / n) : null; });
    var speedVals = speedW.filter(function (v) { return v != null; }), speedAvg = speedVals.length ? Math.round(speedVals.reduce(function (t, v) { return t + v; }, 0) / speedVals.length) : (numbers.funnel.avg_speed_to_first_call);
    var noNextW = zeros_(N); // no-next-action count only meaningful today
    var noNextToday = live.filter(function (l) { return l.due_state === 'NO_NEXT_ACTION'; }).length;

    /* ---- APPOINTMENTS ---- */
    var apIn = appts.filter(function (a) { return inRange(toStr_(a.appointment_date)) || inRange(toStr_(a.created_at).slice(0, 10)); });
    var visitedOutcomes = ['Offer made', 'Thinking about it', 'Too high on price', 'No deal', 'Signed'];
    var setN = apIn.length, visited = apIn.filter(function (a) { return visitedOutcomes.indexOf(toStr_(a.outcome)) > -1; }).length,
        offered = apIn.filter(function (a) { return ['Offer made', 'Thinking about it', 'Too high on price', 'Signed'].indexOf(toStr_(a.outcome)) > -1; }).length,
        signed = apIn.filter(function (a) { return toStr_(a.outcome) === 'Signed'; }).length,
        noShow = apIn.filter(function (a) { return toStr_(a.status) === 'CANCELLED' || (toStr_(a.outcome) === 'Not visited yet' && toStr_(a.appointment_date) < today); }).length;
    var byRep = {}; apIn.forEach(function (a) { var k = toStr_(a.assigned_to), r = byRep[k] = byRep[k] || { user_id: k, name: nameOf[k] || k, set: 0, visited: 0, signed: 0 }; r.set++; if (visitedOutcomes.indexOf(toStr_(a.outcome)) > -1) r.visited++; if (toStr_(a.outcome) === 'Signed') r.signed++; });
    var upcoming = appts.filter(function (a) { var d = toStr_(a.appointment_date); return d >= today && d <= shiftDateString_(today, 7) && a.status !== 'CANCELLED'; }).length;

    return ok_({
      from: spec.from, to: spec.to, days: spec.days, bucket_days: spec.bucket_days, labels: labels, today: today,
      compare: { current: windowTotals_(spec.from, spec.to, leads, acts, metrics),
                 previous: windowTotals_(spec.prev_from, spec.prev_to, leads, acts, metrics) },
      pace: { closed_mtd: pace.closed, target: pace.target, expected_to_date: pace.expected_to_date, on_pace: pace.on_pace, behind_by: pace.behind_by, percent: pace.percent, day_of_month: pace.day_of_month, days_in_month: pace.days_in_month,
        spend_mtd: pace.spend_mtd, budget: pace.budget, contracts_mtd: pace.contracts_mtd, contracts_by_bucket: contractsW, closed_by_bucket: closedW, fell_out_by_bucket: fellW, spend_by_bucket: spendW,
        contracts_period: ct, closed_period: cl, fell_out_period: fo, contract_to_close: pctOf_(cl, ct), fallout_pct: pctOf_(fo, ct), weekly_target: weeklyTarget },
      pipeline: { live: live.length, target: toNum_(ctx.settings.live_list_target) || 200, stages: stages, days_in_stage: daysInStage, avg_days_in_stage: avgStage, archived_period: archivedInRange.length,
        archive_reasons: ARCHIVED_STATUSES.map(function (s) { return { key: s, label: STATUS_LABELS[s].replace('Archived: ', ''), count: archReasons[s] }; }), stale_by_bucket: staleW, stale_now: live.filter(function (l) { return l.days_untouched >= ctx.staleDays; }).length,
        no_next_action: noNextToday, appointments_set: stageCounts.APPOINTMENT_SET, offers_sent: offersSent, offer_rate: pctOf_(offersSent, reached), reached_period: reached },
      marketing: { sources: sources, spend: totalSpend, leads: totalLeads, cost_per_lead: safeDiv_(totalSpend, totalLeads), cost_per_appointment: safeDiv_(totalSpend, totalAppts), cost_per_contract: safeDiv_(totalSpend, ct), cost_per_close: safeDiv_(totalSpend, cl), channels: chan, spend_by_bucket: spendW, cpl_ceiling: toNum_(ctx.settings.cpl_ceiling) || 100 },
      team: { worked: worked, total_reps: reps.length, leads_touched: reps.reduce(function (t, r) { return t + r.leads_touched; }, 0), attempts: reps.reduce(function (t, r) { return t + r.attempts; }, 0), appointments: reps.reduce(function (t, r) { return t + r.appointments; }, 0), offers: reps.reduce(function (t, r) { return t + r.offers; }, 0), day_labels: dayLabels, day_keys: dayKeys, reps: reps },
      discipline: { logged_days: loggedCount, elapsed_days: elapsed, calendar: calendar, missed_dates: calendar.filter(function (c) { return c.state === 'missed'; }).map(function (c) { return c.date; }), tools: toolHeat, tool_days: heatDays, tool_misses: toolMisses, streak: streak,
        followup_on_time_pct: pctOf_(fuOn, fuTotal), followup_by_bucket: fuW, followups_done: fuTotal, followup_target: 90, speed_avg: speedAvg, speed_by_bucket: speedW, speed_target: toNum_(ctx.settings.speed_target_minutes) || 10, no_next_action: noNextToday },
      appointments: { set: setN, visited: visited, offered: offered, signed: signed, no_show: noShow, visited_pct: pctOf_(visited, setN), offer_pct: pctOf_(offered, visited), signed_pct: pctOf_(signed, offered), no_show_pct: pctOf_(noShow, setN), by_rep: Object.keys(byRep).map(function (k) { return byRep[k]; }).sort(function (a, b) { return b.set - a.set; }), upcoming_7d: upcoming }
    });
  }, { capability: 'view_numbers' });
}
