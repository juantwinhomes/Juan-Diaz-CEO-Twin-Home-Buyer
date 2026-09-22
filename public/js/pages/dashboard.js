import { api } from '../api.js';
import * as U from '../ui.js';
import * as V from '../charts.js';
import { state, go, dateNote, isToday, activeUsers } from '../app.js';

/* The eleven project statuses read as six delivery stages. Keeping the stages
   in this order is what lets one colour ramp carry "how far along" on the
   pipeline chart. Blocked is not a stage, so it gets the status colour. */
const STAGE_OF = {
  Backlog: 'Not started', Requirements: 'Not started',
  Building: 'Building',
  'Internal Testing': 'Testing', 'User Testing': 'Testing',
  'Ready for Deployment': 'Ready',
  Production: 'Live', Monitoring: 'Live', Completed: 'Live',
  Blocked: 'Blocked'
};
const STAGES = ['Not started', 'Building', 'Testing', 'Ready', 'Live', 'Blocked'];
const MEASURES = [['taken', 'Taken'], ['finished', 'Finished'], ['all', 'All']];
const SYSTEM_COLOR = { Healthy: 'var(--green)', Warning: 'var(--yellow)', Degraded: 'var(--orange)', Down: 'var(--red)' };

export async function page() {
  const d = await api.get('/dashboard', { date: state.date });
  const k = d.kpis;
  const s = d.settings;
  const history = d.history || [];
  const series = d.commitment_series || [];

  const commitMet = k.commitments.rate >= Number(s.commitment_target);
  const progressMet = k.projects.rate >= Number(s.progressed_target);

  const tiles = [
    tile({
      label: 'Commitment completion', value: U.fmt.pct(k.commitments.rate),
      meta: `${k.commitments.completed} / ${k.commitments.total} completed`,
      accent: commitMet ? 'green' : k.commitments.rate >= 60 ? 'yellow' : 'red',
      iconName: 'commitments', action: 'view-commitments',
      values: history.map((h) => h.completion_rate), goodUp: true, unitSuffix: '%'
    }),
    tile({
      label: 'Projects progressed', value: U.fmt.pct(k.projects.rate),
      meta: `${k.projects.progressed} / ${k.projects.active} active`,
      accent: progressMet ? 'green' : k.projects.rate >= 60 ? 'yellow' : 'orange',
      iconName: 'projects', action: 'view-projects',
      values: history.map((h) => h.progressed_rate), goodUp: true, unitSuffix: '%'
    }),
    tile({
      label: 'Deployed', value: String(k.deployments.total), unit: k.deployments.total === 1 ? 'deploy' : 'deploys',
      meta: deployMeta(k.deployments), accent: k.deployments.total ? 'blue' : 'gray',
      iconName: 'rocket', action: 'view-deployments',
      values: history.map((h) => h.deployments), goodUp: true
    }),
    tile({
      label: 'Blockers open', value: String(k.blockers.open), unit: 'open',
      meta: k.blockers.aging
        ? `<span style="color:var(--orange);font-weight:600">${k.blockers.aging} over a business day</span>`
        : `${k.blockers.created_today} opened, ${k.blockers.resolved_today} cleared`,
      accent: k.blockers.aging ? 'orange' : k.blockers.open ? 'yellow' : 'green',
      iconName: 'blockers', action: 'view-blockers',
      values: history.map((h) => h.blockers_open), goodUp: false
    }),
    tile({
      label: 'Production issues', value: String(k.production.critical), unit: 'critical',
      meta: severityMeta(k.production),
      accent: k.production.critical ? 'red' : k.production.open ? 'yellow' : 'green',
      iconName: 'production', action: 'view-production',
      values: history.map((h) => h.open_issues), goodUp: false
    })
  ].join('');

  const stageCounts = Object.fromEntries(STAGES.map((n) => [n, 0]));
  for (const p of d.projects) {
    const stage = STAGE_OF[p.status];
    if (stage) stageCounts[stage]++;
  }
  const stageTotal = STAGES.reduce((a, n) => a + stageCounts[n], 0);

  const people = peopleWithCommitments(series);
  const deadlines = upcomingDeadlines(d.projects, d.date);
  /* A portfolio of forty is a wall of rows on a page meant to be read at a
     glance. What moved today comes first, then the highest priority. */
  const headline = d.projects.slice().sort((a, b) =>
    (b.progressed ? 1 : 0) - (a.progressed ? 1 : 0)
    || b.progress_today - a.progress_today
    || String(a.priority).localeCompare(String(b.priority))
    || a.name.localeCompare(b.name)).slice(0, 8);
  const systems = (k.production.systems || []).slice().sort((a, b) => a.success_rate - b.success_rate);
  const unhealthy = systems.filter((x) => x.status !== 'Healthy').length;

  const html = `
    ${dateNote()}
    <div class="section"><div class="grid grid-kpi">${tiles}</div></div>

    <div class="section grid grid-3" style="align-items:stretch">
      <div class="card" id="cardScore">
        <div class="card-head">
          <h2>Daily execution score</h2>
          <span class="spacer"></span>
          <span class="badge ${d.score.total >= Number(s.daily_score_target || 80) ? 'green'
            : d.score.total >= 65 ? 'yellow' : 'orange'}">${U.esc(d.score.grade)}</span>
          <button class="btn btn-sm btn-ghost" data-twin>Table</button>
        </div>
        <div class="card-body">
          <div class="row" style="align-items:baseline;gap:8px;margin-bottom:4px">
            <span style="font-size:34px;font-weight:650;letter-spacing:-.03em;line-height:1">${d.score.total}</span>
            <span class="muted small">/ 100</span>
            <span class="spacer"></span>
            <button class="btn btn-sm btn-ghost" data-action="view-score">How it is worked out</button>
          </div>
          <div class="chart-twin chart" id="scoreChart"></div>
          <div class="table-twin" id="scoreTable"></div>
        </div>
      </div>

      <div class="card" id="cardCommit">
        <div class="card-head">
          <h2>Commitments per person</h2>
          <span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" data-twin>Table</button>
        </div>
        <div class="card-body">
          <div class="row" style="flex-wrap:nowrap;gap:8px;margin-bottom:9px">
            <span class="seg" id="measure" role="radiogroup" aria-label="Which commitments to show">
              ${MEASURES.map(([value, label], i) => `<button type="button" role="radio"
                aria-checked="${i === 0}" data-measure="${value}">${label}</button>`).join('')}
            </span>
            <span class="spacer"></span>
            <span class="small muted nowrap" id="measureNote"></span>
          </div>
          <div class="chart-twin">
            <div class="legend" id="commitLegend"></div>
            <div class="chart" id="commitChart"></div>
          </div>
          <div class="table-twin" id="commitTable"></div>
        </div>
      </div>

      <div class="card" id="cardStages">
        <div class="card-head"><h2>Project pipeline</h2>
          <span class="sub">${stageTotal} active</span>
          <span class="spacer"></span>
          <button class="btn btn-sm" data-action="view-projects">Open ${U.icon('chevron', 12)}</button>
        </div>
        <div class="card-body">
          <div class="donut-split">
            <div class="chart" id="stageDonut"></div>
            <div class="figures">${U.table(['Stage', { label: 'Projects', align: 'right' }, { label: 'Share', align: 'right' }],
              STAGES, (name) => `<tr>
                <td><span class="who"><i class="dot-key" style="background:${stageCounts[name]
                  ? V.STAGE_COLORS[name] : 'var(--gray-bd)'}"></i>${U.esc(name)}</span></td>
                <td class="num">${stageCounts[name]}</td>
                <td class="num muted">${stageTotal ? Math.round((stageCounts[name] / stageTotal) * 100) : 0}%</td>
              </tr>`)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section grid grid-3" style="align-items:start">
      <div class="card">
        <div class="card-head"><h2>Deadlines at risk</h2><span class="sub">Nearest first</span></div>
        ${deadlines.length ? U.table(['Project', 'Owner', 'Done', { label: 'Due', align: 'right' }],
          deadlines, (p) => `<tr>
            <td><a href="#/project/${p.id}"><b>${U.esc(p.name)}</b></a></td>
            <td class="nowrap muted">${U.esc(p.owner_name || 'Unassigned')}</td>
            <td><span class="row" style="flex-wrap:nowrap;gap:7px">
              <span class="bar sm" style="flex:1;min-width:38px"><span class="bar-fill"
                style="width:${p.today_pct}%"></span></span>
              <span class="num small">${p.today_pct}%</span></span></td>
            <td class="num">${dueBadge(p.days_left)}</td>
          </tr>`)
        : U.empty('No dated work ahead', 'No active project has a target date in the next 30 days.')}
      </div>

      <div class="card">
        <div class="card-head"><h2>Projects not moving</h2>
          <span class="sub">${d.stagnant.length} with nothing logged</span></div>
        ${d.stagnant.length ? U.table(['Project', 'Owner', { label: 'Last progress', align: 'right' }],
          d.stagnant.slice(0, 5), (p) => `<tr>
            <td><a href="#/project/${p.id}"><b>${U.esc(p.name)}</b></a></td>
            <td class="nowrap muted">${U.esc(p.owner_name || 'Unassigned')}</td>
            <td class="num muted nowrap">${p.last_progress_date ? U.fmt.date(p.last_progress_date) : 'Never'}</td>
          </tr>`)
        : U.empty('Everything is moving', 'Every active project has been updated recently.')}
        ${d.stagnant.length > 5
          ? `<div class="card-body tight"><p class="small muted">${d.stagnant.length - 5} more</p></div>` : ''}
      </div>

      <div class="card">
        <div class="card-head"><h2>Production systems</h2>
          <span class="sub">${unhealthy ? `${unhealthy} need attention` : 'all healthy'}</span>
          <span class="spacer"></span>
          <button class="btn btn-sm" data-action="view-production">Open ${U.icon('chevron', 12)}</button></div>
        <div class="card-body">
          ${systems.length ? systems.map((x) => `
            <div class="sys-row">
              <i class="dot-key" style="background:${SYSTEM_COLOR[x.status] || 'var(--gray)'}"></i>
              <span class="name">${U.esc(x.name)}${x.failed_runs
                ? `<span class="muted small"> · ${x.failed_runs} failed of ${x.total_runs}</span>` : ''}</span>
              <span class="rate" style="color:${x.status === 'Healthy' ? 'var(--text-2)'
                : SYSTEM_COLOR[x.status]}">${x.success_rate}%</span>
            </div>`).join('')
          : '<p class="small muted">No systems recorded yet.</p>'}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>Active projects</h2>
        <span class="sub">What moved today, and by how much</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-action="view-projects">Open projects ${U.icon('chevron', 13)}</button>
      </div>
      <div class="card">
        ${activeProjectTable(headline)}
        ${d.projects.length > headline.length ? `<div class="card-body tight">
          <p class="small muted">Showing ${headline.length} of ${d.projects.length} active projects, the ones that
          moved today first. The Projects page has all of them, with filters.</p></div>` : ''}
      </div>
    </div>`;

  return {
    title: 'Dashboard',
    subtitle: `${d.day_name}, ${d.date_label}${isToday() ? '' : ' (historical view)'}`,
    html,
    mount(root) {
      drawScore(root, d, history, s);
      drawCommitments(root, series, people, 'taken');
      V.donut(root.querySelector('#stageDonut'),
        STAGES.map((name) => ({ label: name, value: stageCounts[name], color: V.STAGE_COLORS[name] })), stageTotal);

      root.querySelectorAll('[data-twin]').forEach((btn) => btn.addEventListener('click', () => {
        const card = btn.closest('.card');
        card.classList.toggle('show-table');
        btn.textContent = card.classList.contains('show-table') ? 'Chart' : 'Table';
      }));

      root.querySelector('#measure').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-measure]');
        if (!btn) return;
        root.querySelectorAll('#measure [data-measure]').forEach((b) =>
          b.setAttribute('aria-checked', String(b === btn)));
        drawCommitments(root, series, people, btn.dataset.measure);
      });

      root.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'view-deployments') showDeployments(k.deployments, d.date);
        if (action === 'view-score') showScoreDetail(d.score);
        if (action === 'view-commitments') go('#/commitments');
        if (action === 'view-projects') go('#/projects');
        if (action === 'view-blockers') go('#/blockers');
        if (action === 'view-production') go('#/production');
      });
    }
  };
}

