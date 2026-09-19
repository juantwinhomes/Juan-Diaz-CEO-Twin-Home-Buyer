import { api } from '../api.js';
import * as U from '../ui.js';
import { state, go, dateNote, isToday } from '../app.js';

export async function page(ctx) {
  const d = await api.get('/dashboard', { date: state.date });
  const k = d.kpis;
  const s = d.settings;

  const commitMet = k.commitments.rate >= Number(s.commitment_target);
  const progressMet = k.projects.rate >= Number(s.progressed_target);

  const kpis = [
    U.kpiCard({
      label: 'Daily Commitment Completion',
      value: U.fmt.pct(k.commitments.rate),
      meta: `${k.commitments.completed} / ${k.commitments.total} completed`,
      foot: U.targetChip(commitMet, `Target ${s.commitment_target}%+`),
      accent: commitMet ? 'green' : k.commitments.rate >= 60 ? 'yellow' : 'red',
      iconName: 'commitments',
      action: 'view-commitments'
    }),
    U.kpiCard({
      label: 'Projects Progressed',
      value: U.fmt.pct(k.projects.rate),
      meta: `${k.projects.progressed} / ${k.projects.active} active projects`,
      foot: `<span class="muted">Logged, deployed or resolved today</span>`,
      accent: progressMet ? 'green' : k.projects.rate >= 60 ? 'yellow' : 'orange',
      iconName: 'projects',
      action: 'view-projects'
    }),
    U.kpiCard({
      label: 'Deployed Today',
      value: String(k.deployments.total),
      unit: k.deployments.total === 1 ? 'deployment' : 'deployments',
      meta: deployMeta(k.deployments),
      foot: `<span class="muted">${U.icon('chevron', 11)} Click to see what shipped</span>`,
      accent: k.deployments.total ? 'blue' : 'gray',
      iconName: 'rocket',
      action: 'view-deployments'
    }),
    U.kpiCard({
      label: 'Blocked Items',
      value: String(k.blockers.open),
      unit: k.blockers.open === 1 ? 'blocked' : 'blocked',
      meta: k.blockers.aging
        ? `<span style="color:var(--orange);font-weight:600">${k.blockers.aging} blocked more than 1 business day</span>`
        : k.blockers.open ? 'All reported within the last business day' : 'Nothing is blocked',
      foot: k.blockers.resolved_today ? `<span class="badge green">${k.blockers.resolved_today} resolved today</span>` : '',
      accent: k.blockers.aging ? 'orange' : k.blockers.open ? 'yellow' : 'green',
      iconName: 'blockers',
      action: 'view-blockers'
    }),
    U.kpiCard({
      label: 'Production Issues',
      value: String(k.production.critical),
      unit: 'critical',
      meta: severityMeta(k.production),
      foot: U.targetChip(k.production.critical === 0, `Target ${s.critical_issue_target} critical`),
      accent: k.production.critical ? 'red' : k.production.open ? 'yellow' : 'green',
      iconName: 'production',
      action: 'view-production'
    })
  ].join('');

  const html = `
    ${dateNote()}
    <div class="section"><div class="grid grid-kpi">${kpis}</div></div>

    <div class="section grid grid-2" style="align-items:start">
      ${scoreCard(d.score, s)}
      ${prioritiesCard(d.priorities)}
    </div>

    ${d.stagnant.length ? stagnationSection(d.stagnant) : ''}

    <div class="section">
      <div class="section-head">
        <h2>Team member daily scorecards</h2>
        <span class="sub">${U.fmt.longDate(d.date)}</span>
      </div>
      <div class="grid grid-2">${d.scorecards.map(scorecard).join('') ||
        U.empty('No team members yet', 'Add people on the Team page.')}</div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Active projects</h2>
        <span class="sub">What moved today, and by how much</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-action="view-projects">Open projects ${U.icon('chevron', 13)}</button>
      </div>
      <div class="card">${activeProjectTable(d.projects)}</div>
    </div>`;

  return {
    title: 'Dashboard',
    subtitle: `${d.day_name}, ${d.date_label}${isToday() ? '' : ' (historical view)'}`,
    html,
    mount(root) {
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'view-deployments') showDeployments(k.deployments, d.date);
        if (action === 'view-commitments') go('#/commitments');
        if (action === 'view-projects') go('#/projects');
        if (action === 'view-blockers') go('#/blockers');
        if (action === 'view-production') go('#/production');
        if (action === 'view-score') showScoreDetail(d.score);
      });
      root.querySelectorAll('[data-project]').forEach((el) =>
        el.addEventListener('click', () => go(`#/project/${el.dataset.project}`)));
    }
  };
}

