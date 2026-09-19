import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, activeUsers, dateNote } from '../app.js';
import { commitmentForm } from './forms.js';

const filters = { user_id: '', project_id: '', priority: '', status: '', range: 'day' };

export async function page() {
  const params = { user_id: filters.user_id, project_id: filters.project_id, priority: filters.priority, status: filters.status };
  if (filters.range === 'day') params.date = state.date;
  else if (filters.range === 'week') { params.from = weekStart(state.date); params.to = state.date; }
  else params.to = state.date;

  const rows = await api.get('/commitments', params);
  const counted = rows.filter((c) => c.status !== 'Cancelled');
  const done = counted.filter((c) => c.status === 'Completed').length;
  const rate = counted.length ? Math.round((done / counted.length) * 100) : 0;
  const target = Number(state.settings.commitment_target);

  const byUser = new Map();
  for (const c of rows) {
    if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
    byUser.get(c.user_id).push(c);
  }

  const html = `
    ${dateNote()}
    <div class="section"><div class="grid grid-kpi">
      ${U.kpiCard({ label: 'Completion', value: `${rate}%`, meta: `${done} / ${counted.length} completed`,
        foot: U.targetChip(rate >= target, `Target ${target}%+`), accent: rate >= target ? 'green' : 'yellow', iconName: 'commitments' })}
      ${U.kpiCard({ label: 'In progress', value: String(counted.filter((c) => c.status === 'In Progress').length), accent: 'blue', iconName: 'clock' })}
      ${U.kpiCard({ label: 'Blocked', value: String(counted.filter((c) => c.status === 'Blocked').length), accent: 'orange', iconName: 'blockers' })}
      ${U.kpiCard({ label: 'Not started', value: String(counted.filter((c) => c.status === 'Not Started').length), accent: 'gray', iconName: 'inbox' })}
      ${U.kpiCard({ label: 'Cancelled', value: String(rows.length - counted.length), meta: 'Excluded from the rate', accent: 'gray', iconName: 'x' })}
    </div></div>

    <div class="section">
      <div class="card"><div class="card-body" style="padding:12px 14px">
        <div class="filters">
          ${sel('f-range', null, [{ value: 'day', label: 'Selected day' }, { value: 'week', label: 'This week to date' }, { value: 'all', label: 'All time' }], filters.range)}
          ${sel('f-user_id', 'All team members', activeUsers().map((u) => ({ value: u.id, label: u.name })), filters.user_id)}
          ${sel('f-project_id', 'All projects', state.projects.map((p) => ({ value: p.id, label: p.name })), filters.project_id)}
          ${sel('f-priority', 'All priorities', state.enums.priorities, filters.priority)}
          ${sel('f-status', 'All statuses', state.enums.commitment_statuses, filters.status)}
          <span class="spacer"></span>
          <button class="btn btn-sm" id="clearFilters">Clear</button>
          <button class="btn btn-primary btn-sm" id="add">${U.icon('plus', 14)} Add commitment</button>
        </div>
      </div></div>
    </div>

    ${filters.range === 'day' && !filters.user_id ? perUserSections(byUser) : ''}

    <div class="section">
      <div class="section-head"><h2>All commitments</h2>
        <span class="sub">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</span></div>
      <div class="card">
        ${U.table(
          ['Date', 'Person', 'Task / deliverable', 'Project', 'Priority', 'Status', 'Reason if unfinished', ''],
          rows,
          (c) => `<tr>
            <td class="nowrap">${U.fmt.date(c.commit_date)}</td>
            <td class="nowrap">${U.esc(c.user_name || '—')}</td>
            <td>${U.esc(c.task)}
              ${c.quality_score < 50 ? `<div class="small" style="color:var(--yellow)">${U.icon('alert', 10)} Vague — describe a measurable result</div>` : ''}
              ${c.notes ? `<div class="small muted">${U.esc(c.notes)}</div>` : ''}</td>
            <td class="nowrap muted">${U.esc(c.project_name || '—')}</td>
            <td>${U.priority(c.priority)}</td>
            <td>${U.badge(c.status)}</td>
            <td>${c.status === 'Completed' ? '<span class="muted">—</span>'
                 : c.carryover_reason ? U.badge(c.carryover_reason, c.carryover_reason === 'Blocked' ? 'orange' : 'gray')
                 : `<span class="badge red">${U.icon('alert', 10)} Needs a reason</span>`}</td>
            ${U.rowActions(c.id)}
          </tr>`,
          'No commitments match these filters.'
        )}
      </div>
    </div>`;

  return {
    title: 'Commitments',
    subtitle: `${state.guidance.helper || ''}`,
    html,
    mount(root) {
      const bind = (id, key) => root.querySelector(`#${id}`)?.addEventListener('change', (e) => {
        filters[key] = e.target.value; refresh();
      });
      bind('f-range', 'range'); bind('f-user_id', 'user_id'); bind('f-project_id', 'project_id');
      bind('f-priority', 'priority'); bind('f-status', 'status');
      root.querySelector('#clearFilters').addEventListener('click', () => {
        Object.assign(filters, { user_id: '', project_id: '', priority: '', status: '', range: 'day' });
        refresh();
      });
      root.querySelector('#add').addEventListener('click', () =>
        commitmentForm({ user_id: state.currentUserId, commit_date: state.date }));

      root.addEventListener('click', (e) => {
        const edit = e.target.closest('[data-edit]')?.dataset.edit;
        const remove = e.target.closest('[data-remove]')?.dataset.remove;
        if (edit) commitmentForm(rows.find((c) => c.id === Number(edit)));
        if (remove) {
          const c = rows.find((x) => x.id === Number(remove));
          U.confirmRemove({
            title: 'Remove commitment',
            message: `Remove "${c.task}"?`,
            detail: 'If the work simply did not happen, set a reason instead so it stays on the record.',
            async onConfirm() { await api.del(`/commitments/${c.id}`); U.toast('Commitment removed'); refresh(); }
          });
        }
      });
    }
  };
}

