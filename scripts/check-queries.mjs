/**
 * Query budget for the pages people open constantly.
 *
 * Every query is a network round-trip once the database is remote, so the count
 * per request matters far more than how fast it runs locally. A loop that calls
 * a helper per project or per person is invisible on a local database and adds
 * seconds against a hosted one — the Projects page once issued ~300 queries
 * this way.
 *
 *   npm run check:queries
 */
import { init, exec, stats, resetStats } from '../server/db.js';
import { match } from '../server/api.js';

// Budgets are deliberately close to current counts so a regression trips them.
const BUDGETS = [
  ['GET', '/api/bootstrap', 5],
  ['GET', '/api/projects', 15],
  ['GET', '/api/dashboard', 25],
  ['GET', '/api/today', 25]
];

await init();
// Enough projects and people that a per-row query pattern shows up clearly.
await exec(`
  INSERT INTO users (name, role, sort_order)
  SELECT 'Perf User ' || g, 'AI / Systems', g FROM generate_series(1, 6) g
   WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Perf User ' || g);
  INSERT INTO projects (name, owner_id, status, completion_pct, start_date)
  SELECT 'Perf Project ' || g, (SELECT MIN(id) FROM users), 'Building', 40, '2026-01-01'
    FROM generate_series(1, 40) g
   WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Perf Project ' || g);
`);

let failed = 0;
for (const [method, path, budget] of BUDGETS) {
  const hit = match(method, path);
  resetStats();
  await hit.handler(hit.params, {}, {});
  const used = stats.queries;
  const ok = used <= budget;
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${(method + ' ' + path).padEnd(22)} ${String(used).padStart(4)} queries (budget ${budget})`);
}

console.log(failed
  ? `\n  ${failed} endpoint(s) over budget — look for a query inside a loop.\n`
  : '\n  All endpoints within budget.\n');
process.exit(failed ? 1 : 0);
