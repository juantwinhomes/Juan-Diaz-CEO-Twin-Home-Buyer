/**
 * Utils.gs — IDs, dates, business timezone, normalization, responses, locks, logging helpers.
 */

function nowUtcIso_() { return new Date().toISOString(); }
/** Stable string compare (returns 0 on ties so Array.sort keeps insertion order). */
function cmpStr_(a, b) { a = toStr_(a); b = toStr_(b); return a < b ? -1 : a > b ? 1 : 0; }

function getBusinessTimezone_() {
  try { var tz = getSettingValue_('business_timezone'); if (tz) return tz; } catch (e) {}
  return DEFAULT_SETTINGS.business_timezone;
}

/** Company business date (yyyy-MM-dd) for a Date, in the configured business timezone. */
function businessDateOf_(date, tz) {
  tz = tz || getBusinessTimezone_();
  return Utilities.formatDate(date || new Date(), tz, 'yyyy-MM-dd');
}
function todayBusinessDate_() { return businessDateOf_(new Date()); }

/** Shift a yyyy-MM-dd string by N days (calendar arithmetic, timezone-neutral). */
function shiftDateString_(ymd, days) {
  var p = ymd.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days));
  return d.toISOString().slice(0, 10);
}
function monthStartOf_(ymd) { return ymd.slice(0, 8) + '01'; }
function daysInMonthOf_(ymd) {
  var p = ymd.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate();
}
function dayOfMonthOf_(ymd) { return +ymd.split('-')[2]; }

/** Days between two yyyy-MM-dd strings (b - a). */
function daysBetween_(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
}

/** Days since an ISO timestamp, measured on the business calendar. */
function daysSinceTimestamp_(iso, todayYmd, tz) {
  if (!iso) return 9999;
  var d = new Date(iso); if (isNaN(d.getTime())) return 9999;
  return daysBetween_(businessDateOf_(d, tz), todayYmd);
}

var ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomToken_(len) {
  var s = '';
  for (var i = 0; i < len; i++) s += ID_ALPHABET.charAt(Math.floor(Math.random() * ID_ALPHABET.length));
  return s;
}
/** Collision-safe permanent IDs, e.g. LEAD-20260911-A82KD. `exists` is an optional predicate. */
function generateId_(prefix, exists) {
  var stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd');
  for (var i = 0; i < 20; i++) {
    var id = prefix + '-' + stamp + '-' + randomToken_(5);
    if (!exists || !exists(id)) return id;
  }
  return prefix + '-' + stamp + '-' + randomToken_(9);
}
function generateEventId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmmss') + '-' + randomToken_(6);
}

/* ---------- normalization ---------- */
function toBool_(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}
function toNum_(v) {
  if (v === '' || v == null) return null;
  var n = Number(v); return isFinite(n) ? n : null;
}
function toStr_(v) { return v == null ? '' : String(v); }
/** Key used to match IDs in sheet cells. Sheets may coerce date-like text (e.g. a business_date) into a Date cell. */
function idKey_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, getBusinessTimezone_(), 'yyyy-MM-dd');
  return toStr_(v).trim();
}
function trimStr_(v) { return toStr_(v).replace(/\s+/g, ' ').trim(); }

/** Accepts yyyy-MM-dd strings or Date objects; returns yyyy-MM-dd or ''. Throws on garbage. */
function normalizeDate_(v, tz) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) { if (isNaN(v.getTime())) return ''; return Utilities.formatDate(v, tz || getBusinessTimezone_(), 'yyyy-MM-dd'); }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var p = s.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    if (d.getUTCFullYear() !== +p[0] || d.getUTCMonth() !== +p[1] - 1 || d.getUTCDate() !== +p[2]) throw validationError_('Invalid date: ' + s);
    return s;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  throw validationError_('Date must be yyyy-MM-dd: ' + s);
}
function normalizeAddress_(a) {
  return trimStr_(a).toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(street)\b/g, 'st').replace(/\b(avenue)\b/g, 'ave').replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\b(drive)\b/g, 'dr').replace(/\b(road)\b/g, 'rd').replace(/\b(lane)\b/g, 'ln').replace(/\b(court)\b/g, 'ct')
    .replace(/\b(place)\b/g, 'pl').replace(/\b(apartment|apt|unit)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}
