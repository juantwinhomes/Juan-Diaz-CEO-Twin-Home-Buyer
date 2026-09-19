import { api } from '../api.js';
import * as U from '../ui.js';
import { state, go, dateNote } from '../app.js';

export async function page() {
  const d = await api.get('/dashboard', { date: state.date });
  const cards = d.scorecards;
  const k = d.kpis;
  const target = Number(state.settings.commitment_target);

  const metrics = [
    ['Daily commitments', (c) => `${c.commitments.completed}/${c.commitments.total}`,
      `${k.commitments.completed}/${k.commitments.total}`],
    ['Completion', (c) => `${c.commitments.rate}%`, `${k.commitments.rate}%`, true],
    ['Projects progressed', (c) => `${c.projects.progressed}/${c.projects.active}`,
      `${k.projects.progressed}/${k.projects.active}`],
    ['Deployments', (c) => String(c.deployments.total), String(k.deployments.total)],
    ['Blockers', (c) => String(c.blockers.open), String(k.blockers.open)],
    ['Critical issues', (c) => String(c.production.critical), String(k.production.critical)],
    ['Daily score', (c) => String(c.score.total), String(d.score.total), true]
  ];

  const html = `
    ${dateNote()}
    <div class="section">
      <div class="section-head"><h2>Team comparison</h2>
        <span class="sub">${U.fmt.longDate(d.date)}</span></div>
      <div class="card">
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>Metric</th>
            ${cards.map((c) => `<th style="text-align:right">${U.esc(c.user.name)}</th>`).join('')}
            <th style="text-align:right">Team</th>
          </tr></thead>
          <tbody>
            ${metrics.map(([label, fn, teamValue, emphasise]) => `
              <tr>
                <td><b>${U.esc(label)}</b></td>
                ${cards.map((c) => `<td class="num"${emphasise ? ' style="font-weight:650"' : ''}>${U.esc(fn(c))}</td>`).join('')}
                <td class="num" style="font-weight:650;background:var(--surface-2)">${U.esc(teamValue)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Score breakdown per person</h2>
        <span class="sub">Transparent by design</span></div>
      <div class="grid grid-2">
        ${cards.map((c) => `<div class="card">
          <div class="scorecard-head">
            ${U.avatar(c.user, 'lg')}
            <div><div class="name">${U.esc(c.user.name)}</div><div class="role">${U.esc(c.user.role)}</div></div>
            <div class="score-chip"><div class="n">${c.score.total}</div><div class="l">${U.esc(c.score.grade)}</div></div>
          </div>
          <div class="card-body">
            <div class="score-lines">
              ${c.score.lines.map((l) => `
                <div class="score-line">
                  <div class="top"><b>${U.esc(l.label)}</b><span class="pts">${l.points} / ${l.max}</span></div>
                  <div class="bar sm" style="margin-top:5px">
                    <div class="bar-fill ${l.points / l.max >= 0.8 ? 'gain' : ''}" style="width:${(l.points / l.max) * 100}%"></div></div>
                  <div class="d">${U.esc(l.detail)}</div>
                </div>`).join('')}
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Project status</h2>
        <span class="sub">Every active project, with today's movement</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-go="#/projects">Open projects ${U.icon('chevron', 13)}</button></div>
      <div class="card">
        ${U.table(
          ['Project', 'Owner', 'Priority', 'Phase', 'Yesterday', 'Today', 'Progress today', 'Deadline',
           { label: 'Blocker', min: 150 }, { label: 'Next step', min: 160 }],
          d.projects,
          (p) => `<tr${p.progressed ? '' : ' class="row-warn"'}>
            <td><a href="#/project/${p.id}"><b>${U.esc(p.name)}</b></a></td>
            <td class="nowrap">${U.esc(p.owner_name || 'Unassigned')}</td>
            <td>${U.priority(p.priority)}</td>
            <td class="nowrap">${U.badge(p.status)}</td>
            <td class="num muted">${p.previous_pct}%</td>
            <td class="num"><b>${p.today_pct}%</b></td>
            <td class="num">${U.fmt.delta(p.progress_today)}</td>
            <td class="nowrap">${U.fmt.date(p.target_date)}</td>
            <td>${p.blocker_summary ? `<span class="badge orange">${U.esc(p.blocker_summary.slice(0, 36))}${p.blocker_summary.length > 36 ? '…' : ''}</span>` : '<span class="muted">None</span>'}</td>
            <td class="muted">${U.esc(p.next_step || 'Not set')}</td>
          </tr>`
        )}
      </div>
    </div>

    ${d.stagnant.length ? `<div class="section">
      <div class="card" style="border-color:var(--orange-bd)">
        <div class="card-head" style="background:var(--orange-bg);border-radius:12px 12px 0 0">
          <span style="color:var(--orange)">${U.icon('alert', 17)}</span>
          <h2>Needs attention</h2></div>
        ${U.table(['Project', 'Owner', 'Last progress', 'Blocker', 'Next step'], d.stagnant, (s) => `<tr>
          <td><a href="#/project/${s.id}"><b>${U.esc(s.name)}</b></a>
            <div class="small" style="color:var(--orange)">${U.esc(s.message)}</div></td>
          <td class="nowrap">${U.esc(s.owner_name || 'Unassigned')}</td>
          <td class="nowrap">${s.last_progress_date ? U.fmt.date(s.last_progress_date) : 'Never'}</td>
          <td>${U.esc(s.blocker || 'None recorded')}</td>
          <td class="muted">${U.esc(s.next_step || 'Not set')}</td>
        </tr>`)}
      </div>
    </div>` : ''}`;

  return {
    title: 'Manager View',
    subtitle: 'Whole-team execution, side by side',
    html,
    mount(root) {
      root.addEventListener('click', (e) => {
        const target = e.target.closest('[data-go]');
        if (target) go(target.dataset.go);
      });
    }
  };
}
