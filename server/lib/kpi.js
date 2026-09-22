/**
 * KPI engine. Every number shown on the dashboard is computed here so the
 * math stays in one place and every score can be explained line by line.
 */
import { all, get, run, getSettings } from '../db.js';
import * as D from './dates.js';

export const ACTIVE_STATUSES = [
  'Requirements', 'Building', 'Internal Testing', 'User Testing',
  'Ready for Deployment', 'Production', 'Monitoring', 'Blocked'
];
const ACTIVE_IN = ACTIVE_STATUSES.map(() => '?').join(', ');

export const SEVERITY_WEIGHT = { Critical: 15, High: 7, Medium: 3, Low: 1 };
export const SYSTEM_STATUS_WEIGHT = { Down: 10, Degraded: 5, Warning: 2, Healthy: 0 };

/* ------------------------------------------------------------------ */
/* Snapshots                                                           */
/* ------------------------------------------------------------------ */

/** Record a project's completion % for a day (idempotent per project/day). */
export async function ensureSnapshot(projectId, date, pct, status) {
  await run(
    `INSERT INTO project_snapshots (project_id, snapshot_date, completion_pct, status)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, snapshot_date)
     DO UPDATE SET completion_pct = excluded.completion_pct, status = excluded.status`,
    projectId, date, Number(pct) || 0, status || null
  );
}

export async function previousPct(projectId, date) {
  const row = await get(
    `SELECT completion_pct FROM project_snapshots
      WHERE project_id = ? AND snapshot_date < ?
      ORDER BY snapshot_date DESC LIMIT 1`,
    projectId, date
  );
  return row ? Number(row.completion_pct) : 0;
}

