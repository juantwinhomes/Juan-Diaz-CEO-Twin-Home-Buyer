/* Shared UI primitives. Everything renders from HTML strings and is wired
   with event delegation, so pages stay short and consistent. */

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ------------------------------------------------------------- Icons */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  commitments: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 13l2.5 2.5L16 10"/>',
  blockers: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
  production: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  weekly: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  impact: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/>',
  reports: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.4M17.5 20a6 6 0 0 0-2-4.5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  manager: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  rocket: '<path d="M5 13l-2 6 6-2"/><path d="M14.5 4.5c3-3 6.5-2.5 6.5-2.5s.5 3.5-2.5 6.5L13 14l-4-4z"/><path d="M9 10l-4 4 5 5 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17v.01"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  caret: '<path d="M6 9l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>'
};

export const icon = (name, size = 17) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
        stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

/* ------------------------------------------------------- Formatting */
export const fmt = {
  pct: (n) => `${round(n)}%`,
  num: (n) => new Intl.NumberFormat().format(round(n)),
  money: (n, cur = '$') => `${cur}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n || 0))}`,
  delta(n) {
    const v = round(n);
    const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return `<span class="delta ${cls}">${v > 0 ? '+' : ''}${v}%</span>`;
  },
  date(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },
  longDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
};
const round = (n) => Math.round((Number(n) || 0) * 10) / 10;

/* ------------------------------------------------------ Status colors */
const STATUS_COLOR = {
  Completed: 'green', Healthy: 'green', Resolved: 'green', Production: 'green', Monitoring: 'green',
  'In Progress': 'blue', Building: 'blue', 'Internal Testing': 'blue', 'User Testing': 'blue',
  Requirements: 'blue', 'Ready for Deployment': 'blue', Investigating: 'blue',
  Warning: 'yellow', Waiting: 'yellow', Open: 'yellow', Medium: 'yellow',
  Blocked: 'orange', Degraded: 'orange', Escalated: 'orange', High: 'orange',
  Down: 'red', Critical: 'red',
  'Not Started': 'gray', Cancelled: 'gray', Backlog: 'gray', Low: 'gray'
};
export const statusColor = (value) => STATUS_COLOR[value] || 'gray';
export const badge = (value, color) =>
  value ? `<span class="badge ${color || statusColor(value)}"><i class="dot"></i>${esc(value)}</span>` : '';
/** Project type reads as a neutral tag, so it is not mistaken for a status. */
const TYPE_COLOR = { System: 'blue', Automation: 'green', Report: 'gray' };
export const typeBadge = (t) =>
  t ? `<span class="badge ${TYPE_COLOR[t] || 'gray'}" title="Project type">${esc(t)}</span>` : '';

export const priority = (p) => (p ? `<span class="pri ${esc(p)}">${esc(p)}</span>` : '');

export function avatar(user, size = '') {
  if (!user) return `<span class="avatar ${size}" style="background:#98a2b3">?</span>`;
  if (user.avatar_url) return `<img class="avatar ${size}" src="${esc(user.avatar_url)}" alt="${esc(user.name)}">`;
  const initials = user.initials || String(user.name || '?').slice(0, 2).toUpperCase();
  return `<span class="avatar ${size}" style="background:${esc(user.color || '#2563eb')}">${esc(initials)}</span>`;
}
export const who = (user, size = 'sm') =>
  `<span class="who">${avatar(user, size)}<span>${esc(user ? user.name : 'Unassigned')}</span></span>`;

/* ----------------------------------------------------- Progress bars */
export function progressBar(previous, current, showNums = true) {
  const prev = Math.max(0, Math.min(100, Number(previous) || 0));
  const now = Math.max(0, Math.min(100, Number(current) || 0));
  const gain = Math.max(0, now - prev);
  const base = Math.min(prev, now);
  return `<div class="progress-row">
    <div class="bar">
      <div class="bar-fill prev" style="width:${base}%"></div>
      <div class="bar-fill gain" style="width:${gain}%"></div>
    </div>
    ${showNums ? `<span class="progress-num">${round(now)}%</span>` : ''}
  </div>`;
}

/* --------------------------------------------------------- KPI cards */
export function kpiCard({ label, value, unit, meta, foot, accent = 'gray', iconName = 'target', action }) {
  const tag = action ? 'button' : 'div';
  return `<${tag} class="kpi accent-${accent}"${action ? ` data-action="${esc(action)}"` : ''}>
    <div class="kpi-top">
      <span class="kpi-label">${esc(label)}</span>
      <span class="kpi-icon">${icon(iconName, 15)}</span>
    </div>
    <div class="kpi-value">${value}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    ${meta ? `<div class="kpi-meta">${meta}</div>` : ''}
    ${foot ? `<div class="kpi-foot">${foot}</div>` : ''}
  </${tag}>`;
}

