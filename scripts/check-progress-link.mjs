/**
 * Ticking a commitment complete records it as progress on its project.
 *
 * The link between the two is easy to break in ways nothing else notices: a
 * duplicate entry each time someone re-ticks, an entry left behind after the
 * tick is taken back, or a percentage a person set being deleted by an undo.
 * This exercises the whole path against a real database.
 *
 *   npm run check:progress
 */
import { init, get, all, run, setSettings, closeDb } from '../server/db.js';
import { match } from '../server/api.js';
import * as D from '../server/lib/dates.js';

await init();
const today = D.today();
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

async function call(method, path, body = {}, query = {}) {
  const hit = match(method, path);
  if (!hit) throw new Error(`no route for ${method} ${path}`);
  return await hit.handler(hit.params, query, body);
}

const stamp = Date.now();
const user = await call('POST', '/api/users', { name: `Link Check ${stamp}`, role: 'AI / Systems' });
const project = await call('POST', '/api/projects', {
  name: `Link Check Project ${stamp}`, owner_id: user.id, status: 'Building',
  completion_pct: 40, start_date: '2026-01-01', priority: 'P2'
});
const startPct = Number((await get('SELECT completion_pct FROM projects WHERE id = ?', project.id)).completion_pct);
const linkedLog = (id) => get('SELECT * FROM progress_logs WHERE commitment_id = ?', id);

const MEASURABLE = 'Deployed the after-hours transfer route and passed 18 of 20 test cases';
const VAGUE = 'Worked on the Retell integration';