export async function pctOn(projectId, date, fallback = 0) {
  const exact = await get(
    'SELECT completion_pct FROM project_snapshots WHERE project_id = ? AND snapshot_date = ?',
    projectId, date
  );
  if (exact) return Number(exact.completion_pct);
  const before = await get(
    `SELECT completion_pct FROM project_snapshots
      WHERE project_id = ? AND snapshot_date < ?
      ORDER BY snapshot_date DESC LIMIT 1`,
    projectId, date
  );
  return before ? Number(before.completion_pct) : Number(fallback) || 0;
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export const activeProjects = async () =>
  await all(
    `SELECT p.*, o.name AS owner_name, o.color AS owner_color, s.name AS secondary_name
       FROM projects p
       LEFT JOIN users o ON o.id = p.owner_id
       LEFT JOIN users s ON s.id = p.secondary_owner_id
      WHERE p.archived = 0 AND p.status IN (${ACTIVE_IN})
      ORDER BY CASE p.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, p.name`,
    ...ACTIVE_STATUSES
  );

/**
 * Everything the project cards need for one date, in a fixed number of queries
 * regardless of how many projects there are.
 *
 * This matters because the database is remote: each query is a network
 * round-trip, so querying per project inside a loop turns a fast page into a
 * slow one. Loading once and grouping in memory keeps it flat.
 */
export async function loadDayContext(date) {
  const [todaySnaps, prevSnaps, logs, deployments, milestones, incidents, blockers, lastProgress, todos] =
    await Promise.all([
      all('SELECT project_id, completion_pct FROM project_snapshots WHERE snapshot_date = ?', date),
      all(`SELECT DISTINCT ON (project_id) project_id, completion_pct
             FROM project_snapshots WHERE snapshot_date < ?
            ORDER BY project_id, snapshot_date DESC`, date),
      all(`SELECT pl.*, u.name AS user_name FROM progress_logs pl
             LEFT JOIN users u ON u.id = pl.user_id
            WHERE pl.log_date = ? ORDER BY pl.project_id, pl.id`, date),
      all('SELECT * FROM deployments WHERE deploy_date = ?', date),
      all('SELECT * FROM project_milestones WHERE completed = 1 AND completed_date = ?', date),
      all('SELECT * FROM incidents WHERE resolved_date = ?', date),
      all(`SELECT * FROM blockers
            WHERE status IN ('Open','Waiting','Escalated') AND date_reported <= ?
            ORDER BY date_reported`, date),
      all(`SELECT project_id, MAX(d) AS d FROM (
             SELECT project_id, MAX(log_date)      AS d FROM progress_logs
              WHERE log_date <= ? GROUP BY project_id
             UNION ALL
             SELECT project_id, MAX(deploy_date)   AS d FROM deployments
              WHERE deploy_date <= ? GROUP BY project_id
             UNION ALL
             SELECT project_id, MAX(completed_date) AS d FROM project_milestones
              WHERE completed = 1 AND completed_date <= ? GROUP BY project_id
             UNION ALL
             SELECT project_id, MAX(resolved_date) AS d FROM incidents
              WHERE resolved_date <= ? GROUP BY project_id
           ) x WHERE project_id IS NOT NULL GROUP BY project_id`, date, date, date, date),
      // The to-do count behind each project's percentage.
      all(`SELECT project_id, COUNT(DISTINCT task) AS total,
                  COUNT(DISTINCT task) FILTER (WHERE status = 'Completed') AS done
             FROM commitments
            WHERE project_id IS NOT NULL AND status != 'Cancelled'
            GROUP BY project_id`)
    ]);

  const byProject = (rows) => {
    const map = new Map();
    for (const r of rows) {
      if (r.project_id === null || r.project_id === undefined) continue;
      if (!map.has(r.project_id)) map.set(r.project_id, []);
      map.get(r.project_id).push(r);
    }
    return map;
  };
  const pctMap = (rows) => new Map(rows.map((r) => [r.project_id, Number(r.completion_pct)]));

  return {
    date,
    todayPct: pctMap(todaySnaps),
    prevPct: pctMap(prevSnaps),
    logs: byProject(logs),
    deployments: byProject(deployments),
    milestones: byProject(milestones),
    incidents: byProject(incidents),
    blockers: byProject(blockers),
    lastProgress: new Map(lastProgress.map((r) => [r.project_id, r.d])),
    todos: new Map(todos.map((r) => [r.project_id, { done: Number(r.done), total: Number(r.total) }]))
  };
}

/** Active projects for a date, with their day data, in a flat set of queries. */
export async function activeProjectsWithDay(date) {
  const [projects, ctx] = await Promise.all([activeProjects(), loadDayContext(date)]);
  return Promise.all(projects.map((p) => projectDay(p, date, ctx)));
}

/**
 * Evidence that a project moved on `date`: what was logged, deployed, finished
 * or resolved that day.
 *
 * Pass a context from loadDayContext to avoid per-project queries.
 */
export async function projectDay(project, date, ctx = null) {
  const context = ctx || await loadDayContext(date);

  const prev = context.prevPct.get(project.id) ?? 0;
  const today = context.todayPct.get(project.id)
    ?? context.prevPct.get(project.id)
    ?? (Number(project.completion_pct) || 0);

  const logs = context.logs.get(project.id) || [];
  const deployments = context.deployments.get(project.id) || [];
  const milestones = context.milestones.get(project.id) || [];
  const fixedIncidents = context.incidents.get(project.id) || [];
  const openBlockers = context.blockers.get(project.id) || [];

  const evidence = [];
  if (logs.length) evidence.push(...logs.map((l) => l.completed_text));
  if (deployments.length) evidence.push(...deployments.map((d) => `Deployed: ${d.title}`));
  if (milestones.length) evidence.push(...milestones.map((m) => `Milestone: ${m.name}`));
  if (fixedIncidents.length) evidence.push(...fixedIncidents.map((i) => `Resolved: ${i.title}`));

  const lastProgress = context.lastProgress.get(project.id) || null;

  return {
    ...project,
    previous_pct: round(prev),
    today_pct: round(today),
    progress_today: round(today - prev),
    progressed: evidence.length > 0,
    evidence,
    logs,
    deployments,
    milestones_completed: milestones,
    incidents_resolved: fixedIncidents,
    blockers: openBlockers,
    blocker_summary: openBlockers.length ? openBlockers.map((b) => b.title).join('; ') : null,
    todo: context.todos.get(project.id) || { done: 0, total: 0 },
    last_progress_date: lastProgress,
    days_since_progress: lastProgress ? D.businessDaysBetween(lastProgress, date) : null
  };
}

/** Last date (on or before `date`) with real, evidenced progress. */
export async function lastProgressDate(projectId, date) {
  const candidates = (await Promise.all([
    get(`SELECT MAX(log_date) AS d FROM progress_logs
          WHERE project_id = ? AND log_date <= ?`, projectId, date),
    get('SELECT MAX(deploy_date) AS d FROM deployments WHERE project_id = ? AND deploy_date <= ?', projectId, date),
    get(`SELECT MAX(completed_date) AS d FROM project_milestones
          WHERE project_id = ? AND completed = 1 AND completed_date <= ?`, projectId, date),
    get('SELECT MAX(resolved_date) AS d FROM incidents WHERE project_id = ? AND resolved_date <= ?', projectId, date)
  ])).map((r) => r && r.d).filter(Boolean);
  return candidates.length ? candidates.sort().pop() : null;
}

/* ------------------------------------------------------------------ */
/* Component metrics                                                   */
/* ------------------------------------------------------------------ */

export async function commitmentStats(date, userId = null, pre = null) {
  const rows = pre
    ? pre.filter((c) => !userId || c.user_id === userId)
    : userId
      ? await all('SELECT * FROM commitments WHERE commit_date = ? AND user_id = ?', date, userId)
      : await all('SELECT * FROM commitments WHERE commit_date = ?', date);
  const counted = rows.filter((c) => c.status !== 'Cancelled');
  const completed = counted.filter((c) => c.status === 'Completed').length;
  return {
    total: counted.length,
    completed,
    cancelled: rows.length - counted.length,
    blocked: counted.filter((c) => c.status === 'Blocked').length,
    in_progress: counted.filter((c) => c.status === 'In Progress').length,
    not_started: counted.filter((c) => c.status === 'Not Started').length,
    rate: counted.length ? round((completed / counted.length) * 100) : 0,
    rows
  };
}

export async function deploymentStats(date, userId = null, pre = null) {
  const rows = pre ? pre.filter((d) => !userId || d.user_id === userId) : userId
    ? await all(`SELECT d.*, p.name AS project_name, u.name AS user_name FROM deployments d
             LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN users u ON u.id = d.user_id
            WHERE d.deploy_date = ? AND d.user_id = ? ORDER BY d.id`, date, userId)
    : await all(`SELECT d.*, p.name AS project_name, u.name AS user_name FROM deployments d
             LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN users u ON u.id = d.user_id
            WHERE d.deploy_date = ? ORDER BY d.id`, date);
  const byKind = (k) => rows.filter((r) => r.kind === k).length;
  return {
    total: rows.length,
    features: byKind('Feature'),
    automations: byKind('Automation'),
    systems: byKind('System Launch'),
    fixes: byKind('Fix'),
    rows
  };
}

export async function blockerStats(date, userId = null, pre = null) {
  const settings = await getSettings();
  const alertAfter = Number(settings.blocker_age_alert_days || 1);
  const params = [date];
  let sql = `SELECT b.*, p.name AS project_name, u.name AS owner_name FROM blockers b
               LEFT JOIN projects p ON p.id = b.project_id
               LEFT JOIN users u ON u.id = b.owner_id
              WHERE b.date_reported <= ?
                AND (b.status IN ('Open','Waiting','Escalated') OR b.resolved_date >= ?)`;
  params.push(date);
  if (userId) { sql += ' AND b.owner_id = ?'; params.push(userId); }
  sql += ' ORDER BY b.date_reported';

  const source = pre ? pre.filter((b) => !userId || b.owner_id === userId) : await all(sql, ...params);
  const rows = source.map((b) => {
    const endDate = b.status === 'Resolved' && b.resolved_date ? b.resolved_date : date;
    const days = D.businessDaysBetween(b.date_reported, endDate);
    return { ...b, days_blocked: days, age_band: ageBand(days), aging: days > alertAfter };
  });

  const open = rows.filter((b) => b.status !== 'Resolved');
  return {
    open: open.length,
    aging: open.filter((b) => b.aging).length,
    escalated: open.filter((b) => b.status === 'Escalated').length,
    created_today: rows.filter((b) => b.date_reported === date).length,
    resolved_today: rows.filter((b) => b.status === 'Resolved' && b.resolved_date === date).length,
    rows,
    open_rows: open
  };
}

const ageBand = (days) => (days <= 0 ? 'Same Day' : days === 1 ? '1 Day' : days === 2 ? '2 Days' : '3+ Days');

export async function productionStats(date, userId = null, pre = null) {
  const params = [date, date];
  let sql = `SELECT i.*, s.name AS system_name, p.name AS project_name, u.name AS reporter_name
               FROM incidents i
               LEFT JOIN production_systems s ON s.id = i.system_id
               LEFT JOIN projects p ON p.id = i.project_id
               LEFT JOIN users u ON u.id = i.reported_by
              WHERE i.reported_date <= ?
                AND (i.status != 'Resolved' OR i.resolved_date >= ?)`;
  if (userId) { sql += ' AND (i.reported_by = ? OR s.owner_id = ?)'; params.push(userId, userId); }
  sql += " ORDER BY CASE i.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END";

  const rows = pre
    ? pre.incidents.filter((i) => !userId || i.reported_by === userId || i.system_owner_id === userId)
    : await all(sql, ...params);
  const openRows = rows.filter((i) => i.status !== 'Resolved');
  const bySeverity = (s) => openRows.filter((i) => i.severity === s).length;

  const systemRows = pre
    ? pre.systems.filter((s) => !userId || s.owner_id === userId)
    : await all(
        `SELECT s.*, u.name AS owner_name FROM production_systems s
           LEFT JOIN users u ON u.id = s.owner_id ${userId ? 'WHERE s.owner_id = ?' : ''} ORDER BY s.name`,
        ...(userId ? [userId] : []));
  const systems = systemRows.map((s) => {
    const total = (s.successful_runs || 0) + (s.failed_runs || 0);
    return { ...s, total_runs: total, success_rate: total ? round((s.successful_runs / total) * 100) : 100 };
  });

  const totalRuns = systems.reduce((a, s) => a + s.total_runs, 0);
  const okRuns = systems.reduce((a, s) => a + (s.successful_runs || 0), 0);

  return {
    open: openRows.length,
    critical: bySeverity('Critical'),
    high: bySeverity('High'),
    medium: bySeverity('Medium'),
    low: bySeverity('Low'),
    resolved_today: rows.filter((i) => i.status === 'Resolved' && i.resolved_date === date).length,
    rows,
    open_rows: openRows,
    systems,
    unhealthy: systems.filter((s) => s.status !== 'Healthy'),
    overall_success_rate: totalRuns ? round((okRuns / totalRuns) * 100) : 100
  };
}

/* ------------------------------------------------------------------ */
/* Daily execution score (0-100), fully itemised                       */
/* ------------------------------------------------------------------ */

export function dailyScore({ commitments, projects, production, blockers }) {
  const lines = [];

  // 50 pts - daily commitment completion
  let commitPts = 0;
  if (commitments.total === 0) {
    lines.push({ label: 'Daily commitment completion', points: 0, max: 50, detail: 'No commitments were logged for this day.' });
  } else {
    commitPts = (commitments.completed / commitments.total) * 50;
    lines.push({
      label: 'Daily commitment completion', points: round(commitPts), max: 50,
      detail: `${commitments.completed} of ${commitments.total} completed (${commitments.rate}%)`
    });
  }

  // 25 pts - active projects progressed
  let projectPts = 0;
  if (projects.active === 0) {
    projectPts = 25;
    lines.push({ label: 'Active projects progressed', points: 25, max: 25, detail: 'No active projects.' });
  } else {
    projectPts = (projects.progressed / projects.active) * 25;
    lines.push({
      label: 'Active projects progressed', points: round(projectPts), max: 25,
      detail: `${projects.progressed} of ${projects.active} projects moved forward`
    });
  }

  // 15 pts - production quality.
  // A system that is Degraded *because* of an open incident must not be
  // penalised twice, so each system contributes the worse of the two signals.
  let deduction = 0;
  const notes = [];
  const openIssues = production.open_rows || [];
  const seen = new Set();
  for (const sys of production.systems || []) {
    const issues = openIssues.filter((i) => i.system_id === sys.id);
    issues.forEach((i) => seen.add(i.id));
    const issueWeight = issues.reduce((a, i) => a + (SEVERITY_WEIGHT[i.severity] || 0), 0);
    const statusWeight = SYSTEM_STATUS_WEIGHT[sys.status] || 0;
    const worst = Math.max(issueWeight, statusWeight);
    if (worst > 0) {
      deduction += worst;
      notes.push(issueWeight >= statusWeight && issues.length
        ? `${sys.name}: ${issues.map((i) => i.severity.toLowerCase()).join(', ')} issue (-${worst})`
        : `${sys.name} is ${sys.status} (-${worst})`);
    }
  }
  for (const i of openIssues.filter((i) => !seen.has(i.id))) {
    const w = SEVERITY_WEIGHT[i.severity] || 0;
    if (w) { deduction += w; notes.push(`${i.title} (${i.severity.toLowerCase()}) (-${w})`); }
  }
  const qualityPts = Math.max(0, 15 - deduction);
  lines.push({
    label: 'Production quality', points: round(qualityPts), max: 15,
    detail: notes.length ? notes.join(', ') : 'No open production issues.'
  });

  // 10 pts - blocker management
  let blockerPts = 10;
  const bNotes = [];
  const stale = blockers.open_rows.filter((b) => b.aging && b.status !== 'Escalated');
  const unrouted = blockers.open_rows.filter((b) => !b.person_needed);
  if (stale.length) { blockerPts -= stale.length * 4; bNotes.push(`${stale.length} blocker(s) aging without escalation (-${stale.length * 4})`); }
  if (unrouted.length) { blockerPts -= unrouted.length * 2; bNotes.push(`${unrouted.length} blocker(s) with nobody assigned (-${unrouted.length * 2})`); }
  if (blockers.resolved_today) { blockerPts += blockers.resolved_today * 2; bNotes.push(`${blockers.resolved_today} blocker(s) resolved today (+${blockers.resolved_today * 2})`); }
  blockerPts = Math.max(0, Math.min(10, blockerPts));
  lines.push({
    label: 'Blocker management', points: round(blockerPts), max: 10,
    detail: bNotes.length ? bNotes.join(', ') : 'No open blockers.'
  });

  const total = round(commitPts + projectPts + qualityPts + blockerPts);
  return { total, grade: grade(total), lines };
}

const grade = (s) => (s >= 90 ? 'Excellent' : s >= 80 ? 'On Track' : s >= 65 ? 'Watch' : s >= 40 ? 'Behind' : 'At Risk');

/* ------------------------------------------------------------------ */
/* Assembled views                                                     */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 *   trends  also fetch the day-by-day history the dashboard charts need. Off by
 *           default, because the Today page and the reports share this builder
 *           and neither draws a trend — two queries nobody reads is two
 *           round trips on every page view.
 */
export async function dashboard(date, { trends = false } = {}) {
  const settings = await getSettings();
  const [projects, team] = await Promise.all([activeProjectsWithDay(date), loadTeamDayContext(date)]);
  const progressed = projects.filter((p) => p.progressed);
  const commitments = await commitmentStats(date, null, team.commitments);
  const deployments = await deploymentStats(date, null, team.deployments);
  const blockers = await blockerStats(date, null, team.blockers);
  const production = await productionStats(date, null, team.production);

  const projectSummary = {
    active: projects.length,
    progressed: progressed.length,
    rate: projects.length ? round((progressed.length / projects.length) * 100) : 0,
    avg_progress: projects.length ? round(projects.reduce((a, p) => a + p.progress_today, 0) / projects.length) : 0
  };

  const score = dailyScore({ commitments, projects: projectSummary, production, blockers });

  return {
    date,
    day_name: D.dayName(date),
    date_label: D.formatLong(date),
    is_business_day: D.isBusinessDay(date),
    settings,
    kpis: {
      commitments: { ...commitments, target: Number(settings.commitment_target) },
      projects: { ...projectSummary, target: Number(settings.progressed_target) },
      deployments,
      blockers,
      production: { ...production, target: Number(settings.critical_issue_target) }
    },
    score,
    projects,
    scorecards: await scorecards(date, projects, team),
    stagnant: await stagnantProjects(date, projects),
    priorities: await nextDayPriorities(date, projects, team),
    history: trends ? await kpiHistory(date, TREND_DAYS) : [],
    commitment_series: trends ? await commitmentSeries(date, TREND_DAYS) : []
  };
}

/* How far back the dashboard trends look. Both are one indexed query each. */
const TREND_DAYS = 30;

/**
 * The recorded daily rollups, oldest first. This is the cheap source for every
 * trend on the dashboard: one row per day, already totalled, rather than
 * recomputing each day from the raw tables.
 */
export async function kpiHistory(date, days = TREND_DAYS) {
  const rows = await all(
    `SELECT snapshot_date, commitments_total, commitments_completed, completion_rate,
            projects_active, projects_progressed, deployments, blockers_open,
            blockers_created, blockers_resolved, critical_issues, open_issues, daily_score
       FROM daily_kpi_snapshots
      WHERE user_id IS NULL AND snapshot_date BETWEEN ? AND ?
      ORDER BY snapshot_date`,
    D.addDays(date, -(days - 1)), date);
  return rows.map((r) => ({
    date: r.snapshot_date,
    score: round(Number(r.daily_score)),
    completion_rate: round(Number(r.completion_rate)),
    commitments_total: Number(r.commitments_total),
    commitments_completed: Number(r.commitments_completed),
    projects_active: Number(r.projects_active),
    projects_progressed: Number(r.projects_progressed),
    progressed_rate: r.projects_active
      ? round((Number(r.projects_progressed) / Number(r.projects_active)) * 100) : 0,
    deployments: Number(r.deployments),
    blockers_open: Number(r.blockers_open),
    blockers_created: Number(r.blockers_created),
    blockers_resolved: Number(r.blockers_resolved),
    critical_issues: Number(r.critical_issues),
    open_issues: Number(r.open_issues)
  }));
}

/** Commitments per person per day: what each person took on and finished. */
export async function commitmentSeries(date, days = TREND_DAYS) {
  const rows = await all(
    `SELECT user_id, commit_date, COUNT(*) AS total,
            COUNT(*) FILTER (WHERE expected_today = 1) AS taken,
            COUNT(*) FILTER (WHERE status = 'Completed') AS finished
       FROM commitments
      WHERE commit_date BETWEEN ? AND ?
      GROUP BY user_id, commit_date
      ORDER BY commit_date`,
    D.addDays(date, -(days - 1)), date);
  return rows.map((r) => ({
    user_id: Number(r.user_id),
    date: r.commit_date,
    all: Number(r.total),
    taken: Number(r.taken),
    finished: Number(r.finished)
  }));
}

/**
 * Everything the team-level and per-person stats need for one date, fetched
 * once. Each scorecard used to run its own five queries, which is six times
 * the round-trips for no extra information.
 */
export async function loadTeamDayContext(date) {
  const [commitments, deployments, blockers, incidents, systems] = await Promise.all([
    all('SELECT * FROM commitments WHERE commit_date = ?', date),
    all(`SELECT d.*, p.name AS project_name, u.name AS user_name FROM deployments d
           LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN users u ON u.id = d.user_id
          WHERE d.deploy_date = ? ORDER BY d.id`, date),
    all(`SELECT b.*, p.name AS project_name, u.name AS owner_name FROM blockers b
           LEFT JOIN projects p ON p.id = b.project_id
           LEFT JOIN users u ON u.id = b.owner_id
          WHERE b.date_reported <= ?
            AND (b.status IN ('Open','Waiting','Escalated') OR b.resolved_date >= ?)
          ORDER BY b.date_reported`, date, date),
    all(`SELECT i.*, s.name AS system_name, s.owner_id AS system_owner_id,
                p.name AS project_name, u.name AS reporter_name
           FROM incidents i
           LEFT JOIN production_systems s ON s.id = i.system_id
           LEFT JOIN projects p ON p.id = i.project_id
           LEFT JOIN users u ON u.id = i.reported_by
          WHERE i.reported_date <= ? AND (i.status != 'Resolved' OR i.resolved_date >= ?)
          ORDER BY CASE i.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2
                                   WHEN 'Medium' THEN 3 ELSE 4 END, i.reported_date DESC`, date, date),
    all(`SELECT s.*, u.name AS owner_name FROM production_systems s
           LEFT JOIN users u ON u.id = s.owner_id ORDER BY s.name`)
  ]);
  return { commitments, deployments, blockers, production: { incidents, systems } };
}

export async function scorecards(date, projectsPre = null, teamPre = null) {
  const projects = projectsPre || await activeProjectsWithDay(date);
  // Managers are viewers, not contributors, so they never appear as a scorecard.
  const team = teamPre || await loadTeamDayContext(date);
  const users = await all('SELECT * FROM users WHERE active = 1 AND is_manager = 0 ORDER BY sort_order, id');

  return Promise.all(users.map(async (u) => {
    const commitments = await commitmentStats(date, u.id, team.commitments);
    const mine = projects.filter((p) => p.owner_id === u.id || p.secondary_owner_id === u.id);
    const myProgressed = mine.filter((p) => p.progressed);
    const deployments = await deploymentStats(date, u.id, team.deployments);
    const blockers = await blockerStats(date, u.id, team.blockers);
    const production = await productionStats(date, u.id, team.production);
    const summary = {
      active: mine.length,
      progressed: myProgressed.length,
      rate: mine.length ? round((myProgressed.length / mine.length) * 100) : 0,
      avg_progress: mine.length ? round(mine.reduce((a, p) => a + p.progress_today, 0) / mine.length) : 0
    };
    return {
      user: u,
      commitments,
      projects: summary,
      project_rows: mine,
      deployments,
      blockers,
      production,
      score: dailyScore({ commitments, projects: summary, production, blockers })
    };
  }));
}

export async function stagnantProjects(date, projectsPre = null) {
  const limit = Number((await getSettings()).stagnation_days || 2);
  const projects = projectsPre || await activeProjectsWithDay(date);
  return projects
    .filter((p) => p.days_since_progress === null || p.days_since_progress >= limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      owner_name: p.owner_name,
      status: p.status,
      priority: p.priority,
      completion_pct: p.today_pct,
      last_progress_date: p.last_progress_date,
      days_since_progress: p.days_since_progress,
      blocker: p.blocker_summary,
      next_step: p.next_step,
      message: p.last_progress_date
        ? `Nothing logged for ${p.days_since_progress} business day${p.days_since_progress === 1 ? '' : 's'}`
        : 'Nothing logged yet'
    }))
    .sort((a, b) => (b.days_since_progress ?? 99) - (a.days_since_progress ?? 99));
}