export const targetChip = (met, text) =>
  `<span class="badge ${met ? 'green' : 'yellow'}">${met ? icon('check', 11) : icon('alert', 11)}${esc(text)}</span>`;

/* ------------------------------------------------------ Empty states */
export const empty = (title, text, actionHtml = '') => `
  <div class="empty">
    ${icon('inbox', 30)}
    <p class="t">${esc(title)}</p>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${actionHtml ? `<div style="margin-top:12px">${actionHtml}</div>` : ''}
  </div>`;

/* ------------------------------------------------------------ Tables */
export function table(columns, rows, renderRow, emptyMsg = 'Nothing here yet.') {
  if (!rows.length) return empty('Nothing to show', emptyMsg);
  return `<div class="table-wrap"><table class="data">
    <thead><tr>${columns.map((c) => {
      const style = [c.align === 'right' ? 'text-align:right' : '', c.min ? `min-width:${c.min}px` : ''].filter(Boolean).join(';');
      return `<th${style ? ` style="${style}"` : ''}>${esc(c.label ?? c)}</th>`;
    }).join('')}</tr></thead>
    <tbody>${rows.map(renderRow).join('')}</tbody>
  </table></div>`;
}

export const rowActions = (id, { edit = true, remove = true, extra = '' } = {}) => `
  <td class="actions">${extra}
    ${edit ? `<button class="icon-btn" data-edit="${id}" title="Edit" aria-label="Edit">${icon('edit', 15)}</button>` : ''}
    ${remove ? `<button class="icon-btn danger" data-remove="${id}" title="Remove" aria-label="Remove">${icon('trash', 15)}</button>` : ''}
  </td>`;

/* ------------------------------------------------------------ Toasts */
export function toast(message, type = '') {
  const el = h(`<div class="toast ${type}">${icon(type === 'error' || type === 'warn' ? 'alert' : 'check', 15)}<span>${esc(message)}</span></div>`);
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

/* ------------------------------------------------------------- Modal */
let closeCurrent = null;

export function openModal({ title, subtitle, body, footer = '', wide = false, onMount }) {
  closeModal();
  const root = document.getElementById('modalRoot');
  root.hidden = false;
  root.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div style="flex:1;min-width:0">
          <h2>${esc(title)}</h2>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 17)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;

  const close = () => closeModal();
  closeCurrent = close;
  root.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
  document.addEventListener('keydown', onEsc);
  const modal = root.querySelector('.modal');
  if (onMount) onMount(modal, close);
  enhanceSelects(modal);
  // The search box of a closed list is not the field to land on.
  const focusable = modal.querySelector('input:not(.combo-input), select:not([hidden]), textarea, button:not([data-close])');
  if (focusable) setTimeout(() => focusable.focus(), 40);
  return { close, modal };
}

function onEsc(e) { if (e.key === 'Escape') closeModal(); }

export function closeModal() {
  const root = document.getElementById('modalRoot');
  if (!root || root.hidden) return;
  root.hidden = true;
  root.innerHTML = '';
  document.removeEventListener('keydown', onEsc);
  closeCurrent = null;
}

/* -------------------------------------------------------- Form modal */
/**
 * Field: { name, label, type, options, required, help, placeholder,
 *          full, min, max, step, rows }
 */
export function openForm({ title, subtitle, fields, values = {}, submitLabel = 'Save', wide = false, note = '', onSubmit, onReady }) {
  const body = `<form id="entityForm" novalidate>${note}${renderFields(fields, values)}</form>`;
  const footer = `
    <span class="spacer"></span>
    <button type="button" class="btn" data-close>Cancel</button>
    <button type="submit" form="entityForm" class="btn btn-primary" id="formSubmit">${esc(submitLabel)}</button>`;

  return openModal({ title, subtitle, body, footer, wide, onMount(modal, close) {
    const form = modal.querySelector('#entityForm');
    if (onReady) onReady(form, modal);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = modal.querySelector('#formSubmit');
      const data = collect(form, fields);
      const missing = fields.filter((f) => f.required && !String(data[f.name] ?? '').trim());
      if (missing.length) {
        toast(`${missing[0].label} is required`, 'error');
        focusField(form, missing[0].name);
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await onSubmit(data, close);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = submitLabel;
      }
    });
  } });
}