/* ------------------------------------------------------------ Pieces */
/** A KPI card with the shape of its last few days underneath the number. */
function tile({ label, value, unit, meta, accent, iconName, action, values, goodUp, unitSuffix = '' }) {
  const clean = values.filter(Number.isFinite);
  const now = clean.at(-1);
  const before = clean.length > 1 ? clean.at(-2) : now;
  const diff = clean.length > 1 ? Math.round((now - before) * 10) / 10 : 0;
  const direction = diff === 0 ? 'flat' : (diff > 0) === goodUp ? 'up' : 'down';
  const foot = clean.length > 1
    ? `<span class="delta ${direction}">${diff === 0 ? 'flat' : `${diff > 0 ? '+' : ''}${diff}${unitSuffix}`}</span>
       <span style="flex:1;min-width:0">${V.sparkline(clean)}</span>`
    : '<span class="muted">No history yet</span>';
  return U.kpiCard({ label, value, unit, meta, foot, accent, iconName, action });
}

function drawScore(root, d, history, settings) {
  const host = root.querySelector('#scoreChart');
  const showTarget = settings.show_score_target === '1';
  const target = Number(settings.daily_score_target || 80);
  V.lineChart(host, {
    labels: history.map((h) => h.date),
    series: [{
      name: 'Score', color: 'var(--viz-1)', values: history.map((h) => h.score),
      extra: (i) => `<div class="l"><i style="background:var(--viz-deemph)"></i>Commitments<b>${history[i].completion_rate}%</b></div>`
        + `<div class="l"><i style="background:var(--viz-deemph)"></i>Projects<b>${history[i].projects_progressed} / ${history[i].projects_active}</b></div>`
    }],
    max: 100,
    ticks: [0, 50, 100],
    rule: showTarget ? { value: target, label: `target ${target}` } : null,
    area: true
  });
  root.querySelector('#scoreTable').innerHTML = history.length
    ? U.table(['Day', { label: 'Score', align: 'right' }, { label: 'Commitments', align: 'right' },
      { label: 'Projects', align: 'right' }], history.slice().reverse(), (h) => `<tr>
        <td class="nowrap">${V.dayOf(h.date)} ${U.fmt.date(h.date)}</td>
        <td class="num"><b>${h.score}</b></td>
        <td class="num">${h.completion_rate}%</td>
        <td class="num">${h.projects_progressed} / ${h.projects_active}</td>
      </tr>`)
    : U.empty('No history yet', 'Days are recorded as they are viewed or closed out.');
}

