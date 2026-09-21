import { api } from '../api.js';
import * as U from '../ui.js';
import { state, refresh, reloadBootstrap, themePreference, setTheme } from '../app.js';

const SCOPES = [
  ['commitments', 'Daily commitments', 'Every commitment on every date.'],
  ['progress', 'Progress logs and snapshots', 'All progress history and per-day completion percentages.'],
  ['blockers', 'Blockers', 'All blockers, open and resolved.'],
  ['deployments', 'Deployments', 'All deployment records.'],
  ['incidents', 'Production issues', 'All incidents. Systems are kept.'],
  ['impact', 'Business impact', 'All business impact entries.'],
  ['snapshots', 'Daily KPI snapshots', 'Stored daily rollups. They rebuild when you close a day.'],
  ['everything', 'Everything', 'Users, projects, and every record. The app is reset to empty.']
];

export async function page() {
  const s = await api.get('/settings');

  const html = `
    <div class="section grid grid-2" style="align-items:start">
      <div class="card">
        <div class="card-head"><h2>Targets</h2><span class="sub">What "good" means for this team</span></div>
        <div class="card-body">
          <form id="settingsForm">
            ${num('commitment_target', 'Daily commitment completion target (%)', s.commitment_target)}
            ${num('progressed_target', 'Projects progressed target (%)', s.progressed_target)}
            ${num('success_rate_target', 'Automation success rate target (%)', s.success_rate_target)}
            ${num('critical_issue_target', 'Critical production issue target', s.critical_issue_target)}
            ${num('daily_score_target', 'Daily execution score target', s.daily_score_target)}
            ${num('stagnation_days', 'Warn after this many business days with no progress', s.stagnation_days)}
            ${num('blocker_age_alert_days', 'Highlight blockers older than this many business days', s.blocker_age_alert_days)}
            ${num('max_commitments', 'Recommended daily commitments per person', s.max_commitments || 5)}
            <div class="field-row">
              <div class="field"><label>Team name</label>
                <input class="input" name="team_name" value="${U.esc(s.team_name)}"></div>
              <div class="field"><label>Currency symbol</label>
                <input class="input" name="currency" value="${U.esc(s.currency)}"></div>
            </div>
            <label class="checkbox" style="margin:4px 0 14px">
              <input type="checkbox" name="auto_progress_from_commitments" value="1"
                     ${s.auto_progress_from_commitments !== '0' ? 'checked' : ''}>
              Ticking a commitment complete logs it as progress on its project
            </label>
            <button type="submit" class="btn btn-primary">Save settings</button>
          </form>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Appearance</h2><span class="sub">Saved in this browser only</span></div>
          <div class="card-body">
            <div class="seg" id="appearance" role="radiogroup" aria-label="Appearance">${appearance()}</div>
            <p class="hint">System follows your device's light or dark setting. The moon button in the
              top bar switches between light and dark directly.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>How the daily score works</h2></div>
          <div class="card-body">
            <table class="data" style="font-size:12.5px"><tbody>
              <tr><td><b>50%</b></td><td>Daily commitment completion</td></tr>
              <tr><td><b>25%</b></td><td>Active projects that moved forward</td></tr>
              <tr><td><b>15%</b></td><td>Production quality — open issues and unhealthy systems deduct</td></tr>
              <tr><td><b>10%</b></td><td>Blocker management — aging and unassigned blockers deduct</td></tr>
            </tbody></table>
            <div class="callout" style="margin-top:12px">${U.icon('target', 15)}
              <div>No points for hours worked, lines of code, prompts written, or automations nobody asked for.</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Writing entries people can read later</h2>
            <span class="sub">Advice, not a rule</span></div>
          <div class="card-body">
            <div class="field-label">Says what moved</div>
            <div class="row" style="gap:5px;margin-bottom:12px">
              ${(state.guidance.good || []).map((g) => `<span class="badge green">${U.esc(g)}</span>`).join('')}
            </div>
            <div class="field-label">Harder to read back in a month</div>
            <div class="row" style="gap:5px">
              ${(state.guidance.bad || []).map((g) => `<span class="badge gray">${U.esc(g)}</span>`).join('')}
            </div>
            <p class="small muted" style="margin-top:11px">Everything you log counts. This is only about
              wording that still makes sense when someone reads the weekly report.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Daily snapshot</h2></div>
          <div class="card-body">
            <p class="small muted" style="margin-bottom:11px">
              Snapshots preserve each day's results so trends stay accurate. Closing a day on the Today page
              stores one automatically; you can also rebuild the snapshot for the selected date.</p>
            <button class="btn" id="snapshot">${U.icon('refresh', 14)} Rebuild snapshot for ${U.fmt.date(state.date)}</button>
          </div>
        </div>

      </div>
    </div>

    <div class="section">
      <div class="card" style="border-color:var(--red-bd)">
        <div class="card-head" style="background:var(--red-bg);border-radius:12px 12px 0 0">
          <span style="color:var(--red)">${U.icon('alert', 17)}</span>
          <h2>Remove data</h2>
          <span class="sub">Permanent. There is no undo.</span>
        </div>
        <div class="card-body">
          <p class="small muted" style="margin-bottom:13px">
            Use this to clear the sample data before your team starts, or to remove a category of records you no longer want.</p>
          ${U.table(['What', 'Removes', ''], SCOPES, ([scope, label, detail]) => `<tr>
            <td><b>${U.esc(label)}</b></td>
            <td class="muted">${U.esc(detail)}</td>
            <td class="actions">
              <button class="btn btn-sm ${scope === 'everything' ? 'btn-danger' : ''}" data-scope="${scope}">
                ${U.icon('trash', 13)} Remove</button>
            </td>
          </tr>`)}
        </div>
      </div>
    </div>`;

  return {
    title: 'Settings',
    subtitle: 'Targets, appearance, scoring rules and data removal',
    html,
    mount(root) {
      root.querySelector('#settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        data.auto_progress_from_commitments = data.auto_progress_from_commitments ? '1' : '0';
        await api.patch('/settings', data);
        await reloadBootstrap();
        U.toast('Settings saved', 'success');
        refresh();
      });

      root.querySelector('#appearance').addEventListener('click', (e) => {
        const preference = e.target.closest('[data-theme-pref]')?.dataset.themePref;
        if (!preference) return;
        setTheme(preference);
        root.querySelector('#appearance').innerHTML = appearance();
      });

      root.querySelector('#snapshot').addEventListener('click', async () => {
        await api.post('/snapshots/run', { date: state.date });
        U.toast('Snapshot rebuilt', 'success');
      });

      root.addEventListener('click', (e) => {
        const scope = e.target.closest('[data-scope]')?.dataset.scope;
        if (!scope) return;
        const [, label, detail] = SCOPES.find((x) => x[0] === scope);
        U.confirmRemove({
          title: `Remove ${label.toLowerCase()}`,
          message: scope === 'everything'
            ? 'Remove every record in the database?'
            : `Remove all ${label.toLowerCase()}?`,
          detail: `${detail} This cannot be undone.`,
          confirmLabel: 'Remove permanently',
          async onConfirm() {
            const result = await api.del(`/data/${scope}`);
            const count = Object.values(result.removed).reduce((a, b) => a + b, 0);
            await reloadBootstrap();
            U.toast(`${count} record${count === 1 ? '' : 's'} removed`);
            refresh();
          }
        });
      });
    }
  };
}

const THEME_OPTIONS = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const appearance = () => THEME_OPTIONS.map(([value, label]) => `
  <button type="button" role="radio" aria-checked="${themePreference() === value}" data-theme-pref="${value}">${label}</button>`).join('');

const num = (name, label, value) => `
  <div class="field">
    <label>${U.esc(label)}</label>
    <input class="input" type="number" name="${name}" value="${U.esc(value)}" min="0" step="1">
  </div>`;