/** Suggestions only — the team decides. Ordered by the six rules in the spec. */
export async function nextDayPriorities(date, projectsPre = null, teamPre = null) {
  const projects = projectsPre || await activeProjectsWithDay(date);
  const out = [];
  const push = (category, item) => out.push({ category, ...item });

  // 1. Unfinished P1/P2 commitments
  const unfinished = await all(
    `SELECT c.*, u.name AS user_name, p.name AS project_name FROM commitments c
       LEFT JOIN users u ON u.id = c.user_id LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.commit_date = ? AND c.status NOT IN ('Completed','Cancelled')
        AND c.priority IN ('P1','P2')
      ORDER BY c.priority`,
    date
  );
  for (const c of unfinished) {
    push('Unfinished priority work', {
      title: c.task, owner: c.user_name, project: c.project_name, priority: c.priority,
      detail: `${c.priority} · left ${c.status.toLowerCase()} today${c.carryover_reason ? ` · ${c.carryover_reason}` : ''}`
    });
  }

  // 2. Blockers that cleared today
  for (const b of await all(
    `SELECT b.*, p.name AS project_name, u.name AS owner_name FROM blockers b
       LEFT JOIN projects p ON p.id = b.project_id LEFT JOIN users u ON u.id = b.owner_id
      WHERE b.status = 'Resolved' AND b.resolved_date = ?`, date)) {
    push('Newly unblocked', {
      title: b.title, owner: b.owner_name, project: b.project_name, priority: b.priority,
      detail: `Unblocked today — ${b.resolution || 'resume this work'}`
    });
  }

  // 3. Projects closest to deployment
  for (const p of projects.filter((p) => p.today_pct >= 75 && !['Production', 'Monitoring'].includes(p.status))
    .sort((a, b) => b.today_pct - a.today_pct)) {
    push('Closest to deployment', {
      title: p.name, owner: p.owner_name, project: p.name, priority: p.priority,
      detail: `${p.today_pct}% complete · ${p.status} · next: ${p.next_step || 'set a next step'}`
    });
  }

  // 4. Deadlines approaching or passed
  for (const p of projects.filter((p) => p.target_date && D.businessDaysBetween(date, p.target_date) <= 3)) {
    const overdue = p.target_date < date;
    push('Deadline approaching', {
      title: p.name, owner: p.owner_name, project: p.name, priority: p.priority,
      detail: overdue
        ? `Target date ${D.formatShort(p.target_date)} has passed · ${p.today_pct}% complete`
        : `Due ${D.formatShort(p.target_date)} · ${p.today_pct}% complete`
    });
  }

  // 5. Open production issues
  for (const i of (await productionStats(date, null, teamPre ? teamPre.production : null)).open_rows) {
    push('Production issue', {
      title: i.title, owner: i.reporter_name, project: i.project_name || i.system_name, priority: i.severity,
      detail: `${i.severity} · ${i.system_name || 'system'} · open since ${D.formatShort(i.reported_date)}`
    });
  }

  // 6. Stagnant projects
  for (const s of await stagnantProjects(date, projects)) {
    push('Not moving', {
      title: s.name, owner: s.owner_name, project: s.name, priority: s.priority,
      detail: `${s.message}${s.blocker ? ` · blocked by ${s.blocker}` : ''}`
    });
  }

  return out.map((item, i) => ({ rank: i + 1, ...item }));
}

