import { api, tookAWrite } from './api.js';
import { icon, esc, loading, toast, closeModal, fmt } from './ui.js';

/* ------------------------------------------------------------- State */
export const state = {
  date: null,
  today: null,
  users: [],
  projects: [],
  settings: {},
  enums: {},
  guidance: {},
  currentUserId: null
};

const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
};

/* --------------------------------------------------------- Navigation */
const NAV = [
  { group: 'Daily', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'today', label: 'Today', icon: 'today' },
    { id: 'commitments', label: 'Commitments', icon: 'commitments' }
  ] },
  { group: 'Delivery', items: [
    { id: 'projects', label: 'Projects', icon: 'projects' },
    { id: 'blockers', label: 'Blockers', icon: 'blockers', badge: 'blockers' },
    { id: 'production', label: 'Production Health', icon: 'production', badge: 'issues' }
  ] },
  { group: 'Rollups', items: [
    { id: 'weekly', label: 'Weekly', icon: 'weekly' },
    { id: 'manager', label: 'Manager View', icon: 'manager' },
    { id: 'impact', label: 'Business Impact', icon: 'impact' },
    { id: 'reports', label: 'Reports', icon: 'reports' }
  ] },
  { group: 'Setup', items: [
    { id: 'team', label: 'Team', icon: 'team' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ] }
];

const PAGES = {
  dashboard: () => import('./pages/dashboard.js'),
  today: () => import('./pages/today.js'),
  commitments: () => import('./pages/commitments.js'),
  projects: () => import('./pages/projects.js'),
  project: () => import('./pages/project-detail.js'),
  blockers: () => import('./pages/blockers.js'),
  production: () => import('./pages/production.js'),
  weekly: () => import('./pages/weekly.js'),
  manager: () => import('./pages/manager.js'),
  impact: () => import('./pages/impact.js'),
  reports: () => import('./pages/reports.js'),
  team: () => import('./pages/team.js'),
  settings: () => import('./pages/settings.js')
};

function renderNav(active) {
  document.getElementById('nav').innerHTML = NAV.map((g) => `
    <div class="nav-group">
      <div class="nav-group-label">${esc(g.group)}</div>
      ${g.items.map((i) => `
        <a href="#/${i.id}" class="${active === i.id ? 'active' : ''}">
          ${icon(i.icon, 17)}<span>${esc(i.label)}</span>
          ${i.badge ? `<span class="nav-badge" data-badge="${i.badge}" hidden></span>` : ''}
        </a>`).join('')}
    </div>`).join('');
}

let badgesAt = 0;
/**
 * Two small numbers in the sidebar are not worth two requests on every page
 * view — on a hosted setup that is two serverless invocations each time someone
 * clicks anything. They refresh after a write, and otherwise once a minute.
 */
async function refreshBadges(force = false) {
  if (!force && Date.now() - badgesAt < 60000) return;
  badgesAt = Date.now();
  try {
    const [blockers, incidents] = await Promise.all([
      api.get('/blockers', { open: '1' }),
      api.get('/incidents', { open: '1' })
    ]);
    setBadge('blockers', blockers.length);
    setBadge('issues', incidents.length);
  } catch { badgesAt = 0; /* badges are cosmetic — try again next time */ }
}
function setBadge(name, count) {
  const el = document.querySelector(`[data-badge="${name}"]`);
  if (!el) return;
  el.hidden = !count;
  el.textContent = count;
}

/* ------------------------------------------------------------- Router */
export function go(hash) {
  if (location.hash === hash) router();
  else location.hash = hash;
}

export function refresh() { router(); }

function parseRoute() {
  const raw = (location.hash || '#/dashboard').slice(2);
  const [name, param] = raw.split('/');
  return { name: name || 'dashboard', param };
}

let renderToken = 0;
async function router() {
  closeModal();
  const { name, param } = parseRoute();
  const key = PAGES[name] ? name : 'dashboard';
  renderNav(key === 'project' ? 'projects' : key);

  const view = document.getElementById('view');
  const token = ++renderToken;
  view.innerHTML = loading();

  try {
    const mod = await PAGES[key]();
    const ctx = { state, param, go, refresh, setSubtitle };
    const result = await mod.page(ctx);
    if (token !== renderToken) return;
    document.getElementById('pageTitle').textContent = result.title || '';
    setSubtitle(result.subtitle || '');
    // Each render gets a fresh container. Pages attach delegated listeners to it,
    // so discarding the node discards their listeners — otherwise handlers stack
    // up across navigations and fire with stale data.
    view.replaceChildren();
    const container = document.createElement('div');
    container.className = 'page';
    container.innerHTML = result.html;
    view.appendChild(container);
    if (result.mount) result.mount(container, ctx);
    view.scrollTop = 0;
    window.scrollTo(0, 0);
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    view.innerHTML = `<div class="card"><div class="card-body">
      <div class="callout danger">${icon('alert', 16)}<div>
        <b>Could not load this page.</b><p style="margin-top:3px">${esc(err.message)}</p>
      </div></div>
      <div style="margin-top:12px"><button class="btn" onclick="location.reload()">Reload</button></div>
    </div></div>`;
  }
  refreshBadges(tookAWrite());
  closeDrawer();
}

const setSubtitle = (text) => { document.getElementById('pageSubtitle').textContent = text; };