/* ------------------------------------------------------------ Pieces */
const deployMeta = (dep) => {
  const parts = [];
  if (dep.features) parts.push(`${dep.features} feature${dep.features > 1 ? 's' : ''}`);
  if (dep.automations) parts.push(`${dep.automations} automation${dep.automations > 1 ? 's' : ''}`);
  if (dep.systems) parts.push(`${dep.systems} system launch${dep.systems > 1 ? 'es' : ''}`);
  if (dep.fixes) parts.push(`${dep.fixes} fix${dep.fixes > 1 ? 'es' : ''}`);
  return parts.length ? U.esc(parts.join(' · ')) : 'Nothing deployed yet';
};

const severityMeta = (prod) => {
  const parts = [];
  if (prod.high) parts.push(`${prod.high} high`);
  if (prod.medium) parts.push(`${prod.medium} medium`);
  if (prod.low) parts.push(`${prod.low} low`);
  return parts.length
    ? `${prod.open} open · ${U.esc(parts.join(', '))}`
    : 'No open production issues';
};

function scoreCard(score, settings) {
  const met = score.total >= Number(settings.daily_score_target || 80);
  return `<div class="card">
    <div class="card-head">
      <h2>Daily Execution Score</h2>
      <span class="sub">What got done today</span>
      <span class="spacer"></span>
      <span class="badge ${met ? 'green' : score.total >= 65 ? 'yellow' : 'orange'}">${U.esc(score.grade)}</span>
    </div>
    <div class="card-body">
      <div class="row" style="align-items:baseline;gap:10px;margin-bottom:14px">
        <span style="font-size:42px;font-weight:650;letter-spacing:-.03em;line-height:1">${score.total}</span>
        <span class="muted">/ 100</span>
        <span class="spacer"></span>
        <span class="small muted">Target ${U.esc(settings.daily_score_target || 80)}+</span>
      </div>
      <div class="score-lines">
        ${score.lines.map((l) => `
          <div class="score-line">
            <div class="top"><b>${U.esc(l.label)}</b><span class="pts">${l.points} / ${l.max}</span></div>
            <div class="bar sm" style="margin-top:5px">
              <div class="bar-fill ${l.points / l.max >= 0.8 ? 'gain' : ''}" style="width:${(l.points / l.max) * 100}%"></div>
            </div>
            <div class="d">${U.esc(l.detail)}</div>
          </div>`).join('')}
      </div>
      <div class="callout" style="margin-top:14px">${U.icon('target', 15)}
        <div>No points for hours worked, lines of code, prompts written, or creating automations nobody asked for.</div>
      </div>
    </div>
  </div>`;
}