try {
  /* An open commitment is a promise, not a delivery. */
  let c = await call('POST', '/api/commitments', { user_id: user.id, project_id: project.id, task: MEASURABLE });
  ok('nothing is logged while the commitment is still open', !(await linkedLog(c.id)));

  /* Ticking it complete delivers it. */
  let res = await call('PATCH', `/api/commitments/${c.id}`, { status: 'Completed' });
  ok('the tick returns the entry it created', !!res.progress && res.progress.project_name === project.name);
  let log = await linkedLog(c.id);
  ok('the entry lands on the right project', !!log && log.project_id === project.id);
  ok('the entry carries the commitment wording', log && log.completed_text === MEASURABLE);
  ok('measurable wording counts as progress', log && log.counts_as_progress === 1);
  ok('the percentage stays where it was', log && Number(log.new_pct) === startPct, `new_pct ${log && log.new_pct}`);

  let proj = await get('SELECT completion_pct FROM projects WHERE id = ?', project.id);
  ok('the project bar does not move on its own', Number(proj.completion_pct) === startPct, `now ${proj.completion_pct}`);

  const day = await call('GET', `/api/projects/${project.id}`);
  ok('the project reads as progressed today', day.progressed === true);
  ok('the commitment is the evidence', (day.evidence || []).includes(MEASURABLE));

  /* Editing something else about it must not log it twice. */
  await call('PATCH', `/api/commitments/${c.id}`, { notes: 'unchanged' });
  ok('a later edit does not add a second entry', (await all('SELECT id FROM progress_logs WHERE commitment_id = ?', c.id)).length === 1);

  /* Rewording the commitment rewords the delivery. */
  const REWORDED = 'Deployed the after-hours transfer route and passed all 20 test cases';
  await call('PATCH', `/api/commitments/${c.id}`, { task: REWORDED });
  log = await linkedLog(c.id);
  ok('rewording a finished commitment rewords its entry', log && log.completed_text === REWORDED);

  /* Taking the tick back takes the entry with it. */
  await call('PATCH', `/api/commitments/${c.id}`, { status: 'In Progress', carryover_reason: 'Continue tomorrow' });
  ok('un-ticking removes the automatic entry', !(await linkedLog(c.id)));
  proj = await get('SELECT completion_pct FROM projects WHERE id = ?', project.id);
  ok('the bar is unchanged after an undo', Number(proj.completion_pct) === startPct, `now ${proj.completion_pct}`);

  res = await call('PATCH', `/api/commitments/${c.id}`, { status: 'Completed' });
  log = await linkedLog(c.id);
  ok('re-ticking logs it again', !!log);

  /* Once a person edits the entry it is theirs, and an undo must not eat it. */
  await call('PATCH', `/api/progress/${log.id}`, { new_pct: 55 });
  log = await get('SELECT * FROM progress_logs WHERE id = ?', log.id);
  ok('editing the entry clears the link', log.commitment_id === null);
  await call('PATCH', `/api/commitments/${c.id}`, { status: 'In Progress', carryover_reason: 'Continue tomorrow' });
  ok('un-ticking leaves an edited entry alone', !!(await get('SELECT id FROM progress_logs WHERE id = ?', log.id)));
  proj = await get('SELECT completion_pct FROM projects WHERE id = ?', project.id);
  ok('a percentage a person set survives an undo', Number(proj.completion_pct) === 55, `now ${proj.completion_pct}`);
  await run('DELETE FROM progress_logs WHERE id = ?', log.id);
  await call('PATCH', `/api/projects/${project.id}`, { completion_pct: startPct });

  /* Activity is recorded but still does not count. */
  const vague = await call('POST', '/api/commitments', { user_id: user.id, project_id: project.id, task: VAGUE });
  await call('PATCH', `/api/commitments/${vague.id}`, { status: 'Completed' });
  log = await linkedLog(vague.id);
  ok('vague wording is still recorded', !!log);
  ok('vague wording does not count as progress', log && log.counts_as_progress === 0);

  /* Nothing to log against. */
  const loose = await call('POST', '/api/commitments', { user_id: user.id, task: `${MEASURABLE} (no project)` });
  res = await call('PATCH', `/api/commitments/${loose.id}`, { status: 'Completed' });
  ok('a commitment with no project logs nothing', res.progress === null);

  /* Removing the commitment removes what it wrote. */
  await call('DELETE', `/api/commitments/${vague.id}`);
  ok('deleting the commitment removes its entry', !(await linkedLog(vague.id)));

  /* Added already finished. */
  const born = await call('POST', '/api/commitments', {
    user_id: user.id, project_id: project.id, status: 'Completed',
    task: 'Shipped the lead router and cut manual triage to zero'
  });
  ok('a commitment added as complete logs progress too', !!born.progress);

  /* The setting switches it off. */
  await setSettings({ auto_progress_from_commitments: '0' });
  const off = await call('POST', '/api/commitments', {
    user_id: user.id, project_id: project.id, task: 'Cut report build time from 40 minutes to 6'
  });
  res = await call('PATCH', `/api/commitments/${off.id}`, { status: 'Completed' });
  ok('the setting switches the behaviour off', res.progress === null);
  await setSettings({ auto_progress_from_commitments: '1' });

  /* Someone who wrote it up by hand does not get it twice. */
  const typed = 'Rebuilt the skip-trace queue and cleared the 900 stuck records';
  const manual = await call('POST', '/api/commitments', { user_id: user.id, project_id: project.id, task: typed });
  await call('POST', '/api/progress', { project_id: project.id, user_id: user.id, completed_text: typed, log_date: today });
  res = await call('PATCH', `/api/commitments/${manual.id}`, { status: 'Completed' });
  ok('an entry the person already wrote is not duplicated', res.progress === null);
} finally {
  await call('DELETE', `/api/projects/${project.id}`);
  await call('DELETE', `/api/users/${user.id}`);
}

console.log(fail
  ? `\n  ${fail} of ${pass + fail} checks failed.\n`
  : `\n  All ${pass} checks passed.\n`);
// Close the embedded database before leaving, or it keeps its lock file and the
// next thing to open it waits forever.
await closeDb();
process.exit(fail ? 1 : 0);
