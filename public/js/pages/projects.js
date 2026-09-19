import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, go, activeUsers, dateNote } from '../app.js';
import { projectForm, progressForm, removeEntity } from './forms.js';

const filters = { owner_id: '', status: '', priority: '', department: '', blocked: '', search: '', include_archived: '' };

export async function page(ctx) {
  const projects = await api.get('/projects', { date: state.date, ...filters });
  const departments = [...new Set(state.projects.map((p) => p.department).filter(Boolean))];
  const progressed = projects.filter((p) => p.progressed).length;

  const html = `
    ${dateNote()}
    <div class="section">
      <div class="card"><div class="card-body" style="padding:12px 14px">
        <div class="filters">
          <input class="input" id="f-search" placeholder="Search projects…" value="${U.esc(filters.search)}" style="min-width:180px">
          ${sel('f-owner_id', 'All owners', activeUsers().map((u) => ({ value: u.id, label: u.name })), filters.owner_id)}
          ${sel('f-status', 'All statuses', state.enums.project_statuses, filters.status)}
          ${sel('f-priority', 'All priorities', state.enums.priorities, filters.priority)}
          ${departments.length ? sel('f-department', 'All departments', departments, filters.department) : ''}
          ${sel('f-blocked', 'Blocked & not blocked', [{ value: '1', label: 'Blocked only' }, { value: '0', label: 'Not blocked' }], filters.blocked)}
          <label class="checkbox" style="margin-left:4px">
            <input type="checkbox" id="f-archived"${filters.include_archived ? ' checked' : ''}> Show archived</label>
          <span class="spacer"></span>
          <button class="btn btn-sm" id="clearFilters">Clear</button>
          <button class="btn btn-primary btn-sm" id="newProject">${U.icon('plus', 14)} New project</button>
        </div>
      </div></div>
    </div>

    <div class="section">
      <div class="section-head">
        <h2>${projects.length} project${projects.length === 1 ? '' : 's'}</h2>
        <span class="sub">${progressed} moved measurably on ${U.fmt.date(state.date)}</span>
      </div>
      ${projects.length
        ? `<div class="grid grid-3">${projects.map(card).join('')}</div>`
        : `<div class="card">${U.empty('No projects match', 'Adjust the filters, or create a project.',
            `<button class="btn btn-primary" id="newProject2">${U.icon('plus', 14)} New project</button>`)}</div>`}
    </div>`;

  return {
    title: 'Projects',
    subtitle: `Completion tracked daily · ${U.fmt.longDate(state.date)}`,
    html,
    mount(root) {
      const bind = (id, key, event = 'change') => {
        const el = root.querySelector(`#${id}`);
        if (el) el.addEventListener(event, (e) => {
          filters[key] = e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value;
          refresh();
        });
      };
      bind('f-owner_id', 'owner_id'); bind('f-status', 'status'); bind('f-priority', 'priority');
      bind('f-department', 'department'); bind('f-blocked', 'blocked'); bind('f-archived', 'include_archived');

      const search = root.querySelector('#f-search');
      let timer;
      search.addEventListener('input', (e) => {
        clearTimeout(timer);
        const v = e.target.value;
        timer = setTimeout(() => { filters.search = v; refresh(); }, 320);
      });

      root.querySelector('#clearFilters').addEventListener('click', () => {
        Object.keys(filters).forEach((k) => { filters[k] = ''; });
        refresh();
      });
      root.querySelectorAll('#newProject, #newProject2').forEach((b) =>
        b.addEventListener('click', () => projectForm()));

      root.addEventListener('click', (e) => {
        const open = e.target.closest('[data-open]');
        const edit = e.target.closest('[data-edit]');
        const log = e.target.closest('[data-log]');
        const archive = e.target.closest('[data-archive]');
        const remove = e.target.closest('[data-remove]');
        if (open) go(`#/project/${open.dataset.open}`);
        if (edit) projectForm(projects.find((p) => p.id === Number(edit.dataset.edit)));
        if (log) progressForm({ project_id: Number(log.dataset.log), log_date: state.date, user_id: state.currentUserId });
        if (archive) {
          const p = projects.find((x) => x.id === Number(archive.dataset.archive));
          api.post(`/projects/${p.id}/archive`, { archived: !p.archived })
            .then(() => { U.toast(p.archived ? 'Project restored' : 'Project archived'); refresh(); })
            .catch((err) => U.toast(err.message, 'error'));
        }
        if (remove) {
          const p = projects.find((x) => x.id === Number(remove.dataset.remove));
          U.confirmRemove({
            title: 'Remove project',
            message: `Permanently remove "${p.name}"?`,
            detail: 'Its progress history, milestones, blockers and deployments are removed with it. To keep the history, archive it instead.',
            confirmLabel: 'Remove permanently',
            async onConfirm() {
              await api.del(`/projects/${p.id}`);
              U.toast(`${p.name} removed`);
              const { reloadBootstrap } = await import('../app.js');
              await reloadBootstrap();
              refresh();
            }
          });
        }
      });
    }
  };
}