/* ---------------------------------------------------- Shell behaviour */
const sidebar = () => document.getElementById('sidebar');
const scrim = () => document.getElementById('scrim');
function openDrawer() { sidebar().classList.add('open'); scrim().hidden = false; }
function closeDrawer() { sidebar().classList.remove('open'); scrim().hidden = true; }

/* On a phone the navigation is a drawer over the page. On a desktop it is a
   column that can be put away to give the page the width — and it stays put
   away, across visits, until it is asked back. */
const PHONE = '(max-width: 1024px)';
function applyNavPreference() {
  const collapsed = store.get('kpi.nav', 'open') === 'collapsed';
  document.body.classList.toggle('nav-collapsed', collapsed);
  document.getElementById('menuBtn').setAttribute('aria-label', collapsed ? 'Show navigation' : 'Hide navigation');
}
function toggleNav() {
  if (window.matchMedia(PHONE).matches) { openDrawer(); return; }
  const collapsed = !document.body.classList.contains('nav-collapsed');
  store.set('kpi.nav', collapsed ? 'collapsed' : 'open');
  applyNavPreference();
}

/* --------------------------------------------------------- Appearance */
/* Dark mode is a choice each browser keeps, not a team setting. "system" follows
   the device; the topbar button flips between light and dark outright. A script
   in <head> applies the saved choice before the first paint — this is the same
   rule, kept current while the page is open. */
export const THEMES = ['system', 'light', 'dark'];
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
export function themePreference() {
  const saved = store.get('kpi.theme', 'system');
  return THEMES.includes(saved) ? saved : 'system';
}
export const resolvedTheme = () => {
  const preference = themePreference();
  return preference === 'system' ? (darkMedia.matches ? 'dark' : 'light') : preference;
};
export function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121826' : '#ffffff');
  const btn = document.getElementById('themeBtn');
  if (btn) {
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
}
export function setTheme(preference) {
  store.set('kpi.theme', THEMES.includes(preference) ? preference : 'system');
  applyTheme();
}

export async function reloadBootstrap() {
  const data = await api.get('/bootstrap', { date: state.date || undefined });
  state.today = data.today;
  if (!state.date) state.date = store.get('kpi.date', data.today) || data.today;
  if (state.date > data.today) state.date = data.today;
  state.users = data.users;
  state.projects = data.projects;
  state.settings = data.settings;
  state.enums = data.enums;
  state.guidance = data.guidance;
  state.auth = data.auth || { enabled: false };
  renderSignOut();
  const saved = Number(store.get('kpi.user', 0));
  const contributors = data.users.filter((u) => !u.is_manager && u.active);
  state.currentUserId = contributors.some((u) => u.id === saved) ? saved : (contributors[0]?.id ?? null);
  document.getElementById('globalDate').value = state.date;
  document.getElementById('globalDate').max = data.today;
}

function renderSignOut() {
  const foot = document.querySelector('.sidebar-foot');
  if (!foot || foot.querySelector('#signOut')) return;
  if (!state.auth?.enabled) return;
  const btn = document.createElement('button');
  btn.id = 'signOut';
  btn.className = 'btn btn-sm';
  btn.style.cssText = 'width:100%;margin-bottom:12px';
  btn.textContent = 'Sign out';
  btn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    location.href = '/';
  });
  foot.prepend(btn);
}

export function setDate(date) {
  state.date = date;
  store.set('kpi.date', date);
  document.getElementById('globalDate').value = date;
  refresh();
}

export function setCurrentUser(id) {
  state.currentUserId = Number(id) || null;
  store.set('kpi.user', String(state.currentUserId ?? ''));
}

export const activeUsers = () => state.users.filter((u) => u.active && !u.is_manager);
export const userById = (id) => state.users.find((u) => u.id === Number(id)) || null;
export const projectById = (id) => state.projects.find((p) => p.id === Number(id)) || null;
export const isToday = () => state.date === state.today;

/* ---------------------------------------------------------- Bootstrap */
(async function init() {
  applyTheme();
  applyNavPreference();
  document.getElementById('themeBtn').addEventListener('click', () => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'));
  darkMedia.addEventListener('change', applyTheme);
  // A choice made in another tab of this browser applies here too.
  window.addEventListener('storage', (e) => { if (e.key === 'kpi.theme') applyTheme(); });
  document.getElementById('menuBtn').addEventListener('click', toggleNav);
  document.getElementById('scrim').addEventListener('click', closeDrawer);
  document.getElementById('globalDate').addEventListener('change', (e) => {
    if (e.target.value) setDate(e.target.value);
  });
  document.getElementById('todayBtn').addEventListener('click', () => setDate(state.today));
  window.addEventListener('hashchange', router);

  try {
    await reloadBootstrap();
  } catch (err) {
    document.getElementById('view').innerHTML =
      `<div class="card"><div class="card-body"><div class="callout danger">${icon('alert', 16)}
       <div><b>Could not reach the server.</b><p>${esc(err.message)}</p></div></div></div></div>`;
    return;
  }
  router();
})();

/* Convenience for pages: keep the date banner consistent. */
export function dateNote() {
  if (isToday()) return '';
  return `<div class="callout info" style="margin-bottom:16px">${icon('clock', 16)}
    <div>You are viewing <b>${esc(fmt.longDate(state.date))}</b>, not today.
    Historical data is read-only in spirit — edits still apply to that date.</div></div>`;
}

export { toast };
