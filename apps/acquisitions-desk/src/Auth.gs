/**
 * Auth.gs — identity comes ONLY from the authenticated Google account.
 * Deployment: "Execute as: Me (owner)", "Who has access: Anyone within <Workspace domain>".
 * In that configuration Session.getActiveUser().getEmail() returns the signed-in employee's email.
 * If the email cannot be determined we return an error; we never fall back to a self-selected identity.
 */

function getActiveEmail_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  return trimStr_(email).toLowerCase();
}

/** Resolves the authenticated USERS record or throws an AppError_. */
function getCurrentUser_() {
  var email = getActiveEmail_();
  if (!email) {
    throw new AppError_('IDENTITY_UNAVAILABLE',
      'Your Google identity could not be determined. The web app must be deployed for Workspace users of the company domain. ' +
      'Ask the administrator to check the deployment access setting.');
  }
  var u = findUserByEmail_(email);
  if (!u) { safeAudit_(null, 'USER', email, 'ACCESS_DENIED', 'No USERS record for ' + email); throw accessDenied_('This Google account (' + email + ') is not authorized for the Acquisitions Desk.'); }
  if (!toBool_(u.active)) { safeAudit_(null, 'USER', u.user_id, 'ACCESS_DENIED', 'Inactive user ' + email); throw accessDenied_('This account is inactive. Ask an administrator to re-enable it.'); }
  var role = toStr_(u.role).toUpperCase();
  if (!ROLES[role]) throw accessDenied_('This account has an invalid role configured.');
  return {
    user_id: toStr_(u.user_id), name: toStr_(u.name), email: email, team: toStr_(u.team), role: role,
    permission_level: toNum_(u.permission_level) || PERMISSION_LEVEL[role] || 0,
    capabilities: capabilitiesForRole_(role)
  };
}
function requireUser_() { return getCurrentUser_(); }
function capabilitiesForRole_(role) {
  return Object.keys(CAPABILITIES).filter(function (c) { return CAPABILITIES[c].indexOf(role) > -1; });
}
function hasCapability_(user, cap) { return !!user && CAPABILITIES[cap] && CAPABILITIES[cap].indexOf(user.role) > -1; }
function requireCapability_(user, cap) { if (!hasCapability_(user, cap)) throw accessDenied_('Your role (' + user.role + ') cannot ' + cap.replace(/_/g, ' ') + '.'); return user; }
function requireRole_(user, roles) {
  roles = Array.isArray(roles) ? roles : [roles];
  if (!user || roles.indexOf(user.role) < 0) throw accessDenied_();
  return user;
}

/** Client-callable diagnostic used by the deployment identity test. Returns no company data. */
/**
 * Google profile photo for a Workspace account, looked up in the domain directory (People API, runs as the
 * deploying account). Best effort: any failure or a default silhouette yields '' and the UI shows the initial.
 * Cached per email for 6 hours so the lookup does not run on every refresh.
 */
function profilePhotoUrl_(email) {
  email = toStr_(email).toLowerCase(); if (!email) return '';
  var cache = CacheService.getScriptCache(), key = 'photo:' + email, hit = cache.get(key);
  if (hit !== null) return hit === '-' ? '' : hit;
  var url = '';
  try {
    if (typeof People !== 'undefined') {
      var res = People.People.searchDirectoryPeople({ query: email, readMask: 'photos,emailAddresses', pageSize: 5,
        sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE', 'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT'] });
      var people = (res && res.people) || [];
      for (var i = 0; i < people.length && !url; i++) {
        var p = people[i], emails = (p.emailAddresses || []).map(function (e) { return toStr_(e.value).toLowerCase(); });
        if (emails.length && emails.indexOf(email) < 0) continue;
        var photos = (p.photos || []).filter(function (ph) { return ph.url && !ph['default']; });
        if (photos.length) url = toStr_(photos[0].url);
      }
    }
  } catch (e) { try { logError_('profilePhotoUrl_', null, e, 'USER', email); } catch (ignored) {} }
  cache.put(key, url || '-', 21600);
  return url;
}

function whoAmI() {
  var email = getActiveEmail_();
  var out = { active_email: email, effective_email: '', resolved: false, message: '' };
  try { out.effective_email = trimStr_(Session.getEffectiveUser().getEmail()).toLowerCase(); } catch (e) {}
  if (!email) { out.message = 'No active user email. Check deployment access setting (must be domain users, not anonymous).'; return ok_(out); }
  try {
    var u = getCurrentUser_();
    out.resolved = true; out.user = { user_id: u.user_id, name: u.name, role: u.role, team: u.team };
    out.message = 'Identified as ' + u.name + ' (' + u.role + ').';
  } catch (e) { out.message = e.message; out.code = e.code; }
  return ok_(out);
}
