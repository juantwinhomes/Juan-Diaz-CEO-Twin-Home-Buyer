import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, go } from '../app.js';
import { projectForm, progressForm, blockerForm, deploymentForm, impactForm, commitmentForm } from './forms.js';

export async function page(ctx) {
  const p = await api.get(`/projects/${ctx.param}`, { date: state.date });
  const overdue = p.target_date && p.target_date < state.date && p.status !== 'Completed';

  const html = `
    <div class="section">
      <a href="#/projects" class="small muted">← All projects</a>
    </div>

    <div class="section grid grid-2" style="align-items:start">
      <div class="card">
        <div class="card-head">
          <h2>Progress</h2>
          <span class="spacer"></span>
          ${U.priority(p.priority)} ${U.badge(p.status)} ${p.project_type ? U.typeBadge(p.project_type) : ''}
        </div>
        <div class="card-body">
          <div id="pctBlock">${pctBlock(p)}</div>
          <div class="divider"></div>
          <div class="row">
            <button class="btn btn-primary btn-sm" data-action="log">${U.icon('plus', 13)} Log progress</button>
            <button class="btn btn-sm" data-action="deploy">${U.icon('rocket', 13)} Log deployment</button>
            <button class="btn btn-sm" data-action="block">${U.icon('blockers', 13)} Report blocker</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Milestones</h2><span class="sub">Progress framework</span></div>
        <div class="card-body tight">
          ${p.milestones.map((m) => `
            <div class="row" style="padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:nowrap">
              <button class="check-mark" data-milestone="${m.id}" data-done="${m.completed}"
                      title="${m.completed ? 'Mark not reached' : 'Mark reached'}"
                      style="${m.completed ? 'background:var(--green);border-color:var(--green);color:#fff' : ''}">
                ${m.completed ? U.icon('check', 12) : ''}</button>
              <span style="flex:1;min-width:0;${m.completed ? '' : 'color:var(--text-2)'}">${U.esc(m.name)}</span>
              <span class="small muted nowrap">${m.target_pct}%</span>
              ${m.completed_date ? `<span class="chip nowrap">${U.fmt.date(m.completed_date)}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card">
        <div class="card-head">
          <h2>To-dos</h2>
          <span class="sub">${countsFromTodos(p)
            ? 'Ticking these is what moves the percentage'
            : 'This project\'s percentage is set by hand, so these do not move it'}</span>
          <span class="spacer"></span>
          <span class="badge ${p.commitment_progress.total && p.commitment_progress.done === p.commitment_progress.total ? 'green' : 'gray'}"
                id="todoCount">${p.commitment_progress.done} of ${p.commitment_progress.total} done</span>
          <button class="btn btn-sm btn-primary" data-action="add-todo">${U.icon('plus', 13)} Add to-do</button>
        </div>
        ${p.commitments.length ? `<div class="card-body tight">
          <div class="check-list">${p.commitments.map(todoItem).join('')}</div>
        </div>` : `<div class="card-body">${U.empty('No to-dos yet',
          'Add what has to be finished for this project. The percentage counts them.')}</div>`}
      </div>
    </div>

    <div class="section grid grid-2" style="align-items:start">
      <div class="card">
        <div class="card-head"><h2>Details</h2><span class="spacer"></span>
          <button class="btn btn-sm" data-action="edit">${U.icon('edit', 13)} Edit</button></div>
        <div class="card-body">
          <dl style="display:grid;grid-template-columns:auto 1fr;gap:9px 14px;margin:0;font-size:13px">
            ${row('Owner', p.owner_name || 'Unassigned')}
            ${row('Secondary owner', p.secondary_name || '—')}
            ${row('Type', p.project_type || '—')}
            ${row('Requester / department', [p.requester, p.department].filter(Boolean).join(' · ') || '—')}
            ${row('Start date', U.fmt.date(p.start_date))}
            ${row('Target completion', `${U.fmt.date(p.target_date)}${overdue ? ' <span style="color:var(--red)">(passed)</span>' : ''}`, true)}
            ${row('Completion %', countsFromTodos(p)
              ? `Counted from ${p.commitment_progress.total} to-do${p.commitment_progress.total === 1 ? '' : 's'}`
              : 'Set by hand')}
            ${row('Current phase', p.current_phase || '—')}
            ${row('Next step', p.next_step || 'Not set')}
            ${row('Business objective', p.business_objective || '—')}
            ${row('Expected impact', p.expected_impact || '—')}
            ${row('Production link', p.production_url
              ? `<a href="${U.esc(p.production_url)}" target="_blank" rel="noopener">${U.esc(p.production_url)} ${U.icon('link', 11)}</a>`
              : '—', true)}
            ${row('Notes', p.notes || '—')}
          </dl>
          <div class="divider"></div>
          <div class="row">
            <button class="btn btn-sm" data-action="archive">${U.icon(p.archived ? 'refresh' : 'inbox', 13)} ${p.archived ? 'Restore' : 'Archive'}</button>
            <span class="spacer"></span>
            <button class="btn btn-sm btn-danger" data-action="delete">${U.icon('trash', 13)} Remove project</button>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Blockers</h2><span class="spacer"></span>
            <span class="badge ${p.blockers.length ? 'orange' : 'green'}">${p.blockers.length} open</span></div>
          ${p.all_blockers.length ? `<div class="card-body tight">
            ${p.all_blockers.map((b) => `
              <div style="padding:9px 0;border-bottom:1px solid var(--border)">
                <div class="row" style="flex-wrap:nowrap;gap:8px">
                  <span style="flex:1;min-width:0;font-weight:500">${U.esc(b.title)}</span>
                  ${U.badge(b.status)}
                  <button class="icon-btn" data-blocker="${b.id}" title="Edit">${U.icon('edit', 14)}</button>
                </div>
                <div class="small muted">${U.esc(b.reason)} · reported ${U.fmt.date(b.date_reported)}${b.person_needed ? ` · needs ${U.esc(b.person_needed)}` : ''}</div>
              </div>`).join('')}
          </div>` : U.empty('Nothing blocked', 'No blockers have been reported for this project.')}
        </div>

        <div class="card">
          <div class="card-head"><h2>Deployments</h2><span class="spacer"></span>
            <span class="badge gray">${p.deployment_history.length}</span></div>
          ${p.deployment_history.length ? `<div class="card-body tight">
            ${p.deployment_history.map((d) => `
              <div class="row" style="padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:nowrap;gap:8px">
                <span style="flex:1;min-width:0">${U.esc(d.title)}</span>
                ${U.badge(d.kind, d.kind === 'Fix' ? 'orange' : 'blue')}
                <span class="small muted nowrap">${U.fmt.date(d.deploy_date)}</span>
              </div>`).join('')}
          </div>` : U.empty('Nothing deployed yet', '')}
        </div>

        <div class="card">
          <div class="card-head"><h2>Business impact</h2><span class="sub">Not part of the daily score</span>
            <span class="spacer"></span>
            <button class="btn btn-sm" data-action="impact">${U.icon(p.impact ? 'edit' : 'plus', 13)} ${p.impact ? 'Edit' : 'Add'}</button></div>
          <div class="card-body">
            ${p.impact ? `<dl style="display:grid;grid-template-columns:auto 1fr;gap:7px 14px;margin:0;font-size:13px">
              ${row('Manual process replaced', p.impact.manual_process || '—')}
              ${row('Minutes per run', p.impact.minutes_per_run)}
              ${row('Runs per week', p.impact.runs_per_week)}
              ${row('Hours saved / week', U.fmt.num((p.impact.minutes_per_run * p.impact.runs_per_week) / 60))}
              ${row('Monthly saving', U.fmt.money((p.impact.minutes_per_run * p.impact.runs_per_week / 60) * 4.33 * p.impact.hourly_cost, state.settings.currency))}
            </dl>` : `<p class="small muted">No impact recorded. Add it once the system is live.</p>`}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Daily progress log</h2>
        <span class="sub">Every entry, newest first</span>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-primary" data-action="log">${U.icon('plus', 13)} Add entry</button></div>
      <div class="card">
        ${U.table(
          ['Date', 'Person', 'Previous', 'New', 'Change', 'What was completed', 'What is next', 'Blocker', ''],
          p.history,
          (l) => `<tr>
            <td class="nowrap">${U.fmt.date(l.log_date)}</td>
            <td class="nowrap">${U.esc(l.user_name || '—')}</td>
            <td class="num muted">${l.previous_pct}%</td>
            <td class="num"><b>${l.new_pct}%</b></td>
            <td class="num">${U.fmt.delta(l.new_pct - l.previous_pct)}</td>
            <td>${U.esc(l.completed_text)}
              ${l.commitment_id ? ` <span class="badge gray" title="Recorded when the daily commitment was ticked complete">${U.icon('check', 9)} From a commitment</span>` : ''}</td>
            <td class="muted">${U.esc(l.next_text || '—')}</td>
            <td class="muted">${U.esc(l.blocker_text || '—')}</td>
            ${U.rowActions(l.id)}
          </tr>`,
          'No progress has been logged for this project yet.'
        )}
      </div>
    </div>`;

  return {
    title: p.name,
    subtitle: `${p.owner_name || 'Unassigned'} · ${p.status} · ${p.today_pct}% complete`,
    html,
    mount(root) {
      // Ticking to-dos should feel like ticking a list, not like reloading a
      // page. The percentage, the bar and the counter settle once the ticking
      // stops rather than after every box.
      let settleTimer = null;
      const settle = () => {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(async () => {
          try {
            const fresh = await api.get(`/projects/${p.id}`, { date: state.date });
            Object.assign(p, fresh);
            const block = root.querySelector('#pctBlock');
            if (block) block.innerHTML = pctBlock(fresh);
            const count = root.querySelector('#todoCount');
            if (count) {
              count.textContent = `${fresh.commitment_progress.done} of ${fresh.commitment_progress.total} done`;
              const all = fresh.commitment_progress.total && fresh.commitment_progress.done === fresh.commitment_progress.total;
              count.className = `badge ${all ? 'green' : 'gray'}`;
            }
          } catch { /* the numbers catch up on the next action */ }
        }, 800);
      };

      root.addEventListener('click', async (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        const editLog = e.target.closest('[data-edit]')?.dataset.edit;
        const removeLog = e.target.closest('[data-remove]')?.dataset.remove;
        const milestone = e.target.closest('[data-milestone]');
        const blocker = e.target.closest('[data-blocker]')?.dataset.blocker;
        const todo = e.target.closest('[data-todo]')?.dataset.todo;
        const todoEdit = e.target.closest('[data-todo-edit]')?.dataset.todoEdit;
        const todoRemove = e.target.closest('[data-todo-remove]')?.dataset.todoRemove;

        if (action === 'log') progressForm({ project_id: p.id, log_date: state.date, user_id: state.currentUserId });
        if (action === 'deploy') deploymentForm({ project_id: p.id, deploy_date: state.date, user_id: state.currentUserId });
        if (action === 'block') blockerForm({ project_id: p.id, date_reported: state.date, owner_id: p.owner_id });
        if (action === 'edit') projectForm(p);
        if (action === 'add-todo') {
          commitmentForm({ project_id: p.id, user_id: state.currentUserId || p.owner_id, commit_date: state.date });
        }
        if (todo) {
          const c = p.commitments.find((x) => x.id === Number(todo));
          const before = { ...c };
          // Redraw the one line now; the percentage above catches up once the
          // ticking stops, so a run of them does not reload the page each time.
          c.status = c.status === 'Completed' ? 'In Progress' : 'Completed';
          redrawTodo(root, c);
          try {
            const res = await api.patch(`/commitments/${c.id}`, { status: c.status }, { date: state.date });
            Object.assign(c, res);
            redrawTodo(root, c);
            U.toast(c.status === 'Completed' ? 'Ticked off' : 'Put back on the list', 'success');
            settle();
          } catch (err) {
            Object.assign(c, before);
            redrawTodo(root, c);
            U.toast(err.message, 'error');
          }
        }
        if (todoEdit) commitmentForm(p.commitments.find((x) => x.id === Number(todoEdit)));
        if (todoRemove) {
          const c = p.commitments.find((x) => x.id === Number(todoRemove));
          U.confirmRemove({
            title: 'Remove to-do',
            message: `Remove "${c.task}"?`,
            detail: "It stops counting towards this project's percentage.",
            async onConfirm() { await api.del(`/commitments/${c.id}`, { date: state.date }); U.toast('To-do removed'); refresh(); }
          });
        }
        if (action === 'impact') impactForm(p.impact || { project_id: p.id });
        if (action === 'archive') {
          await api.post(`/projects/${p.id}/archive`, { archived: !p.archived });
          U.toast(p.archived ? 'Project restored' : 'Project archived');
          refresh();
        }
        if (action === 'delete') {
          U.confirmRemove({
            title: 'Remove project',
            message: `Permanently remove "${p.name}"?`,
            detail: `${p.history.length} progress entries, ${p.all_blockers.length} blockers and ${p.deployment_history.length} deployments are removed with it. Archive instead to keep the history.`,
            confirmLabel: 'Remove permanently',
            async onConfirm() {
              await api.del(`/projects/${p.id}`);
              const { reloadBootstrap } = await import('../app.js');
              await reloadBootstrap();
              U.toast(`${p.name} removed`);
              go('#/projects');
            }
          });
        }
        if (editLog) progressForm(p.history.find((l) => l.id === Number(editLog)));
        if (removeLog) {
          const l = p.history.find((x) => x.id === Number(removeLog));
          U.confirmRemove({
            title: 'Remove progress entry',
            message: `Remove the entry from ${U.fmt.date(l.log_date)}?`,
            detail: "The project's completion % is recalculated from the entries that remain.",
            async onConfirm() { await api.del(`/progress/${l.id}`); U.toast('Entry removed'); refresh(); }
          });
        }
        if (milestone) {
          const done = milestone.dataset.done === '1';
          await api.patch(`/milestones/${milestone.dataset.milestone}`, { completed: !done, completed_date: state.date });
          refresh();
        }
        if (blocker) blockerForm(p.all_blockers.find((b) => b.id === Number(blocker)));
      });
    }
  };
}

/** The part of the page a tick changes, so ticking can redraw only this. */
function pctBlock(p) {
  return `
    <div class="row" style="align-items:baseline;gap:8px">
      <span style="font-size:36px;font-weight:650;letter-spacing:-.03em;line-height:1">${p.today_pct}%</span>
      <span class="small muted">complete</span>
      <span class="spacer"></span>
      <span class="small">${p.progress_today
        ? `${U.fmt.delta(p.progress_today)} <span class="muted">today</span>`
        : '<span class="muted">no change today</span>'}</span>
    </div>
    <div style="margin-top:12px">${U.progressBar(p.previous_pct, p.today_pct, false)}</div>
    <div class="small muted" style="margin-top:6px">
      ${countsFromTodos(p)
        ? `${p.commitment_progress.done} of ${p.commitment_progress.total} to-dos done · was ${p.previous_pct}% at the start of the day`
        : `Set by hand · was ${p.previous_pct}% at the start of the day`}
    </div>
    <div class="small ${p.progressed ? '' : 'muted'}" style="margin-top:9px;${p.progressed ? 'color:var(--green)' : ''}">
      ${p.progressed
        ? `${U.icon('check', 12)} ${U.esc(p.evidence.join(' · '))}`
        : `<span style="color:var(--orange)">${U.icon('alert', 12)} Nothing logged on ${U.fmt.date(state.date)}</span>`}
    </div>`;
}

/** True when this project's percentage is counted from its to-dos. */
const countsFromTodos = (p) => p.pct_from_commitments !== 0 && p.commitment_progress.total > 0;

/** Redraw one to-do in place, leaving the rest of the page where it is. */
function redrawTodo(root, c) {
  const el = root.querySelector(`.check-item[data-id="${c.id}"]`);
  if (el) el.outerHTML = todoItem(c);
}

/** One to-do: the same tick box as the Today page, in the project's own list. */
function todoItem(c) {
  const done = c.status === 'Completed';
  const cls = done ? 'done' : c.status === 'Blocked' ? 'blocked' : c.status === 'Cancelled' ? 'cancelled' : '';
  return `<div class="check-item ${cls}" data-id="${c.id}">
    <button class="check-mark" data-todo="${c.id}" aria-label="${done ? 'Mark not done' : 'Mark done'}">
      ${done ? U.icon('check', 12) : c.status === 'Blocked' ? U.icon('alert', 11) : c.status === 'Cancelled' ? U.icon('x', 11) : ''}
    </button>
    <div class="check-main">
      <div class="check-task">${U.esc(c.task)}</div>
      <div class="check-meta">
        ${U.priority(c.priority)}
        ${U.badge(c.status)}
        <span class="chip">${U.fmt.date(c.commit_date)}</span>
        ${c.user_name ? `<span class="chip">${U.esc(c.user_name)}</span>` : ''}
      </div>
    </div>
    <div class="check-actions">
      <button class="icon-btn" data-todo-edit="${c.id}" title="Edit">${U.icon('edit', 15)}</button>
      <button class="icon-btn danger" data-todo-remove="${c.id}" title="Remove">${U.icon('trash', 15)}</button>
    </div>
  </div>`;
}

const row = (label, value, raw = false) =>
  `<dt class="muted nowrap">${U.esc(label)}</dt><dd style="margin:0">${raw ? value : U.esc(value)}</dd>`;