function drawCommitments(root, series, people, measure) {
  const host = root.querySelector('#commitChart');
  const labels = [...new Set(series.map((r) => r.date))].sort();
  const valueOf = (userId, date) => {
    const row = series.find((r) => r.user_id === userId && r.date === date);
    return row ? row[measure] : 0;
  };
  const lines = people.map((person, i) => ({
    name: person.name,
    color: V.SERIES_COLORS[i % V.SERIES_COLORS.length],
    values: labels.map((date) => valueOf(person.id, date))
  }));
  if (!lines.length) {
    host.innerHTML = '<p class="viz-empty">No commitments recorded in this window.</p>';
    root.querySelector('#commitLegend').innerHTML = '';
    root.querySelector('#measureNote').textContent = '';
    root.querySelector('#commitTable').innerHTML = '';
    return;
  }
  V.lineChart(host, { labels, series: lines });
  root.querySelector('#commitLegend').innerHTML =
    lines.map((l) => `<span class="key"><i style="background:${l.color}"></i>${U.esc(l.name)}</span>`).join('');
  root.querySelector('#measureNote').textContent =
    `${MEASURES.find(([value]) => value === measure)[1].toLowerCase()} per day`;
  root.querySelector('#commitTable').innerHTML = U.table(
    ['Day', ...people.map((p) => ({ label: p.name, align: 'right' }))],
    labels.slice().reverse(),
    (date) => `<tr><td class="nowrap">${V.dayOf(date)} ${U.fmt.date(date)}</td>${
      people.map((p) => `<td class="num">${valueOf(p.id, date)}</td>`).join('')}</tr>`);
}