function perUserSections(byUser) {
  const users = activeUsers();
  return `<div class="section"><div class="grid grid-2">
    ${users.map((u) => {
      const rows = byUser.get(u.id) || [];
      const counted = rows.filter((c) => c.status !== 'Cancelled');
      const done = counted.filter((c) => c.status === 'Completed').length;
      const rate = counted.length ? Math.round((done / counted.length) * 100) : 0;
      return `<div class="card">
        <div class="scorecard-head">
          ${U.avatar(u)}
          <div><div class="name">${U.esc(u.name)}</div><div class="role">${U.esc(u.role)}</div></div>
          <div class="score-chip"><div class="n">${done}/${counted.length}</div><div class="l">${rate}% complete</div></div>
        </div>
        <div class="check-list">
          ${rows.length ? rows.map((c) => `
            <div class="check-item ${c.status === 'Completed' ? 'done' : c.status === 'Blocked' ? 'blocked' : c.status === 'Cancelled' ? 'cancelled' : ''}">
              <span class="check-mark" style="cursor:default">${c.status === 'Completed' ? U.icon('check', 12) : ''}</span>
              <div class="check-main">
                <div class="check-task">${U.esc(c.task)}</div>
                <div class="check-meta">${U.priority(c.priority)}
                  ${c.project_name ? `<span class="chip">${U.esc(c.project_name)}</span>` : ''}
                  ${c.status === 'Completed' ? '' : U.badge(c.status)}
                  ${c.carryover_reason ? U.badge(c.carryover_reason, 'gray') : ''}</div>
              </div>
            </div>`).join('')
          : U.empty('No commitments', 'Nothing was committed to for this day.')}
        </div>
      </div>`;
    }).join('')}
  </div></div>`;
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

function weekStart(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + (dt.getDay() === 0 ? -6 : 1 - dt.getDay()));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