/* ------------------------------------------------------------------ */
/* Weekly rollup                                                       */
/* ------------------------------------------------------------------ */

export async function weekly(date) {
  const days = D.weekDays(date);
  const rows = await Promise.all(days.map(async (d) => {
    const [projects, team] = await Promise.all([activeProjectsWithDay(d), loadTeamDayContext(d)]);
    const c = await commitmentStats(d, null, team.commitments);
    const progressed = projects.filter((p) => p.progressed).length;
    const dep = await deploymentStats(d, null, team.deployments);
    const b = await blockerStats(d, null, team.blockers);
    const prod = await productionStats(d, null, team.production);
    const completed = (await get(
      `SELECT COUNT(*) AS n FROM project_snapshots ps
        JOIN projects p ON p.id = ps.project_id
       WHERE ps.snapshot_date = ? AND ps.completion_pct >= 100
         AND NOT EXISTS (SELECT 1 FROM project_snapshots q
                          WHERE q.project_id = ps.project_id AND q.snapshot_date < ? AND q.completion_pct >= 100)`,
      d, d
    )).n;
    const summary = { active: projects.length, progressed, rate: projects.length ? round((progressed / projects.length) * 100) : 0 };
    return {
      date: d,
      day: D.dayName(d),
      label: D.formatShort(d),
      commitments_total: c.total,
      commitments_completed: c.completed,
      completion_rate: c.rate,
      projects_active: projects.length,
      projects_progressed: progressed,
      projects_progressed_rate: summary.rate,
      avg_project_progress: projects.length ? round(projects.reduce((a, p) => a + p.progress_today, 0) / projects.length) : 0,
      deployments: dep.total,
      blockers_created: b.created_today,
      blockers_resolved: b.resolved_today,
      blockers_open: b.open,
      incidents: prod.rows.filter((i) => i.reported_date === d).length,
      critical_issues: prod.critical,
      projects_completed: completed,
      score: dailyScore({ commitments: c, projects: summary, production: prod, blockers: b }).total
    };
  }));

  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const withData = rows.filter((r) => r.commitments_total > 0);
  return {
    week_start: days[0],
    week_end: days[4],
    days: rows,
    totals: {
      commitments_total: sum('commitments_total'),
      commitments_completed: sum('commitments_completed'),
      completion_rate: sum('commitments_total') ? round((sum('commitments_completed') / sum('commitments_total')) * 100) : 0,
      deployments: sum('deployments'),
      blockers_created: sum('blockers_created'),
      blockers_resolved: sum('blockers_resolved'),
      incidents: sum('incidents'),
      projects_completed: sum('projects_completed'),
      avg_progressed_rate: withData.length ? round(withData.reduce((a, r) => a + r.projects_progressed_rate, 0) / withData.length) : 0,
      avg_score: withData.length ? round(withData.reduce((a, r) => a + r.score, 0) / withData.length) : 0
    }
  };
}

