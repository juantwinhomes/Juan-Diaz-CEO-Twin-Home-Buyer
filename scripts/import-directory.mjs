/**
 * Import the Tools & Artifact Directory CSV into the dashboard.
 *
 *   node scripts/import-directory.mjs <file.csv>            -> writes import.sql
 *   node scripts/import-directory.mjs <file.csv> --apply    -> writes straight to DATABASE_URL
 *
 * The directory tracks published artifacts rather than daily delivery, so the
 * mapping is deliberately lossy: whatever has no equivalent is left out rather
 * than invented. Existing rows are matched by project name, so re-running it
 * updates instead of duplicating.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ENUMS } from '../server/lib/enums.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('Usage: node scripts/import-directory.mjs <file.csv> [--apply]'); process.exit(1); }
const APPLY = flags.includes('--apply');

/* ---------------------------------------------------------------- CSV --- */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// The export mangles em dashes; restore them rather than leaving replacement marks.
const clean = (s) => String(s || '').replace(/�/g, '—').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------- Field mapping --- */
// Directory status + publication -> the dashboard's project lifecycle.
function mapStatus(status, publication) {
  const s = clean(status).toLowerCase();
  const p = clean(publication).toLowerCase();
  if (s === 'new') return { status: 'Backlog', pct: 0, phase: 'Requirements' };
  if (s === 'building' && p === 'preview') return { status: 'Internal Testing', pct: 75, phase: 'Internal Testing' };
  if (s === 'building') return { status: 'Building', pct: 40, phase: 'Core Build' };
  if (s === 'for review') return { status: 'User Testing', pct: 90, phase: 'User Testing' };
  // Finished artifacts map to Completed, not Production. Production counts as
  // active work that is expected to move daily, so parking 30 finished tools
  // there would mean "0 of 35 projects progressed" every day and make the
  // headline metric meaningless. They stay visible on the Projects page.
  if (s === 'approved' && p === 'published') return { status: 'Completed', pct: 100, phase: 'Monitoring' };
  if (s === 'approved') return { status: 'Ready for Deployment', pct: 90, phase: 'Deployment' };
  if (s === 'completed' && p === 'published') return { status: 'Completed', pct: 100, phase: 'Monitoring' };
  if (s === 'completed') return { status: 'Completed', pct: 100, phase: 'Deployment' };
  return { status: 'Backlog', pct: 0, phase: 'Requirements' };
}

// The directory's own sections become departments.
const SECTIONS = ['Report Tracker ONLY', 'Guides and Handbooks', 'New Projects - Not Yet Started',
  'Active Projects', 'Review and Approval', 'Published/Operational'];

const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#c2410c', '#15803d', '#be123c', '#4338ca', '#0f766e'];

/* -------------------------------------------------------------- Parse --- */
const rows = parseCsv(readFileSync(file, 'utf8'));
let section = null;
const projects = [];
const people = new Map();

const personId = (name) => {
  const n = clean(name);
  if (!n) return null;
  if (!people.has(n)) people.set(n, { name: n, order: people.size + 1, color: PALETTE[people.size % PALETTE.length] });
  return n;
};

for (const r of rows) {
  const first = clean(r[0]);
  if (!first) continue;
  const maybeSection = SECTIONS.find((s) => first.toLowerCase().replace(/\s+/g, ' ') === s.toLowerCase().replace(/\s+/g, ' '));
  if (maybeSection) { section = maybeSection; continue; }
  if (first === 'Name') continue;                       // per-section header row
  if (!section) continue;                               // title/blurb lines above the first section

  const [name, , purpose, builtBy, status, publication, link, docs, , maintenance, health] = r;
  const owners = clean(builtBy).split(',').map((x) => x.trim()).filter(Boolean);
  const mapped = mapStatus(status, publication);

  const notes = [
    clean(docs) && clean(docs).startsWith('http') ? `Docs: ${clean(docs)}` : clean(docs),
    clean(maintenance) && clean(maintenance) !== 'TBD' ? `Maintenance: ${clean(maintenance)}` : '',
    clean(health) ? `Health: ${clean(health)}` : ''
  ].filter(Boolean).join(' · ');

  projects.push({
    name: clean(name),
    owner: personId(owners[0]),
    secondary: personId(owners[1]),
    department: section,
    business_objective: clean(purpose),
    production_url: clean(link).startsWith('http') ? clean(link) : null,
    notes: [notes, clean(link) && !clean(link).startsWith('http') ? `Access: ${clean(link)}` : ''].filter(Boolean).join(' · '),
    ...mapped
  });
}

/* ---------------------------------------------------------------- SQL --- */
const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const today = new Date().toISOString().slice(0, 10);

const lines = ['BEGIN;', ''];
lines.push('-- People referenced by the directory');
for (const p of people.values()) {
  lines.push(
    `INSERT INTO users (name, role, initials, color, is_manager, active, sort_order)
 SELECT ${q(p.name)}, 'AI / Systems', ${q(p.name.slice(0, 2).toUpperCase())}, ${q(p.color)}, 0, 1, ${p.order}
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = ${q(p.name)});`);
}
lines.push('', '-- Projects');
for (const p of projects) {
  lines.push(`INSERT INTO projects
  (name, owner_id, secondary_owner_id, department, start_date, priority, status,
   completion_pct, current_phase, business_objective, production_url, notes, archived, updated_at)
 SELECT ${q(p.name)},
   (SELECT id FROM users WHERE name = ${q(p.owner)}),
   ${p.secondary ? `(SELECT id FROM users WHERE name = ${q(p.secondary)})` : 'NULL'},
   ${q(p.department)}, ${q(today)}, 'P3', ${q(p.status)}, ${p.pct}, ${q(p.phase)},
   ${q(p.business_objective)}, ${q(p.production_url)}, ${q(p.notes)}, 0, now()::text
 WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = ${q(p.name)});`);
}

lines.push('', '-- Milestone framework for every imported project');
for (const m of ENUMS.milestone_framework) {
  const i = ENUMS.milestone_framework.indexOf(m);
  lines.push(`INSERT INTO project_milestones (project_id, name, target_pct, sort_order, completed, completed_date)
 SELECT p.id, ${q(m.name)}, ${m.target_pct}, ${i},
        CASE WHEN p.completion_pct >= ${m.target_pct} THEN 1 ELSE 0 END,
        CASE WHEN p.completion_pct >= ${m.target_pct} THEN ${q(today)} ELSE NULL END
   FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM project_milestones m WHERE m.project_id = p.id AND m.name = ${q(m.name)});`);
}

lines.push('', '-- Today\'s completion snapshot, so progress is measured from here on');
lines.push(`INSERT INTO project_snapshots (project_id, snapshot_date, completion_pct, status)
 SELECT id, ${q(today)}, completion_pct, status FROM projects
 ON CONFLICT (project_id, snapshot_date) DO UPDATE SET completion_pct = EXCLUDED.completion_pct;`);
lines.push('', 'COMMIT;');

const sql = lines.join('\n') + '\n';

if (APPLY) {
  const { exec, init } = await import('../server/db.js');
  await init();
  await exec(sql);
  console.log('Applied to the database.');
} else {
  writeFileSync('import.sql', sql);
  console.log(`Wrote import.sql (${(sql.length / 1024).toFixed(1)} KB)`);
}

console.log(`\n  ${people.size} people: ${[...people.keys()].join(', ')}`);
console.log(`  ${projects.length} projects\n`);
const byStatus = {};
for (const p of projects) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
for (const [s, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(3)}  ${s}`);
}
