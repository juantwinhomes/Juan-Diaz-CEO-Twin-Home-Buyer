/**
 * The app can build its own database from nothing.
 *
 * The whole schema is applied as one block, so a column that references a table
 * defined further down the file fails on an empty database and nowhere else —
 * which means it never shows up in development and always shows up on someone's
 * first deploy. This builds the schema into a throwaway namespace and checks it
 * stands up, without touching any real data.
 *
 *   npm run check:schema
 */
import { init, exec, all, closeDb } from '../server/db.js';
import { SCHEMA, MIGRATIONS } from '../server/schema.js';

const TABLES = ['users', 'projects', 'project_snapshots', 'project_milestones', 'progress_logs',
  'commitments', 'blockers', 'deployments', 'production_systems', 'incidents',
  'business_impact', 'daily_kpi_snapshots', 'settings'];

await init();
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};

await exec('DROP SCHEMA IF EXISTS setup_check CASCADE');
await exec('CREATE SCHEMA setup_check');
try {
  await exec(`SET search_path TO setup_check;\n${SCHEMA}`);
  ok('the schema builds on an empty database', true);

  for (const statement of MIGRATIONS) await exec(statement);
  ok('the migrations apply on top of it', true);

  const built = (await all(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'setup_check'"
  )).map((r) => r.table_name);
  for (const t of TABLES) ok(`table ${t}`, built.includes(t));
  ok('no unexpected tables', built.length === TABLES.length, `${built.length} tables`);
} catch (err) {
  failed++;
  console.log(`  FAIL  building the schema: ${err.message}`);
} finally {
  await exec('SET search_path TO public');
  await exec('DROP SCHEMA IF EXISTS setup_check CASCADE');
}

console.log(failed
  ? `\n  ${failed} problem(s) — a first deploy would fail.\n`
  : '\n  A first deploy would build the database correctly.\n');
await closeDb();
process.exit(failed ? 1 : 0);