/* ------------------------------------------------------------------ */
/* Business impact (reporting only — never affects the daily score)    */
/* ------------------------------------------------------------------ */

export async function businessImpact() {
  const rows = (await all(
    `SELECT bi.*, p.name AS project_name, p.status AS project_status, u.name AS owner_name
       FROM business_impact bi
       LEFT JOIN projects p ON p.id = bi.project_id
       LEFT JOIN users u ON u.id = p.owner_id
      ORDER BY p.name`
  )).map((r) => {
    const hoursWeek = round(((r.minutes_per_run || 0) * (r.runs_per_week || 0)) / 60);
    const hoursMonth = round(hoursWeek * 4.33);
    return {
      ...r,
      hours_saved_week: hoursWeek,
      hours_saved_month: hoursMonth,
      monthly_savings: round(hoursMonth * (r.hourly_cost || 0))
    };
  });
  const sum = (k) => round(rows.reduce((a, r) => a + (r[k] || 0), 0));
  return {
    rows,
    totals: {
      hours_saved_week: sum('hours_saved_week'),
      hours_saved_month: sum('hours_saved_month'),
      monthly_savings: sum('monthly_savings'),
      annual_savings: round(sum('monthly_savings') * 12),
      revenue_supported: sum('revenue_supported'),
      leads_processed: sum('leads_processed'),
      errors_prevented: sum('errors_prevented')
    }
  };
}

