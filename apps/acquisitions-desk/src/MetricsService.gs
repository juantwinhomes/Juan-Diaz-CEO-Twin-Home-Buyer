/**
 * MetricsService.gs — DAILY_METRICS (one row per business date) and the Numbers dashboard.
 */

function publicMetrics_(m) {
  var o = { business_date: toStr_(m.business_date) };
  METRIC_FIELDS.forEach(function (f) { o[f] = toNum_(m[f]); });
  o.created_by = toStr_(m.created_by); o.updated_by = toStr_(m.updated_by); o.updated_at = toStr_(m.updated_at);
  o.created_by_name = userDisplayName_(o.created_by); o.updated_by_name = userDisplayName_(o.updated_by);
  o.total_spend = (o.tv_spend || 0) + (o.ppc_spend || 0) + (o.ppl_spend || 0) + (o.other_spend || 0);
  return o;
}
function getDailyMetrics(date) {
  return guarded_('getDailyMetrics', function (user) {
    var ctx = leadContext_(), d = date ? normalizeDate_(date, ctx.tz) : ctx.today;
    var m = findById_(SHEETS.DAILY_METRICS, d);
    return ok_(m ? publicMetrics_(m) : null);
  }, { capability: 'view_numbers' });
}
/** Upsert one business date. Saving today again updates today's record. */
function saveDailyMetrics(date, data) {
  return guarded_('saveDailyMetrics', function (user) {
    data = data || {}; var ctx = leadContext_(), d = date ? normalizeDate_(date, ctx.tz) : ctx.today;
    if (d > ctx.today) throw validationError_('You cannot log a future date.');
    var clean = {};
    METRIC_FIELDS.forEach(function (f) {
      if (!(f in data)) return; var v = data[f];
      if (v === '' || v == null) { clean[f] = ''; return; }
      var n = toNum_(v); if (n == null) throw validationError_(f.replace(/_/g, ' ') + ' must be a number.'); if (n < 0) throw validationError_(f.replace(/_/g, ' ') + ' cannot be negative.');
      clean[f] = n;
    });
    if (!Object.keys(clean).length) throw validationError_('Nothing to save.');
    var saved = withLock_(function () {
      var rn = findRowNumberById_(SHEETS.DAILY_METRICS, d), ts = nowUtcIso_(), rec;
      if (rn < 0) { rec = { business_date: d, created_by: user.user_id, created_at: ts, updated_by: user.user_id, updated_at: ts }; METRIC_FIELDS.forEach(function (f) { rec[f] = f in clean ? clean[f] : ''; }); appendRowObject_(SHEETS.DAILY_METRICS, rec); }
      else { rec = getRowObjectByNumber_(SHEETS.DAILY_METRICS, rn); Object.keys(clean).forEach(function (f) { rec[f] = clean[f]; }); rec.updated_by = user.user_id; rec.updated_at = ts; rec.business_date = d; writeRowObject_(SHEETS.DAILY_METRICS, rn, rec); }
      return rec;
    });
    audit_(user, 'DAILY_METRICS', d, 'METRICS_SAVED', clean);
    return ok_(publicMetrics_(saved), 'Saved by ' + user.name);
  }, { capability: 'enter_metrics' });
}

function sumField_(rows, f) { return rows.reduce(function (t, r) { return t + (toNum_(r[f]) || 0); }, 0); }
function spendOf_(r) { return (toNum_(r.tv_spend) || 0) + (toNum_(r.ppc_spend) || 0) + (toNum_(r.ppl_spend) || 0) + (toNum_(r.other_spend) || 0); }
function safeDiv_(a, b) { return b > 0 ? a / b : null; }
function pctOf_(a, b) { return b > 0 ? Math.round(a / b * 100) : null; }

