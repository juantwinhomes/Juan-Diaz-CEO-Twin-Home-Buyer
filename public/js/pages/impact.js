import { api } from '../api.js';
import * as U from '../ui.js';
import { refresh, state } from '../app.js';
import { impactForm } from './forms.js';

export async function page() {
  const data = await api.get('/impact');
  const cur = state.settings.currency || '$';
  const t = data.totals;

  const html = `
    <div class="section">
      <div class="callout info">${U.icon('target', 16)}
        <div><b>Business impact answers the monthly question — is what we're shipping valuable?</b>
        <p style="margin-top:3px">It is deliberately excluded from the daily execution score, so nobody can inflate today's number with projected savings.</p></div>
      </div>
    </div>

    <div class="section"><div class="grid grid-kpi">
      ${U.kpiCard({ label: 'Hours saved per week', value: U.fmt.num(t.hours_saved_week), accent: 'green', iconName: 'clock' })}
      ${U.kpiCard({ label: 'Hours saved per month', value: U.fmt.num(t.hours_saved_month), accent: 'green', iconName: 'clock' })}
      ${U.kpiCard({ label: 'Monthly cost savings', value: U.fmt.money(t.monthly_savings, cur),
        meta: `${U.fmt.money(t.annual_savings, cur)} annualised`, accent: 'green', iconName: 'impact' })}
      ${U.kpiCard({ label: 'Revenue supported', value: U.fmt.money(t.revenue_supported, cur), accent: 'blue', iconName: 'impact' })}
      ${U.kpiCard({ label: 'Leads processed / errors prevented', value: `${U.fmt.num(t.leads_processed)}`,
        meta: `${U.fmt.num(t.errors_prevented)} errors prevented`, accent: 'blue', iconName: 'check' })}
    </div></div>

    <div class="section">
      <div class="section-head"><h2>By system</h2>
        <span class="sub">Hours saved = minutes saved × runs ÷ 60</span>
        <span class="spacer"></span>
        <button class="btn btn-primary btn-sm" id="add">${U.icon('plus', 14)} Add entry</button></div>
      <div class="card">
        ${U.table(
          ['Project', 'Manual process replaced', 'Min / run', 'Runs / week', 'Hrs / week', 'Hrs / month',
           'Hourly cost', 'Monthly savings', 'Revenue supported', 'Leads', 'Errors prevented', ''],
          data.rows,
          (r) => `<tr>
            <td><b>${U.esc(r.project_name || 'Unlinked')}</b>
              ${r.project_status ? `<div class="small muted">${U.esc(r.project_status)}</div>` : ''}</td>
            <td class="muted">${U.esc(r.manual_process || '—')}</td>
            <td class="num">${U.fmt.num(r.minutes_per_run)}</td>
            <td class="num">${U.fmt.num(r.runs_per_week)}</td>
            <td class="num"><b>${U.fmt.num(r.hours_saved_week)}</b></td>
            <td class="num"><b>${U.fmt.num(r.hours_saved_month)}</b></td>
            <td class="num muted">${U.fmt.money(r.hourly_cost, cur)}</td>
            <td class="num"><b style="color:var(--green)">${U.fmt.money(r.monthly_savings, cur)}</b></td>
            <td class="num muted">${r.revenue_supported ? U.fmt.money(r.revenue_supported, cur) : '—'}</td>
            <td class="num muted">${U.fmt.num(r.leads_processed)}</td>
            <td class="num muted">${U.fmt.num(r.errors_prevented)}</td>
            ${U.rowActions(r.id)}
          </tr>`,
          'No business impact recorded yet. Add it once a system is live.'
        )}
      </div>
    </div>`;

  return {
    title: 'Business Impact',
    subtitle: 'Monthly reporting — never part of the daily score',
    html,
    mount(root) {
      root.querySelector('#add').addEventListener('click', () => impactForm());
      root.addEventListener('click', (e) => {
        const edit = e.target.closest('[data-edit]')?.dataset.edit;
        const remove = e.target.closest('[data-remove]')?.dataset.remove;
        if (edit) impactForm(data.rows.find((r) => r.id === Number(edit)));
        if (remove) {
          const r = data.rows.find((x) => x.id === Number(remove));
          U.confirmRemove({
            title: 'Remove impact entry',
            message: `Remove the business impact recorded for "${r.project_name || 'this project'}"?`,
            async onConfirm() { await api.del(`/impact/${r.id}`); U.toast('Entry removed'); refresh(); }
          });
        }
      });
    }
  };
}
