'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.KCA_DATA_DIR || path.join(ROOT, 'data');

/** Open (and create) the database. Pass ':memory:' for tests. */
function openDb(file = path.join(DATA_DIR, 'academy.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  db.exec('PRAGMA journal_mode = WAL;');
  // Convenience helpers.
  db.all = (sql, ...p) => db.prepare(sql).all(...p);
  db.get = (sql, ...p) => db.prepare(sql).get(...p);
  db.run = (sql, ...p) => db.prepare(sql).run(...p);
  db.tx = fn => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  db.setting = (key, fallback = null) => {
    const r = db.get('SELECT value FROM settings WHERE key = ?', key);
    return r ? JSON.parse(r.value) : fallback;
  };
  db.setSetting = (key, value) => db.run(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  return db;
}

/** The "as of" date for reports: the configured date, or today. */
function asOfDate(db) {
  return db.setting('as_of_date') || new Date().toISOString().slice(0, 10);
}

module.exports = { openDb, asOfDate, DATA_DIR, ROOT };
