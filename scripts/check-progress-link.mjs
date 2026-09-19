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
  ok('the entry counts as progress', log && log.counts_as_progress === 1);
  ok('one of one to-do done reads as 100%', log && Number(log.new_pct) === 100, `new_pct ${log && log.new_pct}`);

  let proj = await get('SELECT completion_pct FROM projects WHERE id = ?', project.id);
  ok('the project bar follows the to-dos', Number(proj.completion_pct) === 100, `now ${proj.completion_pct}`);

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
  ok('the bar drops back when the tick is taken away', Number(proj.completion_pct) === 0, `now ${proj.completion_pct}`);

  res = await call('PATCH', `/api/commitments/${c.id}`, { status: 'Completed' });
  log = await linkedLog(c.id);
  ok('re-ticking logs it again', !!log);

  /* Once a person edits the entry it is theirs, and an undo must not eat it. */
  await call('PATCH', `/api/progress/${log.id}`, { notes: 'checked by hand' });
  log = await get('SELECT * FROM progress_logs WHERE id = ?', log.id);
  ok('editing the entry clears the link', log.commitment_id === null);
  await call('PATCH', `/api/commitments/${c.id}`, { status: 'In Progress', carryover_reason: 'Continue tomorrow' });
  ok('un-ticking leaves an edited entry alone', !!(await get('SELECT id FROM progress_logs WHERE id = ?', log.id)));
  await run('DELETE FROM progress_logs WHERE id = ?', log.id);

  /* Wording is nobody's business but the person writing it: it all counts. */
  const vague = await call('POST', '/api/commitments', { user_id: user.id, project_id: project.id, task: VAGUE });
  await call('PATCH', `/api/commitments/${vague.id}`, { status: 'Completed' });
  log = await linkedLog(vague.id);
  ok('plainly worded work is recorded', !!log);
  ok('it counts as progress like any other entry', log && log.counts_as_progress === 1);

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

  /* ---- the percentage is the to-do list ------------------------------- */
  const board = await call('POST', '/api/projects', {
    name: `Checklist Project ${stamp}`, owner_id: user.id, status: 'Building',
    completion_pct: 40, start_date: '2026-01-01', priority: 'P2'
  });
  const pctOf = async () => Number((await get('SELECT completion_pct FROM projects WHERE id = ?', board.id)).completion_pct);
  ok('a project with no to-dos keeps the figure it was given', await pctOf() === 40, `is ${await pctOf()}`);

  const todos = [];
  for (let i = 1; i <= 4; i++) {
    todos.push(await call('POST', '/api/commitments', {
      user_id: user.id, project_id: board.id, task: `Checklist item ${i} for ${stamp}`
    }));
  }
  ok('four open to-dos read as 0%', await pctOf() === 0, `is ${await pctOf()}`);

  await call('PATCH', `/api/commitments/${todos[0].id}`, { status: 'Completed' });
  ok('one of four done reads as 25%', await pctOf() === 25, `is ${await pctOf()}`);

  await call('PATCH', `/api/commitments/${todos[1].id}`, { status: 'In Progress' });
  ok('in progress is not done', await pctOf() === 25, `is ${await pctOf()}`);

  for (const t of todos.slice(1)) await call('PATCH', `/api/commitments/${t.id}`, { status: 'Completed' });
  ok('all four done reads as 100%', await pctOf() === 100, `is ${await pctOf()}`);

  const late = await call('POST', '/api/commitments', {
    user_id: user.id, project_id: board.id, task: `One more thing for ${stamp}`
  });
  ok('a new to-do stops it reading as finished', await pctOf() === 80, `is ${await pctOf()}`);

  await call('DELETE', `/api/commitments/${late.id}`);
  ok('removing that to-do puts it back to 100%', await pctOf() === 100, `is ${await pctOf()}`);

  await call('PATCH', `/api/commitments/${todos[0].id}`, { status: 'Cancelled' });
  ok('a cancelled to-do is not counted', await pctOf() === 100, `is ${await pctOf()}`);
  await call('PATCH', `/api/commitments/${todos[0].id}`, { status: 'Completed' });

  /* ---- and a person can always overrule it ---------------------------- */
  await call('POST', '/api/commitments', { user_id: user.id, project_id: board.id, task: `Open item for ${stamp}` });
  ok('back below 100 with one open', await pctOf() === 80, `is ${await pctOf()}`);
  await call('PATCH', `/api/projects/${board.id}`, { pct_from_commitments: false, completion_pct: 100 });
  ok('a person can call it complete anyway', await pctOf() === 100, `is ${await pctOf()}`);
  await call('POST', '/api/commitments', { user_id: user.id, project_id: board.id, task: `Another open item for ${stamp}` });
  ok('to-dos no longer move a hand-set figure', await pctOf() === 100, `is ${await pctOf()}`);
  await call('PATCH', `/api/projects/${board.id}`, { pct_from_commitments: true });
  ok('switching back recounts straight away', await pctOf() === 67, `is ${await pctOf()}`);

  /* ---- work carried to the next day is still one item ----------------- */
  const carried = await call('POST', '/api/projects', {
    name: `Carry Over Project ${stamp}`, owner_id: user.id, status: 'Building', start_date: '2026-01-01'
  });
  const carriedPct = async () => Number((await get('SELECT completion_pct FROM projects WHERE id = ?', carried.id)).completion_pct);
  const a = await call('POST', '/api/commitments', { user_id: user.id, project_id: carried.id, task: `Carry me ${stamp}` });
  await call('POST', '/api/commitments', { user_id: user.id, project_id: carried.id, task: `Stay put ${stamp}` });
  await call('PATCH', `/api/commitments/${a.id}`, { status: 'In Progress', carryover_reason: 'Continue tomorrow' });
  await call('POST', '/api/commitments/close-day', { date: today, force: true, carry_forward: true });
  ok('carrying an item forward does not add a to-do', await carriedPct() === 0, `is ${await carriedPct()}`);
  const copy = await get(
    'SELECT id FROM commitments WHERE project_id = ? AND task = ? ORDER BY commit_date DESC LIMIT 1', carried.id, `Carry me ${stamp}`);
  await call('PATCH', `/api/commitments/${copy.id}`, { status: 'Completed' });
  ok('finishing the carried copy finishes the item', await carriedPct() === 50, `is ${await carriedPct()}`);
  await call('DELETE', `/api/projects/${carried.id}`);

  /* ---- unfinished work follows you onto today ------------------------- */
  const yesterday = D.addDays(today, -1);
  const T = (name) => `${name} yesterday ${stamp}`;
  const left = await call('POST', '/api/commitments', { user_id: user.id, project_id: project.id, task: T('Left open'), commit_date: yesterday });
  await call('POST', '/api/commitments', { user_id: user.id, task: T('Finished'), commit_date: yesterday, status: 'Completed' });
  await call('POST', '/api/commitments', { user_id: user.id, task: T('Dropped'), commit_date: yesterday, status: 'Cancelled' });
  await call('POST', '/api/commitments', { user_id: user.id, task: T('Stuck'), commit_date: yesterday, status: 'Blocked' });
  const todosBefore = (await call('GET', `/api/projects/${project.id}`)).commitment_progress.total;

  let todayView = await call('GET', '/api/today', {}, { date: today, user_id: String(user.id) });
  const tasksToday = todayView.commitments.map((c) => c.task);
  ok('an item left open yesterday shows up today', tasksToday.includes(T('Left open')));
  ok('a blocked item comes along, still blocked',
    todayView.commitments.some((c) => c.task === T('Stuck') && c.status === 'Blocked' && c.carryover_reason === 'Blocked'));
  ok('a finished item stays on its day', !tasksToday.includes(T('Finished')));
  ok('a cancelled item stays on its day', !tasksToday.includes(T('Dropped')));
  ok('the carried copy says where it came from',
    todayView.commitments.find((c) => c.task === T('Left open'))?.notes === `Carried over from ${yesterday}`);
  const original = await get('SELECT carryover_reason FROM commitments WHERE id = ?', left.id);
  ok("yesterday's copy is marked as continued", original.carryover_reason === 'Continue tomorrow');

  todayView = await call('GET', '/api/today', {}, { date: today, user_id: String(user.id) });
  ok('opening Today again does not carry it twice', todayView.commitments.filter((c) => c.task === T('Left open')).length === 1);
  const todosAfter = (await call('GET', `/api/projects/${project.id}`)).commitment_progress.total;
  ok('the project still counts it as one to-do', todosAfter === todosBefore, `${todosBefore} -> ${todosAfter}`);

  const past = await call('GET', '/api/today', {}, { date: yesterday, user_id: String(user.id) });
  ok('looking back at yesterday does not create anything', past.commitments.filter((c) => c.task === T('Left open')).length === 1);

  await call('DELETE', `/api/projects/${board.id}`);
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
