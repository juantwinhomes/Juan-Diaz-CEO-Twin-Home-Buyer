import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, go, activeUsers, setCurrentUser, isToday, dateNote } from '../app.js';
import { commitmentForm, progressForm, deploymentForm, blockerForm, incidentForm, commitmentFeedback } from './forms.js';

export async function page(ctx) {
  const users = activeUsers();
  const userId = state.currentUserId || users[0]?.id;
  if (!userId) {
    return { title: 'Today', subtitle: '', html: U.empty('No team members yet', 'Add someone on the Team page first.') };
  }

  const data = await api.get('/today', { date: state.date, user_id: userId });
  const user = users.find((u) => u.id === userId);
  const commitments = data.commitments;
  const max = Number(state.settings.max_commitments || 5);

  const hour = new Date().getHours();
  const greeting = !isToday() ? 'Reviewing' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const prompt = commitments.length === 0
    ? 'What are your concrete deliverables today?'
    : hour >= 16 || !isToday()
      ? 'Time to close out the day — what was completed, what remains, what is blocked?'
      : 'Update your progress as you go.';

  const html = `
    ${dateNote()}
    <div class="section">
      <div class="card">
        <div class="card-body">
          <div class="row" style="gap:14px;flex-wrap:nowrap;align-items:flex-start">
            ${U.avatar(user, 'lg')}
            <div style="flex:1;min-width:0">
              <h2 style="font-size:17px">${greeting}, ${U.esc(user.name.split(' ')[0])}.</h2>
              <p class="muted" style="margin-top:3px">${U.esc(prompt)}</p>
            </div>
            ${users.length > 1 ? `<select class="select" id="userSwitch" style="width:auto;min-width:150px">
              ${users.map((u) => `<option value="${u.id}"${u.id === userId ? ' selected' : ''}>${U.esc(u.name)}</option>`).join('')}
            </select>` : ''}
          </div>
          <div class="stat-row" id="dayStats" style="margin:15px -16px -16px;border-radius:0 0 12px 12px;overflow:hidden;border-bottom:0;border-top:1px solid var(--border)">
            ${statRow(data.scorecard, commitments)}
          </div>
        </div>
      </div>
    </div>

    <div class="section grid grid-2" style="align-items:start">
      <div class="card">
        <div class="card-head">
          <h2>Today's commitments</h2>
          <span class="sub" id="commitCount">${countedOf(commitments)} of ${max} recommended</span>
          <span class="spacer"></span>
          <button class="btn btn-primary btn-sm" data-action="add-commitment">
            ${U.icon('plus', 14)} Add</button>
        </div>
        ${commitments.length === 0 ? `
          <div class="card-body">
            <div class="callout info">${U.icon('target', 16)}
              <div><b>${U.esc(state.guidance.helper || '')}</b>
              <p style="margin-top:4px">Enter 1–${max} concrete deliverables you expect to finish today.</p></div>
            </div>
            <div style="margin-top:12px"><button class="btn btn-primary" data-action="add-commitment">${U.icon('plus', 14)} Add your first commitment</button></div>
          </div>`
        : `<div class="check-list" id="checkList">${checkList(commitments)}</div>`}
        <div id="unexplained">${unexplainedBlock(commitments)}</div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head">
            <h2>Log progress</h2>
            <span class="sub">What moved on each project</span>
          </div>
          <div class="card-body tight" id="projectPanel">${projectRows(data.my_projects)}</div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Quick actions</h2></div>
          <div class="card-body">
            <div class="row">
              <button class="btn" data-action="add-deployment">${U.icon('rocket', 15)} Log a deployment</button>
              <button class="btn" data-action="add-blocker">${U.icon('blockers', 15)} Report a blocker</button>
              <button class="btn" data-action="add-incident">${U.icon('production', 15)} Report a production issue</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>End of day</h2><span class="sub">Under 5 minutes</span></div>
          <div class="card-body">
            <p class="small muted" style="margin-bottom:11px">
              Closing the day checks that every unfinished commitment has a reason, stores the day's KPI snapshot,
              and generates the end-of-day summary.</p>
            <div class="row">
              <button class="btn btn-primary" data-action="close-day">${U.icon('check', 15)} Close out the day</button>
              <button class="btn" data-action="eod-report">${U.icon('reports', 15)} Preview EOD report</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  return {
    title: 'Today',
    subtitle: `${data.day_name}, ${data.date_label}`,
    html,
    mount(root) {
      const switcher = root.querySelector('#userSwitch');
      if (switcher) switcher.addEventListener('change', (e) => { setCurrentUser(e.target.value); refresh(); });

      /* --------------------------------------------------------------
         Ticking a box redraws that one line, not the page. Someone going
         down the list can tick four things in four seconds without the
         screen shifting under them; the numbers around the list catch up
         once the ticking stops.
      -------------------------------------------------------------- */
      const rowOf = (id) => root.querySelector(`.check-item[data-id="${id}"]`);

      const redraw = (c) => {
        const el = rowOf(c.id);
        if (el) el.outerHTML = checkItem(c);
        const counter = root.querySelector(`.check-group[data-group="${c.project_id || 0}"] [data-group-count]`);
        if (counter) {
          const mine = commitments.filter((x) => (x.project_id || 0) === (c.project_id || 0));
          counter.textContent = `${mine.filter((x) => x.status === 'Completed').length} of ${mine.length} done`;
        }
      };

      let settleTimer = null;
      const settleNumbers = () => {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(async () => {
          try {
            const fresh = await api.get('/today', { date: state.date, user_id: userId });
            const put = (sel, inner) => { const el = root.querySelector(sel); if (el) el.innerHTML = inner; };
            put('#dayStats', statRow(fresh.scorecard, fresh.commitments));
            put('#projectPanel', projectRows(fresh.my_projects));
            put('#unexplained', unexplainedBlock(fresh.commitments));
            const sub = root.querySelector('#commitCount');
            if (sub) sub.textContent = `${countedOf(fresh.commitments)} of ${max} recommended`;
          } catch { /* the numbers catch up on the next action */ }
        }, 800);
      };

      /** Save a status change, showing it before the request comes back. */
      const applyStatus = async (c, body) => {
        const before = { ...c };
        Object.assign(c, body);
        redraw(c);
        try {
          const res = await api.patch(`/commitments/${c.id}`, body, { date: state.date });
          Object.assign(c, res);
          redraw(c);
          settleNumbers();
          return res;
        } catch (err) {
          Object.assign(c, before);
          redraw(c);
          U.toast(err.message, 'error');
          return null;
        }
      };

      root.addEventListener('click', async (e) => {
        const t = e.target;
        const action = t.closest('[data-action]')?.dataset.action;
        const logId = t.closest('[data-log]')?.dataset.log;
        const toggleId = t.closest('[data-toggle]')?.dataset.toggle;
        const editId = t.closest('[data-edit]')?.dataset.edit;
        const removeId = t.closest('[data-remove]')?.dataset.remove;
        const statusId = t.closest('[data-status]')?.dataset.status;

        if (action === 'add-commitment') commitmentForm({ user_id: userId, commit_date: state.date });
        if (action === 'add-deployment') deploymentForm({ user_id: userId, deploy_date: state.date });
        if (action === 'add-blocker') blockerForm({ owner_id: userId, date_reported: state.date });
        if (action === 'add-incident') incidentForm({ reported_by: userId, reported_date: state.date });
        if (action === 'close-day') closeDay(userId);
        if (action === 'eod-report') showEod();
        if (logId) progressForm({ project_id: Number(logId), user_id: userId, log_date: state.date });
        if (editId) commitmentForm(commitments.find((x) => x.id === Number(editId)));
        if (statusId) setStatus(commitments.find((x) => x.id === Number(statusId)), false, applyStatus);
        if (toggleId) {
          const c = commitments.find((x) => x.id === Number(toggleId));
          if (c.status === 'Completed') setStatus(c, true, applyStatus);
          else {
            const res = await applyStatus(c, { status: 'Completed' });
            if (res) U.toast(...commitmentFeedback(res));
          }
        }
        if (removeId) {
          const c = commitments.find((x) => x.id === Number(removeId));
          U.confirmRemove({
            title: 'Remove commitment',
            message: `Remove "${c.task}"?`,
            detail: 'It disappears from today\'s score. If the work simply did not happen, set a reason instead so it stays on the record.',
            onConfirm: async () => {
              await api.del(`/commitments/${c.id}`, { date: state.date });
              commitments.splice(commitments.indexOf(c), 1);
              U.toast('Commitment removed');
              // The last one on the list takes the empty state with it.
              if (!commitments.length) return refresh();
              const el = rowOf(c.id);
              const group = el && el.closest('.check-group');
              if (el) el.remove();
              if (group && !group.querySelector('.check-item')) group.remove();
              redraw(c);
              settleNumbers();
            }
          });
        }
      });
    }
  };
}

const countedOf = (rows) => rows.filter((c) => c.status !== 'Cancelled').length;

function statRow(sc, rows) {
  const done = rows.filter((c) => c.status === 'Completed').length;
  return `
    <div class="stat"><div class="v">${done}/${countedOf(rows)}</div><div class="k">Commitments</div></div>
    <div class="stat"><div class="v ${sc && sc.commitments.rate >= 80 ? 'green' : ''}">${sc ? sc.commitments.rate : 0}%</div><div class="k">Completion</div></div>
    <div class="stat"><div class="v">${sc ? sc.projects.progressed : 0}/${sc ? sc.projects.active : 0}</div><div class="k">Projects moved</div></div>
    <div class="stat"><div class="v ${sc && sc.deployments.total ? 'blue' : ''}">${sc ? sc.deployments.total : 0}</div><div class="k">Deployments</div></div>
    <div class="stat"><div class="v ${sc && sc.blockers.open ? 'orange' : ''}">${sc ? sc.blockers.open : 0}</div><div class="k">Blockers</div></div>
    <div class="stat"><div class="v">${sc ? sc.score.total : 0}</div><div class="k">Daily score</div></div>`;
}

function unexplainedBlock(rows) {
  const open = rows.filter((c) => !['Completed', 'Cancelled'].includes(c.status) && !c.carryover_reason);
  if (!open.length) return '';
  return `<div class="card-body" style="border-top:1px solid var(--border)">
    <div class="callout warn">${U.icon('alert', 16)}<div>
      <b>${open.length} unfinished item${open.length > 1 ? 's need' : ' needs'} an explanation.</b>
      <p style="margin-top:3px">Unfinished work never just disappears — mark it continue tomorrow, blocked, cancelled or changed priority.</p>
    </div></div></div>`;
}

/**
 * The day reads as "what moved on what", so commitments sit under the project
 * they belong to instead of in one undifferentiated list. Work with no project
 * goes last — that is the part still waiting to be filed somewhere.
 */
function groupByProject(rows) {
  const groups = [];
  const seen = new Map();
  for (const c of rows) {
    const key = c.project_id || 0;
    if (!seen.has(key)) {
      seen.set(key, { key, id: c.project_id || null, name: c.project_name || null, items: [] });
      groups.push(seen.get(key));
    }
    seen.get(key).items.push(c);
  }
  return groups.sort((a, b) => (a.key === 0 ? 1 : 0) - (b.key === 0 ? 1 : 0));
}

function checkList(rows) {
  return groupByProject(rows).map((g) => {
    const done = g.items.filter((c) => c.status === 'Completed').length;
    return `<div class="check-group" data-group="${g.key}">
      <div class="check-group-head">
        ${g.id
          ? `<a href="#/project/${g.id}">${U.esc(g.name)}</a>`
          : '<span class="muted">Not linked to a project</span>'}
        <span class="spacer"></span>
        <span class="small muted" data-group-count>${done} of ${g.items.length} done</span>
      </div>
      ${g.items.map(checkItem).join('')}
    </div>`;
  }).join('');
}

function checkItem(c) {
  const done = c.status === 'Completed';
  const cls = done ? 'done' : c.status === 'Blocked' ? 'blocked' : c.status === 'Cancelled' ? 'cancelled' : '';
  const needsReason = !['Completed', 'Cancelled'].includes(c.status) && !c.carryover_reason;
  return `<div class="check-item ${cls}" data-id="${c.id}">
    <button class="check-mark" data-toggle="${c.id}" aria-label="${done ? 'Mark not complete' : 'Mark complete'}">
      ${done ? U.icon('check', 12) : c.status === 'Blocked' ? U.icon('alert', 11) : c.status === 'Cancelled' ? U.icon('x', 11) : ''}
    </button>
    <div class="check-main">
      <div class="check-task">${U.esc(c.task)}</div>
      <div class="check-meta">
        ${U.priority(c.priority)}
        ${c.project_id ? '' : `<button class="badge gray" data-edit="${c.id}" style="cursor:pointer;border:0" title="Link a project so finishing this records progress">${U.icon('plus', 9)} Link a project</button>`}
        ${done ? U.badge('Completed') : U.badge(c.status)}
        ${!done && c.carryover_reason ? `<span class="badge ${c.carryover_reason === 'Blocked' ? 'orange' : 'gray'}">${U.esc(c.carryover_reason)}</span>` : ''}
        ${needsReason ? `<button class="badge red" data-status="${c.id}" style="cursor:pointer;border:0">${U.icon('alert', 10)} Add a reason</button>` : ''}
      </div>
      ${carriedFrom(c)
        ? `<div class="small muted" style="margin-top:4px">${U.icon('clock', 10)} Carried over from ${U.fmt.date(carriedFrom(c))}</div>`
        : c.notes ? `<div class="small muted" style="margin-top:4px">${U.esc(c.notes)}</div>` : ''}
    </div>
    <div class="check-actions">
      <button class="icon-btn" data-status="${c.id}" title="Change status">${U.icon('clock', 15)}</button>
      <button class="icon-btn" data-edit="${c.id}" title="Edit">${U.icon('edit', 15)}</button>
      <button class="icon-btn danger" data-remove="${c.id}" title="Remove">${U.icon('trash', 15)}</button>
    </div>
  </div>`;
}

/** The date an item was carried forward from, if that is what its note says. */
const carriedFrom = (c) => (c.notes || '').match(/^Carried over from (\d{4}-\d{2}-\d{2})$/)?.[1] || null;

function projectRows(projects) {
  if (!projects.length) return U.empty('No projects assigned', 'Assign yourself as owner on the Projects page.');
  return projects.map((p) => `
    <div style="padding:11px 0;border-bottom:1px solid var(--border)">
      <div class="row" style="flex-wrap:nowrap;gap:8px">
        <a href="#/project/${p.id}" style="font-weight:500;flex:1;min-width:0" class="truncate">${U.esc(p.name)}</a>
        ${U.fmt.delta(p.progress_today)}
        <button class="btn btn-sm" data-log="${p.id}">Log</button>
      </div>
      ${U.progressBar(p.previous_pct, p.today_pct)}
      ${p.pct_from_commitments !== 0 && p.todo.total
        ? `<div class="small muted" style="margin-top:3px">${p.todo.done} of ${p.todo.total} to-dos done</div>`
        : ''}
      ${p.progressed
        ? `<div class="evidence">${p.evidence.slice(0, 3).map((line) =>
            `<div class="evidence-line">${U.icon('check', 11)}<span>${U.esc(line)}</span></div>`).join('')}
            ${p.evidence.length > 3 ? `<div class="evidence-line muted">+${p.evidence.length - 3} more</div>` : ''}
          </div>`
        : `<div class="small" style="margin-top:4px;color:var(--orange)">${U.icon('alert', 11)} Nothing logged yet</div>`}
    </div>`).join('');
}

/** Unfinished work must carry an explanation before it leaves the day. */
function setStatus(c, forceReason = false, applyStatus = null) {
  const statuses = state.enums.commitment_statuses;
  const reasons = state.enums.carryover_reasons;
  U.openModal({
    title: 'Update commitment',
    subtitle: c.task,
    body: `
      <div class="field">
        <label>Status</label>
        <select class="select" id="st">${statuses.map((s) =>
          `<option value="${s}"${s === (forceReason ? 'In Progress' : c.status) ? ' selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <div class="field" id="reasonWrap">
        <label>Why is it not finished? <span class="req">*</span></label>
        <select class="select" id="rs">${reasons.map((r) =>
          `<option value="${r}"${r === c.carryover_reason ? ' selected' : ''}>${r}</option>`).join('')}</select>
        <p class="hint">Unfinished work never disappears silently — it carries forward with a reason.</p>
      </div>
      <div class="field">
        <label>Notes</label>
        <textarea class="textarea" id="nt" rows="2" placeholder="Optional context">${U.esc(c.notes || '')}</textarea>
      </div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close>Cancel</button>
             <button class="btn btn-primary" id="saveStatus">Save</button>`,
    onMount(modal, close) {
      const st = modal.querySelector('#st');
      const wrap = modal.querySelector('#reasonWrap');
      const sync = () => { wrap.hidden = ['Completed'].includes(st.value); };
      st.addEventListener('change', sync);
      sync();
      modal.querySelector('#saveStatus').addEventListener('click', async () => {
        const status = st.value;
        const body = { status, notes: modal.querySelector('#nt').value };
        if (status !== 'Completed') body.carryover_reason = modal.querySelector('#rs').value;
        try {
          if (applyStatus) {
            close();
            const res = await applyStatus(c, body);
            if (res) U.toast(...commitmentFeedback(res, 'Commitment updated'));
            return;
          }
          const res = await api.patch(`/commitments/${c.id}`, body, { date: state.date });
          close();
          U.toast(...commitmentFeedback(res, 'Commitment updated'));
          refresh();
        } catch (err) { U.toast(err.message, 'error'); }
      });
    }
  });
}