const sel = (id, placeholder, options, value) => `
  <select class="select" id="${id}">
    <option value="">${U.esc(placeholder)}</option>
    ${options.map((o) => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      return `<option value="${U.esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${U.esc(l)}</option>`;
    }).join('')}
  </select>`;

function card(p) {
  const overdue = p.target_date && p.target_date < state.date && p.status !== 'Completed';
  const stale = p.days_since_progress === null || p.days_since_progress >= Number(state.settings.stagnation_days || 2);
  return `<div class="card" style="${p.archived ? 'opacity:.62;' : ''}${stale ? 'border-color:var(--orange-bd);' : ''}">
    <div class="card-head" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <a href="#/project/${p.id}" style="font-weight:650;font-size:14.5px">${U.esc(p.name)}</a>
        <div class="row small muted" style="gap:6px;margin-top:4px">
          ${U.priority(p.priority)} ${U.badge(p.status)}
          ${p.archived ? U.badge('Archived', 'gray') : ''}
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="row" style="justify-content:space-between;margin-bottom:5px">
        <span class="small muted">Yesterday ${p.previous_pct}%</span>
        ${U.fmt.delta(p.progress_today)}
      </div>
      ${U.progressBar(p.previous_pct, p.today_pct)}
      ${p.milestones_completed?.length ? `<div class="small" style="color:var(--green);margin-top:7px">
        ${U.icon('check', 11)} Milestone reached: ${U.esc(p.milestones_completed.map((m) => m.name).join(', '))}</div>` : ''}
      ${stale ? `<div class="small" style="color:var(--orange);margin-top:7px">${U.icon('alert', 11)}
        ${p.last_progress_date
          ? `No measurable progress for ${p.days_since_progress} business day${p.days_since_progress === 1 ? '' : 's'}`
          : 'No measurable progress recorded yet'}</div>` : ''}

      <div class="divider"></div>
      <dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0;font-size:12.5px">
        <dt class="muted">Owner</dt><dd style="margin:0">${U.esc(p.owner_name || 'Unassigned')}${p.secondary_name ? ` <span class="muted">+ ${U.esc(p.secondary_name)}</span>` : ''}</dd>
        <dt class="muted">Phase</dt><dd style="margin:0">${U.esc(p.current_phase || '—')}</dd>
        <dt class="muted">Deadline</dt><dd style="margin:0${overdue ? ';color:var(--red);font-weight:600' : ''}">${U.fmt.date(p.target_date)}${overdue ? ' (passed)' : ''}</dd>
        <dt class="muted">Next</dt><dd style="margin:0">${U.esc(p.next_step || 'Not set')}</dd>
        ${p.blocker_summary ? `<dt class="muted">Blocked</dt><dd style="margin:0;color:var(--orange)">${U.esc(p.blocker_summary)}</dd>` : ''}
        ${p.department ? `<dt class="muted">Dept</dt><dd style="margin:0">${U.esc(p.department)}</dd>` : ''}
      </dl>
    </div>
    <div class="card-body" style="border-top:1px solid var(--border);padding:10px 14px">
      <div class="row" style="gap:6px">
        <button class="btn btn-sm" data-log="${p.id}">${U.icon('plus', 13)} Log progress</button>
        <button class="btn btn-sm" data-open="${p.id}">Open</button>
        <span class="spacer"></span>
        <button class="icon-btn" data-edit="${p.id}" title="Edit">${U.icon('edit', 15)}</button>
        <button class="icon-btn" data-archive="${p.id}" title="${p.archived ? 'Restore' : 'Archive'}">${U.icon(p.archived ? 'refresh' : 'inbox', 15)}</button>
        <button class="icon-btn danger" data-remove="${p.id}" title="Remove">${U.icon('trash', 15)}</button>
      </div>
    </div>
  </div>`;
}