/** All Numbers-tab figures, computed from DAILY_METRICS + LEADS. `leads` are enriched leads. */
function computeNumbers_(ctx, leads, rangeDays) {
  rangeDays = rangeDays || 30;
  var days = readTable_(SHEETS.DAILY_METRICS).rows.slice().sort(function (a, b) { return toStr_(a.business_date) < toStr_(b.business_date) ? 1 : -1; });
  var mStart = monthStartOf_(ctx.today), mo = days.filter(function (d) { return toStr_(d.business_date) >= mStart && toStr_(d.business_date) <= ctx.today; });
  var target = toNum_(ctx.settings.monthly_deal_target) || 0, budget = toNum_(ctx.settings.monthly_marketing_budget) || 0;
  var closedMtd = sumField_(mo, 'deals_closed'), dom = dayOfMonthOf_(ctx.today), dim = daysInMonthOf_(ctx.today);
  var expected = target * dom / dim;
  var pace = { closed: closedMtd, target: target, day_of_month: dom, days_in_month: dim, expected_to_date: Math.round(expected * 10) / 10,
    on_pace: target ? closedMtd >= expected : null, behind_by: target ? Math.max(0, Math.round((expected - closedMtd) * 10) / 10) : 0,
    percent: target ? Math.min(100, Math.round(closedMtd / target * 100)) : 0, spend_mtd: mo.reduce(function (t, d) { return t + spendOf_(d); }, 0), budget: budget,
    contracts_mtd: sumField_(mo, 'contracts_signed'), appointments_mtd: sumField_(mo, 'appointments_set'), leads_mtd: sumField_(mo, 'new_leads') };

  var cut = shiftDateString_(ctx.today, -(rangeDays - 1));
  var r = days.filter(function (d) { return toStr_(d.business_date) >= cut && toStr_(d.business_date) <= ctx.today; });
  var nl = sumField_(r, 'new_leads'), calls = sumField_(r, 'inbound_calls'), miss = sumField_(r, 'missed_calls'), con = sumField_(r, 'sellers_reached'),
      ap = sumField_(r, 'appointments_set'), ct = sumField_(r, 'contracts_signed'), cl = sumField_(r, 'deals_closed'), fell = sumField_(r, 'contracts_fell_out'),
      sp = r.reduce(function (t, d) { return t + spendOf_(d); }, 0);
  var sd = r.filter(function (d) { return toNum_(d.minutes_to_first_call) != null; });
  var funnel = { days_logged: r.length, range_days: rangeDays, from: cut, to: ctx.today, spend: sp, new_leads: nl, inbound_calls: calls, missed_calls: miss, sellers_reached: con,
    appointments: ap, contracts: ct, closed: cl, fell_out: fell,
    conv_reached: pctOf_(con, nl), conv_appt: pctOf_(ap, con), conv_contract: pctOf_(ct, ap), conv_close: pctOf_(cl, ct),
    cost_per_lead: safeDiv_(sp, nl), cost_per_appointment: safeDiv_(sp, ap), cost_per_contract: safeDiv_(sp, ct), cost_per_close: safeDiv_(sp, cl),
    contract_to_close: pctOf_(cl, ct), fallout_pct: pctOf_(fell, ct), avg_speed_to_first_call: sd.length ? Math.round(sumField_(sd, 'minutes_to_first_call') / sd.length) : null,
    missed_call_rate: pctOf_(miss, calls + miss) };

  // Channel table: spend from metrics; production from leads created in the range, by normalized source.
  var inRange = leads.filter(function (l) { var d = toStr_(l.created_at).slice(0, 10); return d >= cut && d <= ctx.today; });
  var channels = CHANNELS.map(function (c) {
    var key = c[0], label = c[1], chSpend = sumField_(r, key + '_spend');
    var ls = inRange.filter(function (l) { return toStr_(l.source).toLowerCase() === label.toLowerCase(); });
    var la = ls.filter(function (l) { return ['APPOINTMENT_SET', 'UNDER_CONTRACT', 'CLOSED'].indexOf(l.status) > -1 || l.appointment_date; }).length;
    var lc = ls.filter(function (l) { return ['UNDER_CONTRACT', 'CLOSED'].indexOf(l.status) > -1; }).length;
    var lz = ls.filter(function (l) { return l.status === 'CLOSED'; }).length;
    return { channel: label, spend: chSpend, leads: ls.length, cost_per_lead: safeDiv_(chSpend, ls.length), appointments: la, contracts: lc, closed: lz, cost_per_close: safeDiv_(chSpend, lz) };
  });
  var other = inRange.filter(function (l) { var s = toStr_(l.source).toLowerCase(); return s && !CHANNELS.some(function (c) { return c[1].toLowerCase() === s; }); });
  var bySrc = {}; other.forEach(function (l) { bySrc[l.source] = (bySrc[l.source] || 0) + 1; });
  var days_table = days.slice(0, 20).map(function (d) { var p = publicMetrics_(d); p.spend = spendOf_(d); return p; });
  return { today: ctx.today, pace: pace, funnel: funnel, channels: channels, other_sources: bySrc, days: days_table, mao_percentage: ctx.maoPct };
}
function getNumbersDashboard(range) {
  return guarded_('getNumbersDashboard', function (user) {
    var ctx = leadContext_(), leads = readTable_(SHEETS.LEADS).rows.map(function (l) { return enrichLead_(l, ctx); });
    var rd = Math.max(7, Math.min(365, toNum_(range && range.days) || 30));
    return ok_(computeNumbers_(ctx, leads, rd));
  }, { capability: 'view_numbers' });
}
