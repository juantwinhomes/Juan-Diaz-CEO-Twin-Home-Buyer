/**
 * AdminService.gs — users, settings, audit_/error log access. No hard delete anywhere.
 */

function publicUser_(u) {
  return { user_id: toStr_(u.user_id), name: toStr_(u.name), email: toStr_(u.email), team: toStr_(u.team), role: toStr_(u.role), active: toBool_(u.active),
    permission_level: toNum_(u.permission_level), created_at: toStr_(u.created_at), updated_at: toStr_(u.updated_at), needs_email: !trimStr_(u.email) };
}
/** Everyone may see the team list (names/roles) for assignment; emails only for admins. */
function getUsers() {
  return guarded_('getUsers', function (user) {
    var admin = hasCapability_(user, 'manage_users');
    return ok_(getUsersTable_().rows.map(function (u) { var p = publicUser_(u); if (!admin) { delete p.email; delete p.needs_email; } return p; }));
  }, { capability: 'view_leads' });
}
function validateUserInput_(d, isCreate) {
  var out = {};
  if ('name' in d || isCreate) { out.name = trimStr_(d.name); if (!out.name) throw validationError_('Name is required.'); assertLen_(out.name, 100, 'Name'); }
  if ('email' in d || isCreate) { out.email = trimStr_(d.email).toLowerCase(); if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw validationError_('Email looks invalid.'); }
  if ('team' in d) { out.team = trimStr_(d.team); assertLen_(out.team, 100, 'Team'); }
  if ('role' in d || isCreate) { out.role = toStr_(d.role || 'REP').toUpperCase(); if (!ROLES[out.role]) throw validationError_('Role must be ADMIN, MANAGER, REP or TECHNICAL.'); out.permission_level = PERMISSION_LEVEL[out.role]; }
  if ('active' in d) out.active = toBool_(d.active);
  return out;
}
function createUser(data) {
  return guarded_('createUser', function (user) {
    var d = validateUserInput_(data || {}, true);
    var rec = withLock_(function () {
      if (d.email && findUserByEmail_(d.email)) throw validationError_('A user with that email already exists.');
      var ts = nowUtcIso_();
      var rec = { user_id: generateId_('USR', function (id) { return !!findUserById_(id); }), name: d.name, email: d.email, team: d.team || '', role: d.role,
        active: d.email ? (d.active !== undefined ? d.active : true) : false, permission_level: d.permission_level, created_at: ts, updated_at: ts };
      appendRowObject_(SHEETS.USERS, rec); return rec;
    });
    audit_(user, 'USER', rec.user_id, 'USER_CREATED', { name: rec.name, role: rec.role });
    return ok_(publicUser_(rec), rec.email ? 'User added' : 'User added — inactive until an email is set');
  }, { capability: 'manage_users' });
}
function updateUser(userId, patch) {
  return guarded_('updateUser', function (user) {
    var d = validateUserInput_(patch || {}, false); if (!Object.keys(d).length) throw validationError_('Nothing to update.');
    var rec = withLock_(function () {
      var existing = findUserById_(userId); if (!existing) throw notFound_('User not found.');
      if (d.email) { var other = findUserByEmail_(d.email); if (other && toStr_(other.user_id) !== toStr_(userId)) throw validationError_('Another user already has that email.'); }
      if (toStr_(userId) === user.user_id && ((d.role && d.role !== 'ADMIN') || d.active === false)) throw validationError_('You cannot demote or deactivate your own account.');
      if ((d.role && d.role !== 'ADMIN') || d.active === false) {
        var admins = getUsersTable_().rows.filter(function (u) { return toStr_(u.role) === 'ADMIN' && toBool_(u.active) && toStr_(u.user_id) !== toStr_(userId); });
        if (toStr_(existing.role) === 'ADMIN' && !admins.length) throw validationError_('There must be at least one other active ADMIN.');
      }
      return updateRowById_(SHEETS.USERS, userId, function (u) {
        Object.keys(d).forEach(function (k) { u[k] = d[k]; });
        if (!trimStr_(u.email)) u.active = false; // no email → cannot log in
        u.updated_at = nowUtcIso_(); return u;
      });
    });
    audit_(user, 'USER', userId, 'USER_UPDATED', d);
    return ok_(publicUser_(rec), 'Saved');
  }, { capability: 'manage_users', entityType: 'USER', entityId: userId });
}
function disableUser(userId) { return updateUser(userId, { active: false }); }

function publicSettings_(s) {
  var out = {}; Object.keys(s).forEach(function (k) { out[k] = s[k]; });
  ['monthly_deal_target', 'monthly_marketing_budget', 'mao_percentage', 'stale_lead_days', 'auto_refresh_seconds', 'live_list_target', 'page_size', 'cpl_ceiling', 'speed_target_minutes'].forEach(function (k) { out[k] = toNum_(out[k]); });
  return out;
}
function getSettings() { return guarded_('getSettings', function (user) { return ok_(publicSettings_(getSettingsMap_())); }, { capability: 'view_leads' }); }

var MANAGER_SETTINGS = ['monthly_deal_target', 'monthly_marketing_budget'];
function saveSetting(key, value) {
  return guarded_('saveSetting', function (user) {
    key = toStr_(key);
    var isPillar = /^pillar_p_[a-z]+$/.test(key), isAsked = /^asked_[A-Za-z]+$/.test(key);
    if (isPillar || isAsked) requireCapability_(user, 'manage_tools');
    else if (MANAGER_SETTINGS.indexOf(key) > -1) requireCapability_(user, 'manage_targets');
    else if (key in DEFAULT_SETTINGS) requireCapability_(user, 'manage_settings');
    else throw validationError_('Unknown setting: ' + key);
    var v = trimStr_(value);
    if (isPillar && PILLAR_STATES.indexOf(v) < 0) throw validationError_('Unknown pillar state.');
    if (['monthly_deal_target', 'monthly_marketing_budget', 'mao_percentage', 'stale_lead_days', 'auto_refresh_seconds', 'live_list_target', 'page_size', 'cpl_ceiling', 'speed_target_minutes'].indexOf(key) > -1) {
      var n = toNum_(v); if (n == null || n < 0) throw validationError_(key.replace(/_/g, ' ') + ' must be a number.');
      if (key === 'mao_percentage' && (n < 30 || n > 100)) throw validationError_('MAO percentage must be between 30 and 100.');
      if (key === 'auto_refresh_seconds' && n && n < 10) throw validationError_('Auto refresh must be at least 10 seconds (or 0 to disable).');
      v = String(n);
    }
    if (key === 'business_timezone') { try { Utilities.formatDate(new Date(), v, 'yyyy-MM-dd'); } catch (e) { throw validationError_('Unknown timezone.'); } }
    var rec = withLock_(function () { return upsertSetting_(key, v, user); });
    audit_(user, 'SETTING', key, 'SETTING_CHANGED', { value: v });
    return ok_(rec, 'Saved');
  }, {});
}
function getAuditLog(limit) {
  return guarded_('getAuditLog', function (user) {
    var rows = readTable_(SHEETS.AUDIT_LOG).rows.slice(-(Math.min(500, toNum_(limit) || 100))).reverse();
    return ok_(rows);
  }, { capability: 'view_audit' });
}
function getErrorLog(limit) {
  return guarded_('getErrorLog', function (user) { return ok_(readTable_(SHEETS.ERROR_LOG).rows.slice(-(Math.min(500, toNum_(limit) || 100))).reverse()); }, { capability: 'manage_settings' });
}
