/** REST API. Every entity supports create, update and delete. */
import { all, get, run, insert, update, remove, getSettings, setSettings, transaction } from './db.js';
import * as D from './lib/dates.js';
import * as K from './lib/kpi.js';
import { ENUMS } from './lib/enums.js';
import { scoreText, HELPER_MESSAGE, PROGRESS_EXAMPLES, NON_PROGRESS_EXAMPLES } from './lib/quality.js';
import { buildReport } from './lib/reports.js';
import { authEnabled } from './auth.js';

const routes = [];
const route = (method, path, handler) =>
  routes.push({ method, parts: path.split('/').filter(Boolean), handler });

export const GET = (p, h) => route('GET', p, h);
export const POST = (p, h) => route('POST', p, h);
export const PATCH = (p, h) => route('PATCH', p, h);
export const DELETE = (p, h) => route('DELETE', p, h);

export function match(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (r.parts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new HttpError(400, msg); };
const notFound = (msg = 'Not found') => { throw new HttpError(404, msg); };
export { HttpError };

const int = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const dateOr = (q, key = 'date') => q[key] || D.today();

/* ================================================================== */
/* Bootstrap & reference data                                          */
/* ================================================================== */
GET('/api/bootstrap', (_p, q) => ({
  today: D.today(),
  date: dateOr(q),
  users: all('SELECT * FROM users ORDER BY sort_order, id'),
  projects: all(`SELECT p.*, u.name AS owner_name FROM projects p
                   LEFT JOIN users u ON u.id = p.owner_id
                  WHERE p.archived = 0 ORDER BY p.name`),
  settings: getSettings(),
  enums: ENUMS,
  guidance: { helper: HELPER_MESSAGE, good: PROGRESS_EXAMPLES, bad: NON_PROGRESS_EXAMPLES },
  auth: { enabled: authEnabled() }
}));

POST('/api/quality-check', (_p, _q, body) => scoreText(body.text, { kind: body.kind || 'progress' }));

/* ================================================================== */
/* Users                                                               */
/* ================================================================== */
GET('/api/users', () => all('SELECT * FROM users ORDER BY sort_order, id'));

POST('/api/users', (_p, _q, body) => {
  if (!body.name) bad('Name is required');
  const id = insert('users', {
    name: body.name,
    role: body.role || 'AI / Systems',
    email: body.email,
    avatar_url: body.avatar_url,
    initials: body.initials || initialsOf(body.name),
    color: body.color || pickColor(),
    is_manager: body.is_manager ? 1 : 0,
    active: body.active === undefined ? 1 : (body.active ? 1 : 0),
    sort_order: int(body.sort_order) ?? 0
  });
  return get('SELECT * FROM users WHERE id = ?', id);
});

PATCH('/api/users/:id', (p, _q, body) => {
  if (body.name && !body.initials) body.initials = initialsOf(body.name);
  if ('is_manager' in body) body.is_manager = body.is_manager ? 1 : 0;
  if ('active' in body) body.active = body.active ? 1 : 0;
  update('users', p.id, body);
  return get('SELECT * FROM users WHERE id = ?', p.id);
});

DELETE('/api/users/:id', (p) => {
  const user = get('SELECT * FROM users WHERE id = ?', p.id) || notFound('User not found');
  const owned = get('SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?', p.id).n;
  remove('users', p.id);
  return { deleted: true, id: Number(p.id), name: user.name, projects_unassigned: owned };
});

const initialsOf = (name) =>
  String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#c2410c', '#15803d', '#be123c'];
const pickColor = () => PALETTE[get('SELECT COUNT(*) AS n FROM users').n % PALETTE.length];

/* ================================================================== */
/* Projects                                                            */
/* ================================================================== */
GET('/api/projects', (_p, q) => {
  const date = dateOr(q);
  const where = ['1 = 1'];
  const args = [];
  if (q.include_archived !== '1') where.push('p.archived = 0');
  if (q.owner_id) { where.push('(p.owner_id = ? OR p.secondary_owner_id = ?)'); args.push(q.owner_id, q.owner_id); }
  if (q.status) { where.push('p.status = ?'); args.push(q.status); }
  if (q.priority) { where.push('p.priority = ?'); args.push(q.priority); }
  if (q.department) { where.push('p.department = ?'); args.push(q.department); }
  if (q.search) { where.push('LOWER(p.name) LIKE ?'); args.push(`%${q.search.toLowerCase()}%`); }

  const rows = all(
    `SELECT p.*, o.name AS owner_name, o.color AS owner_color, s.name AS secondary_name
       FROM projects p
       LEFT JOIN users o ON o.id = p.owner_id
       LEFT JOIN users s ON s.id = p.secondary_owner_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE p.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, p.name`,
    ...args
  ).map((p) => K.projectDay(p, date));

  if (q.blocked === '1') return rows.filter((r) => r.blockers.length);
  if (q.blocked === '0') return rows.filter((r) => !r.blockers.length);
  return rows;
});

GET('/api/projects/:id', (p, q) => {
  const date = dateOr(q);
  const project = get(
    `SELECT p.*, o.name AS owner_name, o.color AS owner_color, s.name AS secondary_name
       FROM projects p LEFT JOIN users o ON o.id = p.owner_id LEFT JOIN users s ON s.id = p.secondary_owner_id
      WHERE p.id = ?`, p.id) || notFound('Project not found');
  return {
    ...K.projectDay(project, date),
    milestones: all('SELECT * FROM project_milestones WHERE project_id = ? ORDER BY sort_order, target_pct', p.id),
    history: all(
      `SELECT pl.*, u.name AS user_name FROM progress_logs pl
         LEFT JOIN users u ON u.id = pl.user_id
        WHERE pl.project_id = ? ORDER BY pl.log_date DESC, pl.id DESC LIMIT 60`, p.id),
    snapshots: all('SELECT * FROM project_snapshots WHERE project_id = ? ORDER BY snapshot_date', p.id),
    all_blockers: all(
      `SELECT b.*, u.name AS owner_name FROM blockers b LEFT JOIN users u ON u.id = b.owner_id
        WHERE b.project_id = ? ORDER BY b.date_reported DESC`, p.id),
    deployment_history: all(
      `SELECT d.*, u.name AS user_name FROM deployments d LEFT JOIN users u ON u.id = d.user_id
        WHERE d.project_id = ? ORDER BY d.deploy_date DESC`, p.id),
    impact: get('SELECT * FROM business_impact WHERE project_id = ?', p.id)
  };
});

POST('/api/projects', (_p, _q, body) => {
  if (!body.name) bad('Project name is required');
  const today = D.today();
  return transaction(() => {
    const id = insert('projects', {
      name: body.name,
      owner_id: int(body.owner_id),
      secondary_owner_id: int(body.secondary_owner_id),
      requester: body.requester,
      department: body.department,
      start_date: body.start_date || today,
      target_date: body.target_date,
      priority: body.priority || 'P3',
      status: body.status || 'Backlog',
      completion_pct: Number(body.completion_pct) || 0,
      current_phase: body.current_phase,
      next_step: body.next_step,
      business_objective: body.business_objective,
      expected_impact: body.expected_impact,
      production_url: body.production_url,
      notes: body.notes,
      archived: 0,
      updated_at: new Date().toISOString()
    });
    ENUMS.milestone_framework.forEach((m, i) =>
      insert('project_milestones', { project_id: id, name: m.name, target_pct: m.target_pct, sort_order: i }));
    K.ensureSnapshot(id, body.start_date || today, Number(body.completion_pct) || 0, body.status || 'Backlog');
    syncMilestones(id, Number(body.completion_pct) || 0, today);
    return get('SELECT * FROM projects WHERE id = ?', id);
  });
});

PATCH('/api/projects/:id', (p, q, body) => {
  const project = get('SELECT * FROM projects WHERE id = ?', p.id) || notFound('Project not found');
  const date = q.date || D.today();
  body.updated_at = new Date().toISOString();
  for (const key of ['owner_id', 'secondary_owner_id']) if (key in body) body[key] = int(body[key]);
  update('projects', p.id, body);

  if ('completion_pct' in body || 'status' in body) {
    const next = get('SELECT * FROM projects WHERE id = ?', p.id);
    K.ensureSnapshot(p.id, date, next.completion_pct, next.status);
    syncMilestones(p.id, next.completion_pct, date);
  }
  return K.projectDay(get('SELECT * FROM projects WHERE id = ?', p.id), date);
});

DELETE('/api/projects/:id', (p) => {
  const project = get('SELECT * FROM projects WHERE id = ?', p.id) || notFound('Project not found');
  const counts = {
    progress_logs: get('SELECT COUNT(*) AS n FROM progress_logs WHERE project_id = ?', p.id).n,
    blockers: get('SELECT COUNT(*) AS n FROM blockers WHERE project_id = ?', p.id).n,
    deployments: get('SELECT COUNT(*) AS n FROM deployments WHERE project_id = ?', p.id).n
  };
  remove('projects', p.id);
  return { deleted: true, id: Number(p.id), name: project.name, removed: counts };
});

POST('/api/projects/:id/archive', (p, _q, body) => {
  update('projects', p.id, { archived: body.archived === false ? 0 : 1 });
  return get('SELECT * FROM projects WHERE id = ?', p.id);
});

/** Mark milestones at or below the current % as reached. */
function syncMilestones(projectId, pct, date) {
  for (const m of all('SELECT * FROM project_milestones WHERE project_id = ?', projectId)) {
    if (pct >= m.target_pct && !m.completed) {
      update('project_milestones', m.id, { completed: 1, completed_date: date });
    } else if (pct < m.target_pct && m.completed) {
      update('project_milestones', m.id, { completed: 0, completed_date: null });
    }
  }
}

PATCH('/api/milestones/:id', (p, _q, body) => {
  const m = get('SELECT * FROM project_milestones WHERE id = ?', p.id) || notFound('Milestone not found');
  if ('completed' in body) {
    body.completed = body.completed ? 1 : 0;
    body.completed_date = body.completed ? (body.completed_date || D.today()) : null;
  }
  update('project_milestones', p.id, body);
  return get('SELECT * FROM project_milestones WHERE id = ?', p.id);
});

POST('/api/milestones', (_p, _q, body) => {
  if (!body.project_id || !body.name) bad('Project and milestone name are required');
  const id = insert('project_milestones', {
    project_id: int(body.project_id), name: body.name,
    target_pct: Number(body.target_pct) || 0, sort_order: int(body.sort_order) ?? 99
  });
  return get('SELECT * FROM project_milestones WHERE id = ?', id);
});

DELETE('/api/milestones/:id', (p) => ({ deleted: remove('project_milestones', p.id) > 0, id: Number(p.id) }));

/* ================================================================== */
/* Daily commitments                                                   */
/* ================================================================== */
GET('/api/commitments', (_p, q) => {
  const where = [];
  const args = [];
  if (q.date) { where.push('c.commit_date = ?'); args.push(q.date); }
  if (q.from) { where.push('c.commit_date >= ?'); args.push(q.from); }
  if (q.to) { where.push('c.commit_date <= ?'); args.push(q.to); }
  if (q.user_id) { where.push('c.user_id = ?'); args.push(q.user_id); }
  if (q.project_id) { where.push('c.project_id = ?'); args.push(q.project_id); }
  if (q.priority) { where.push('c.priority = ?'); args.push(q.priority); }
  if (q.status) { where.push('c.status = ?'); args.push(q.status); }
  return all(
    `SELECT c.*, u.name AS user_name, u.color AS user_color, p.name AS project_name
       FROM commitments c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN projects p ON p.id = c.project_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.commit_date DESC,
               CASE c.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, c.id`,
    ...args
  );
});

POST('/api/commitments', (_p, _q, body) => {
  if (!body.user_id) bad('A team member is required');
  if (!body.task || !body.task.trim()) bad('Describe the deliverable');
  const date = body.commit_date || D.today();
  const quality = scoreText(body.task, { kind: 'commitment' });
  const existing = get(
    "SELECT COUNT(*) AS n FROM commitments WHERE user_id = ? AND commit_date = ? AND status != 'Cancelled'",
    body.user_id, date).n;
  const max = Number(getSettings().max_commitments || 5);
  const id = insert('commitments', {
    user_id: int(body.user_id),
    project_id: int(body.project_id),
    commit_date: date,
    task: body.task.trim(),
    priority: body.priority || 'P3',
    expected_today: body.expected_today === false ? 0 : 1,
    status: body.status || 'Not Started',
    notes: body.notes,
    quality_score: quality.score
  });
  return {
    ...get('SELECT * FROM commitments WHERE id = ?', id),
    quality,
    warning: existing >= max ? `That is more than the recommended ${max} commitments for one day.` : null
  };
});

PATCH('/api/commitments/:id', (p, _q, body) => {
  const c = get('SELECT * FROM commitments WHERE id = ?', p.id) || notFound('Commitment not found');
  if ('task' in body && body.task) body.quality_score = scoreText(body.task, { kind: 'commitment' }).score;
  if ('status' in body) {
    if (body.status === 'Completed') {
      body.completed_at = new Date().toISOString();
      body.carryover_reason = null;
    } else {
      body.completed_at = null;
      // Unfinished work must carry an explanation — it never just disappears.
      if (body.status === 'Cancelled' && !body.carryover_reason && !c.carryover_reason) body.carryover_reason = 'Cancelled';
      if (body.status === 'Blocked' && !body.carryover_reason && !c.carryover_reason) body.carryover_reason = 'Blocked';
    }
  }
  if ('project_id' in body) body.project_id = int(body.project_id);
  update('commitments', p.id, body);
  return get('SELECT * FROM commitments WHERE id = ?', p.id);
});

DELETE('/api/commitments/:id', (p) => {
  const c = get('SELECT * FROM commitments WHERE id = ?', p.id) || notFound('Commitment not found');
  remove('commitments', p.id);
  return { deleted: true, id: Number(p.id), task: c.task };
});

/** Close out a day: everything unfinished needs a reason. */
POST('/api/commitments/close-day', (_p, _q, body) => {
  const date = body.date || D.today();
  const rows = body.user_id
    ? all('SELECT * FROM commitments WHERE commit_date = ? AND user_id = ?', date, body.user_id)
    : all('SELECT * FROM commitments WHERE commit_date = ?', date);
  const missing = rows.filter((c) => c.status !== 'Completed' && c.status !== 'Cancelled' && !c.carryover_reason);
  if (missing.length && !body.force) {
    return { ok: false, needs_reason: missing.map((c) => ({ id: c.id, task: c.task, status: c.status })) };
  }
  if (body.carry_forward) {
    const next = nextBusinessDay(date);
    for (const c of rows.filter((r) => r.carryover_reason === 'Continue tomorrow')) {
      const dupe = get('SELECT id FROM commitments WHERE user_id = ? AND commit_date = ? AND task = ?', c.user_id, next, c.task);
      if (!dupe) {
        insert('commitments', {
          user_id: c.user_id, project_id: c.project_id, commit_date: next, task: c.task,
          priority: c.priority, status: 'Not Started', notes: `Carried over from ${date}`,
          quality_score: c.quality_score
        });
      }
    }
  }
  return { ok: true, snapshot: K.persistDailySnapshot(date) };
});

function nextBusinessDay(iso) {
  let cur = D.addDays(iso, 1);
  let guard = 0;
  while (!D.isBusinessDay(cur) && guard++ < 10) cur = D.addDays(cur, 1);
  return cur;
}

/* ================================================================== */
/* Progress logs                                                       */
/* ================================================================== */
GET('/api/progress', (_p, q) => {
  const where = [];
  const args = [];
  if (q.date) { where.push('pl.log_date = ?'); args.push(q.date); }
  if (q.from) { where.push('pl.log_date >= ?'); args.push(q.from); }
  if (q.to) { where.push('pl.log_date <= ?'); args.push(q.to); }
  if (q.project_id) { where.push('pl.project_id = ?'); args.push(q.project_id); }
  if (q.user_id) { where.push('pl.user_id = ?'); args.push(q.user_id); }
  return all(
    `SELECT pl.*, u.name AS user_name, p.name AS project_name, m.name AS milestone_name
       FROM progress_logs pl
       LEFT JOIN users u ON u.id = pl.user_id
       LEFT JOIN projects p ON p.id = pl.project_id
       LEFT JOIN project_milestones m ON m.id = pl.milestone_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY pl.log_date DESC, pl.id DESC`,
    ...args
  );
});

POST('/api/progress', (_p, _q, body) => {
  if (!body.project_id) bad('Project is required');
  if (!body.completed_text || !body.completed_text.trim()) bad('Describe what was completed');
  const date = body.log_date || D.today();
  const project = get('SELECT * FROM projects WHERE id = ?', body.project_id) || notFound('Project not found');
  const quality = scoreText(body.completed_text, { kind: 'progress' });
  const previous = K.previousPct(project.id, date);
  const newPct = body.new_pct === undefined || body.new_pct === null || body.new_pct === ''
    ? K.pctOn(project.id, date, project.completion_pct)
    : Math.max(0, Math.min(100, Number(body.new_pct)));

  return transaction(() => {
    const id = insert('progress_logs', {
      project_id: int(body.project_id),
      user_id: int(body.user_id),
      log_date: date,
      previous_pct: previous,
      new_pct: newPct,
      completed_text: body.completed_text.trim(),
      next_text: body.next_text,
      blocker_text: body.blocker_text,
      notes: body.notes,
      milestone_id: int(body.milestone_id),
      counts_as_progress: quality.measurable ? 1 : 0,
      quality_score: quality.score
    });

    K.ensureSnapshot(project.id, date, newPct, body.status || project.status);
    const patch = { completion_pct: newPct, updated_at: new Date().toISOString() };
    if (body.next_text) patch.next_step = body.next_text;
    if (body.status) patch.status = body.status;
    if (body.current_phase) patch.current_phase = body.current_phase;
    update('projects', project.id, patch);
    syncMilestones(project.id, newPct, date);

    if (body.milestone_id) {
      update('project_milestones', body.milestone_id, { completed: 1, completed_date: date });
    }
    if (body.create_blocker && body.blocker_text) {
      insert('blockers', {
        title: body.blocker_text, project_id: project.id, owner_id: int(body.user_id),
        date_reported: date, reason: body.blocker_reason || 'Other',
        priority: project.priority, status: 'Open'
      });
    }
    return { ...get('SELECT * FROM progress_logs WHERE id = ?', id), quality };
  });
});

PATCH('/api/progress/:id', (p, _q, body) => {
  const log = get('SELECT * FROM progress_logs WHERE id = ?', p.id) || notFound('Progress entry not found');
  if ('completed_text' in body && body.completed_text) {
    const quality = scoreText(body.completed_text, { kind: 'progress' });
    body.counts_as_progress = quality.measurable ? 1 : 0;
    body.quality_score = quality.score;
  }
  if ('new_pct' in body) body.new_pct = Math.max(0, Math.min(100, Number(body.new_pct)));
  update('progress_logs', p.id, body);
  recomputeProject(log.project_id, log.log_date);
  return get('SELECT * FROM progress_logs WHERE id = ?', p.id);
});

DELETE('/api/progress/:id', (p) => {
  const log = get('SELECT * FROM progress_logs WHERE id = ?', p.id) || notFound('Progress entry not found');
  remove('progress_logs', p.id);
  recomputeProject(log.project_id, log.log_date);
  return { deleted: true, id: Number(p.id), project_id: log.project_id };
});

/** After an edit or delete, rebuild that day's snapshot from what remains. */
function recomputeProject(projectId, date) {
  const latest = get(
    'SELECT new_pct FROM progress_logs WHERE project_id = ? AND log_date = ? ORDER BY id DESC LIMIT 1',
    projectId, date);
  if (latest) {
    K.ensureSnapshot(projectId, date, latest.new_pct, null);
  } else {
    run('DELETE FROM project_snapshots WHERE project_id = ? AND snapshot_date = ?', projectId, date);
  }
  const current = get(
    'SELECT completion_pct FROM project_snapshots WHERE project_id = ? ORDER BY snapshot_date DESC LIMIT 1',
    projectId);
  const pct = current ? current.completion_pct : 0;
  update('projects', projectId, { completion_pct: pct, updated_at: new Date().toISOString() });
  syncMilestones(projectId, pct, date);
}

/* ================================================================== */
/* Blockers                                                            */
/* ================================================================== */
GET('/api/blockers', (_p, q) => {
  const date = dateOr(q);
  const where = [];
  const args = [];
  if (q.status) { where.push('b.status = ?'); args.push(q.status); }
  if (q.open === '1') where.push("b.status IN ('Open','Waiting','Escalated')");
  if (q.project_id) { where.push('b.project_id = ?'); args.push(q.project_id); }
  if (q.owner_id) { where.push('b.owner_id = ?'); args.push(q.owner_id); }
  if (q.priority) { where.push('b.priority = ?'); args.push(q.priority); }
  if (q.reason) { where.push('b.reason = ?'); args.push(q.reason); }
  const alertAfter = Number(getSettings().blocker_age_alert_days || 1);
  return all(
    `SELECT b.*, p.name AS project_name, u.name AS owner_name, u.color AS owner_color
       FROM blockers b LEFT JOIN projects p ON p.id = b.project_id LEFT JOIN users u ON u.id = b.owner_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE b.status WHEN 'Escalated' THEN 1 WHEN 'Open' THEN 2 WHEN 'Waiting' THEN 3 ELSE 4 END,
               b.date_reported`,
    ...args
  ).map((b) => {
    const end = b.status === 'Resolved' && b.resolved_date ? b.resolved_date : date;
    const days = D.businessDaysBetween(b.date_reported, end);
    return {
      ...b, days_blocked: days, aging: b.status !== 'Resolved' && days > alertAfter,
      age_band: days <= 0 ? 'Same Day' : days === 1 ? '1 Day' : days === 2 ? '2 Days' : '3+ Days'
    };
  });
});

POST('/api/blockers', (_p, _q, body) => {
  if (!body.title) bad('Describe the blocker');
  const id = insert('blockers', {
    title: body.title,
    project_id: int(body.project_id),
    owner_id: int(body.owner_id),
    commitment_id: int(body.commitment_id),
    date_reported: body.date_reported || D.today(),
    person_needed: body.person_needed,
    reason: body.reason || 'Other',
    priority: body.priority || 'P3',
    status: body.status || 'Open',
    notes: body.notes
  });
  return get('SELECT * FROM blockers WHERE id = ?', id);
});

PATCH('/api/blockers/:id', (p, _q, body) => {
  get('SELECT * FROM blockers WHERE id = ?', p.id) || notFound('Blocker not found');
  if (body.status === 'Resolved' && !body.resolved_date) body.resolved_date = D.today();
  if (body.status && body.status !== 'Resolved') body.resolved_date = null;
  for (const key of ['project_id', 'owner_id']) if (key in body) body[key] = int(body[key]);
  update('blockers', p.id, body);
  return get('SELECT * FROM blockers WHERE id = ?', p.id);
});

DELETE('/api/blockers/:id', (p) => {
  const b = get('SELECT * FROM blockers WHERE id = ?', p.id) || notFound('Blocker not found');
  remove('blockers', p.id);
  return { deleted: true, id: Number(p.id), title: b.title };
});

/* ================================================================== */
/* Deployments                                                         */
/* ================================================================== */
GET('/api/deployments', (_p, q) => {
  const where = [];
  const args = [];
  if (q.date) { where.push('d.deploy_date = ?'); args.push(q.date); }
  if (q.from) { where.push('d.deploy_date >= ?'); args.push(q.from); }
  if (q.to) { where.push('d.deploy_date <= ?'); args.push(q.to); }
  if (q.project_id) { where.push('d.project_id = ?'); args.push(q.project_id); }
  if (q.user_id) { where.push('d.user_id = ?'); args.push(q.user_id); }
  return all(
    `SELECT d.*, p.name AS project_name, u.name AS user_name FROM deployments d
       LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN users u ON u.id = d.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY d.deploy_date DESC, d.id DESC`,
    ...args
  );
});

POST('/api/deployments', (_p, _q, body) => {
  if (!body.title) bad('What was deployed?');
  const id = insert('deployments', {
    project_id: int(body.project_id), user_id: int(body.user_id),
    deploy_date: body.deploy_date || D.today(), kind: body.kind || 'Feature',
    title: body.title, description: body.description, url: body.url
  });
  return get('SELECT * FROM deployments WHERE id = ?', id);
});

PATCH('/api/deployments/:id', (p, _q, body) => {
  for (const key of ['project_id', 'user_id']) if (key in body) body[key] = int(body[key]);
  update('deployments', p.id, body);
  return get('SELECT * FROM deployments WHERE id = ?', p.id);
});

DELETE('/api/deployments/:id', (p) => {
  const d = get('SELECT * FROM deployments WHERE id = ?', p.id) || notFound('Deployment not found');
  remove('deployments', p.id);
  return { deleted: true, id: Number(p.id), title: d.title };
});

/* ================================================================== */
/* Production systems & incidents                                      */
/* ================================================================== */
GET('/api/systems', (_p, q) => {
  const where = [];
  const args = [];
  if (q.owner_id) { where.push('s.owner_id = ?'); args.push(q.owner_id); }
  if (q.status) { where.push('s.status = ?'); args.push(q.status); }
  if (q.system_type) { where.push('s.system_type = ?'); args.push(q.system_type); }
  return all(
    `SELECT s.*, u.name AS owner_name, p.name AS project_name FROM production_systems s
       LEFT JOIN users u ON u.id = s.owner_id LEFT JOIN projects p ON p.id = s.project_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.name`,
    ...args
  ).map((s) => {
    const total = (s.successful_runs || 0) + (s.failed_runs || 0);
    return {
      ...s, total_runs: total,
      success_rate: total ? K.round((s.successful_runs / total) * 100) : 100,
      open_incidents: get(
        "SELECT COUNT(*) AS n FROM incidents WHERE system_id = ? AND status != 'Resolved'", s.id).n
    };
  });
});

POST('/api/systems', (_p, _q, body) => {
  if (!body.name) bad('System name is required');
  const id = insert('production_systems', {
    name: body.name, owner_id: int(body.owner_id), project_id: int(body.project_id),
    system_type: body.system_type || 'Automation', status: body.status || 'Healthy',
    last_checked: body.last_checked || D.today(),
    successful_runs: int(body.successful_runs) ?? 0, failed_runs: int(body.failed_runs) ?? 0,
    url: body.url, notes: body.notes
  });
  return get('SELECT * FROM production_systems WHERE id = ?', id);
});

PATCH('/api/systems/:id', (p, _q, body) => {
  for (const key of ['owner_id', 'project_id']) if (key in body) body[key] = int(body[key]);
  update('production_systems', p.id, body);
  return get('SELECT * FROM production_systems WHERE id = ?', p.id);
});

DELETE('/api/systems/:id', (p) => {
  const s = get('SELECT * FROM production_systems WHERE id = ?', p.id) || notFound('System not found');
  remove('production_systems', p.id);
  return { deleted: true, id: Number(p.id), name: s.name };
});

POST('/api/systems/:id/check', (p, _q, body) => {
  const s = get('SELECT * FROM production_systems WHERE id = ?', p.id) || notFound('System not found');
  update('production_systems', p.id, {
    last_checked: body.date || D.today(),
    successful_runs: (s.successful_runs || 0) + (int(body.successful_runs) ?? 0),
    failed_runs: (s.failed_runs || 0) + (int(body.failed_runs) ?? 0),
    status: body.status || s.status
  });
  return get('SELECT * FROM production_systems WHERE id = ?', p.id);
});

GET('/api/incidents', (_p, q) => {
  const where = [];
  const args = [];
  if (q.open === '1') where.push("i.status != 'Resolved'");
  if (q.status) { where.push('i.status = ?'); args.push(q.status); }
  if (q.severity) { where.push('i.severity = ?'); args.push(q.severity); }
  if (q.system_id) { where.push('i.system_id = ?'); args.push(q.system_id); }
  if (q.date) { where.push('i.reported_date = ?'); args.push(q.date); }
  if (q.from) { where.push('i.reported_date >= ?'); args.push(q.from); }
  return all(
    `SELECT i.*, s.name AS system_name, p.name AS project_name, u.name AS reporter_name
       FROM incidents i LEFT JOIN production_systems s ON s.id = i.system_id
       LEFT JOIN projects p ON p.id = i.project_id LEFT JOIN users u ON u.id = i.reported_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE i.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
               i.reported_date DESC`,
    ...args
  );
});

POST('/api/incidents', (_p, _q, body) => {
  if (!body.title) bad('Describe the issue');
  const date = body.reported_date || D.today();
  const id = insert('incidents', {
    title: body.title, system_id: int(body.system_id), project_id: int(body.project_id),
    reported_by: int(body.reported_by), category: body.category || 'Bug',
    severity: body.severity || 'Low', status: body.status || 'Open',
    reported_date: date, description: body.description
  });
  if (body.system_id) update('production_systems', body.system_id, { last_incident_date: date });
  return get('SELECT * FROM incidents WHERE id = ?', id);
});

PATCH('/api/incidents/:id', (p, _q, body) => {
  get('SELECT * FROM incidents WHERE id = ?', p.id) || notFound('Incident not found');
  if (body.status === 'Resolved' && !body.resolved_date) body.resolved_date = D.today();
  if (body.status && body.status !== 'Resolved') body.resolved_date = null;
  for (const key of ['system_id', 'project_id', 'reported_by']) if (key in body) body[key] = int(body[key]);
  update('incidents', p.id, body);
  return get('SELECT * FROM incidents WHERE id = ?', p.id);
});

DELETE('/api/incidents/:id', (p) => {
  const i = get('SELECT * FROM incidents WHERE id = ?', p.id) || notFound('Incident not found');
  remove('incidents', p.id);
  return { deleted: true, id: Number(p.id), title: i.title };
});

/* ================================================================== */
/* Business impact                                                     */
/* ================================================================== */
GET('/api/impact', () => K.businessImpact());

POST('/api/impact', (_p, _q, body) => {
  if (!body.project_id) bad('Pick a project');
  const existing = get('SELECT id FROM business_impact WHERE project_id = ?', body.project_id);
  const payload = {
    project_id: int(body.project_id), manual_process: body.manual_process,
    minutes_per_run: Number(body.minutes_per_run) || 0, runs_per_week: Number(body.runs_per_week) || 0,
    hourly_cost: Number(body.hourly_cost) || 0, revenue_supported: Number(body.revenue_supported) || 0,
    leads_processed: int(body.leads_processed) ?? 0, errors_prevented: int(body.errors_prevented) ?? 0,
    notes: body.notes
  };
  const id = existing ? (update('business_impact', existing.id, payload), existing.id) : insert('business_impact', payload);
  return get('SELECT * FROM business_impact WHERE id = ?', id);
});

PATCH('/api/impact/:id', (p, _q, body) => {
  update('business_impact', p.id, body);
  return get('SELECT * FROM business_impact WHERE id = ?', p.id);
});

DELETE('/api/impact/:id', (p) => {
  const r = get('SELECT * FROM business_impact WHERE id = ?', p.id) || notFound('Entry not found');
  remove('business_impact', p.id);
  return { deleted: true, id: Number(p.id) };
});

/* ================================================================== */
/* Aggregate views                                                     */
/* ================================================================== */
GET('/api/dashboard', (_p, q) => K.dashboard(dateOr(q)));
GET('/api/weekly', (_p, q) => K.weekly(dateOr(q)));
GET('/api/scorecards', (_p, q) => K.scorecards(dateOr(q)));
GET('/api/stagnant', (_p, q) => K.stagnantProjects(dateOr(q)));
GET('/api/priorities', (_p, q) => K.nextDayPriorities(dateOr(q)));

GET('/api/today', (_p, q) => {
  const date = dateOr(q);
  const userId = q.user_id ? Number(q.user_id) : null;
  const d = K.dashboard(date);
  const card = userId ? d.scorecards.find((s) => s.user.id === userId) : null;
  return {
    date, date_label: D.formatLong(date), day_name: D.dayName(date), today: D.today(),
    user_id: userId, scorecard: card, team: d,
    my_projects: userId ? d.projects.filter((p) => p.owner_id === userId || p.secondary_owner_id === userId) : d.projects,
    commitments: all(
      `SELECT c.*, p.name AS project_name FROM commitments c LEFT JOIN projects p ON p.id = c.project_id
        WHERE c.commit_date = ? ${userId ? 'AND c.user_id = ?' : ''}
        ORDER BY CASE c.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, c.id`,
      ...(userId ? [date, userId] : [date]))
  };
});

GET('/api/eod', (_p, q) => {
  const date = dateOr(q);
  return { report: buildReport('daily-team', { date }), priorities: K.nextDayPriorities(date) };
});

GET('/api/reports/:type', (p, q) => {
  const report = buildReport(p.type, { date: dateOr(q), userId: q.user_id });
  return report || notFound('Unknown report type');
});

GET('/api/kpi-history', (_p, q) => {
  const from = q.from || D.addDays(D.today(), -30);
  const to = q.to || D.today();
  return all(
    `SELECT k.*, u.name AS user_name FROM daily_kpi_snapshots k
       LEFT JOIN users u ON u.id = k.user_id
      WHERE k.snapshot_date BETWEEN ? AND ? ${q.user_id ? 'AND k.user_id = ?' : 'AND k.user_id IS NULL'}
      ORDER BY k.snapshot_date`,
    ...(q.user_id ? [from, to, q.user_id] : [from, to]));
});

POST('/api/snapshots/run', (_p, _q, body) => K.persistDailySnapshot(body.date || D.today()));

/* ================================================================== */
/* Settings                                                            */
/* ================================================================== */
GET('/api/settings', () => getSettings());
PATCH('/api/settings', (_p, _q, body) => setSettings(body));

DELETE('/api/data/:scope', (p) => {
  const tables = {
    commitments: ['commitments'],
    progress: ['progress_logs', 'project_snapshots'],
    blockers: ['blockers'],
    deployments: ['deployments'],
    incidents: ['incidents'],
    impact: ['business_impact'],
    snapshots: ['daily_kpi_snapshots'],
    everything: ['daily_kpi_snapshots', 'business_impact', 'incidents', 'production_systems',
      'deployments', 'blockers', 'progress_logs', 'project_snapshots', 'project_milestones',
      'commitments', 'projects', 'users']
  }[p.scope];
  if (!tables) bad('Unknown scope');
  const removed = {};
  transaction(() => {
    for (const t of tables) {
      removed[t] = get(`SELECT COUNT(*) AS n FROM ${t}`).n;
      run(`DELETE FROM ${t}`);
    }
  });
  return { deleted: true, scope: p.scope, removed };
});