/* ------------------------------------------------------------------ */
/* Persisted daily snapshot (history is never overwritten by a new day)*/
/* ------------------------------------------------------------------ */

export async function persistDailySnapshot(date, prebuilt = null) {
  const data = prebuilt || await dashboard(date);
  const write = async (userId, c, proj, dep, blk, prod, score) => {
    await run(
      `INSERT INTO daily_kpi_snapshots
         (snapshot_date, user_id, commitments_total, commitments_completed, completion_rate,
          projects_active, projects_progressed, avg_progress_pct, deployments, blockers_open,
          blockers_created, blockers_resolved, critical_issues, open_issues, daily_score, breakdown_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(snapshot_date, COALESCE(user_id, -1)) DO UPDATE SET
         commitments_total = excluded.commitments_total,
         commitments_completed = excluded.commitments_completed,
         completion_rate = excluded.completion_rate,
         projects_active = excluded.projects_active,
         projects_progressed = excluded.projects_progressed,
         avg_progress_pct = excluded.avg_progress_pct,
         deployments = excluded.deployments,
         blockers_open = excluded.blockers_open,
         blockers_created = excluded.blockers_created,
         blockers_resolved = excluded.blockers_resolved,
         critical_issues = excluded.critical_issues,
         open_issues = excluded.open_issues,
         daily_score = excluded.daily_score,
         breakdown_json = excluded.breakdown_json`,
      date, userId, c.total, c.completed, c.rate, proj.active, proj.progressed, proj.avg_progress,
      dep.total, blk.open, blk.created_today, blk.resolved_today, prod.critical, prod.open,
      score.total, JSON.stringify(score.lines)
    );
  };

  const k = data.kpis;
  await write(null, k.commitments, k.projects, k.deployments, k.blockers, k.production, data.score);
  for (const sc of data.scorecards) {
    await write(sc.user.id, sc.commitments, sc.projects, sc.deployments, sc.blockers, sc.production, sc.score);
  }
  return data;
}

