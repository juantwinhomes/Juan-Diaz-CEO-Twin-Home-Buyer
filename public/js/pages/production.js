import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, dateNote } from '../app.js';
import { systemForm, incidentForm } from './forms.js';

const filters = { open: '1', severity: '', system_id: '' };

export async function page() {
  const [systems, incidents] = await Promise.all([
    api.get('/systems'),
    api.get('/incidents', { open: filters.open, severity: filters.severity, system_id: filters.system_id })
  ]);

  const totalRuns = systems.reduce((a, s) => a + s.total_runs, 0);
  const okRuns = systems.reduce((a, s) => a + s.successful_runs, 0);
  const overall = totalRuns ? Math.round((okRuns / totalRuns) * 1000) / 10 : 100;
  const target = Number(state.settings.success_rate_target);
  const openIncidents = incidents.filter((i) => i.status !== 'Resolved');
  const critical = openIncidents.filter((i) => i.severity === 'Critical').length;

  const html = `
    ${dateNote()}
    <div class="section"><div class="grid grid-kpi">
      ${U.kpiCard({ label: 'Automation success rate', value: `${overall}%`,
        meta: `${U.fmt.num(okRuns)} of ${U.fmt.num(totalRuns)} runs succeeded`,
        foot: U.targetChip(overall >= target, `Target ${target}%+`),
        accent: overall >= target ? 'green' : overall >= 95 ? 'yellow' : 'red', iconName: 'production' })}
      ${U.kpiCard({ label: 'Critical issues', value: String(critical),
        foot: U.targetChip(critical === 0, `Target ${state.settings.critical_issue_target} critical`),
        accent: critical ? 'red' : 'green', iconName: 'alert' })}
      ${U.kpiCard({ label: 'Open issues', value: String(openIncidents.length),
        meta: severityLine(openIncidents), accent: openIncidents.length ? 'yellow' : 'green', iconName: 'blockers' })}
      ${U.kpiCard({ label: 'Systems healthy', value: `${systems.filter((s) => s.status === 'Healthy').length}/${systems.length}`,
        meta: systems.filter((s) => s.status !== 'Healthy').map((s) => s.name).join(', ') || 'Everything is healthy',
        accent: systems.every((s) => s.status === 'Healthy') ? 'green' : 'orange', iconName: 'target' })}
      ${U.kpiCard({ label: 'Systems down', value: String(systems.filter((s) => s.status === 'Down').length),
        accent: systems.some((s) => s.status === 'Down') ? 'red' : 'green', iconName: 'x' })}
    </div></div>

    <div class="section">
      <div class="section-head"><h2>Production systems</h2>
        <span class="sub">Automations, agents, apps and integrations that are live</span>
        <span class="spacer"></span>
        <button class="btn btn-primary btn-sm" id="addSystem">${U.icon('plus', 14)} Add system</button></div>
      <div class="card" data-entity="system">
        ${U.table(
          ['System', 'Owner', 'Type', 'Status', 'Last checked', 'Successful', 'Failed', 'Success rate', 'Last incident', ''],
          systems,
          (s) => `<tr${s.status === 'Down' ? ' class="row-warn"' : ''}>
            <td><b>${U.esc(s.name)}</b>
              ${s.project_name ? `<div class="small muted">${U.esc(s.project_name)}</div>` : ''}
              ${s.open_incidents ? `<div class="small" style="color:var(--orange)">${s.open_incidents} open issue${s.open_incidents > 1 ? 's' : ''}</div>` : ''}</td>
            <td class="nowrap">${U.esc(s.owner_name || 'Unassigned')}</td>
            <td class="nowrap muted">${U.esc(s.system_type)}</td>
            <td>${U.badge(s.status)}</td>
            <td class="nowrap muted">${U.fmt.date(s.last_checked)}</td>
            <td class="num">${U.fmt.num(s.successful_runs)}</td>
            <td class="num ${s.failed_runs ? '' : 'muted'}">${U.fmt.num(s.failed_runs)}</td>
            <td class="num"><b style="${s.success_rate >= target ? 'color:var(--green)' : 'color:var(--orange)'}">${s.success_rate}%</b>
              <div class="bar sm" style="width:64px;margin-top:4px;margin-left:auto">
                <div class="bar-fill ${s.success_rate >= target ? 'gain' : ''}" style="width:${s.success_rate}%;${s.success_rate >= target ? '' : 'background:var(--orange)'}"></div>
              </div></td>
            <td class="nowrap muted">${s.last_incident_date ? U.fmt.date(s.last_incident_date) : '—'}</td>
            ${U.rowActions(s.id, { extra: `<button class="icon-btn" data-check="${s.id}" title="Record runs">${U.icon('refresh', 15)}</button>` })}
          </tr>`,
          'No production systems recorded yet.'
        )}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Issues &amp; incidents</h2>
        <span class="spacer"></span>
        <div class="filters">
          ${sel('f-open', null, [{ value: '1', label: 'Open only' }, { value: '', label: 'All' }], filters.open)}
          ${sel('f-severity', 'Any severity', state.enums.severities, filters.severity)}
          ${sel('f-system_id', 'Any system', systems.map((s) => ({ value: s.id, label: s.name })), filters.system_id)}
          <button class="btn btn-primary btn-sm" id="addIncident">${U.icon('plus', 14)} Report issue</button>
        </div>
      </div>
      <div class="card" data-entity="incident">
        ${U.table(
          ['Issue', 'System', 'Category', 'Severity', 'Status', 'Reported', 'Resolved', 'Reported by', ''],
          incidents,
          (i) => `<tr${i.severity === 'Critical' && i.status !== 'Resolved' ? ' class="row-warn"' : ''}>
            <td><b>${U.esc(i.title)}</b>${i.description ? `<div class="small muted">${U.esc(i.description)}</div>` : ''}
              ${i.resolution ? `<div class="small" style="color:var(--green)">${U.icon('check', 10)} ${U.esc(i.resolution)}</div>` : ''}</td>
            <td class="nowrap muted">${U.esc(i.system_name || '—')}</td>
            <td class="nowrap muted">${U.esc(i.category)}</td>
            <td>${U.badge(i.severity)}</td>
            <td>${U.badge(i.status)}</td>
            <td class="nowrap">${U.fmt.date(i.reported_date)}</td>
            <td class="nowrap muted">${i.resolved_date ? U.fmt.date(i.resolved_date) : '—'}</td>
            <td class="nowrap muted">${U.esc(i.reporter_name || '—')}</td>
            ${U.rowActions(i.id, { extra: i.status !== 'Resolved'
              ? `<button class="icon-btn" data-resolve="${i.id}" title="Mark resolved">${U.icon('check', 15)}</button>` : '' })}
          </tr>`,
          'No issues match. Production is clean.'
        )}
      </div>
    </div>`;

  return {
    title: 'Production Health',
    subtitle: `Are the systems we shipped actually working?`,
    html,
    mount(root) {
      const bind = (id, key) => root.querySelector(`#${id}`)?.addEventListener('change', (e) => {
        filters[key] = e.target.value; refresh();
      });
      bind('f-open', 'open'); bind('f-severity', 'severity'); bind('f-system_id', 'system_id');
      root.querySelector('#addSystem').addEventListener('click', () => systemForm());
      root.querySelector('#addIncident').addEventListener('click', () =>
        incidentForm({ reported_by: state.currentUserId, reported_date: state.date }, systems));

      root.addEventListener('click', (e) => {
        // Systems and incidents both number from 1, so the owning table decides.
        const entity = e.target.closest('[data-entity]')?.dataset.entity;
        const edit = e.target.closest('[data-edit]')?.dataset.edit;
        const remove = e.target.closest('[data-remove]')?.dataset.remove;
        const check = e.target.closest('[data-check]')?.dataset.check;
        const resolve = e.target.closest('[data-resolve]')?.dataset.resolve;

        if (check) return recordRuns(systems.find((s) => s.id === Number(check)));
        if (resolve) return resolveIncident(incidents.find((i) => i.id === Number(resolve)));

        if (edit && entity === 'system') return systemForm(systems.find((s) => s.id === Number(edit)));
        if (edit && entity === 'incident') return incidentForm(incidents.find((i) => i.id === Number(edit)), systems);

        if (remove && entity === 'system') {
          const sys = systems.find((s) => s.id === Number(remove));
          return U.confirmRemove({
            title: 'Remove system',
            message: `Remove "${sys.name}"?`,
            detail: 'Its incident history is removed with it.',
            async onConfirm() { await api.del(`/systems/${sys.id}`); U.toast('System removed'); refresh(); }
          });
        }
        if (remove && entity === 'incident') {
          const inc = incidents.find((i) => i.id === Number(remove));
          return U.confirmRemove({
            title: 'Remove issue',
            message: `Remove "${inc.title}"?`,
            detail: 'If it was actually fixed, mark it resolved instead so the fix stays on the record.',
            async onConfirm() { await api.del(`/incidents/${inc.id}`); U.toast('Issue removed'); refresh(); }
          });
        }
      });
    }
  };
}

