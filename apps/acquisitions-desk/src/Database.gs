/**
 * Database.gs — the only file that touches SpreadsheetApp.
 * Reusable utilities: sheet access, header maps, row<->object mapping, find-by-id, targeted writes, appends.
 * Row numbers are never used as IDs. Rows are only ever appended or updated in place, never deleted or reordered,
 * so an ID→row map is safe to cache per request (and re-verified before every write).
 */

var _dbCache = { ss: null, sheets: {}, headers: {}, tables: {} };

function getDbId_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_DB_ID);
  if (!id) throw new AppError_('NOT_CONFIGURED', 'Database not configured. Run setupDatabase() from the Apps Script editor first.');
  return id;
}
function getDb_() {
  if (_dbCache.ss) return _dbCache.ss;
  _dbCache.ss = SpreadsheetApp.openById(getDbId_());
  return _dbCache.ss;
}
function getSheet_(name) {
  if (_dbCache.sheets[name]) return _dbCache.sheets[name];
  var sh = getDb_().getSheetByName(name);
  if (!sh) throw new AppError_('NOT_CONFIGURED', 'Missing sheet ' + name + '. Run setupDatabase().');
  _dbCache.sheets[name] = sh;
  return sh;
}
/** Header array for a sheet: the canonical list from Config (the sheet is verified against it by setupDatabase). */
function headersOf_(name) {
  if (_dbCache.headers[name]) return _dbCache.headers[name];
  var sh = getSheet_(name);
  var lastCol = Math.max(sh.getLastColumn(), HEADERS[name].length);
  var actual = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return toStr_(h).trim(); });
  // Prefer actual headers so an admin-added column does not break mapping, but require the canonical ones present.
  HEADERS[name].forEach(function (h) { if (actual.indexOf(h) < 0) throw new AppError_('NOT_CONFIGURED', 'Sheet ' + name + ' is missing column ' + h + '. Run setupDatabase().'); });
  _dbCache.headers[name] = actual.filter(function (h) { return h; });
  return _dbCache.headers[name];
}
function colIndex_(name, field) {
  var i = headersOf_(name).indexOf(field);
  if (i < 0) throw new AppError_('SERVER_ERROR', 'Unknown column ' + field + ' on ' + name);
  return i + 1; // 1-based
}

function rowToObject_(name, row, headers) {
  headers = headers || headersOf_(name);
  var o = {};
  for (var i = 0; i < headers.length; i++) {
    var v = row[i];
    if (v instanceof Date) {
      // Sheets may coerce yyyy-MM-dd strings into Dates; normalize back to strings.
      var f = headers[i];
      v = (/_at$|_utc$|^timestamp$|^run_at$/.test(f)) ? v.toISOString() : Utilities.formatDate(v, getBusinessTimezone_(), 'yyyy-MM-dd');
    }
    o[headers[i]] = v === undefined ? '' : v;
  }
  return o;
}
function objectToRow_(name, obj, headers) {
  headers = headers || headersOf_(name);
  return headers.map(function (h) { var v = obj[h]; return v === undefined || v === null ? '' : v; });
}

/**
 * Reads a whole table once (one getValues call). Returns { headers, rows:[obj], rowNumbers:[n], byId:{id:obj} }.
 * Cached for the duration of the request; invalidate with invalidateTable_(name) after writes.
 */
function readTable_(name) {
  if (_dbCache.tables[name]) return _dbCache.tables[name];
  var sh = getSheet_(name), headers = headersOf_(name);
  var lastRow = sh.getLastRow();
  var rows = [], rowNumbers = [], byId = {}, idField = ID_COLUMN[name];
  if (lastRow >= 2) {
    var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var idv = idKey_(values[i][headers.indexOf(idField)]);
      if (!idv) continue; // blank row
      var o = rowToObject_(name, values[i], headers);
      rows.push(o); rowNumbers.push(i + 2);
      byId[idv] = o;
    }
  }
  var t = { headers: headers, rows: rows, rowNumbers: rowNumbers, byId: byId };
  _dbCache.tables[name] = t;
  return t;
}
function invalidateTable_(name) { delete _dbCache.tables[name]; }