function renderFields(fields, values) {
  const one = (f) => {
    const v = values[f.name] ?? f.default ?? '';
    const req = f.required ? ' <span class="req">*</span>' : '';
    let control;
    if (f.type === 'textarea') {
      control = `<textarea class="textarea" name="${f.name}" rows="${f.rows || 3}"
        placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
    } else if (f.type === 'select') {
      const opts = (f.options || []).map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const lab = typeof o === 'object' ? o.label : o;
        return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`;
      }).join('');
      control = `<select class="select" name="${f.name}">${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : ''}${opts}</select>`;
    } else if (f.type === 'checkbox') {
      return `<div class="field"><label class="checkbox">
        <input type="checkbox" name="${f.name}"${v ? ' checked' : ''}> ${esc(f.label)}</label>
        ${f.help ? `<p class="hint">${esc(f.help)}</p>` : ''}</div>`;
    } else {
      control = `<input class="input" type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}"
        placeholder="${esc(f.placeholder || '')}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}>`;
    }
    return `<div class="field">
      <label for="${f.name}">${esc(f.label)}${req}</label>
      ${control}
      ${f.help ? `<p class="hint">${esc(f.help)}</p>` : ''}
    </div>`;
  };

  // Pair up adjacent half-width fields into one row.
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.half && next && next.half) {
      out.push(`<div class="field-row">${one(f)}${one(next)}</div>`);
      i++;
    } else {
      out.push(one(f));
    }
  }
  return out.join('');
}

function collect(form, fields) {
  const data = {};
  for (const f of fields) {
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') data[f.name] = el.checked;
    else if (f.type === 'number') data[f.name] = el.value === '' ? null : Number(el.value);
    else data[f.name] = el.value;
  }
  return data;
}

/* ------------------------------------------------------ Confirm remove */
export function confirmRemove({ title, message, detail = '', confirmLabel = 'Remove', onConfirm }) {
  return openModal({
    title,
    body: `<div class="callout danger">${icon('alert', 16)}<div>
             <b>${esc(message)}</b>
             ${detail ? `<p style="margin-top:4px">${esc(detail)}</p>` : ''}
           </div></div>`,
    footer: `<span class="spacer"></span>
      <button type="button" class="btn" data-close>Cancel</button>
      <button type="button" class="btn btn-danger" id="confirmBtn">${esc(confirmLabel)}</button>`,
    onMount(modal, close) {
      modal.querySelector('#confirmBtn').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Removing…';
        try { await onConfirm(); close(); }
        catch (err) { toast(err.message, 'error'); close(); }
      });
    }
  });
}

/* ------------------------------------------------------------ Helpers */
export function copyText(text) {
  const done = () => toast('Copied to clipboard', 'success');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
  } else fallback(text, done);
}
function fallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch { toast('Could not copy', 'error'); }
  ta.remove();
}

export const loading = () => `<div class="loading"><div class="spinner"></div>Loading…</div>`;

export const selectOptions = (items, labelKey = 'name', valueKey = 'id') =>
  items.map((i) => ({ value: i[valueKey], label: i[labelKey] }));

/* A field that is now a search box is focused by its button, not its select. */
function focusField(form, name) {
  const el = form.elements[name];
  if (!el) return;
  (el.closest?.('.combo')?.querySelector('.combo-btn') || el).focus();
}

/* ------------------------------------------------ Searchable selects */
/**
 * A long list is quicker to type into than to scroll through, so any list past
 * SEARCH_FROM entries gets a search box. Shorter ones are left as the browser's
 * own control, which behaves better on a phone than anything we could build.
 *
 * The <select> stays in the page and stays the value: everything that reads
 * form.elements[name], assigns .value or listens for "change" keeps working,
 * which is why this can be switched on everywhere without touching the pages.
 */
const SEARCH_FROM = 8;
let openCombo = null;
let comboSeq = 0;

export function enhanceSelects(root) {
  for (const select of (root || document).querySelectorAll('select.select')) {
    if (select.multiple || select.disabled) continue;
    if (select.closest('.combo')) continue;            // already done
    if (select.options.length <= SEARCH_FROM) continue;
    searchable(select);
  }
}

