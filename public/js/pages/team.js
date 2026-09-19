import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, reloadBootstrap } from '../app.js';
import { userForm } from './forms.js';

export async function page() {
  const [users, cards] = await Promise.all([
    api.get('/users'),
    api.get('/scorecards', { date: state.date })
  ]);
  const byId = new Map(cards.map((c) => [c.user.id, c]));

  const html = `
    <div class="section">
      <div class="section-head">
        <h2>${users.length} ${users.length === 1 ? 'person' : 'people'}</h2>
        <span class="sub">Managers see everything but do not carry a daily scorecard</span>
        <span class="spacer"></span>
        <button class="btn btn-primary btn-sm" id="add">${U.icon('plus', 14)} Add team member</button>
      </div>
      <div class="grid grid-3">
        ${users.map((u) => {
          const sc = byId.get(u.id);
          const projects = state.projects.filter((p) => p.owner_id === u.id || p.secondary_owner_id === u.id);
          return `<div class="card" style="${u.active ? '' : 'opacity:.6'}">
            <div class="scorecard-head">
              ${U.avatar(u, 'lg')}
              <div style="min-width:0">
                <div class="name">${U.esc(u.name)}</div>
                <div class="role">${U.esc(u.role)}</div>
              </div>
              ${sc ? `<div class="score-chip"><div class="n">${sc.score.total}</div><div class="l">today</div></div>` : ''}
            </div>
            <div class="card-body">
              <div class="row" style="gap:6px;margin-bottom:11px">
                ${u.is_manager ? U.badge('Manager', 'blue') : U.badge('Contributor', 'gray')}
                ${u.active ? U.badge('Active', 'green') : U.badge('Inactive', 'gray')}
              </div>
              ${u.email ? `<p class="small muted" style="margin-bottom:9px">${U.esc(u.email)}</p>` : ''}
              <div class="field-label">Active projects (${projects.length})</div>
              ${projects.length
                ? `<div class="row" style="gap:5px">${projects.map((p) =>
                    `<a href="#/project/${p.id}" class="chip">${U.esc(p.name)}</a>`).join('')}</div>`
                : '<p class="small muted">None assigned</p>'}
              ${sc ? `
                <div class="divider"></div>
                <div class="stat-row" style="margin:0 -16px -16px;border-radius:0 0 12px 12px;overflow:hidden;border-bottom:0">
                  <div class="stat"><div class="v">${sc.commitments.completed}/${sc.commitments.total}</div><div class="k">Commitments</div></div>
                  <div class="stat"><div class="v">${sc.projects.progressed}/${sc.projects.active}</div><div class="k">Projects</div></div>
                  <div class="stat"><div class="v ${sc.blockers.open ? 'orange' : ''}">${sc.blockers.open}</div><div class="k">Blockers</div></div>
                </div>` : ''}
            </div>
            <div class="card-body" style="border-top:1px solid var(--border);padding:10px 14px">
              <div class="row">
                <button class="btn btn-sm" data-edit="${u.id}">${U.icon('edit', 13)} Edit</button>
                <button class="btn btn-sm" data-toggle="${u.id}">${u.active ? 'Deactivate' : 'Reactivate'}</button>
                <span class="spacer"></span>
                <button class="icon-btn danger" data-remove="${u.id}" title="Remove">${U.icon('trash', 15)}</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  return {
    title: 'Team',
    subtitle: 'People, roles and what they own',
    html,
    mount(root) {
      root.querySelector('#add').addEventListener('click', () => userForm());
      root.addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit]')?.dataset.edit;
        const toggle = e.target.closest('[data-toggle]')?.dataset.toggle;
        const remove = e.target.closest('[data-remove]')?.dataset.remove;
        if (edit) userForm(users.find((u) => u.id === Number(edit)));
        if (toggle) {
          const u = users.find((x) => x.id === Number(toggle));
          await api.patch(`/users/${u.id}`, { active: !u.active });
          await reloadBootstrap();
          U.toast(u.active ? `${u.name} deactivated` : `${u.name} reactivated`);
          refresh();
        }
        if (remove) {
          const u = users.find((x) => x.id === Number(remove));
          const owned = state.projects.filter((p) => p.owner_id === u.id).length;
          U.confirmRemove({
            title: 'Remove team member',
            message: `Permanently remove ${u.name}?`,
            detail: `Their commitments are removed with them${owned ? `, and ${owned} project${owned > 1 ? 's' : ''} will be left unassigned` : ''}. Deactivate instead to keep the history.`,
            confirmLabel: 'Remove permanently',
            async onConfirm() {
              await api.del(`/users/${u.id}`);
              await reloadBootstrap();
              U.toast(`${u.name} removed`);
              refresh();
            }
          });
        }
      });
    }
  };
}