/** Canonical source label for any spelling we know; unknown non-empty text is kept as typed. */
function isValidEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimStr_(e)); }
function normalizeSource_(s) {
  var t = trimStr_(s); if (!t) return '';
  var k = t.toLowerCase().replace(/\s+/g, ' ');
  for (var i = 0; i < LEAD_SOURCES.length; i++) if (LEAD_SOURCES[i][0].toLowerCase() === k) return LEAD_SOURCES[i][0];
  if (SOURCE_ALIASES[k]) return SOURCE_ALIASES[k];
  return t;
}
/** Spend channel key a source rolls up into ('other' for unknown or blank). */
function channelOfSource_(s) {
  var c = normalizeSource_(s);
  for (var i = 0; i < LEAD_SOURCES.length; i++) if (LEAD_SOURCES[i][0] === c) return LEAD_SOURCES[i][1];
  return 'other';
}
function normalizePhone_(p) { var d = toStr_(p).replace(/\D/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); return d; }
function isValidUrl_(u) { return /^https?:\/\/[^\s<>"']+$/i.test(String(u || '')); }
function assertLen_(v, max, field) { if (toStr_(v).length > max) throw validationError_(field + ' is too long (max ' + max + ' characters).'); }

/* ---------- standard responses ---------- */
function ok_(data, message) { var r = { ok: true, data: data === undefined ? null : data }; if (message) r.message = message; return r; }
function fail_(code, message, data) { var r = { ok: false, code: code, message: message || code }; if (data !== undefined) r.data = data; return r; }

function AppError_(code, message, data) { this.code = code; this.message = message || code; this.data = data; this.isAppError = true; }
function validationError_(msg) { return new AppError_('VALIDATION_ERROR', msg); }
function accessDenied_(msg) { return new AppError_('ACCESS_DENIED', msg || 'You do not have access to do that.'); }
function notFound_(msg) { return new AppError_('NOT_FOUND', msg || 'Record not found.'); }
function conflictError_(latest) { return new AppError_('CONFLICT_RECORD_CHANGED', 'This lead was updated by another team member. Review the latest information before saving your change.', latest); }

/**
 * Wraps a server entry point: authenticates, runs fn(user), converts any exception into a standard failure
 * and writes unexpected errors to ERROR_LOG. Every client-callable function goes through this.
 */
/**
 * Prints the outcome of a maintenance run to the Execution log. Every public function returns failures as a value
 * rather than throwing, so without this a run that could not start looks identical to one that did nothing.
 */
function logResult_(name, r) {
  if (r && r.ok) { Logger.log(name + ' — ' + r.message + '\n' + JSON.stringify(r.data, null, 2)); return r; }
  var code = (r && r.code) || 'UNKNOWN', msg = (r && r.message) || 'no result';
  var hint = code === 'NOT_CONFIGURED' ? '\n\nRun setupDatabase once from the Setup file, then run this again.'
    : code === 'ACCESS_DENIED' ? '\n\nThe signed-in account is not allowed to do this.' : '';
  Logger.log('!! ' + name + ' did NOT run.\n' + code + ': ' + msg + hint);
  return r;
}

function guarded_(fnName, fn, opts) {
  opts = opts || {};
  var user = null;
  try {
    user = opts.noAuth ? null : requireUser_();
    if (opts.capability) requireCapability_(user, opts.capability);
    return fn(user);
  } catch (e) {
    if (e && e.isAppError) {
      if (e.code === 'ACCESS_DENIED') safeAudit_(user, 'ACCESS', fnName, 'ACCESS_DENIED', e.message);
      return fail_(e.code, e.message, e.data);
    }
    logError_(fnName, user, e, opts.entityType, opts.entityId);
    return fail_('SERVER_ERROR', 'Something went wrong on the server. It has been logged.');
  }
}

/* ---------- locks ---------- */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(LOCK_TIMEOUT_MS);
    if (!got) throw new AppError_('BUSY', 'The desk is busy saving another change. Try again in a moment.');
    return fn();
  } finally {
    if (got) { try { lock.releaseLock(); } catch (e) {} }
  }
}

/* ---------- logging ---------- */
function logError_(fnName, user, err, entityType, entityId) {
  try {
    var details = err && err.stack ? String(err.stack).slice(0, 2000) : '';
    appendRowObject_(SHEETS.ERROR_LOG, {
      error_id: generateEventId_('ERR'), timestamp_utc: nowUtcIso_(), user_id: user ? user.user_id : '',
      'function': fnName, entity_type: entityType || '', entity_id: entityId || '',
      error: String(err && err.message ? err.message : err).slice(0, 1000), details: details
    });
  } catch (e2) { try { console.error('logError_ failed', e2); } catch (e3) {} }
}
function audit_(user, entityType, entityId, action, details) {
  appendRowObject_(SHEETS.AUDIT_LOG, {
    event_id: generateEventId_('EVT'), timestamp_utc: nowUtcIso_(), business_date: todayBusinessDate_(),
    user_id: user ? user.user_id : '', user_email: user ? user.email : (safeActiveEmail_() || ''),
    entity_type: entityType, entity_id: toStr_(entityId), action: action,
    details: typeof details === 'string' ? details.slice(0, 4000) : JSON.stringify(details || {}).slice(0, 4000)
  });
}
function safeAudit_(user, entityType, entityId, action, details) { try { audit_(user, entityType, entityId, action, details); } catch (e) {} }
function safeActiveEmail_() { try { return Session.getActiveUser().getEmail(); } catch (e) { return ''; } }
