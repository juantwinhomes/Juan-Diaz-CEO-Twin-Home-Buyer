/**
 * Code.gs — web app entry point and bootstrap.
 * Deploy: Execute as "Me", access "Anyone within <company Workspace domain>". Production URL ends in /exec.
 */

function doGet(e) {
  var tpl;
  try {
    var user = getCurrentUser_();
    tpl = HtmlService.createTemplateFromFile('Index');
    tpl.userName = user.name; tpl.appVersion = APP_VERSION;
    return tpl.evaluate().setTitle(APP_NAME).addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  } catch (err) {
    // No company data is rendered for anyone who is not an active, authorized user.
    var code = err && err.code ? err.code : 'SERVER_ERROR';
    if (code === 'SERVER_ERROR' || code === 'NOT_CONFIGURED') logError_('doGet', null, err);
    var msg = err && err.isAppError ? err.message : 'The desk could not open. The error has been logged.';
    var email = getActiveEmail_();
    return HtmlService.createHtmlOutput(
      '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + APP_NAME + '</title>' +
      '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:60px auto;padding:20px;border:1px solid #CBD3DC;border-radius:3px;color:#17223B">' +
      '<h2 style="margin:0 0 8px">Acquisitions desk</h2><p style="color:#B3301F;font-weight:700;margin:0 0 8px">' + escapeHtml_(code.replace(/_/g, ' ')) + '</p>' +
      '<p style="margin:0 0 12px">' + escapeHtml_(msg) + '</p>' +
      (email ? '<p style="font-size:13px;color:#5B6879">Signed in as ' + escapeHtml_(email) + '. If this is your company account, ask the administrator to add it in USERS.</p>' : '') +
      '<p style="font-size:12px;color:#5B6879">' + APP_NAME + ' v' + APP_VERSION + '</p></div>').setTitle(APP_NAME);
  }
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function escapeHtml_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/** First call from the browser: identity, permissions, settings, constants, team list, today's date. */
function bootstrapApp() {
  return guarded_('bootstrapApp', function (user) {
    var s = getSettingsMap_();
    var users = getUsersTable_().rows.map(function (u) { return { user_id: toStr_(u.user_id), name: toStr_(u.name), role: toStr_(u.role), active: toBool_(u.active), team: toStr_(u.team) }; });
    audit_(user, 'SESSION', user.user_id, 'LOGIN', { role: user.role });
    return ok_({
      user: user, settings: publicSettings_(s), today: businessDateOf_(new Date(), s.business_timezone), timezone: s.business_timezone,
      app_version: APP_VERSION, env: PropertiesService.getScriptProperties().getProperty(PROP_ENV) || 'production',
      users: users,
      constants: { status_order: STATUS_ORDER, status_labels: STATUS_LABELS, live_statuses: LIVE_STATUSES, archived_statuses: ARCHIVED_STATUSES,
        appointment_outcomes: APPOINTMENT_OUTCOMES, tool_status: TOOL_STATUS, tool_recommendation: TOOL_RECOMMENDATION, tool_cadence: TOOL_CADENCE,
        tool_verdict: TOOL_VERDICT, pillar_states: PILLAR_STATES, builders: BUILDERS, channels: CHANNELS, roles: Object.keys(ROLES) }
    });
  });
}
/** Lightweight poll used by auto-refresh: returns everything the current tab needs. */
function refreshView(view, params) {
  switch (toStr_(view)) {
    case 'today': return getTodayDashboard();
    case 'numbers': return getNumbersDashboard(params);
    case 'leads': return listLeads(params);
    case 'tools': return getTools();
    case 'juan': return getJuanDashboard();
    case 'dash': return getDashboards(params);
    default: return fail_('VALIDATION_ERROR', 'Unknown view');
  }
}
