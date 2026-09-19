import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, activeUsers, dateNote } from '../app.js';
import { blockerForm } from './forms.js';

const filters = { status: '', project_id: '', owner_id: '', priority: '', reason: '', open: '1' };

export async function page() {
  const rows = await api.get('/blockers', { date: state.date, ...filters });
  const open = rows.filter((b) => b.status !== 'Resolved');
  const bands = { 'Same Day': 0, '1 Day': 0, '2 Days': 0, '3+ Days': 0 };
  for (const b of open) bands[b.age_band]++;

  const html = `
    ${dateNote()}
    <div class="section"><div class="grid grid-kpi">
      ${U.kpiCard({ label: 'Open blockers', value: String(open.length),
        meta: open.length ? 'Work that cannot move without someone else' : 'Nothing is blocked',
        accent: open.length ? 'orange' : 'green', iconName: 'blockers' })}
      ${U.kpiCard({ label: 'Blocked over 1 business day', value: String(open.filter((b) => b.aging).length),
        meta: 'These need chasing or escalation', accent: open.some((b) => b.aging) ? 'red' : 'green', iconName: 'alert' })}
      ${U.kpiCard({ label: 'Escalated', value: String(open.filter((b) => b.status === 'Escalated').length), accent: 'yellow', iconName: 'target' })}
      ${U.kpiCard({ label: 'Nobody assigned', value: String(open.filter((b) => !b.person_needed).length),
        meta: 'No person or department recorded', accent: open.some((b) => !b.person_needed) ? 'yellow' : 'green', iconName: 'team' })}
      ${U.kpiCard({ label: 'Resolved on this date', value: String(rows.filter((b) => b.resolved_date === state.date).length), accent: 'green', iconName: 'check' })}
    </div></div>

    <div class="section">
      <div class="card"><div class="card-body" style="padding:12px 14px">
        <div class="filters">
          ${sel('f-open', null, [{ value: '1', label: 'Open only' }, { value: '', label: 'Open and resolved' }], filters.open)}
          ${sel('f-status', 'Any status', state.enums.blocker_statuses, filters.status)}
          ${sel('f-reason', 'Any reason', state.enums.blocker_reasons, filters.reason)}
          ${sel('f-owner_id', 'Any owner', activeUsers().map((u) => ({ value: u.id, label: u.name })), filters.owner_id)}
          ${sel('f-project_id', 'Any project', state.projects.map((p) => ({ value: p.id, label: p.name })), filters.project_id)}
          ${sel('f-priority', 'Any priority', state.enums.priorities, filters.priority)}
          <span class="spacer"></span>
          <button class="btn btn-sm" id="clearFilters">Clear</button>
          <button class="btn btn-primary btn-sm" id="add">${U.icon('plus', 14)} Report blocker</button>
        </div>
      </div></div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Aging</h2><span class="sub">Business days blocked</span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        ${Object.entries(bands).map(([band, n]) => `
          <div class="card"><div class="card-body" style="padding:13px">
            <div style="font-size:22px;font-weight:650;${n && (band === '3+ Days' || band === '2 Days') ? 'color:var(--red)' : ''}">${n}</div>
            <div class="small muted">${band}</div>
          </div></div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Blockers</h2><span class="sub">${rows.length} shown</span></div>
      <div class="card">
        ${U.table(
          ['Blocker', 'Project', 'Owner', 'Reported', 'Needed from', 'Reason', 'Priority', 'Status', 'Days blocked', 'Resolution', ''],
          rows,
          (b) => `<tr${b.aging ? ' class="row-warn"' : ''}>
            <td><b>${U.esc(b.title)}</b>${b.notes ? `<div class="small muted">${U.esc(b.notes)}</div>` : ''}</td>
            <td class="nowrap muted">${U.esc(b.project_name || '—')}</td>
            <td class="nowrap">${U.esc(b.owner_name || 'Unassigned')}</td>
            <td class="nowrap">${U.fmt.date(b.date_reported)}</td>
            <td class="nowrap">${b.person_needed ? U.esc(b.person_needed) : '<span class="badge yellow">Nobody assigned</span>'}</td>
            <td class="nowrap muted">${U.esc(b.reason)}</td>
            <td>${U.priority(b.priority)}</td>
            <td>${U.badge(b.status)}</td>
            <td class="num">${U.badge(b.age_band, b.age_band === '3+ Days' ? 'red' : b.age_band === '2 Days' ? 'orange' : b.age_band === '1 Day' ? 'yellow' : 'gray')}</td>
            <td class="muted">${U.esc(b.resolution || '—')}</td>
            ${U.rowActions(b.id, { extra: b.status !== 'Resolved'
              ? `<button class="icon-btn" data-resolve="${b.id}" title="Mark resolved">${U.icon('check', 15)}</button>` : '' })}
          </tr>`,
          'No blockers match these filters. Nothing is in the way.'
        )}
      </div>
    </div>`;

  return {
    title: 'Blockers',
    subtitle: 'What cannot move without someone else',
    html,
    mount(root) {
      const bind = (id, key) => root.querySelector(`#${id}`)?.addEventListener('change', (e) => {
        filters[key] = e.target.value; refresh();
      });
      bind('f-open', 'open'); bind('f-status', 'status'); bind('f-reason', 'reason');
      bind('f-owner_id', 'owner_id'); bind('f-project_id', 'project_id'); bind('f-priority', 'priority');
      root.querySelector('#clearFilters').addEventListener('click', () => {
        Object.assign(filters, { status: '', project_id: '', owner_id: '', priority: '', reason: '', open: '1' });
        refresh();
      });
      root.querySelector('#add').addEventListener('click', () =>
        blockerForm({ owner_id: state.currentUserId, date_reported: state.date }));

      root.addEventListener('click', (e) => {
        const edit = e.target.closest('[data-edit]')?.dataset.edit;
        const remove = e.target.closest('[data-remove]')?.dataset.remove;
        const resolve = e.target.closest('[data-resolve]')?.dataset.resolve;
        if (edit) blockerForm(rows.find((b) => b.id === Number(edit)));
        if (resolve) resolveBlocker(rows.find((b) => b.id === Number(resolve)));
        if (remove) {
          const b = rows.find((x) => x.id === Number(remove));
          U.confirmRemove({
            title: 'Remove blocker',
            message: `Remove "${b.title}"?`,
            detail: 'If it was actually cleared, mark it resolved instead so the resolution stays on the record.',
            async onConfirm() { await api.del(`/blockers/${b.id}`); U.toast('Blocker removed'); refresh(); }
          });
        }
      });
    }
  };
}

function resolveBlocker(b) {
  U.openModal({
    title: 'Resolve blocker',
    subtitle: b.title,
    body: `<div class="field"><label>How was it unblocked? <span class="req">*</span></label>
      <textarea class="textarea" id="res" rows="3" placeholder="e.g. IT issued the production credentials"></textarea></div>
      <div class="field"><label>Resolved date</label>
      <input class="input" type="date" id="rdate" value="${U.esc(state.date)}"></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="doResolve">Mark resolved</button>`,
    onMount(modal, close) {
      modal.querySelector('#doResolve').addEventListener('click', async () => {
        const resolution = modal.querySelector('#res').value.trim();
        if (!resolution) return U.toast('Describe how it was unblocked', 'error');
        await api.patch(`/blockers/${b.id}`, { status: 'Resolved', resolution, resolved_date: modal.querySelector('#rdate').value });
        close();
        U.toast('Blocker resolved', 'success');
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
