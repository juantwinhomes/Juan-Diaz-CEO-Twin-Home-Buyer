/**
 * Minimal in-memory emulation of the Google Apps Script services used by src/*.gs, good enough to run the
 * backend and its test suite under Node. Cell date coercion is simulated (Sheets turns yyyy-MM-dd strings into
 * Dates unless the range is formatted as plain text) so the Date-handling code paths are exercised.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const _dtf = {};
function fmt(date, tz, pattern) {
  if (!_dtf[tz]) _dtf[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = Object.fromEntries(_dtf[tz].formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return pattern.replace(/yyyy/g, parts.year).replace(/MM/g, parts.month).replace(/dd/g, parts.day)
    .replace(/HH/g, parts.hour === '24' ? '00' : parts.hour).replace(/mm/g, parts.minute).replace(/ss/g, parts.second);
}
function midnightInTz(ymd, tz) { // UTC instant of local midnight for yyyy-MM-dd in tz
  const [y, m, d] = ymd.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, 12);
  for (let i = 0; i < 3; i++) { const local = fmt(new Date(guess), tz, 'yyyy-MM-dd HH:mm'); const [ld, lt] = local.split(' '); const [lh, lm] = lt.split(':').map(Number);
    const dayDiff = Math.round((Date.UTC(...ld.split('-').map((v, k) => k === 1 ? v - 1 : +v)) - Date.UTC(y, m - 1, d)) / 86400000);
    guess -= (dayDiff * 24 + lh) * 3600000 + lm * 60000; }
  return new Date(guess);
}

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sheet._get(this.r + i, this.c + j)); out.push(row); } return out; }
  setValues(vals) { if (vals.length !== this.nr || vals.some(v => v.length !== this.nc)) throw new Error(`setValues size mismatch: range ${this.nr}x${this.nc}, data ${vals.length}x${vals[0] && vals[0].length}`);
    vals.forEach((row, i) => row.forEach((v, j) => this.sheet._set(this.r + i, this.c + j, v))); return this; }
  getValue() { return this.sheet._get(this.r, this.c); }
  setValue(v) { this.sheet._set(this.r, this.c, v); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._set(this.r + i, this.c + j, ''); return this; }
  setNumberFormat(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._fmt.add(`${this.r + i}:${this.c + j}`); if (this.nr > 1000) this.sheet._plainCols.add(String(this.c) + '-' + (this.c + this.nc - 1)); return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  getNumRows() { return this.nr; } getNumColumns() { return this.nc; }
}
class Protection { constructor() { this.editors = ['owner@example.com']; this.domain = true; } setDescription() { return this; } getEditors() { return this.editors.slice(); } removeEditors(e) { this.editors = this.editors.filter(x => !e.includes(x)); return this; } addEditor(e) { this.editors.push(String(e)); return this; } canDomainEdit() { return this.domain; } setDomainEdit(v) { this.domain = v; return this; } }
class Sheet {
  constructor(ss, name) { this.ss = ss; this.name = name; this.rows = []; this.frozen = 0; this._fmt = new Set(); this._plainCols = new Set(); this.protections = []; this.maxRows = 1000; }
  getName() { return this.name; }
  _isPlain(r, c) { if (this._fmt.has(`${r}:${c}`)) return true; for (const k of this._plainCols) { const [a, b] = k.split('-').map(Number); if (c >= a && c <= b && r >= 2) return true; } return false; }
  _get(r, c) { const row = this.rows[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; }
  _set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push('');
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !this._isPlain(r, c) && this.ss.coerceDates) v = midnightInTz(v, this.ss.tz); // Sheets-style coercion
    row[c - 1] = v; if (r > this.maxRows) this.maxRows = r; }
  getLastRow() { for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].some(v => v !== '' && v !== null && v !== undefined)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this.rows.forEach(r => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; }
  getMaxRows() { return Math.max(this.maxRows, this.rows.length); } getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getRange(r, c, nr = 1, nc = 1) { if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Range out of bounds ' + [r, c, nr, nc]); return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, j) => this._set(r, j + 1, v)); return this; }
  deleteRow(r) { if (r >= 1 && r <= this.rows.length) { this.rows.splice(r - 1, 1); this.maxRows = Math.max(1, this.maxRows - 1); } return this; }
  setFrozenRows(n) { this.frozen = n; } getFrozenRows() { return this.frozen; }
  protect() { const p = new Protection(); this.protections.push(p); return p; } getProtections() { return this.protections.slice(); }
}
class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = [new Sheet(this, 'Sheet1')]; this.tz = 'America/Los_Angeles'; this.coerceDates = true; }
  getId() { return this.id; } getName() { return this.name; } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; } getSheets() { return this.sheets.slice(); }
  insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; } deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  setSpreadsheetTimeZone(tz) { this.tz = tz; } getSpreadsheetTimeZone() { return this.tz; }
}

function createMocks(opts = {}) {
  const state = { identity: { active: opts.active || '', effective: opts.effective || opts.active || '' }, props: {}, cache: {}, photos: opts.photos || {}, peopleCalls: 0, spreadsheets: {}, drive: { folders: [], files: {} }, triggers: [], locks: 0, lockHeld: false, htmlDir: opts.htmlDir };
  let idc = 0; const nid = p => p + '_' + (++idc).toString(36) + Math.random().toString(36).slice(2, 8);
  const SpreadsheetApp = {
    create(name) { const ss = new Spreadsheet(nid('ss'), name); state.spreadsheets[ss.id] = ss; state.drive.files[ss.id] = { id: ss.id, name, created: new Date(), trashed: false }; return ss; },
    openById(id) { const ss = state.spreadsheets[id]; if (!ss) throw new Error('Spreadsheet not found: ' + id); return ss; },
    ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' }
  };
  const LockService = { getScriptLock() { return { tryLock(ms) { if (state.lockHeld) return false; state.lockHeld = true; state.locks++; return true; }, waitLock(ms) { if (!this.tryLock(ms)) throw new Error('lock timeout'); }, releaseLock() { state.lockHeld = false; }, hasLock() { return state.lockHeld; } }; } };
  const Session = { getActiveUser: () => ({ getEmail: () => state.identity.active }), getEffectiveUser: () => ({ getEmail: () => state.identity.effective }), getScriptTimeZone: () => 'America/Los_Angeles' };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in state.props ? state.props[k] : null), setProperty(k, v) { state.props[k] = String(v); return this; }, deleteProperty(k) { delete state.props[k]; return this; } }) };
  const CacheService = { getScriptCache: () => ({ get: k => state.cache[k] || null, put(k, v) { state.cache[k] = v; }, remove(k) { delete state.cache[k]; } }) };
  const Utilities = { formatDate: fmt, getUuid: () => nid('uuid'), sleep: () => {}, base64Encode: s => Buffer.from(s).toString('base64') };
  const mkIter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const mkFile = f => ({ getId: () => f.id, getName: () => f.name, getDateCreated: () => f.created, setTrashed(v) { f.trashed = v; }, isTrashed: () => f.trashed,
    makeCopy(name, folder) { const c = { id: nid('file'), name, created: new Date(), trashed: false, folder: folder && folder.getId() }; state.drive.files[c.id] = c; return mkFile(c); } });
  const mkFolder = fo => ({ getId: () => fo.id, getName: () => fo.name, getFiles: () => mkIter(Object.values(state.drive.files).filter(f => f.folder === fo.id && !f.trashed).map(mkFile)) });
  const DriveApp = { getFoldersByName: n => mkIter(state.drive.folders.filter(f => f.name === n).map(mkFolder)), createFolder(n) { const fo = { id: nid('folder'), name: n }; state.drive.folders.push(fo); return mkFolder(fo); }, getFileById(id) { const f = state.drive.files[id]; if (!f) throw new Error('File not found ' + id); return mkFile(f); } };
  const readHtml = n => fs.readFileSync(path.join(state.htmlDir, n + '.html'), 'utf8');
  const mkOutput = content => ({ getContent: () => content, setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } });
  const HtmlService = {
    createHtmlOutput: mkOutput, createHtmlOutputFromFile: n => mkOutput(readHtml(n)),
    createTemplateFromFile(n) { const tpl = { evaluate() { let s = readHtml(n); s = s.replace(/<\?!=\s*([\s\S]*?)\s*\?>/g, (m, expr) => vm.runInContext(expr, ctx, { filename: 'tpl' })); s = s.replace(/<\?=\s*([\s\S]*?)\s*\?>/g, (m, expr) => String(vm.runInContext(expr.trim(), Object.assign(ctx, tpl))).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))); return mkOutput(s); } }; return tpl; },
    XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }
  };
  const ScriptApp = { newTrigger: fn => ({ timeBased() { return this; }, everyDays() { return this; }, atHour() { return this; }, create() { const t = { fn, id: nid('trig') }; state.triggers.push(t); return t; } }),
    getProjectTriggers: () => state.triggers.map(t => ({ getHandlerFunction: () => t.fn, getUniqueId: () => t.id, _t: t })), deleteTrigger(t) { state.triggers = state.triggers.filter(x => x !== t._t); } };
  const People = { People: { searchDirectoryPeople(o) { state.peopleCalls++; const u = state.photos[String(o.query).toLowerCase()]; return { people: u ? [{ emailAddresses: [{ value: o.query }], photos: [{ url: u }] }] : [{ emailAddresses: [{ value: o.query }], photos: [{ url: 'https://lh3.googleusercontent.com/default', default: true }] }] }; } } };
  const Logger = { log: (...a) => { if (process.env.GAS_LOG) console.log(...a); } };
  const ctx = vm.createContext({ People, SpreadsheetApp, LockService, Session, PropertiesService, CacheService, Utilities, DriveApp, HtmlService, ScriptApp, Logger, console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent });
  ctx.__state = state;
  return { ctx, state };
}
function loadBackend(ctx, srcDir) {
  for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.gs')).sort()) vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), ctx, { filename: f });
}
module.exports = { createMocks, loadBackend, fmt };