const severityLine = (rows) => {
  const parts = ['Critical', 'High', 'Medium', 'Low']
    .map((s) => [s, rows.filter((i) => i.severity === s).length])
    .filter(([, n]) => n)
    .map(([s, n]) => `${n} ${s.toLowerCase()}`);
  return parts.length ? parts.join(' · ') : 'Nothing open';
};

function recordRuns(s) {
  U.openModal({
    title: `Record runs — ${s.name}`,
    subtitle: `Currently ${U.fmt.num(s.successful_runs)} successful / ${U.fmt.num(s.failed_runs)} failed (${s.success_rate}%)`,
    body: `<div class="field-row">
        <div class="field"><label>Successful runs to add</label><input class="input" type="number" id="ok" min="0" value="0"></div>
        <div class="field"><label>Failed runs to add</label><input class="input" type="number" id="bad" min="0" value="0"></div>
      </div>
      <div class="field"><label>Status</label>
        <select class="select" id="st">${state.enums.system_statuses.map((x) =>
          `<option${x === s.status ? ' selected' : ''}>${x}</option>`).join('')}</select></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="save">Record</button>`,
    onMount(modal, close) {
      modal.querySelector('#save').addEventListener('click', async () => {
        await api.post(`/systems/${s.id}/check`, {
          successful_runs: Number(modal.querySelector('#ok').value) || 0,
          failed_runs: Number(modal.querySelector('#bad').value) || 0,
          status: modal.querySelector('#st').value,
          date: state.date
        });
        close();
        U.toast('Runs recorded', 'success');
        refresh();
      });
    }
  });
}

function resolveIncident(i) {
  U.openModal({
    title: 'Resolve issue',
    subtitle: i.title,
    body: `<div class="field"><label>What fixed it? <span class="req">*</span></label>
        <textarea class="textarea" id="res" rows="3"></textarea></div>
      <div class="field"><label>Resolved date</label>
        <input class="input" type="date" id="rdate" value="${U.esc(state.date)}"></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="doResolve">Mark resolved</button>`,
    onMount(modal, close) {
      modal.querySelector('#doResolve').addEventListener('click', async () => {
        const resolution = modal.querySelector('#res').value.trim();
        if (!resolution) return U.toast('Describe the fix', 'error');
        await api.patch(`/incidents/${i.id}`, { status: 'Resolved', resolution, resolved_date: modal.querySelector('#rdate').value });
        close();
        U.toast('Issue resolved', 'success');
        refresh();
      });
    }
  });
}

const sel = (id, placeholder, options, value) => `
  <select class="select" id="${id}">
    ${placeholder ? `<option value="">${U.esc(placeholder)}</option>` : ''}
    ${options.map((o) => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      return `<option value="${U.esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${U.esc(l)}</option>`;
    }).join('')}
  </select>`;
