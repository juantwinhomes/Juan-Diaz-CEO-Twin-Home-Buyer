/**
 * Export the whole database to a single JSON file.
 *
 *   npm run export            -> backups/kpi-YYYY-MM-DD.json
 *   npm run export -- /path   -> writes there instead
 *
 * Free database tiers keep little or no backup history, so this is how you
 * keep your own copies. Save the file to Drive and you have a full snapshot.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, all, closeDb } from './db.js';
import { today } from './lib/dates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TABLES = ['users', 'projects', 'project_snapshots', 'project_milestones', 'progress_logs',
  'commitments', 'blockers', 'deployments', 'production_systems', 'incidents',
  'business_impact', 'daily_kpi_snapshots', 'settings'];

await init();

const data = { exported_at: new Date().toISOString(), tables: {} };
let rows = 0;
for (const table of TABLES) {
  data.tables[table] = await all(`SELECT * FROM ${table}`);
  rows += data.tables[table].length;
}

const target = process.argv[2] || join(ROOT, 'backups', `kpi-${today()}.json`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(data, null, 2));

const kb = (JSON.stringify(data).length / 1024).toFixed(0);
console.log(`Exported ${rows} rows across ${TABLES.length} tables -> ${target} (${kb} KB)`);
await closeDb();
process.exit(0);
