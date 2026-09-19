import { api } from '../api.js';
import * as U from '../ui.js';
import { state, activeUsers } from '../app.js';

let current = { type: 'daily-team', user_id: '' };

export async function page() {
  const types = state.enums.report_types;
  const users = activeUsers();
  if (current.type === 'daily-individual' && !current.user_id) current.user_id = users[0]?.id || '';

  let report = null;
  let error = null;
  try {
    report = await api.get(`/reports/${current.type}`, { date: state.date, user_id: current.user_id || undefined });
  } catch (err) { error = err.message; }

  const html = `
    <div class="section">
      <div class="card"><div class="card-body" style="padding:12px 14px">
        <div class="filters">
          <select class="select" id="type" style="min-width:210px">
            ${types.map((t) => `<option value="${t.value}"${t.value === current.type ? ' selected' : ''}>${U.esc(t.label)}</option>`).join('')}
          </select>
          ${current.type === 'daily-individual' ? `<select class="select" id="user">
            ${users.map((u) => `<option value="${u.id}"${String(u.id) === String(current.user_id) ? ' selected' : ''}>${U.esc(u.name)}</option>`).join('')}
          </select>` : ''}
          <span class="spacer"></span>
          <button class="btn btn-sm" id="copy">${U.icon('copy', 14)} Copy as text</button>
          <button class="btn btn-sm" id="print">${U.icon('print', 14)} Print / PDF</button>
        </div>
        <p class="small muted" style="margin-top:9px">
          The text version is formatted to paste straight into Google Chat, Slack, email or a management meeting.
        </p>
      </div></div>
    </div>

    ${error ? `<div class="card"><div class="card-body"><div class="callout danger">${U.icon('alert', 16)}
      <div><b>Could not build this report.</b><p>${U.esc(error)}</p></div></div></div></div>`
    : `<div class="section grid grid-2" style="align-items:start">
      <div class="card">
        <div class="card-head"><h2>${U.esc(report.title)}</h2>
          <span class="spacer"></span><span class="sub">${U.esc(report.subtitle || '')}</span></div>
        <div class="card-body">
          ${report.sections.map((s) => `
            <div style="margin-bottom:18px">
              <h3 style="font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px">
                ${U.esc(s.heading)}</h3>
              <table class="data" style="font-size:12.5px">
                <tbody>${s.rows.map((r) => `<tr>
                  <td style="width:38%"><b>${U.esc(r[0])}</b></td>
                  <td>${U.esc(r[1] || '')}</td>
                  <td class="muted">${U.esc(r[2] || '')}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Plain text</h2><span class="sub">Ready to paste</span></div>
        <div class="card-body"><div class="report-text" id="reportText">${U.esc(report.text)}</div></div>
      </div>
    </div>`}`;

  return {
    title: 'Reports',
    subtitle: report ? report.subtitle : '',
    html,
    mount(root) {
      root.querySelector('#type').addEventListener('change', async (e) => {
        current.type = e.target.value;
        const { refresh } = await import('../app.js');
        refresh();
      });
      root.querySelector('#user')?.addEventListener('change', async (e) => {
        current.user_id = e.target.value;
        const { refresh } = await import('../app.js');
        refresh();
      });
      root.querySelector('#copy')?.addEventListener('click', () => report && U.copyText(report.text));
      root.querySelector('#print')?.addEventListener('click', () => window.print());
    }
  };
}
