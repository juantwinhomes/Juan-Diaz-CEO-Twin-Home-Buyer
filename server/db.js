import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DB_PATH = process.env.KPI_DB_PATH || join(ROOT, 'data', 'kpi.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

export const DEFAULT_SETTINGS = {
  commitment_target: '80',
  progressed_target: '100',
  success_rate_target: '98',
  critical_issue_target: '0',
  daily_score_target: '80',
  stagnation_days: '2',
  blocker_age_alert_days: '1',
  team_name: 'AI & Systems',
  currency: '$'
};

for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run(key, value);
}

/** Rows come back with a null prototype; normalise to plain objects. */
const plain = (row) => (row ? { ...row } : row);

export const all = (sql, ...params) => db.prepare(sql).all(...params).map(plain);
export const get = (sql, ...params) => plain(db.prepare(sql).get(...params));
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of all('SELECT key, value FROM settings')) out[row.key] = row.value;
  return out;
}

export function setSettings(patch) {
  const stmt = db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(patch)) stmt.run(key, String(value));
  return getSettings();
}

/**
 * Insert helper: only writes columns that actually exist on the table, so the
 * API can accept partial payloads without hand-writing every INSERT.
 */
export function insert(table, data) {
  const cols = tableColumns(table).filter((c) => c !== 'id' && c in data);
  if (!cols.length) throw new Error(`No writable fields provided for ${table}`);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const info = db.prepare(sql).run(...cols.map((c) => normalise(data[c])));
  return Number(info.lastInsertRowid);
}

export function update(table, id, data) {
  const cols = tableColumns(table).filter((c) => c !== 'id' && c in data);
  if (!cols.length) return 0;
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
  const info = db.prepare(sql).run(...cols.map((c) => normalise(data[c])), id);
  return info.changes;
}

export function remove(table, id) {
  return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes;
}

const columnCache = new Map();
export function tableColumns(table) {
  if (!columnCache.has(table)) {
    if (!/^[a-z_]+$/.test(table)) throw new Error(`Unsafe table name: ${table}`);
    columnCache.set(table, db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  }
  return columnCache.get(table);
}

/** SQLite has no boolean/undefined; coerce to storable primitives. */
function normalise(value) {
  if (value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
