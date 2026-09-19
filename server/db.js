/**
 * PostgreSQL data layer.
 *
 *   DATABASE_URL set   -> a real Postgres server (Supabase in production)
 *   DATABASE_URL unset -> an embedded Postgres stored under data/, so the app
 *                         still runs locally with no database to install
 *
 * Both are genuine PostgreSQL, so local behaviour matches production.
 *
 * Every query here is async. SQL is written with `?` placeholders as before and
 * rewritten to Postgres `$1, $2 …` on the way out, which keeps the query
 * strings throughout the app unchanged.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA, MIGRATIONS } from './schema.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(MODULE_DIR, '..');
const DATABASE_URL = process.env.DATABASE_URL || '';

let client = null;

const isServerless = () => Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
  || process.env.VERCEL || process.env.FUNCTIONS_WORKER_RUNTIME
);

/** Rewrite `?` to `$n`, leaving anything inside quoted strings alone. */
export function toPgPlaceholders(sql) {
  let out = '';
  let n = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    if (c === '?' && !inSingle && !inDouble) out += `$${++n}`;
    else out += c;
  }
  return out;
}

async function connect() {
  if (client) return client;

  if (DATABASE_URL) {
    const pg = (await import('pg')).default;
    // int8 and numeric arrive as strings by default, which would break every
    // COUNT and percentage comparison in the KPI code.
    pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
    pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
    // Serverless runs many short-lived instances, each with its own pool, so a
    // large pool per instance is how you exhaust the database's connection
    // limit. One connection per instance, and let the provider's pooler fan out.
    const serverless = isServerless();
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: serverless ? 3 : 5,
      idleTimeoutMillis: serverless ? 10_000 : 30_000,
      connectionTimeoutMillis: 10_000
    });
    client = {
      query: (text, params) => pool.query(text, params),
      // Multi-statement SQL needs the simple protocol, i.e. no parameters.
      exec: (text) => pool.query(text),
      close: () => pool.end()
    };
  } else {
    // The embedded database writes to disk, which a serverless function does not
    // durably have. Failing here with an explanation beats a bare 502.
    if (isServerless()) {
      throw new Error(
        'DATABASE_URL is not set. Add your Supabase connection string to this site\'s ' +
        'environment variables and redeploy — environment variables only take effect on a new build.'
      );
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = join(ROOT, 'data', 'pgdata');
    mkdirSync(dirname(dir), { recursive: true });
    const lite = await PGlite.create(dir);
    client = {
      query: (text, params) => lite.query(text, params),
      exec: (text) => lite.exec(text),
      close: () => lite.close()
    };
  }
  return client;
}

/** Query counter. Each query is a network round-trip once the database is
 *  remote, so the count per request matters far more than local timing. */
export const stats = { queries: 0, ms: 0 };
export const resetStats = () => { stats.queries = 0; stats.ms = 0; };

export async function query(sql, params = []) {
  const c = await connect();
  const started = Date.now();
  try {
    return await c.query(toPgPlaceholders(sql), params);
  } finally {
    stats.queries++;
    stats.ms += Date.now() - started;
  }
}

/** Run multi-statement SQL (migrations, imports). No parameters: the extended
 *  protocol that carries them only accepts a single statement. */
export async function exec(sql) {
  const c = await connect();
  return c.exec(sql);
}

export const all = async (sql, ...params) => (await query(sql, params)).rows;
export const get = async (sql, ...params) => (await query(sql, params)).rows[0] ?? undefined;
export const run = async (sql, ...params) => {
  const r = await query(sql, params);
  return { changes: r.rowCount ?? 0, rows: r.rows };
};

export const DEFAULT_SETTINGS = {
  commitment_target: '80',
  progressed_target: '100',
  success_rate_target: '98',
  critical_issue_target: '0',
  daily_score_target: '80',
  stagnation_days: '2',
  blocker_age_alert_days: '1',
  max_commitments: '5',
  show_progress_warnings: '1',
  team_name: 'AI & Systems',
  currency: '$'
};

/** Create the schema and seed default settings. Safe to run repeatedly. */
export async function init() {
  const c = await connect();
  await c.exec(SCHEMA);
  for (const statement of MIGRATIONS) await c.exec(statement);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', key, value);
  }
  columnCache.clear();
  settingsCache = null;
  return c;
}

// Settings are read on nearly every KPI call but change rarely, and each read
// is a network round-trip once the database is remote.
let settingsCache = null;

export async function getSettings() {
  if (settingsCache) return settingsCache;
  const out = { ...DEFAULT_SETTINGS };
  for (const row of await all('SELECT key, value FROM settings')) out[row.key] = row.value;
  settingsCache = out;
  return out;
}

export async function setSettings(patch) {
  settingsCache = null;
  for (const [key, value] of Object.entries(patch)) {
    await run(
      'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      key, String(value)
    );
  }
  return getSettings();
}

/**
 * Writes only columns that exist on the table, so the API can accept partial
 * payloads without hand-writing every INSERT.
 */
export async function insert(table, data) {
  const cols = (await tableColumns(table)).filter((c) => c !== 'id' && c in data);
  if (!cols.length) throw new Error(`No writable fields provided for ${table}`);
  const sql = `INSERT INTO ${table} (${cols.join(', ')})
               VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`;
  const r = await query(sql, cols.map((c) => normalise(data[c])));
  return r.rows[0]?.id;
}

export async function update(table, id, data) {
  const cols = (await tableColumns(table)).filter((c) => c !== 'id' && c in data);
  if (!cols.length) return 0;
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
  const r = await query(sql, [...cols.map((c) => normalise(data[c])), id]);
  return r.rowCount ?? 0;
}

export async function remove(table, id) {
  const r = await query(`DELETE FROM ${table} WHERE id = ?`, [id]);
  return r.rowCount ?? 0;
}

const columnCache = new Map();
export async function tableColumns(table) {
  if (!columnCache.has(table)) {
    if (!/^[a-z_]+$/.test(table)) throw new Error(`Unsafe table name: ${table}`);
    const rows = await all(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
      'public', table
    );
    columnCache.set(table, rows.map((r) => r.column_name));
  }
  return columnCache.get(table);
}

/** Postgres has no untyped columns, so coerce to storable primitives. */
function normalise(value) {
  if (value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
}

export async function transaction(fn) {
  await run('BEGIN');
  try {
    const result = await fn();
    await run('COMMIT');
    return result;
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

export const closeDb = async () => { if (client) { await client.close(); client = null; } };
