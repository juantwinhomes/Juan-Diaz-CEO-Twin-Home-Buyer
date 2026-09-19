import { api } from '../api.js';
import * as U from '../ui.js';
import { state } from '../app.js';

export async function page() {
  const w = await api.get('/weekly', { date: state.date });
  const t = w.totals;
  const target = Number(state.settings.commitment_target);

  const html = `
    <div class="section"><div class="grid grid-kpi">
      ${U.kpiCard({ label: 'Commitment completion', value: `${t.completion_rate}%`,
        meta: `${t.commitments_completed} / ${t.commitments_total} across the week`,
        foot: U.targetChip(t.completion_rate >= target, `Target ${target}%+`),
        accent: t.completion_rate >= target ? 'green' : 'yellow', iconName: 'commitments' })}
      ${U.kpiCard({ label: 'Projects progressed', value: `${t.avg_progressed_rate}%`,
        meta: 'Daily average', accent: t.avg_progressed_rate >= 80 ? 'green' : 'yellow', iconName: 'projects' })}
      ${U.kpiCard({ label: 'Deployments', value: String(t.deployments), meta: 'Shipped this week', accent: 'blue', iconName: 'rocket' })}
      ${U.kpiCard({ label: 'Blockers', value: `${t.blockers_created} / ${t.blockers_resolved}`,
        meta: 'Created / resolved', accent: t.blockers_resolved >= t.blockers_created ? 'green' : 'yellow', iconName: 'blockers' })}
      ${U.kpiCard({ label: 'Average daily score', value: String(t.avg_score), unit: '/ 100',
        meta: `${t.incidents} production incident${t.incidents === 1 ? '' : 's'} · ${t.projects_completed} project${t.projects_completed === 1 ? '' : 's'} completed`,
        accent: t.avg_score >= 80 ? 'green' : t.avg_score >= 65 ? 'yellow' : 'orange', iconName: 'target' })}
    </div></div>

    <div class="section grid grid-2" style="align-items:start">
      ${chart('Daily commitment completion', w.days, 'completion_rate', (v) => `${v}%`,
        (v) => (v >= target ? 'green' : v >= 60 ? 'yellow' : 'red'), 100)}
      ${chart('Projects progressed', w.days, 'projects_progressed_rate', (v) => `${v}%`,
        (v) => (v >= 100 ? 'green' : v >= 60 ? '' : 'yellow'), 100)}
    </div>

    <div class="section grid grid-2" style="align-items:start">
      ${chart('Deployments', w.days, 'deployments', (v) => String(v), () => '', null)}
      ${chart('Daily execution score', w.days, 'score', (v) => String(v),
        (v) => (v >= 80 ? 'green' : v >= 65 ? 'yellow' : 'red'), 100)}
    </div>

    <div class="section">
      <div class="section-head"><h2>Monday to Friday</h2>
        <span class="sub">${U.fmt.longDate(w.week_start)} – ${U.fmt.longDate(w.week_end)}</span></div>
      <div class="card">
        ${U.table(
          ['Day', 'Commitments', 'Completion', 'Projects progressed', 'Avg project progress',
           'Deployments', 'Blockers created', 'Blockers resolved', 'Incidents', 'Projects completed', 'Score'],
          w.days,
          (d) => `<tr>
            <td class="nowrap"><b>${U.esc(d.day)}</b> <span class="muted">${U.esc(d.label)}</span></td>
            <td class="num">${d.commitments_completed} / ${d.commitments_total}</td>
            <td class="num"><b style="${d.completion_rate >= target ? 'color:var(--green)' : d.commitments_total ? 'color:var(--orange)' : ''}">${d.commitments_total ? `${d.completion_rate}%` : '—'}</b></td>
            <td class="num">${d.projects_progressed} / ${d.projects_active}</td>
            <td class="num">${U.fmt.delta(d.avg_project_progress)}</td>
            <td class="num">${d.deployments || '<span class="muted">0</span>'}</td>
            <td class="num">${d.blockers_created || '<span class="muted">0</span>'}</td>
            <td class="num">${d.blockers_resolved || '<span class="muted">0</span>'}</td>
            <td class="num ${d.incidents ? '' : 'muted'}">${d.incidents}</td>
            <td class="num ${d.projects_completed ? '' : 'muted'}">${d.projects_completed}</td>
            <td class="num"><b>${d.score}</b></td>
          </tr>`
        )}
      </div>
      <p class="small muted" style="margin-top:10px">
        This view exists to see whether the team is shipping consistently — not to monitor people.
      </p>
    </div>`;

  return { title: 'Weekly', subtitle: `${U.fmt.longDate(w.week_start)} – ${U.fmt.longDate(w.week_end)}`, html };
}

function chart(title, days, key, format, colorFor, max) {
  const values = days.map((d) => Number(d[key]) || 0);
  const ceiling = max || Math.max(1, ...values);
  return `<div class="card">
    <div class="card-head"><h2>${U.esc(title)}</h2></div>
    <div class="card-body">
      <div class="bars">
        ${days.map((d, i) => {
          const v = values[i];
          const pct = ceiling ? Math.max(2, (v / ceiling) * 100) : 2;
          return `<div class="col">
            <span class="v">${format(v)}</span>
            <div class="b ${v === 0 ? 'gray' : colorFor(v)}" style="height:${pct}%"></div>
            <span class="l">${U.esc(d.day.slice(0, 3))}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}