/** Finds the sheet row number for an ID by reading only the ID column. Returns -1 when absent. */
function findRowNumberById_(name, id) {
  var sh = getSheet_(name), idCol = colIndex_(name, ID_COLUMN[name]);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var key = idKey_(id);
  var t = _dbCache.tables[name];
  if (t) {
    var i = t.rows.findIndex ? t.rows.findIndex(function (r) { return idKey_(r[ID_COLUMN[name]]) === key; }) : -1;
    if (i >= 0) {
      var rn = t.rowNumbers[i];
      if (idKey_(sh.getRange(rn, idCol).getValue()) === key) return rn; // verify before trusting the cache
    }
  }
  var ids = sh.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (var r = 0; r < ids.length; r++) if (idKey_(ids[r][0]) === key) return r + 2;
  return -1;
}
function getRowObjectByNumber_(name, rowNumber) {
  var sh = getSheet_(name), headers = headersOf_(name);
  return rowToObject_(name, sh.getRange(rowNumber, 1, 1, headers.length).getValues()[0], headers);
}
function findById_(name, id) {
  var rn = findRowNumberById_(name, id);
  if (rn < 0) return null;
  var o = getRowObjectByNumber_(name, rn); o.__row = rn; return o;
}

/** Appends one object as a row. Returns the object. */
function appendRowObject_(name, obj) {
  var sh = getSheet_(name);
  sh.appendRow(objectToRow_(name, obj));
  invalidateTable_(name);
  return obj;
}
/** Appends many rows in one setValues call. */
function appendRowObjects_(name, objs) {
  if (!objs.length) return;
  var sh = getSheet_(name), headers = headersOf_(name);
  var start = sh.getLastRow() + 1;
  var values = objs.map(function (o) { return objectToRow_(name, o, headers); });
  sh.getRange(start, 1, values.length, headers.length).setValues(values);
  invalidateTable_(name);
}
/** Writes exactly one row (the record at rowNumber). Targeted write — never touches other rows. */
function writeRowObject_(name, rowNumber, obj) {
  var sh = getSheet_(name), headers = headersOf_(name);
  var clean = {}; headers.forEach(function (h) { clean[h] = obj[h]; });
  sh.getRange(rowNumber, 1, 1, headers.length).setValues([objectToRow_(name, clean, headers)]);
  invalidateTable_(name);
}
/** Load → patch → write one record by id. Caller holds the lock. */
function updateRowById_(name, id, patchFn) {
  var rn = findRowNumberById_(name, id);
  if (rn < 0) throw notFound_(name + ' record ' + id + ' not found.');
  var current = getRowObjectByNumber_(name, rn);
  var updated = patchFn(current) || current;
  writeRowObject_(name, rn, updated);
  return updated;
}

/* ---------- settings (key/value) ---------- */
function getSettingsMap_() {
  var t = readTable_(SHEETS.SETTINGS), m = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { m[k] = DEFAULT_SETTINGS[k]; });
  t.rows.forEach(function (r) { m[toStr_(r.setting_key)] = toStr_(r.setting_value); });
  return m;
}
function getSettingValue_(key) { return getSettingsMap_()[key]; }
function getSettingNumber_(key, fallback) { var n = toNum_(getSettingValue_(key)); return n == null ? fallback : n; }
function upsertSetting_(key, value, user) {
  var rn = findRowNumberById_(SHEETS.SETTINGS, key);
  var obj = { setting_key: key, setting_value: toStr_(value), updated_by: user ? user.user_id : 'SYSTEM', updated_at: nowUtcIso_() };
  if (rn < 0) appendRowObject_(SHEETS.SETTINGS, obj); else writeRowObject_(SHEETS.SETTINGS, rn, obj);
  return obj;
}

/* ---------- users ---------- */
function getUsersTable_() { return readTable_(SHEETS.USERS); }
function findUserByEmail_(email) {
  var e = trimStr_(email).toLowerCase(); if (!e) return null;
  var t = getUsersTable_();
  for (var i = 0; i < t.rows.length; i++) if (trimStr_(t.rows[i].email).toLowerCase() === e) return t.rows[i];
  return null;
}
function findUserById_(id) { return getUsersTable_().byId[toStr_(id)] || null; }
function userDisplayName_(id) { var u = id ? findUserById_(id) : null; return u ? toStr_(u.name) : toStr_(id); }