async function closeDay(userId) {
  const check = await api.post('/commitments/close-day', { date: state.date, user_id: userId });
  if (!check.ok) {
    const reasons = state.enums.carryover_reasons;
    U.openModal({
      title: 'Finish the day',
      subtitle: `${check.needs_reason.length} unfinished commitment${check.needs_reason.length > 1 ? 's need' : ' needs'} a reason`,
      body: `<div class="callout warn" style="margin-bottom:14px">${U.icon('alert', 16)}
        <div>Unfinished work does not disappear. Say what happens to each item.</div></div>
        ${check.needs_reason.map((c) => `
          <div class="field">
            <label>${U.esc(c.task)}</label>
            <select class="select" data-reason-for="${c.id}">
              ${reasons.map((r) => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>`).join('')}`,
      footer: `<span class="spacer"></span><button class="btn" data-close>Cancel</button>
               <button class="btn btn-primary" id="finishDay">Save and close the day</button>`,
      onMount(modal, close) {
        modal.querySelector('#finishDay').addEventListener('click', async (e) => {
          e.target.disabled = true;
          try {
            for (const sel of modal.querySelectorAll('[data-reason-for]')) {
              await api.patch(`/commitments/${sel.dataset.reasonFor}`, { carryover_reason: sel.value });
            }
            await api.post('/commitments/close-day', { date: state.date, user_id: userId, force: true, carry_forward: true });
            close();
            U.toast('Day closed. Carried-over work was added to the next business day.', 'success');
            showEod();
          } catch (err) { U.toast(err.message, 'error'); e.target.disabled = false; }
        });
      }
    });
    return;
  }
  await api.post('/commitments/close-day', { date: state.date, user_id: userId, force: true, carry_forward: true });
  U.toast('Day closed and snapshot saved', 'success');
  showEod();
}

async function showEod() {
  const { report } = await api.get('/eod', { date: state.date });
  U.openModal({
    title: report.title,
    subtitle: report.subtitle,
    wide: true,
    body: `<div class="report-text" id="eodText">${U.esc(report.text)}</div>`,
    footer: `<button class="btn" id="copyEod">${U.icon('copy', 14)} Copy</button>
             <button class="btn" id="printEod">${U.icon('print', 14)} Print</button>
             <span class="spacer"></span>
             <button class="btn" data-close>Close</button>
             <button class="btn btn-primary" id="openReports">Open in Reports</button>`,
    onMount(modal, close) {
      modal.querySelector('#copyEod').addEventListener('click', () => U.copyText(report.text));
      modal.querySelector('#printEod').addEventListener('click', () => window.print());
      modal.querySelector('#openReports').addEventListener('click', () => { close(); go('#/reports'); });
    }
  });
}