function prioritiesCard(priorities) {
  const groups = {};
  for (const p of priorities) (groups[p.category] ||= []).push(p);
  return `<div class="card">
    <div class="card-head">
      <h2>Recommended next priorities</h2>
      <span class="spacer"></span>
      <span class="badge gray">${priorities.length} suggestion${priorities.length === 1 ? '' : 's'}</span>
    </div>
    <div class="card-body tight" style="max-height:430px;overflow-y:auto">
      ${priorities.length ? Object.entries(groups).map(([cat, items]) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div class="small" style="font-weight:650;color:var(--text-2);margin-bottom:6px">${U.esc(cat)}</div>
          ${items.map((p) => `
            <div class="row" style="gap:8px;padding:4px 0;flex-wrap:nowrap;align-items:flex-start">
              <span class="muted small" style="min-width:18px">${p.rank}.</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:500">${U.esc(p.title)}</div>
                <div class="small muted">${U.esc(p.detail)}</div>
              </div>
              ${p.owner ? `<span class="chip nowrap">${U.esc(p.owner)}</span>` : ''}
            </div>`).join('')}
        </div>`).join('')
      : U.empty('Nothing queued', 'No unfinished priority work, blockers or production issues.')}
    </div>
    <div class="card-body" style="border-top:1px solid var(--border);padding-top:11px">
      <p class="small muted">Suggestions only — the team decides what to pick up.</p>
    </div>
  </div>`;
}

function stagnationSection(stagnant) {
  return `<div class="section">
    <div class="card" style="border-color:var(--orange-bd)">
      <div class="card-head" style="background:var(--orange-bg);border-radius:12px 12px 0 0">
        <span style="color:var(--orange)">${U.icon('alert', 17)}</span>
        <h2>Projects not moving</h2>
        <span class="sub">Nothing logged</span>
      </div>
      ${U.table(
        ['Project', 'Owner', 'Last progress', 'Current blocker', 'Next step'],
        stagnant,
        (s) => `<tr class="row-warn">
          <td><a href="#/project/${s.id}"><b>${U.esc(s.name)}</b></a>
              <div class="small" style="color:var(--orange);font-weight:600">${U.icon('alert', 11)} ${U.esc(s.message)}</div></td>
          <td class="nowrap">${U.esc(s.owner_name || 'Unassigned')}</td>
          <td class="nowrap">${s.last_progress_date ? U.fmt.date(s.last_progress_date) : '<span class="muted">Never</span>'}</td>
          <td>${s.blocker ? U.esc(s.blocker) : '<span class="muted">None recorded</span>'}</td>
          <td>${s.next_step ? U.esc(s.next_step) : '<span class="muted">Not set</span>'}</td>
        </tr>`
      )}
    </div>
  </div>`;
}

function scorecard(sc) {
  const c = sc.commitments;
  const rate = c.total ? Math.round((c.completed / c.total) * 100) : 0;
  return `<div class="card">
    <div class="scorecard-head">
      ${U.avatar(sc.user, 'lg')}
      <div style="min-width:0">
        <div class="name">${U.esc(sc.user.name)}</div>
        <div class="role">${U.esc(sc.user.role)}</div>
      </div>
      <div class="score-chip">
        <div class="n">${sc.score.total}</div>
        <div class="l">daily score</div>
      </div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="v">${c.completed}/${c.total}</div><div class="k">Commitments</div></div>
      <div class="stat"><div class="v ${rate >= 80 ? 'green' : rate >= 60 ? '' : 'red'}">${rate}%</div><div class="k">Completion</div></div>
      <div class="stat"><div class="v">${sc.projects.progressed}/${sc.projects.active}</div><div class="k">Projects</div></div>
      <div class="stat"><div class="v ${sc.deployments.total ? 'blue' : ''}">${sc.deployments.total}</div><div class="k">Deploys</div></div>
      <div class="stat"><div class="v ${sc.blockers.open ? 'orange' : ''}">${sc.blockers.open}</div><div class="k">Blockers</div></div>
      <div class="stat"><div class="v ${sc.production.critical ? 'red' : ''}">${sc.production.open}</div><div class="k">Issues</div></div>
    </div>
    <div class="card-head" style="border-top:0"><h3>Today</h3>
      <span class="spacer"></span>
      <a href="#/today" class="small">Update ${U.icon('chevron', 11)}</a></div>
    <div class="check-list">
      ${c.rows.length ? c.rows.map(checkRow).join('')
        : U.empty('No commitments logged', 'Nothing was committed to for this day.')}
    </div>
    ${sc.project_rows.length ? `
      <div class="card-head" style="border-top:1px solid var(--border)"><h3>Project movement</h3></div>
      <div class="card-body tight">
        ${sc.project_rows.map((p) => `
          <div style="padding:9px 0;border-bottom:1px solid var(--border)">
            <div class="row" style="flex-wrap:nowrap;gap:8px">
              <a href="#/project/${p.id}" style="font-weight:500;flex:1;min-width:0" class="truncate">${U.esc(p.name)}</a>
              <span class="small muted nowrap">${p.previous_pct}% → ${p.today_pct}%</span>
              ${U.fmt.delta(p.progress_today)}
            </div>
            ${U.progressBar(p.previous_pct, p.today_pct, false)}
            <div class="small ${p.progressed ? 'muted' : ''}" style="margin-top:5px;${p.progressed ? '' : 'color:var(--orange)'}">
              ${p.progressed
                ? U.esc(p.evidence.join(' · '))
                : `${U.icon('alert', 11)} Nothing logged today`}
            </div>
          </div>`).join('')}
      </div>` : ''}
  </div>`;
}

function checkRow(c) {
  const done = c.status === 'Completed';
  const cls = done ? 'done' : c.status === 'Blocked' ? 'blocked' : c.status === 'Cancelled' ? 'cancelled' : '';
  return `<div class="check-item ${cls}">
    <span class="check-mark" style="cursor:default">${done ? U.icon('check', 12) : c.status === 'Blocked' ? U.icon('alert', 11) : c.status === 'Cancelled' ? U.icon('x', 11) : ''}</span>
    <div class="check-main">
      <div class="check-task">${U.esc(c.task)}</div>
      <div class="check-meta">
        ${U.priority(c.priority)}
        ${c.project_name ? `<span class="chip">${U.esc(c.project_name)}</span>` : ''}
        ${done ? '' : U.badge(c.status)}
        ${!done && c.carryover_reason ? `<span class="badge ${c.carryover_reason === 'Blocked' ? 'orange' : 'gray'}">${U.esc(c.carryover_reason)}</span>` : ''}
        ${!done && !c.carryover_reason && c.status !== 'Cancelled'
          ? `<span class="badge red">${U.icon('alert', 10)} Needs a reason</span>` : ''}
      </div>
    </div>
  </div>`;
}

function activeProjectTable(projects) {
  return U.table(
    ['Project', 'Owner', 'Priority', 'Phase', 'Yesterday', 'Today', 'Progress', 'Deadline',
     { label: 'Blocker', min: 150 }, { label: 'Next step', min: 160 }],
    projects,
    (p) => `<tr>
      <td><a href="#/project/${p.id}"><b>${U.esc(p.name)}</b></a>
          ${p.progressed ? '' : '<div class="small" style="color:var(--orange)">no progress today</div>'}</td>
      <td class="nowrap">${U.esc(p.owner_name || 'Unassigned')}</td>
      <td>${U.priority(p.priority)}</td>
      <td class="nowrap">${U.badge(p.status)}</td>
      <td class="num muted">${p.previous_pct}%</td>
      <td class="num"><b>${p.today_pct}%</b></td>
      <td class="num">${U.fmt.delta(p.progress_today)}</td>
      <td class="nowrap ${p.target_date && p.target_date < p.date ? '' : ''}">${U.fmt.date(p.target_date)}</td>
      <td>${p.blocker_summary
        ? `<span class="badge orange">${U.esc(p.blocker_summary.slice(0, 40))}${p.blocker_summary.length > 40 ? '…' : ''}</span>`
        : '<span class="muted">None</span>'}</td>
      <td class="muted">${U.esc(p.next_step || 'Not set')}</td>
    </tr>`,
    'No active projects. Add one on the Projects page.'
  );
}

function showDeployments(dep, date) {
  U.openModal({
    title: 'Deployed today',
    subtitle: `${dep.total} deployment${dep.total === 1 ? '' : 's'} on ${U.fmt.longDate(date)}`,
    wide: true,
    body: dep.rows.length ? `
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">
        ${[['Features', dep.features], ['Automations', dep.automations], ['System launches', dep.systems], ['Fixes to production', dep.fixes]]
          .map(([k, v]) => `<div class="card"><div class="card-body" style="padding:11px">
            <div style="font-size:20px;font-weight:650">${v}</div>
            <div class="small muted">${k}</div></div></div>`).join('')}
      </div>
      ${U.table(['What shipped', 'Type', 'Project', 'By'], dep.rows, (r) => `<tr>
        <td><b>${U.esc(r.title)}</b>${r.description ? `<div class="small muted">${U.esc(r.description)}</div>` : ''}</td>
        <td>${U.badge(r.kind, r.kind === 'Fix' ? 'orange' : 'blue')}</td>
        <td class="nowrap">${U.esc(r.project_name || '—')}</td>
        <td class="nowrap">${U.esc(r.user_name || '—')}</td>
      </tr>`)}`
      : U.empty('Nothing deployed', 'No features, automations, launches or fixes were pushed on this date.'),
    footer: `<span class="spacer"></span><button class="btn" data-close>Close</button>`
  });
}

function showScoreDetail(score) {
  U.openModal({
    title: 'How the daily score is calculated',
    body: `<div class="score-lines">${score.lines.map((l) => `
      <div class="score-line"><div class="top"><b>${U.esc(l.label)}</b>
        <span class="pts">${l.points} / ${l.max}</span></div>
        <div class="d">${U.esc(l.detail)}</div></div>`).join('')}</div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>Close</button>`
  });
}
