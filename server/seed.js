/**
 * Demo data. Everything is generated relative to the current date so the
 * dashboard always opens on a live-looking day.
 *
 *   node server/seed.js           # seed only if the database is empty
 *   node server/seed.js --reset   # wipe and reseed
 */
import { init, all, get, run, insert, update, setSettings, closeDb } from './db.js';
import * as D from './lib/dates.js';
import { ensureSnapshot } from './lib/kpi.js';
import { scoreText } from './lib/quality.js';
import { ENUMS } from './lib/enums.js';

const RESET = process.argv.includes('--reset');

const TABLES = ['daily_kpi_snapshots', 'business_impact', 'incidents', 'production_systems',
  'deployments', 'blockers', 'progress_logs', 'project_snapshots', 'project_milestones',
  'commitments', 'projects', 'users'];

await init();

if (RESET) {
  // TRUNCATE ... CASCADE clears the lot and resets the identity counters.
  await run(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  console.log('Cleared existing data.');
} else if ((await get('SELECT COUNT(*) AS n FROM users')).n > 0) {
  console.log('Database already has data. Use `npm run reset` to wipe and reseed.');
  process.exit(0);
}

/* ---- Timeline: five prior business days plus today ---------------- */
const TODAY = D.today();
const prior = D.isBusinessDay(TODAY)
  ? D.lastBusinessDays(D.previousBusinessDay(TODAY), 5)
  : D.lastBusinessDays(TODAY, 5);
const DAYS = [...prior, TODAY];
const day = (i) => DAYS[i];
const forward = (n) => {
  let cur = TODAY;
  for (let i = 0; i < n; i++) {
    do { cur = D.addDays(cur, 1); } while (!D.isBusinessDay(cur));
  }
  return cur;
};

/* ---- Users -------------------------------------------------------- */
const lawrence = await insert('users', {
  name: 'Lawrence', role: 'AI / Systems Engineer', email: 'lawrence@example.com',
  initials: 'L', color: '#2563eb', is_manager: 0, active: 1, sort_order: 1
});
const member2 = await insert('users', {
  name: 'Team Member 2', role: 'AI / Systems Engineer', email: 'member2@example.com',
  initials: 'T2', color: '#7c3aed', is_manager: 0, active: 1, sort_order: 2
});
const manager = await insert('users', {
  name: 'Operations Manager', role: 'Manager', email: 'manager@example.com',
  initials: 'OM', color: '#0f172a', is_manager: 1, active: 1, sort_order: 3
});

/* ---- Projects with a day-by-day story ----------------------------- */
const PLAN = [
  {
    name: 'Retell Voice AI', owner: lawrence, secondary: null, priority: 'P1',
    status: 'Internal Testing', phase: 'Internal Testing', department: 'Sales',
    requester: 'Sales — Inbound Call Team', target: forward(1),
    objective: 'Answer and route every inbound sales call without a human picking up first.',
    impact: 'Removes ~6 hours/week of manual call routing and stops after-hours leads being missed.',
    url: 'https://voice.internal.example.com',
    series: [45, 55, 60, 65, 70, 80],
    next: 'Test after-hours SAS routing',
    logs: [
      { u: lawrence, text: 'Completed call intake prompt and connected Retell agent to the sales number.', next: 'Build transfer logic.' },
      { u: lawrence, text: 'Built warm transfer logic and passed 12 of 20 transfer test cases.', next: 'Finish remaining transfer cases.' },
      { u: lawrence, text: 'Fixed 4 failing transfer cases — now passing 16 of 20 test cases.', next: 'Business-hours routing.' },
      { u: lawrence, text: 'Completed voicemail fallback and documented the routing rules.', next: 'Business-hours routing.' },
      { u: lawrence, text: 'Passed 20 of 20 transfer test cases and closed internal QA round 1.', next: 'Business-hours routing implementation.' },
      { u: lawrence, text: 'Business-hours routing implemented and tested — after-hours calls now reach the SAS queue.', next: 'Test after-hours SAS routing end to end.' }
    ]
  },
  {
    name: 'Lead Tracker Dashboard', owner: lawrence, secondary: null, priority: 'P2',
    status: 'Building', phase: 'Core Build', department: 'Sales',
    requester: 'Sales — Rep Performance', target: forward(2),
    objective: 'Give every rep a live view of their leads without asking operations for a export.',
    impact: 'Replaces a twice-weekly manual spreadsheet pull (~3 hours/week).',
    url: null,
    series: [10, 20, 25, 35, 40, 60],
    next: 'Internal testing',
    logs: [
      { u: lawrence, text: 'Requirements confirmed with sales leadership and data model signed off.', next: 'Set up project and database.' },
      { u: lawrence, text: 'Set up the app shell, database schema and deployment pipeline.', next: 'Start the lead list build.' },
      { u: lawrence, text: 'Built the lead list view with filtering by stage and owner.', next: 'Rep login.' },
      { u: lawrence, text: 'Connected Google Sheets API so lead data syncs every 15 minutes.', next: 'Rep login and dashboard.' },
      { u: lawrence, text: 'Built lead detail page and fixed 3 of 3 stage-calculation bugs.', next: 'Rep login and dashboard shell.' },
      { u: lawrence, text: 'Built rep login and dashboard shell — core build is now complete.', next: 'Internal testing.' }
    ]
  },
  {
    name: 'CRM Automation', owner: member2, secondary: null, priority: 'P1',
    status: 'Building', phase: 'Core Build', department: 'Operations',
    requester: 'Operations — CRM Team', target: forward(2),
    objective: 'Stop manual copying of new leads between the intake form and the CRM.',
    impact: 'Saves ~5 hours/week of data entry and removes duplicate-contact errors.',
    url: null,
    series: [10, 20, 25, 30, 30, 50],
    next: 'Production integration once credentials arrive',
    logs: [
      { u: member2, text: 'Requirements confirmed and field mapping documented with the CRM team.', next: 'Set up sandbox environment.' },
      { u: member2, text: 'Set up the CRM sandbox and authenticated against the staging API.', next: 'Build contact sync.' },
      { u: member2, text: 'Built the contact create/update endpoints and passed 8 of 10 sandbox cases.', next: 'Fix remaining sync cases.' },
      { u: member2, text: 'Fixed the last 2 sandbox sync cases — all 10 now passing.', next: 'Dedupe rules.' },
      { u: member2, text: 'Looked into the production credential request.', next: 'Waiting on IT.', vague: true },
      { u: member2, text: 'Completed CRM API integration, synced 50 test contacts and passed all 12 dedupe test cases.', next: 'Production integration once credentials arrive.' }
    ]
  },
  {
    name: 'Payroll Automation', owner: member2, secondary: null, priority: 'P2',
    status: 'Requirements', phase: 'Requirements', department: 'Finance',
    requester: 'Finance — Payroll', target: forward(7),
    objective: 'Replace the manual bi-weekly payroll export with a scheduled, validated job.',
    impact: 'Saves ~4 hours per payroll cycle and removes transcription errors.',
    url: null,
    series: [0, 10, 20, 20, 20, 20],
    next: 'Get the export spec signed off by Finance',
    logs: [
      { u: member2, text: 'Requirements confirmed for hours, deductions and export format.', next: 'Map the export fields.' },
      { u: member2, text: 'Documented the full payroll export field mapping and validation rules.', next: 'Architecture and environment setup.' },
      { u: member2, text: 'Set up the payroll sandbox environment and scheduled job scaffolding.', next: 'Sign-off on the export spec.' },
      null, null, null
    ]
  },
  {
    name: 'Client Onboarding Bot', owner: member2, secondary: lawrence, priority: 'P3',
    status: 'User Testing', phase: 'User Testing', department: 'Client Services',
    requester: 'Client Services', target: forward(4),
    objective: 'Collect onboarding details from new clients without a coordinator chasing them.',
    impact: 'Saves ~2.5 hours/week of coordinator follow-up and shortens onboarding by a day.',
    url: 'https://onboarding.internal.example.com',
    series: [60, 65, 70, 75, 78, 85],
    next: 'User testing round 2',
    logs: [
      { u: member2, text: 'Completed the onboarding question set and connected it to the intake sheet.', next: 'Build the reminder flow.' },
      { u: member2, text: 'Built the reminder flow and passed 6 of 6 reminder test cases.', next: 'Internal QA.' },
      { u: lawrence, text: 'Completed internal QA and fixed 2 of 2 form validation bugs.', next: 'Start user testing.' },
      { u: member2, text: 'Completed user testing round 1 with 4 client services staff.', next: 'Apply the round 1 feedback.' },
      { u: member2, text: 'Fixed 5 of 6 issues raised in user testing round 1.', next: 'Greeting flow rewrite.' },
      { u: member2, text: 'Deployed the rewritten greeting flow and completed user testing round 1 sign-off.', next: 'User testing round 2.' }
    ]
  }
];

const ids = {};
for (const plan of PLAN) {
  const id = await insert('projects', {
    name: plan.name, owner_id: plan.owner, secondary_owner_id: plan.secondary,
    requester: plan.requester, department: plan.department,
    start_date: day(0), target_date: plan.target, priority: plan.priority,
    status: plan.status, completion_pct: plan.series[plan.series.length - 1],
    current_phase: plan.phase, next_step: plan.next,
    business_objective: plan.objective, expected_impact: plan.impact,
    production_url: plan.url, notes: null, archived: 0, updated_at: new Date().toISOString()
  });
  ids[plan.name] = id;
  for (const [i, m] of ENUMS.milestone_framework.entries()) {
    await insert('project_milestones', { project_id: id, name: m.name, target_pct: m.target_pct, sort_order: i });
  }

  // Replay the week day by day so history, snapshots and milestones line up.
  let previous = 0;
  for (const [i, d] of DAYS.entries()) {
    const pct = plan.series[i];
    const entry = plan.logs[i];
    await ensureSnapshot(id, d, pct, plan.status);
    if (entry) {
      const quality = scoreText(entry.text, { kind: 'progress' });
      await insert('progress_logs', {
        project_id: id, user_id: entry.u, log_date: d,
        previous_pct: previous, new_pct: pct,
        completed_text: entry.text, next_text: entry.next,
        quality_score: quality.score
      });
    }
    for (const m of await all('SELECT * FROM project_milestones WHERE project_id = ? AND completed = 0', id)) {
      if (pct >= m.target_pct) await update('project_milestones', m.id, { completed: 1, completed_date: d });
    }
    previous = pct;
  }
}

/* ---- Daily commitments -------------------------------------------- */
const COMMITMENTS = {
  // [user, project, priority, task, status, carryover]
  0: [
    [lawrence, 'Retell Voice AI', 'P1', 'Complete the call intake prompt and connect the Retell agent to the sales line', 'Completed'],
    [lawrence, 'Lead Tracker Dashboard', 'P2', 'Confirm Lead Tracker requirements and sign off the data model with sales', 'Completed'],
    [member2, 'CRM Automation', 'P1', 'Confirm CRM field mapping and document it with the CRM team', 'Completed'],
    [member2, 'Payroll Automation', 'P2', 'Confirm payroll export requirements with Finance', 'Completed'],
    [member2, 'Client Onboarding Bot', 'P3', 'Complete the onboarding question set and connect it to the intake sheet', 'Completed']
  ],
  1: [
    [lawrence, 'Retell Voice AI', 'P1', 'Build warm transfer logic and pass at least 12 transfer test cases', 'Completed'],
    [lawrence, 'Lead Tracker Dashboard', 'P2', 'Set up the Lead Tracker app shell, schema and deployment pipeline', 'Completed'],
    [lawrence, 'Retell Voice AI', 'P3', 'Write the Retell escalation matrix into the runbook', 'In Progress', 'Continue tomorrow'],
    [member2, 'CRM Automation', 'P1', 'Set up the CRM sandbox and authenticate against the staging API', 'Completed'],
    [member2, 'Payroll Automation', 'P2', 'Document the full payroll export field mapping and validation rules', 'Completed'],
    [member2, 'Client Onboarding Bot', 'P3', 'Build the reminder flow and pass all reminder test cases', 'Completed']
  ],
  2: [
    [lawrence, 'Retell Voice AI', 'P1', 'Fix the 4 failing transfer test cases from QA round 1', 'Completed'],
    [lawrence, 'Lead Tracker Dashboard', 'P2', 'Build the lead list view with stage and owner filtering', 'Completed'],
    [lawrence, 'Retell Voice AI', 'P3', 'Write the Retell escalation matrix into the runbook', 'Completed'],
    [member2, 'CRM Automation', 'P1', 'Build the CRM contact create/update endpoints and pass the sandbox cases', 'Completed'],
    [member2, 'Payroll Automation', 'P2', 'Set up the payroll sandbox environment and job scaffolding', 'Completed'],
    [member2, 'Client Onboarding Bot', 'P3', 'Complete internal QA on the onboarding bot', 'Cancelled', 'Changed priority']
  ],
  3: [
    [lawrence, 'Retell Voice AI', 'P1', 'Complete the voicemail fallback path and document the routing rules', 'Completed'],
    [lawrence, 'Lead Tracker Dashboard', 'P2', 'Connect the Google Sheets API so lead data syncs every 15 minutes', 'Completed'],
    [member2, 'CRM Automation', 'P1', 'Fix the last 2 sandbox sync cases so all 10 pass', 'Completed'],
    [member2, 'Payroll Automation', 'P2', 'Get the payroll export spec signed off by Finance', 'Blocked', 'Blocked'],
    [member2, 'Client Onboarding Bot', 'P3', 'Complete user testing round 1 with client services', 'Completed']
  ],
  4: [
    [lawrence, 'Retell Voice AI', 'P1', 'Pass all 20 transfer test cases and close internal QA round 1', 'Completed'],
    [lawrence, 'Lead Tracker Dashboard', 'P2', 'Build the lead detail page and fix the stage-calculation bugs', 'Completed'],
    [lawrence, 'Retell Voice AI', 'P2', 'Raise the Retell vendor rate-limit issue and get a fix committed', 'Completed'],
    [member2, 'CRM Automation', 'P1', 'Connect the CRM automation to the production workspace', 'Blocked', 'Blocked'],
    [member2, 'Client Onboarding Bot', 'P3', 'Fix the issues raised in user testing round 1', 'Completed'],
    [member2, 'Payroll Automation', 'P2', 'Chase Finance for the payroll export sign-off', 'In Progress', 'Blocked']
  ],
  5: [
    [lawrence, 'Retell Voice AI', 'P1', 'Complete Retell webhook testing and pass all transfer test cases', 'Completed'],
    [lawrence, 'Retell Voice AI', 'P1', 'Fix business-hours routing so after-hours calls reach the SAS queue', 'Completed'],
    [lawrence, 'Retell Voice AI', 'P2', 'Deploy the updated transfer notification to production', 'In Progress', 'Continue tomorrow'],
    [lawrence, 'Lead Tracker Dashboard', 'P2', 'Build the rep login and dashboard shell for Lead Tracker', 'Completed'],
    [lawrence, 'Retell Voice AI', 'P3', 'Document the Retell routing rules in the systems runbook', 'Completed'],
    [member2, 'CRM Automation', 'P1', 'Complete the CRM API integration and sync 50 test contacts', 'Completed'],
    [member2, 'CRM Automation', 'P1', 'Connect the CRM automation to the production workspace', 'Blocked', 'Blocked'],
    [member2, 'CRM Automation', 'P2', 'Build the lead dedupe rules and pass all 12 dedupe test cases', 'Completed'],
    [member2, 'Client Onboarding Bot', 'P3', 'Deploy the onboarding bot greeting flow to production', 'Completed'],
    [member2, 'Client Onboarding Bot', 'P2', 'Complete user testing round 1 sign-off for the onboarding bot', 'Completed']
  ]
};

for (const [index, rows] of Object.entries(COMMITMENTS)) {
  const d = day(Number(index));
  for (const [user, project, priority, task, status, carryover] of rows) {
    await insert('commitments', {
      user_id: user, project_id: ids[project] || null, commit_date: d, task,
      priority, expected_today: 1, status,
      carryover_reason: carryover || null,
      completed_at: status === 'Completed' ? `${d}T17:00:00.000Z` : null,
      quality_score: scoreText(task, { kind: 'commitment' }).score
    });
  }
}

/* ---- Deployments --------------------------------------------------- */
const DEPLOYMENTS = [
  [1, 'Retell Voice AI', lawrence, 'Feature', 'Retell warm transfer flow to staging', 'First end-to-end transfer path available for QA.'],
  [3, 'Lead Tracker Dashboard', lawrence, 'Automation', 'Google Sheets lead sync (15 minute schedule)', 'Automated the twice-weekly manual export.'],
  [4, 'Client Onboarding Bot', member2, 'Fix', 'Onboarding form validation fix', 'Resolved 2 validation defects found in internal QA.'],
  [5, 'Retell Voice AI', lawrence, 'Fix', 'Business-hours routing fix', 'After-hours calls now route to the SAS queue instead of voicemail.'],
  [5, 'CRM Automation', member2, 'Automation', 'Lead dedupe automation', 'Dedupe rules live in the CRM sandbox workspace.'],
  [5, 'Client Onboarding Bot', member2, 'Feature', 'Onboarding bot greeting flow', 'Rewritten greeting flow deployed to production.']
];
for (const [i, project, user, kind, title, description] of DEPLOYMENTS) {
  await insert('deployments', {
    project_id: ids[project], user_id: user, deploy_date: day(i), kind, title, description,
    url: 'https://deploy.internal.example.com'
  });
}

/* ---- Blockers ------------------------------------------------------ */
await insert('blockers', {
  title: 'Waiting for CRM production credentials',
  project_id: ids['CRM Automation'], owner_id: member2, date_reported: day(3),
  person_needed: 'IT / Ops — Maria', reason: 'Waiting for credentials', priority: 'P1',
  status: 'Waiting', notes: 'Requested via the IT ticket queue. Production integration cannot start without it.'
});
await insert('blockers', {
  title: 'Payroll export spec not signed off by Finance',
  project_id: ids['Payroll Automation'], owner_id: member2, date_reported: day(0),
  person_needed: 'Finance — David', reason: 'Missing requirements', priority: 'P2',
  status: 'Escalated', notes: 'Escalated to the Finance lead. Project cannot leave requirements without it.'
});
await insert('blockers', {
  title: 'Retell vendor API rate limit hit during load test',
  project_id: ids['Retell Voice AI'], owner_id: lawrence, date_reported: day(3),
  person_needed: 'Retell support', reason: 'Waiting for vendor', priority: 'P2',
  status: 'Resolved', resolved_date: day(5),
  resolution: 'Vendor raised the account rate limit to 120 calls/minute.'
});

/* ---- Production systems -------------------------------------------- */
const SYSTEMS = [
  ['Retell Voice AI Agent', lawrence, 'Retell Voice AI', 'AI Agent', 'Healthy', 1240, 8, 'Handles all inbound sales calls.'],
  ['Lead Router Automation', lawrence, 'Lead Tracker Dashboard', 'Automation', 'Healthy', 892, 4, 'Routes new leads to the owning rep.'],
  ['CRM Contact Sync', member2, 'CRM Automation', 'API Integration', 'Warning', 430, 22, 'Sandbox sync — below the 98% target.'],
  ['Payroll Export Script', member2, 'Payroll Automation', 'Script', 'Degraded', 96, 9, 'Scheduled export currently failing intermittently.'],
  ['Onboarding Bot', member2, 'Client Onboarding Bot', 'AI Agent', 'Healthy', 318, 2, 'Collects onboarding details from new clients.'],
  ['Ops Dashboard', lawrence, null, 'Dashboard', 'Healthy', 2100, 1, 'Internal operations reporting dashboard.']
];
const sysIds = {};
for (const [name, owner, project, type, status, ok, failed, notes] of SYSTEMS) {
  sysIds[name] = await insert('production_systems', {
    name, owner_id: owner, project_id: project ? ids[project] : null, system_type: type,
    status, last_checked: TODAY, successful_runs: ok, failed_runs: failed,
    url: 'https://status.internal.example.com', notes
  });
}

/* ---- Incidents ------------------------------------------------------ */
await insert('incidents', {
  title: 'Payroll export failed on the scheduled run',
  system_id: sysIds['Payroll Export Script'], project_id: ids['Payroll Automation'],
  reported_by: member2, category: 'Failed automation', severity: 'Medium', status: 'Open',
  reported_date: day(4), description: 'Export job exits before writing the file. Reproduced twice.'
});
await insert('incidents', {
  title: 'CRM sync dropped 3 contact records',
  system_id: sysIds['CRM Contact Sync'], project_id: ids['CRM Automation'],
  reported_by: member2, category: 'Bug', severity: 'Low', status: 'Investigating',
  reported_date: TODAY, description: 'Three records missing after the overnight sandbox sync.'
});
await insert('incidents', {
  title: 'Call transfer returned 500 on after-hours calls',
  system_id: sysIds['Retell Voice AI Agent'], project_id: ids['Retell Voice AI'],
  reported_by: lawrence, category: 'Critical issue', severity: 'Critical', status: 'Resolved',
  reported_date: day(4), resolved_date: day(5),
  description: 'After-hours transfers failed with a 500 from the routing webhook.',
  resolution: 'Business-hours routing rewritten; all after-hours calls now reach the SAS queue.'
});
await update('production_systems', sysIds['Payroll Export Script'], { last_incident_date: day(4) });
await update('production_systems', sysIds['Retell Voice AI Agent'], { last_incident_date: day(4) });
await update('production_systems', sysIds['CRM Contact Sync'], { last_incident_date: TODAY });

/* ---- Business impact ------------------------------------------------ */
const IMPACT = [
  ['Retell Voice AI', 'Manual inbound call answering and routing by the sales coordinator', 4, 90, 28, 18000, 340, 45,
    'Every inbound sales call is answered and routed without a coordinator.'],
  ['Lead Tracker Dashboard', 'Twice-weekly manual lead export and spreadsheet cleanup', 55, 2, 32, 0, 0, 12,
    'Reps self-serve their lead list instead of requesting an export.'],
  ['Client Onboarding Bot', 'Coordinator chasing new clients for onboarding details', 22, 7, 28, 0, 0, 20,
    'Cuts roughly a day off the onboarding cycle.']
];
for (const [project, manual, minutes, runs, cost, revenue, leads, errors, notes] of IMPACT) {
  await insert('business_impact', {
    project_id: ids[project], manual_process: manual, minutes_per_run: minutes,
    runs_per_week: runs, hourly_cost: cost, revenue_supported: revenue,
    leads_processed: leads, errors_prevented: errors, notes
  });
}

await setSettings({ team_name: 'AI & Systems', max_commitments: '5' });

/* ---- Percentages follow the to-do list -------------------------------- */
// The demo history stays as it is; today's figure is what the commitments say,
// the same rule the app applies from here on.
for (const id of Object.values(ids)) {
  const counts = await get(
    `SELECT COUNT(DISTINCT task) AS total,
            COUNT(DISTINCT task) FILTER (WHERE status = 'Completed') AS done
       FROM commitments WHERE project_id = ? AND status != 'Cancelled'`, id);
  const total = Number(counts.total) || 0;
  if (!total) continue;
  const pct = Math.round((Number(counts.done) / total) * 100);
  await update('projects', id, { completion_pct: pct });
  await ensureSnapshot(id, TODAY, pct, null);
}

/* ---- Historical KPI snapshots --------------------------------------- */
const { persistDailySnapshot } = await import('./lib/kpi.js');
for (const d of DAYS) await persistDailySnapshot(d);

console.log(`Seeded ${DAYS.length} days: ${DAYS[0]} → ${DAYS[DAYS.length - 1]}`);
console.log(`  ${(await all('SELECT id FROM users')).length} users, ${(await all('SELECT id FROM projects')).length} projects, ` +
  `${(await all('SELECT id FROM commitments')).length} commitments, ${(await all('SELECT id FROM progress_logs')).length} progress entries`);

// The embedded database holds the process open and keeps its lock file, so an
// unclosed seed looks finished but never returns the prompt — and the next
// thing to open the database waits on it.
await closeDb();