/**
 * Record just today's team row from a dashboard that has already been built.
 *
 * Without this the trends have holes: a day is only written when somebody
 * closes it out, and a day nobody closes leaves a gap in every chart. Looking
 * at the dashboard is enough to record the day, and it costs one insert
 * because the numbers are already in hand.
 */
export async function recordTeamDay(date, data) {
  if (date !== D.today()) return;   // history is never rewritten by a later visit
  const k = data.kpis;
  await run(
    `INSERT INTO daily_kpi_snapshots
       (snapshot_date, user_id, commitments_total, commitments_completed, completion_rate,
        projects_active, projects_progressed, avg_progress_pct, deployments, blockers_open,
        blockers_created, blockers_resolved, critical_issues, open_issues, daily_score, breakdown_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(snapshot_date, COALESCE(user_id, -1)) DO UPDATE SET
       commitments_total = excluded.commitments_total,
       commitments_completed = excluded.commitments_completed,
       completion_rate = excluded.completion_rate,
       projects_active = excluded.projects_active,
       projects_progressed = excluded.projects_progressed,
       avg_progress_pct = excluded.avg_progress_pct,
       deployments = excluded.deployments,
       blockers_open = excluded.blockers_open,
       blockers_created = excluded.blockers_created,
       blockers_resolved = excluded.blockers_resolved,
       critical_issues = excluded.critical_issues,
       open_issues = excluded.open_issues,
       daily_score = excluded.daily_score,
       breakdown_json = excluded.breakdown_json`,
    date, null, k.commitments.total, k.commitments.completed, k.commitments.rate,
    k.projects.active, k.projects.progressed, k.projects.avg_progress,
    k.deployments.total, k.blockers.open, k.blockers.created_today, k.blockers.resolved_today,
    k.production.critical, k.production.open, data.score.total, JSON.stringify(data.score.lines));
}

export function round(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}