/** Only people who actually committed to something belong on the chart. */
function peopleWithCommitments(series) {
  const seen = new Set(series.map((r) => r.user_id));
  return activeUsers().filter((u) => seen.has(u.id)).slice(0, V.SERIES_COLORS.length);
}

/** Dated work that is close, plus anything already past its date. */
function upcomingDeadlines(projects, date) {
  const dayMs = 86400000;
  const daysTo = (iso) => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${date}T12:00:00`)) / dayMs);
  return projects
    .filter((p) => p.target_date)
    .map((p) => ({ ...p, days_left: daysTo(p.target_date) }))
    .filter((p) => p.days_left <= 30)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 5);
}

const dueBadge = (days) =>
  days < 0 ? `<span class="badge red">${Math.abs(days)}d late</span>`
    : days === 0 ? '<span class="badge red">today</span>'
      : days <= 3 ? `<span class="badge orange">${days}d</span>`
        : `<span class="badge gray">${days}d</span>`;

const deployMeta = (dep) => {
  const parts = [];
  if (dep.features) parts.push(`${dep.features} feature${dep.features > 1 ? 's' : ''}`);
  if (dep.automations) parts.push(`${dep.automations} automation${dep.automations > 1 ? 's' : ''}`);
  if (dep.systems) parts.push(`${dep.systems} launch${dep.systems > 1 ? 'es' : ''}`);
  if (dep.fixes) parts.push(`${dep.fixes} fix${dep.fixes > 1 ? 'es' : ''}`);
  return parts.length ? U.esc(parts.join(' · ')) : 'Nothing deployed yet';
};

const severityMeta = (prod) => {
  const parts = [];
  if (prod.high) parts.push(`${prod.high} high`);
  if (prod.medium) parts.push(`${prod.medium} medium`);
  if (prod.low) parts.push(`${prod.low} low`);
  return parts.length ? `${prod.open} open · ${U.esc(parts.join(', '))}` : 'No open production issues';
};

function activeProjectTable(projects) {
  return U.table(
    ['Project', 'Owner', 'Priority', 'Phase', { label: 'Yesterday', align: 'right' },
      { label: 'Today', align: 'right' }, { label: 'Change', align: 'right' }, { label: 'Next step', min: 160 }],
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
          .map(([label, value]) => `<div class="card"><div class="card-body" style="padding:11px">
            <div style="font-size:20px;font-weight:650">${value}</div>
            <div class="small muted">${label}</div></div></div>`).join('')}
      </div>
      ${U.table(['What shipped', 'Type', 'Project', 'By'], dep.rows, (r) => `<tr>
        <td><b>${U.esc(r.title)}</b>${r.description ? `<div class="small muted">${U.esc(r.description)}</div>` : ''}</td>
        <td>${U.badge(r.kind, r.kind === 'Fix' ? 'orange' : 'blue')}</td>
        <td class="nowrap">${U.esc(r.project_name || '—')}</td>
        <td class="nowrap">${U.esc(r.user_name || '—')}</td>
      </tr>`)}`
      : U.empty('Nothing deployed', 'No features, automations, launches or fixes were pushed on this date.'),
    footer: '<span class="spacer"></span><button class="btn" data-close>Close</button>'
  });
}

function showScoreDetail(score) {
  U.openModal({
    title: 'How the daily score is worked out',
    body: `<div class="score-lines">${score.lines.map((l) => `
      <div class="score-line"><div class="top"><b>${U.esc(l.label)}</b>
        <span class="pts">${l.points} / ${l.max}</span></div>
        <div class="bar sm" style="margin-top:5px">
          <div class="bar-fill ${l.points / l.max >= 0.8 ? 'gain' : ''}" style="width:${(l.points / l.max) * 100}%"></div>
        </div>
        <div class="d">${U.esc(l.detail)}</div></div>`).join('')}</div>
      <div class="callout" style="margin-top:14px">${U.icon('target', 15)}
        <div>No points for hours worked, lines of code, prompts written, or automations nobody asked for.</div>
      </div>`,
    footer: '<span class="spacer"></span><button class="btn" data-close>Close</button>'
  });
}