function searchable(select) {
  const listId = `comboList${++comboSeq}`;
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  // Hidden, not disabled: it still carries the value and still submits.
  select.hidden = true;
  select.tabIndex = -1;
  wrap.insertAdjacentHTML('beforeend', `
    <button type="button" class="combo-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}">
      <span class="combo-value"></span>${icon('caret', 13)}
    </button>
    <div class="combo-pop" hidden>
      <div class="combo-search">${icon('search', 14)}
        <input type="text" class="combo-input" placeholder="Search…" aria-label="Search this list"
               role="combobox" aria-expanded="true" aria-controls="${listId}" aria-autocomplete="list"
               autocomplete="off" autocorrect="off" spellcheck="false">
      </div>
      <div class="combo-list" id="${listId}" role="listbox"></div>
    </div>`);

  const button = wrap.querySelector('.combo-btn');
  const shown = wrap.querySelector('.combo-value');
  const pop = wrap.querySelector('.combo-pop');
  const input = wrap.querySelector('.combo-input');
  const list = wrap.querySelector('.combo-list');
  let matches = [];
  let active = -1;

  /** The button always reads as the select does, including changes made in code. */
  const paint = () => {
    const chosen = select.selectedOptions[0];
    shown.textContent = chosen ? chosen.text : '';
    shown.classList.toggle('is-placeholder', !select.value);
  };
  select.addEventListener('change', paint);
  paint();

  const draw = () => {
    const query = input.value.trim().toLowerCase();
    matches = [...select.options].filter((o) => o.text.toLowerCase().includes(query));
    list.innerHTML = matches.length
      ? matches.map((o, i) => `<div class="combo-opt${o.value === select.value ? ' is-on' : ''}"
           role="option" id="${listId}-${i}" aria-selected="${o.value === select.value}" data-i="${i}">
           <span>${highlight(o.text, query)}</span>${o.value === select.value ? icon('check', 13) : ''}</div>`).join('')
      : `<p class="combo-none">Nothing matches <b>${esc(input.value.trim())}</b></p>`;
    // Typing aims at the best match; with an empty box the current choice is the mark.
    active = query ? (matches.length ? 0 : -1) : matches.findIndex((o) => o.value === select.value);
    mark(false);
  };

  const mark = (scroll = true) => {
    const nodes = [...list.children];
    nodes.forEach((n, i) => n.classList.toggle('is-active', i === active));
    const node = nodes[active];
    input.setAttribute('aria-activedescendant', node ? node.id : '');
    if (node && scroll) node.scrollIntoView({ block: 'nearest' });
  };

  const move = (step) => {
    if (!matches.length) return;
    active = (active + step + matches.length) % matches.length;
    mark();
  };

  const place = () => {
    const r = button.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { close(); return; }   // scrolled out of sight
    const width = Math.min(Math.max(r.width, 230), window.innerWidth - 24);
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const up = below < 200 && above > below;
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.round(Math.max(12, Math.min(r.left, window.innerWidth - width - 12)))}px`;
    pop.style.top = up ? 'auto' : `${Math.round(r.bottom + 5)}px`;
    pop.style.bottom = up ? `${Math.round(window.innerHeight - r.top + 5)}px` : 'auto';
    pop.style.maxHeight = `${Math.round(Math.min(340, (up ? above : below) - 16))}px`;
  };

  const onDown = (e) => { if (!wrap.contains(e.target)) close(); };

  function open() {
    if (openCombo === close) return;
    openCombo?.();
    openCombo = close;
    pop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    input.value = '';
    draw();
    place();
    input.focus();
    mark();
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);   // the modal body scrolls too
  }

  function close(focusButton = false) {
    if (openCombo === close) openCombo = null;
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    if (focusButton && wrap.isConnected) button.focus();
  }

  function choose(i) {
    const option = matches[i];
    if (!option) return;
    // Close before telling the page, since a listener may rebuild it from scratch.
    close();
    const changed = select.value !== option.value;
    select.value = option.value;
    paint();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    if (wrap.isConnected) button.focus();
  }

  button.addEventListener('click', () => (pop.hidden ? open() : close(true)));
  input.addEventListener('input', () => { draw(); place(); });
  list.addEventListener('mousedown', (e) => e.preventDefault());   // keep the search box focused
  list.addEventListener('click', (e) => {
    const option = e.target.closest('[data-i]');
    if (option) choose(Number(option.dataset.i));
  });
  list.addEventListener('mousemove', (e) => {
    const option = e.target.closest('[data-i]');
    if (option && Number(option.dataset.i) !== active) { active = Number(option.dataset.i); mark(false); }
  });

  wrap.addEventListener('keydown', (e) => {
    if (pop.hidden) {
      // Typing a letter on the button opens the list with that letter searched.
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        open(); input.value = e.key; draw(); place(); e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }   // the modal stays open
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; mark(); }
    else if (e.key === 'End') { e.preventDefault(); active = matches.length - 1; mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }   // never submits the form
    else if (e.key === 'Tab') close();
  });
}

/** Show which part of a name the search matched. */
function highlight(text, query) {
  if (!query) return esc(text);
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return esc(text);
  return `${esc(text.slice(0, at))}<b>${esc(text.slice(at, at + query.length))}</b>${esc(text.slice(at + query.length))}`;
}
