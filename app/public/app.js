'use strict';
// Kristine AI Controller Academy — single-page front end (no build step).
// All data is escaped before it is put into the page. Lesson HTML comes from the team's own content files.

const S = { token: null, me: null, boot: null };
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = c => {
  if (c === null || c === undefined) return '<span class="muted">unknown</span>';
  const neg = c < 0, a = Math.abs(c);
  const s = '$' + Math.floor(a / 100).toLocaleString('en-US') + '.' + String(a % 100).padStart(2, '0');
  return `<span class="num${neg ? ' neg' : ''}">${neg ? '−' : ''}${s}</span>`;
};
const moneyText = c => (c == null ? 'unknown' : (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const can = p => S.me?.permissions.includes(p);
const userName = id => S.boot?.users.find(u => u.id === id)?.name || id || '—';
const entName = id => S.boot?.entities.find(e => e.id === id)?.name || id || '—';
const store = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* storage unavailable */ } } };

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { 'X-Session': S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { S.token = null; store.set('kca-token', null); location.hash = '#/login'; }
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.detail = data.detail; throw e; }
  return data;
}
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3000);
}
const fail = e => toast(e.message + (e.detail ? ' ' + [].concat(e.detail).join(' ') : ''), true);
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
const statusPill = s => pill(String(s).replace(/_/g, ' '), { resolved: 'good', reviewed: 'good', passed: 'good', approved: 'good', closed: 'good', open: 'warn', draft: 'warn', rejected: 'bad', escalated: 'bad', waiting_on_owner: 'info', prepared: 'info', ready_for_signoff: 'info', in_progress: 'warn', requested: 'warn', proposed: 'warn' }[s] || '');
const table = (heads, rows, cls = '') => `<div class="tablewrap"><table class="t ${cls}"><thead><tr>${heads.map(h => `<th class="${h.startsWith('#') ? 'num' : ''}">${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="muted">Nothing here.</td></tr>`}</tbody></table></div>`;

/** Link to the source of a number: a CSV row, a statement line, a project, a draw… */
function srcLink(ref, text) {
  if (!ref) return '';
  if ((ref.kind === 'txn' || ref.kind === 'bank_line') && ref.document_id && ref.row) {
    return `<a data-act="row" data-doc="${esc(ref.document_id)}" data-line="${esc(ref.row)}">${esc(text || `${ref.filename || ref.document_id}, line ${ref.row}`)}</a>`;
  }
  const map = { project: `#/reports/project/${ref.id}`, draw: '#/reports/draws', loan: '#/reports/draws', forecast: `#/reports/forecast/${ref.id}`, vendor: '#/approvals', freshness: '#/workbench', issue: `#/exceptions/${ref.id}` };
  return map[ref.kind] ? `<a href="${esc(map[ref.kind])}">${esc(text || `${ref.kind} ${ref.id}`)}</a>` : esc(text || ref.kind);
}

// ---------------- boot & chrome ----------------
async function boot() {
  S.token = store.get('kca-token');
  if (S.token) {
    try { S.me = await api('/api/me'); S.boot = await api('/api/bootstrap'); } catch { S.token = null; }
  }
  window.addEventListener('hashchange', render);
  render();
}

function chrome() {
  const b = S.boot;
  const banner = $('#banner');
  if (b?.demo_mode) { banner.hidden = false; banner.textContent = `SYNTHETIC DEMO DATA — as of ${b.as_of}. Not connected to QuickBooks, banks, payroll or payments. Numbers are made up for training.`; }
  const side = $('#side'); side.hidden = !S.me;
  if (!S.me) return;
  const cur = location.hash || '#/';
  const link = (href, label, extra = '', cls = '') => `<a href="${href}" class="${cls} ${cur === href || (href !== '#/' && cur.startsWith(href + '/')) ? 'on' : ''}">${label}${extra}</a>`;
  const open = b.open_issue_count;
  $('#nav').innerHTML = [
    link('#/', 'Home'),
    '<div class="grp">Learn</div>', link('#/learn', '1 · Learn'),
    '<div class="grp">Work</div>', link('#/workbench', '2 · Workbench'), link('#/exceptions', '3 · Exception queue', open ? ` ${pill(open, 'warn')}` : ''),
    link('#/close', '4 · Close & reports'),
    link('#/reports/recon', 'Bank reconciliation', '', 'sub'), link('#/reports/project/PRJ-THB-0001', 'Projects', '', 'sub'),
    link('#/reports/forecast/ENT-THB', 'Cash forecast', '', 'sub'), link('#/reports/aging/ap', 'Aging', '', 'sub'),
    link('#/reports/draws', 'Draws & loans', '', 'sub'), link('#/reports/intercompany', 'Intercompany', '', 'sub'),
    link('#/approvals', 'Approvals'),
    link('#/brief', "Juan's brief"),
    '<div class="grp">Grow</div>', link('#/coach', '5 · Coach & scorecard'),
    '<div class="grp">Settings</div>', link('#/setup', 'Setup', b.setup_missing.length ? ` ${pill(b.setup_missing.length, 'warn')}` : ''), link('#/admin', 'Admin'),
  ].join('');
  $('#sideFoot').innerHTML = `<div><strong>${esc(S.me.user.name)}</strong><br><span class="muted">${esc(S.me.roles.join(', '))}</span></div>
    <div class="row"><button class="btn ghost sm" data-act="switch">Switch user</button></div>
    <div class="muted">AI: ${S.boot.ai.provider === 'claude' ? 'Claude (approved)' : 'rules-based demo'}</div>`;
}

async function refreshBoot() { S.boot = await api('/api/bootstrap'); chrome(); }

const ROUTES = [
  [/^#\/login$/, viewLogin], [/^#?\/?$/, viewHome], [/^#\/setup$/, viewSetup],
  [/^#\/learn$/, viewLearn], [/^#\/learn\/(\w+)$/, viewLesson],
  [/^#\/workbench$/, viewWorkbench], [/^#\/workbench\/import\/([\w-]+)$/, viewImportPreview],
  [/^#\/exceptions$/, viewExceptions], [/^#\/exceptions\/([\w-]+)$/, viewIssue],
  [/^#\/close$/, viewClose], [/^#\/close\/([\w-]+)\/([\d-]+)$/, viewClose],
  [/^#\/reports\/recon$/, viewReconList], [/^#\/reports\/recon\/([\w-]+)$/, viewRecon],
  [/^#\/reports\/project\/([\w-]+)$/, viewProject], [/^#\/reports\/aging\/(ap|ar)$/, viewAging],
  [/^#\/reports\/forecast\/([\w-]+)$/, viewForecast], [/^#\/reports\/draws$/, viewDraws], [/^#\/reports\/intercompany$/, viewIntercompany],
  [/^#\/approvals$/, viewApprovals], [/^#\/brief$/, viewBrief], [/^#\/coach$/, viewCoach], [/^#\/admin$/, viewAdmin],
];

async function render() {
  const hash = location.hash || '#/';
  if (!S.me && hash !== '#/login') { location.hash = '#/login'; return; }
  chrome();
  const r = ROUTES.find(([re]) => re.test(hash));
  const main = $('#main');
  if (!r) { main.innerHTML = '<div class="card"><h2>Page not found</h2><p><a href="#/">Go home</a></p></div>'; return; }
  try {
    const html = await r[1](...(hash.match(r[0]) || []).slice(1));
    if (typeof html === 'string') main.innerHTML = html;
    window.scrollTo(0, 0);
  } catch (e) { main.innerHTML = `<div class="card"><h2>Couldn't load this page</h2><p>${esc(e.message)}</p></div>`; }
}

// ---------------- login ----------------
async function viewLogin() {
  const users = await api('/api/users');
  const desc = { learner: 'Learns and prepares work', preparer: 'Imports data, works exceptions, prepares close', reviewer: 'Reviews and signs off', executive: 'Reads the brief, approves payments', admin: 'Setup, users, settings' };
  return `<div class="login"><div class="stack"><span class="muted small">Demo sign-in</span><h1>Kristine AI Controller Academy</h1>
    <p class="muted">Choose who you are. This demo has no passwords; the real deployment needs proper sign-in before any company data goes in.</p></div>
    <div class="grid">${users.map(u => `<button class="who" data-act="login" data-id="${esc(u.id)}"><strong>${esc(u.name)}</strong><span class="muted small">${esc(u.roles.split(',').map(r => desc[r]).join('; '))}</span></button>`).join('')}</div></div>`;
}

// ---------------- home ----------------
async function viewHome() {
  const roles = S.me.roles;
  if (roles.includes('executive') && !roles.includes('preparer')) { location.hash = '#/brief'; return ''; }
  const [issues, sc, lessons] = await Promise.all([api('/api/issues?open=1'), api(`/api/scorecard/${S.me.user.id}`).catch(() => null), api('/api/lessons')]);
  const mine = issues.filter(i => i.assignee_id === S.me.user.id || roles.includes('reviewer'));
  const nextModule = sc?.modules.find(m => m.status !== 'passed');
  let reviewQueue = '';
  if (can('close.review')) {
    const [close, pays, jes, recons] = await Promise.all([api(`/api/close/ENT-THB/${S.boot.as_of.slice(0, 7)}`), api('/api/payments'), api('/api/journals'), api('/api/reports/recon')]);
    const k = S.boot.users.find(u => u.roles.includes('learner'));
    const ksc = k ? await api(`/api/scorecard/${k.id}`) : null;
    const items = [
      ...close.tasks.filter(t => t.prepared_by && !t.reviewed_by).map(t => `<li>Close step prepared, needs review: <a href="#/close">${esc(t.title)}</a></li>`),
      ...recons.filter(r => r.workpaper_status === 'prepared').map(r => `<li>Reconciliation ready for review: <a href="#/reports/recon/${esc(r.id)}">${esc(r.bank_name)} ${esc(r.period_end)}</a></li>`),
      ...(ksc?.modules || []).filter(m => m.status === 'ready_for_signoff').map(m => `<li>Training task ready for sign-off: <a href="#/learn/${esc(m.id)}">${esc(m.title)}</a></li>`),
      ...pays.filter(p => p.status === 'requested').map(p => `<li>Payment requested: <a href="#/approvals">${esc(p.vendor_name)} ${moneyText(p.amount_cents)}</a></li>`),
      ...jes.filter(j => j.status === 'proposed').map(j => `<li>Journal entry proposed: <a href="#/approvals">${esc(j.memo)}</a></li>`),
    ];
    reviewQueue = `<div class="card"><h2>Waiting for your review</h2>${items.length ? `<ul class="stack" style="margin:0;padding-left:20px">${items.join('')}</ul>` : '<p class="muted">Nothing waiting.</p>'}</div>`;
  }
  const lessonTitle = id => lessons.find(l => l.id === id)?.title || '';
  return `<div class="head"><div><div class="eyebrow">As of ${esc(S.boot.as_of)}</div><h1>Good day, ${esc(S.me.user.name.split(' ')[0])}</h1></div>
    ${S.boot.setup_missing.length ? `<a class="btn ghost" href="#/setup">${S.boot.setup_missing.length} setup answers missing</a>` : ''}</div>
    ${reviewQueue}
    ${nextModule ? `<div class="card"><div class="row between"><div><div class="muted small">Training · ${esc(nextModule.weeks)}</div><h2>${esc(nextModule.title)}</h2></div>${statusPill(nextModule.status)}</div>
      <p class="muted">Daily rhythm: 20 min lesson · 30 min practice · 20 min real exceptions · 10 min written explanation.</p>
      <div class="row"><a class="btn" href="#/learn/${esc(nextModule.id)}">Continue the lesson</a><a class="btn ghost" href="#/coach">See scorecard</a></div></div>` : ''}
    <div class="card"><div class="row between"><h2>Today's queue</h2><a href="#/exceptions">All exceptions →</a></div>
      <p class="muted small">Sorted by severity, then dollars. Each item links to a 3-minute concept card for the skill it uses.</p>
      <div class="stack">${mine.slice(0, 8).map(i => issueRow(i, lessonTitle(i.lesson_id))).join('') || '<p class="muted">Nothing assigned.</p>'}</div></div>`;
}

function issueRow(i, lessonTitle) {
  return `<div class="issue"><div class="sev ${esc(i.severity)}"></div><div class="stack" style="gap:4px"><a href="#/exceptions/${esc(i.id)}"><strong>${esc(i.title)}</strong></a>
    <span class="muted small">${esc(entName(i.entity_id))} · owner ${esc(userName(i.assignee_id))} · due ${esc(i.due_date || '—')} ${lessonTitle ? `· <a data-act="concept" data-id="${esc(i.lesson_id)}">Concept: ${esc(lessonTitle)}</a>` : ''}</span></div>
    <div class="stack" style="gap:4px;align-items:flex-end">${money(i.amount_cents)}${statusPill(i.status)}</div></div>`;
}

// ---------------- setup wizard ----------------
const SETUP_QUESTIONS = [
  ['entities', 'Legal entity list', 'Exact legal names, EINs kept elsewhere, ownership, and which ones share bank accounts. The app starts with the four names in Juan’s brief, marked unverified.'],
  ['ledger', 'Accounting software', 'Which ledger each entity uses.'],
  ['qbo_plan', 'QuickBooks Online plan', 'Simple Start, Essentials, Plus or Advanced? Projects and budgets need Plus or Advanced.'],
  ['exports', 'Exports available', 'Trial balance, general ledger, A/P and A/R aging, bank statements, project detail — for the last three months.'],
  ['project_ids', 'Property and job IDs', 'How each property and job is identified (the app uses PRJ-… IDs separate from entity IDs).'],
  ['payment_approver', 'Who approves payments', 'Named person(s), and the dollar limits.'],
  ['journal_approver', 'Who approves journal entries', 'Named person(s) and the threshold.'],
  ['close_reviewer', 'Who reviews the month-end close', 'Must be someone other than the preparer.'],
  ['cpa_reviewer', 'CPA / outside reviewer', 'Name, firm and how to reach them.'],
  ['data_sources', 'Permitted data sources', 'Which folders, inboxes and systems may feed this app.'],
  ['approved_ai_tools', 'Approved AI tools', 'Which AI tools may see company records, under what data settings.'],
  ['pilot', 'First pilot', 'One entity, one bank account and one property for the first 30 days.'],
];
async function viewSetup() {
  const setup = await api('/api/setup');
  const editable = can('settings.manage');
  const answered = SETUP_QUESTIONS.filter(([k]) => setup[k]).length;
  return `<div class="head"><div><div class="eyebrow">Setup wizard</div><h1>Tell the app about the business</h1></div><span class="pill ${answered === SETUP_QUESTIONS.length ? 'good' : 'warn'}">${answered} of ${SETUP_QUESTIONS.length} answered</span></div>
  <p class="muted" style="max-width:72ch">Missing answers don't block training. They are listed on Juan's weekly report as unresolved access. ${editable ? '' : 'Only an admin can edit these answers.'}</p>
  <form class="stack" data-form="setup">${SETUP_QUESTIONS.map(([k, label, hint], i) => `<div class="card tight"><label class="f">${i + 1}. ${esc(label)} ${setup[k] ? pill('answered', 'good') : pill('missing', 'warn')}<span class="hint">${esc(hint)}</span>
    <textarea name="${k}" id="setup-${k}" ${editable ? '' : 'disabled'}>${esc(setup[k] || '')}</textarea></label></div>`).join('')}
    ${editable ? '<div><button class="btn">Save answers</button></div>' : ''}</form>
  <div class="card"><h2>Entities</h2><p class="muted small">Never merge entities just because Juan owns them. Mark each one verified only after checking the legal entity map.</p>
    ${table(['ID', 'Name', 'Ledger', 'Verified', 'Notes'], S.boot.entities.map(e => `<tr><td class="num">${esc(e.id)}</td><td>${esc(e.name)}</td><td>${esc(e.ledger)}</td><td>${e.verified ? pill('verified', 'good') : pill('unverified', 'warn')}</td><td class="small">${esc(e.notes)}</td></tr>`))}</div>`;
}

// ---------------- learn ----------------
async function viewLearn() {
  const sc = await api(`/api/scorecard/${S.me.user.id}`);
  return `<div class="head"><div><div class="eyebrow">Section 1</div><h1>Learn</h1></div></div>
  <p class="muted" style="max-width:72ch">Twelve weeks, six modules. Each module has a lesson, QuickBooks Online steps, a practice problem, a scored quiz, a real task and a reviewer sign-off. Move on when you pass, not when the calendar says so.</p>
  <div class="grid">${sc.modules.map((m, i) => `<a class="card" href="#/learn/${esc(m.id)}" style="text-decoration:none;color:inherit"><div class="row between"><span class="muted small">Module ${i + 1} · ${esc(m.weeks)}</span>${statusPill(m.status)}</div>
    <h2>${esc(m.title)}</h2><div class="stepper">${stepper(m)}</div></a>`).join('')}</div>`;
}
const stepper = m => [['Practice', m.scenario_solved], ['Quiz', m.quiz_pass], ['Task', !!m.task], ['Sign-off', m.signoff?.passed]].map(([l, d]) => `<span class="s ${d ? 'done' : ''}">${d ? '✓ ' : ''}${l}</span>`).join('');

async function viewLesson(id) {
  const m = await api(`/api/lessons/${id}`);
  const p = m.progress;
  const learner = S.boot.users.find(u => u.roles.includes('learner'));
  let reviewerBox = '';
  if (can('module.signoff') && learner) {
    const lp = (await api(`/api/scorecard/${learner.id}`)).modules.find(x => x.id === id);
    reviewerBox = `<div class="card"><h3>Reviewer sign-off for ${esc(learner.name)}</h3>
      <div class="stepper">${stepper(lp)}</div>
      ${lp.task ? `<div class="feedback"><strong>Submitted task:</strong> ${esc(lp.task.summary)}${lp.task.evidence ? `<br><span class="small">Evidence: ${esc(lp.task.evidence)}</span>` : ''}</div>` : '<p class="muted">No task submitted yet.</p>'}
      <form class="stack" data-form="signoff" data-module="${esc(id)}" data-learner="${esc(learner.id)}">
        ${m.rubric.map((r, i) => `<label class="row"><input type="checkbox" name="r${i}" id="rub-${i}"> ${esc(r)}</label>`).join('')}
        <label class="f">Reviewer note: what you checked and what to practice<textarea name="note" id="signoff-note"></textarea></label>
        <div class="row"><button class="btn" name="passed" value="1">Pass the module</button><button class="btn ghost" name="passed" value="0">Not yet — retry with a new scenario</button></div></form></div>`;
  }
  return `<div class="head"><div><div class="eyebrow">${esc(m.weeks)}</div><h1>${esc(m.title)}</h1></div>${statusPill(p.status)}</div>
  <p class="muted" style="max-width:72ch"><strong>You pass when you can:</strong> ${esc(m.goal)}</p>
  <div class="card"><h3>3-minute concept card</h3><p>${esc(m.concept_card)}</p></div>
  <div class="card"><h3>Lesson</h3><div class="prose">${m.lesson_html}</div><div class="rule"><strong>Rule to remember:</strong> ${esc(m.rule)}</div></div>
  <div class="card"><h3>Do it in QuickBooks Online</h3><ol class="stack" style="margin:0;padding-left:22px">${m.qbo_steps.map(s => `<li><strong>${esc(s.title)}.</strong> ${s.html}</li>`).join('')}</ol>
    <p class="muted small">Menu names change between QuickBooks versions. If a path doesn't match, use the search bar.</p></div>
  <div class="card"><h3>Practice problem ${p.scenario_solved ? pill('solved', 'good') : ''}</h3><p>${m.scenario.text_html}</p>
    <form class="stack" data-form="scenario" data-module="${esc(id)}">
      <label class="f">First, how are you working it out?<textarea name="reasoning" id="scn-reason" placeholder="Show your steps"></textarea></label>
      <div class="form"><label class="f">${esc(m.scenario.ask)}<input type="text" name="answer" id="scn-answer" inputmode="decimal" placeholder="e.g. 12,500"></label>
      <label class="f">How sure are you?<select name="confidence" id="scn-conf"><option>Not sure</option><option>Somewhat sure</option><option>Very sure</option></select></label>
      <div><button class="btn">Check my answer</button></div></div><div id="scnOut"></div></form></div>
  <div class="card"><h3>Quiz ${p.quiz_best != null ? pill(`best ${p.quiz_best}/${p.quiz_max}`, p.quiz_pass ? 'good' : 'warn') : ''}</h3>
    <p class="muted small">Pick an answer and write why. You can ask the coach about any question before scoring. Pass with 4 of 5.</p>
    <form data-form="quiz" data-module="${esc(id)}">${m.quiz.map((q, i) => `<fieldset class="q" style="border:0;margin:0;padding-inline:0"><legend><strong>${i + 1}. ${esc(q.q)}</strong></legend>
      ${q.options.map((o, j) => `<label class="opt" data-q="${i}" data-o="${j}"><input type="radio" name="q${i}" value="${j}" id="q${i}o${j}"> <span>${esc(o)}</span></label>`).join('')}
      <label class="f">Why?<input type="text" name="why${i}" id="why${i}" placeholder="Your reason in a few words"></label>
      <div class="row"><button type="button" class="btn ghost sm" data-act="tutor" data-module="${esc(id)}" data-i="${i}">Ask the coach</button>${q.policy ? `<span class="muted small">Policy: ${esc(q.policy)}</span>` : ''}</div>
      <div class="feedback" id="fb${i}" hidden></div></fieldset>`).join('')}
      <div class="form"><label class="f">Overall confidence<select name="confidence" id="quiz-conf"><option>Not sure</option><option>Somewhat sure</option><option>Very sure</option></select></label><div><button class="btn">Score my quiz</button></div></div>
      <div id="quizOut" class="stack"></div></form></div>
  <div class="card"><h3>Real task ${p.task ? pill('submitted', 'good') : ''}</h3><p>${esc(m.task)}</p>
    <p class="muted small"><strong>Reviewer checks:</strong></p><ul style="margin:0;padding-left:20px">${m.rubric.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    ${can('learn.use') ? `<form class="stack" data-form="task" data-module="${esc(id)}"><label class="f">What you did<textarea name="summary" id="task-summary">${esc(p.task?.summary || '')}</textarea></label>
      <label class="f">Where the evidence is<input type="text" name="evidence" id="task-evidence" value="${esc(p.task?.evidence || '')}" placeholder="Workpaper name, QuickBooks report, import ID"></label><div><button class="btn">Submit for review</button></div></form>` : ''}</div>
  ${p.signoff ? `<div class="card"><h3>Reviewer sign-off ${statusPill(p.signoff.passed ? 'passed' : 'rejected')}</h3><p>${esc(p.signoff.note)}</p><p class="muted small">${esc(p.signoff.reviewer_name)} · ${esc(p.signoff.signed_at.slice(0, 10))}</p></div>` : ''}
  ${reviewerBox}`;
}

// ---------------- workbench ----------------
async function viewWorkbench() {
  const [imports, docs] = await Promise.all([api('/api/imports'), api('/api/documents')]);
  const banks = S.boot.bank_accounts;
  return `<div class="head"><div><div class="eyebrow">Section 2</div><h1>Workbench</h1></div></div>
  <p class="muted" style="max-width:72ch">Upload exports from QuickBooks Online or the bank. The original file is saved unchanged with its fingerprint. You'll see the column mapping, totals, duplicates and errors before anything is imported.</p>
  ${can('import.run') ? `<div class="card"><h2>Import a CSV</h2><form class="stack" data-form="import">
    <div class="form">
      <label class="f">What is it?<select name="kind" id="imp-kind"><option value="ledger">Ledger / transaction detail</option><option value="ap_bills">Bills (A/P)</option><option value="bank_statement">Bank statement</option></select></label>
      <label class="f">Entity<span class="hint">Used when the file has no entity column</span><select name="entity_id" id="imp-entity"><option value="">From the file</option>${S.boot.entities.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select></label>
      <label class="f">File<input type="file" name="file" id="imp-file" accept=".csv,text/csv" required></label>
      <label class="f">Pulled from the source on<input type="date" name="retrieved_at" id="imp-retrieved"></label>
    </div>
    <details><summary>Control totals (recommended)</summary><div class="form" style="margin-top:8px">
      <label class="f">Expected rows<span class="hint">From the report footer</span><input type="number" name="expected_rows" id="imp-rows"></label>
      <label class="f">Control total<span class="hint">Sum of the amount column in the source report</span><input type="text" name="control_total" id="imp-total" inputmode="decimal"></label></div></details>
    <details><summary>Bank statement details</summary><div class="form" style="margin-top:8px">
      <label class="f">Bank account<select name="bank_account_id" id="imp-bank"><option value="">—</option>${banks.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>
      <label class="f">Opening balance<input type="text" name="opening" id="imp-open" inputmode="decimal"></label>
      <label class="f">Closing balance<input type="text" name="closing" id="imp-close" inputmode="decimal"></label>
      <label class="f">Period start<input type="date" name="period_start" id="imp-ps"></label><label class="f">Period end<input type="date" name="period_end" id="imp-pe"></label></div></details>
    <div><button class="btn">Preview import</button></div></form>
    <p class="muted small">Try it: <code>samples/synthetic-thb-ledger-adjustments-2026-09.csv</code> (ledger, entity Twin Home Buyer) records the draw and bank fee so the September reconciliation can pass.</p></div>
  <div class="card"><h2>Add a supporting document</h2><p class="muted small">PDFs and images are stored as originals with a page count. Reading text out of PDFs is a later phase.</p>
    <form class="form" data-form="doc"><label class="f">File<input type="file" name="file" id="doc-file" required></label><div><button class="btn ghost">Store document</button></div></form></div>` : ''}
  <div class="card"><h2>Import manifest</h2>${table(['Import', 'File', 'Type', 'Rows', '#Total', 'Dates', 'Pulled', 'Status', 'Ready'], imports.map(b => `<tr class="click" data-act="go" data-href="#/workbench/import/${esc(b.id)}">
    <td class="num">${esc(b.id)}</td><td>${esc(b.filename)}<br><span class="muted small num">sha256 ${esc(b.sha256.slice(0, 12))}…</span></td><td>${esc(b.kind)}</td><td class="num">${esc(b.row_count)}</td><td class="num">${money(b.total_cents)}</td>
    <td class="small">${esc(b.date_min || '')} → ${esc(b.date_max || '')}</td><td class="small">${esc((b.retrieved_at || '').slice(0, 10))}</td><td>${statusPill(b.status)}</td><td>${b.status === 'committed' ? (b.ready ? pill('ready', 'good') : pill('open questions', 'warn')) : ''}</td></tr>`))}</div>
  <div class="card"><h2>Stored documents</h2>${table(['Document', 'File', 'Kind', 'Pages', 'Uploaded'], docs.slice(0, 30).map(d => `<tr><td class="num">${esc(d.id)}</td><td>${esc(d.filename)} ${d.synthetic ? pill('synthetic') : ''}</td><td>${esc(d.kind)}</td><td class="num">${esc(d.pages ?? '')}</td><td class="small">${esc(d.uploaded_at.slice(0, 10))} · ${esc(userName(d.uploaded_by))}</td></tr>`))}</div>`;
}

function previewHtml(p, batch) {
  const s = p.summary;
  const committed = batch && batch.status !== 'previewed';
  const heads = ['Line', 'Date', 'Amount', 'Entity', 'Account / description', 'Vendor / project', 'Problems'];
  const rows = p.rows.map(r => `<tr class="${r.errors.length ? 'err' : r.warnings.some(w => w.code !== 'new_vendor') ? 'flag' : ''}"><td class="num">${esc(r.line)}</td><td class="num">${esc(r.date || '')}</td><td class="num">${money(r.amount_cents)}</td>
    <td>${esc(r.entity_id || '')}</td><td>${esc(r.account_id || r.description || '')}${r.type ? `<br><span class="muted small">${esc(r.type)}</span>` : ''}</td><td>${esc(r.vendor_name || r.customer || '')}${r.project_id ? `<br><span class="muted small">${esc(r.project_id)}</span>` : ''}</td>
    <td class="small">${[...r.errors.map(e => `<div>${pill('error', 'bad')} ${esc(e)}</div>`), ...r.warnings.map(w => `<div>${pill(w.code.replace(/_/g, ' '), w.code === 'new_vendor' ? '' : 'warn')} ${esc(w.text)}</div>`)].join('')}</td></tr>`);
  const mapOptions = f => `<option value="">— not in file —</option>${p.headers.map(h => `<option ${p.mapping[f.name] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}`;
  return `<div class="grid">
      <div class="card tight kpi"><span class="l">Rows</span><span class="v">${s.row_count}</span></div>
      <div class="card tight kpi"><span class="l">File total</span><span class="v">${money(s.total_cents)}</span></div>
      <div class="card tight kpi"><span class="l">Dates</span><span class="v small">${esc(s.date_min || '—')} → ${esc(s.date_max || '—')}</span></div>
      <div class="card tight kpi"><span class="l">Possible duplicates · wrong entity</span><span class="v">${s.duplicate_count} · ${s.wrong_entity_count}</span></div></div>
    ${s.blocking.length ? `<div class="card" style="border-color:var(--bad)"><h3>Can't import yet</h3><ul style="margin:0;padding-left:20px">${s.blocking.map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>` : !committed ? `<div class="card" style="border-color:var(--good)"><h3>Ready to import</h3><p class="muted">Rows with warnings will import and open questions in the exception queue. They keep a link to this file and line.</p></div>` : ''}
    ${!committed && can('import.run') ? `<div class="card"><h3>Column mapping</h3><form class="stack" data-form="remap" data-id="${esc(p.batch_id)}"><div class="form">${p.fields.map(f => `<label class="f">${esc(f.name.replace(/_/g, ' '))}${f.required ? ' *' : ''}<select name="${esc(f.name)}" id="map-${esc(f.name)}">${mapOptions(f)}</select></label>`).join('')}</div>
      <div class="row"><button class="btn ghost">Re-check with this mapping</button></div></form>
      <div class="row"><button class="btn" data-act="commit" data-id="${esc(p.batch_id)}" ${s.can_commit ? '' : 'disabled'}>Import ${s.row_count} rows</button><button class="btn ghost" data-act="rejectImport" data-id="${esc(p.batch_id)}">Reject file</button></div></div>` : ''}
    <div class="card"><h3>Normalized rows (staging preview)</h3>${table(heads, rows)}</div>`;
}

async function viewImportPreview(id) {
  const b = await api(`/api/imports/${id}`);
  const p = { ...b.validation, batch_id: b.id, mapping: b.mapping, fields: b.fields };
  return `<div class="head"><div><div class="eyebrow"><a href="#/workbench">Workbench</a> · ${esc(b.id)}</div><h1>${esc(b.filename)}</h1></div>${statusPill(b.status)}</div>
    <p class="muted small num">sha256 ${esc(b.sha256)} · pulled ${esc((b.retrieved_at || '').slice(0, 16))} · by ${esc(userName(b.created_by))}</p>
    ${previewHtml(p, b)}`;
}

// ---------------- exceptions ----------------
async function viewExceptions() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const issues = await api('/api/issues');
  const open = issues.filter(i => i.status !== 'resolved');
  const types = [...new Set(issues.map(i => i.type))].sort();
  return `<div class="head"><div><div class="eyebrow">Section 3</div><h1>Exception queue</h1></div>${can('issue.work') ? '<button class="btn ghost" data-act="runRules">Re-run checks</button>' : ''}</div>
  <p class="muted" style="max-width:72ch">A flag is a question, not an accusation. Each item has evidence, severity, a next step, an owner and a due date. Close it only with evidence, mark it waiting on someone, or escalate it.</p>
  <div class="grid">${['high', 'medium', 'low'].map(sv => `<div class="card tight kpi"><span class="l">${sv} severity open</span><span class="v">${open.filter(i => i.severity === sv).length}</span></div>`).join('')}
    <div class="card tight kpi"><span class="l">Dollars involved (open)</span><span class="v">${money(open.reduce((s, i) => s + (i.amount_cents || 0), 0))}</span></div></div>
  <div class="card"><div class="row"><label class="f">Show<select id="exFilter" data-act-change="exFilter"><option value="open">Open</option><option value="all">All</option><option value="resolved">Resolved</option>${types.map(t => `<option value="type:${esc(t)}">${esc(t.replace(/_/g, ' '))}</option>`).join('')}</select></label></div>
  <div id="exList" class="stack">${issueList(issues, 'open')}</div></div>`;
}
function issueList(issues, f) {
  const list = issues.filter(i => f === 'all' ? true : f === 'open' ? i.status !== 'resolved' : f === 'resolved' ? i.status === 'resolved' : i.type === f.slice(5));
  return table(['', 'Exception', 'Entity', '#Amount', 'Owner', 'Due', 'Status'], list.map(i => `<tr class="click" data-act="go" data-href="#/exceptions/${esc(i.id)}"><td>${pill(i.severity, i.severity)}</td>
    <td>${esc(i.title)}<br><span class="muted small">${esc(i.type.replace(/_/g, ' '))}${i.still_detected ? '' : ' · no longer detected in data'}</span></td><td class="small">${esc(i.entity_id || '')}</td><td class="num">${money(i.amount_cents)}</td>
    <td class="small">${esc(userName(i.assignee_id))}</td><td class="num small">${esc(i.due_date || '')}</td><td>${statusPill(i.status)}</td></tr>`));
}

async function viewIssue(id) {
  const i = await api(`/api/issues/${id}`);
  const lesson = S.boot.lessons.find(l => l.id === i.lesson_id);
  return `<div class="head"><div><div class="eyebrow"><a href="#/exceptions">Exception queue</a> · ${esc(i.id)}</div><h1>${esc(i.title)}</h1></div><div class="row">${pill(i.severity, i.severity)}${statusPill(i.status)}</div></div>
  ${!i.still_detected && i.status !== 'resolved' ? '<div class="card" style="border-color:var(--good)"><p>The latest data no longer shows this problem. Confirm what changed and resolve it with a note.</p></div>' : ''}
  <div class="grid two">
    <div class="card"><h3>Evidence</h3><ul class="stack" style="margin:0;padding-left:20px">${i.evidence.map(e => `<li>${esc(e.label)}<div class="cite">${srcLink(e.ref)}</div></li>`).join('')}</ul>
      <div class="row small muted">Entity ${esc(entName(i.entity_id))}${i.project_id ? ` · project <a href="#/reports/project/${esc(i.project_id)}">${esc(i.project_id)}</a>` : ''} · amount ${money(i.amount_cents)}</div></div>
    <div class="card"><h3>Suggested next step</h3><p>${esc(i.suggested_step)}</p>${lesson ? `<p class="small"><a data-act="concept" data-id="${esc(lesson.id)}">Concept card: ${esc(lesson.title)}</a> · <a href="#/learn/${esc(lesson.id)}">full lesson</a></p>` : ''}
      <p class="muted small">Owner ${esc(userName(i.assignee_id))} · due ${esc(i.due_date || '—')}</p></div></div>
  ${can('issue.work') ? `<div class="card"><h3>Disposition</h3><form class="stack" data-form="issue" data-id="${esc(i.id)}">
    <div class="form"><label class="f">Status<select name="status" id="iss-status">${['open', 'waiting_on_owner', 'escalated', 'resolved'].map(s => `<option value="${s}" ${i.status === s ? 'selected' : ''}>${s === 'resolved' ? 'Resolved with evidence' : s.replace(/_/g, ' ')}</option>`).join('')}</select></label>
      <label class="f">Owner<select name="assignee_id" id="iss-owner">${S.boot.users.map(u => `<option value="${esc(u.id)}" ${i.assignee_id === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
      <label class="f">Due<input type="date" name="due_date" id="iss-due" value="${esc(i.due_date || '')}"></label></div>
    <label class="f">AI or first hypothesis<span class="hint">A guess to check, not a conclusion</span><textarea name="ai_hypothesis" id="iss-hyp">${esc(i.ai_hypothesis || '')}</textarea></label>
    <label class="f">Your conclusion and evidence<span class="hint">Required to resolve: what you found, and the document or row that proves it</span><textarea name="human_conclusion" id="iss-concl">${esc(i.human_conclusion || '')}</textarea></label>
    <div><button class="btn">Save</button></div></form></div>` : ''}
  <div class="card"><h3>History</h3>${table(['When', 'Who', 'What'], i.history.map(h => `<tr><td class="small num">${esc(h.at.replace('T', ' ').slice(0, 16))}</td><td class="small">${esc(userName(h.user_id))}</td><td class="small">${esc(h.action)} ${esc(h.detail_json)}</td></tr>`))}</div>`;
}

// ---------------- close ----------------
async function viewClose(entity = 'ENT-THB', period = S.boot.as_of.slice(0, 7)) {
  const c = await api(`/api/close/${entity}/${period}`);
  const reconList = await api('/api/reports/recon');
  return `<div class="head"><div><div class="eyebrow">Section 4</div><h1>Month-end close</h1></div>
    <div class="row"><label class="f">Entity<select id="closeEntity" data-act-change="closeGo">${S.boot.entities.map(e => `<option value="${esc(e.id)}" ${e.id === entity ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
    <label class="f">Period<input type="text" id="closePeriod" value="${esc(period)}" data-act-change="closeGo" style="width:110px"></label></div></div>
  <div class="card"><div class="row between"><h2>${esc(c.entity.name)} · ${esc(period)}</h2>${statusPill(c.close.status)}</div>
    <p class="muted small">Kristine prepares each step with evidence. A reviewer who didn't prepare it reviews it. Automatic checks must pass. Then a reviewer signs off, and someone sets the closing date in QuickBooks Online.</p>
    ${table(['Step', 'Check', 'Prepared', 'Reviewed', ''], c.tasks.map(t => `<tr><td><strong>${esc(t.title)}</strong>${t.evidence ? `<div class="small muted">Evidence: ${esc(t.evidence)}</div>` : ''}${t.review_note ? `<div class="small muted">Reviewer: ${esc(t.review_note)}</div>` : ''}</td>
      <td class="small">${t.check ? `${t.check.pass ? pill('pass', 'good') : pill('failing', 'bad')}<div>${t.check.detail.map(esc).join('<br>')}</div>` : '<span class="muted">manual</span>'}</td>
      <td class="small">${t.prepared_by ? `${esc(userName(t.prepared_by))}<br>${esc(t.prepared_at.slice(0, 16).replace('T', ' '))}` : '—'}</td>
      <td class="small">${t.reviewed_by ? `${esc(userName(t.reviewed_by))}<br>${esc(t.reviewed_at.slice(0, 16).replace('T', ' '))}` : '—'}</td>
      <td>${c.close.status === 'open' ? `${can('close.prepare') ? `<button class="btn sm ghost" data-act="prepTask" data-id="${esc(t.id)}">Prepare</button>` : ''}${can('close.review') && t.prepared_by && !t.reviewed_by ? `<button class="btn sm" data-act="reviewTask" data-id="${esc(t.id)}">Review</button>` : ''}` : ''}</td></tr>`))}
    ${c.close.status === 'closed' ? `<p>${pill('closed', 'good')} Signed off by ${esc(userName(c.close.signed_off_by))} on ${esc(c.close.signed_off_at.slice(0, 10))}. Set the closing date and password in QuickBooks Online.</p>`
      : `<div class="stack">${c.blockers.length ? `<details><summary>${c.blockers.length} item(s) block sign-off</summary><ul>${c.blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul></details>` : '<p>All steps prepared, reviewed and passing.</p>'}
         ${can('close.signoff') ? `<div><button class="btn" data-act="signoffClose" data-entity="${esc(entity)}" data-period="${esc(period)}" ${c.can_sign_off ? '' : 'disabled'}>Sign off the close</button></div>` : '<p class="muted small">Only a reviewer can sign off a close. A learner can never sign off her own close.</p>'}</div>`}</div>
  <div class="card"><h2>Reports for this close</h2><div class="grid">
    ${reconList.filter(r => r.entity_id === entity).map(r => `<a class="card tight" href="#/reports/recon/${esc(r.id)}"><strong>Bank rec · ${esc(r.bank_name)}</strong><span>${r.reconciled ? pill('reconciled', 'good') : pill('not reconciled', 'bad')} ${statusPill(r.workpaper_status)}</span></a>`).join('')}
    ${S.boot.projects.filter(p => p.entity_id === entity).map(p => `<a class="card tight" href="#/reports/project/${esc(p.id)}"><strong>Project · ${esc(p.id)}</strong><span class="muted small">Budget vs actual, profit bridge</span></a>`).join('')}
    <a class="card tight" href="#/reports/forecast/${esc(entity)}"><strong>13-week cash forecast</strong><span class="muted small">Known vs estimate</span></a>
    <a class="card tight" href="#/reports/aging/ap"><strong>A/P and A/R aging</strong></a><a class="card tight" href="#/reports/draws"><strong>Debt and draws</strong></a><a class="card tight" href="#/reports/intercompany"><strong>Intercompany rollforward</strong></a></div></div>`;
}

// ---------------- reports ----------------
function versionBar(kind, scope) {
  return `<div class="row">${pill('draft until reviewed', 'warn')}<button class="btn ghost sm" data-act="saveVersion" data-kind="${esc(kind)}" data-scope="${esc(scope || '')}">Save a version for review</button><a class="small" data-act="versions" data-kind="${esc(kind)}">Versions</a></div>`;
}

async function viewReconList() {
  const list = await api('/api/reports/recon');
  return `<div class="head"><div><div class="eyebrow">Close & reports</div><h1>Bank reconciliations</h1></div></div>
  <div class="card">${table(['Account', 'Period', '#Statement closing', '#Unexplained', 'Status', 'Workpaper'], list.map(r => `<tr class="click" data-act="go" data-href="#/reports/recon/${esc(r.id)}"><td>${esc(r.bank_name)}</td><td class="small">${esc(r.period_start)} → ${esc(r.period_end)}</td>
    <td class="num">${money(r.closing_cents)}</td><td class="num">${money(r.unexplained_difference_cents)}</td><td>${r.reconciled ? pill('reconciled', 'good') : pill('not reconciled', 'bad')}</td><td>${statusPill(r.workpaper_status)}</td></tr>`))}</div>`;
}

async function viewRecon(id) {
  const r = await api(`/api/reports/recon/${id}`);
  const expl = i => i.explanation ? `<div class="small">${pill(i.explanation.treatment.replace(/_/g, ' '), 'info')} ${esc(i.explanation.explanation)} <span class="muted">— ${esc(userName(i.explanation.explained_by))}</span></div>` : '';
  const itemRow = (i, side) => `<tr class="${i.explanation ? '' : 'flag'}"><td class="num small">${esc(i.date)}</td><td>${esc(i.description || i.memo || '')}${i.ref ? ` <span class="muted small">#${esc(i.ref)}</span>` : ''}<div class="cite">${srcLink(i.source)}</div>${expl(i)}</td><td class="num">${money(i.amount_cents)}</td>
    <td>${can('recon.prepare') && r.workpaper?.status !== 'reviewed' ? `<button class="btn sm ghost" data-act="explain" data-st="${esc(id)}" data-key="${esc(i.item_key)}" data-side="${side}">${i.explanation ? 'Edit' : 'Explain'}</button>` : ''}</td></tr>`;
  const w = r.workpaper;
  return `<div class="head"><div><div class="eyebrow"><a href="#/reports/recon">Reconciliations</a></div><h1>${esc(r.bank_account.name)} · ${esc(r.period.start)} to ${esc(r.period.end)}</h1></div>
    <div class="row">${r.reconciled ? pill('reconciled', 'good') : pill('not reconciled', 'bad')}${statusPill(w?.status || 'draft')}</div></div>
  <div class="card"><h3>The equation</h3><div class="eq">
    Statement closing balance <b>${moneyText(r.statement.closing_cents)}</b><br>
    + deposits in transit <b>${moneyText(r.deposits_in_transit_cents)}</b> &nbsp; + outstanding checks <b>${moneyText(r.outstanding_checks_cents)}</b><br>
    = adjusted bank <b>${moneyText(r.adjusted_bank_cents)}</b><br><br>
    Book (ledger) balance <b>${moneyText(r.ledger_balance_cents)}</b><br>
    + bank items not yet in the books <b>${moneyText(r.bank_only_total_cents)}</b><br>
    = adjusted book <b>${moneyText(r.adjusted_book_cents)}</b><br><br>
    Unexplained difference <b class="${r.unexplained_difference_cents ? 'neg' : ''}">${moneyText(r.unexplained_difference_cents)}</b></div>
    <p class="small muted">Statement check: opening ${moneyText(r.statement.opening_cents)} + lines ${moneyText(r.statement.lines_total_cents)} ${r.statement.ties ? '= closing ✓' : '≠ closing — rows or pages may be missing'}.</p>
    ${r.reasons.length ? `<div class="feedback bad"><strong>Can't pass yet:</strong><ul style="margin:4px 0 0;padding-left:20px">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="row">${can('recon.prepare') ? `<button class="btn" data-act="prepRecon" data-id="${esc(id)}" ${r.reconciled ? '' : 'disabled'}>Mark prepared</button>` : ''}
      ${can('recon.review') && w?.status === 'prepared' ? `<button class="btn" data-act="reviewRecon" data-id="${esc(id)}">Review and approve</button>` : ''}
      ${w ? `<span class="muted small">Prepared by ${esc(userName(w.prepared_by))} ${esc((w.prepared_at || '').slice(0, 10))}${w.reviewed_by ? ` · reviewed by ${esc(userName(w.reviewed_by))} ${esc(w.reviewed_at.slice(0, 10))}` : ''}</span>` : ''}</div></div>
  <div class="grid two">
    <div class="card"><h3>In the bank, not in the books (${r.bank_only.length})</h3><p class="muted small">Each needs an explanation and a ledger entry in QuickBooks, then re-import.</p>${table(['Date', 'Item', '#Amount', ''], r.bank_only.map(i => itemRow(i, 'bank')))}</div>
    <div class="card"><h3>In the books, not yet cleared (${r.outstanding.length})</h3><p class="muted small">Outstanding checks and deposits in transit. Explain each one.</p>${table(['Date', 'Item', '#Amount', ''], r.outstanding.map(i => itemRow(i, 'ledger')))}</div></div>
  <div class="card"><details><summary>Matched items (${r.matched.length}) — how each was matched</summary>${table(['Bank date', 'Book date', '#Amount', 'Rule', 'Sources'], r.matched.map(m => `<tr><td class="num small">${esc(m.bank_date)}</td><td class="num small">${esc(m.ledger_date)}</td><td class="num">${money(m.amount_cents)}</td><td class="small">${esc(m.rule)}</td><td class="cite">${srcLink(m.bank.source, 'statement line ' + m.bank.source_row)} · ${srcLink(m.ledger.source, 'ledger line ' + m.ledger.source_row)}</td></tr>`))}</details></div>`;
}

async function viewProject(id) {
  const r = await api(`/api/reports/project/${id}`);
  const p = r.project;
  const b = r.bridge;
  return `<div class="head"><div><div class="eyebrow">Project · ${esc(p.id)} · owned by ${esc(entName(p.entity_id))}</div><h1>${esc(p.name)} — ${esc(p.address || '')}</h1></div>
    <div class="row"><select id="projPick" data-act-change="projGo">${S.boot.projects.map(x => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(x.id)} ${esc(x.name)}</option>`).join('')}</select></div></div>
  ${versionBar('project', id)}
  <div class="grid">
    <div class="card tight kpi"><span class="l">Budget</span><span class="v">${money(r.totals.budget_cents)}</span></div>
    <div class="card tight kpi"><span class="l">Actual to date</span><span class="v">${money(r.totals.actual_to_date_cents)}</span></div>
    <div class="card tight kpi"><span class="l">Projected total</span><span class="v">${money(r.totals.projected_total_cents)}</span></div>
    <div class="card tight kpi"><span class="l">Projected profit ${pill(b.proceeds_basis, b.proceeds_basis === 'actual' ? 'good' : 'est')}</span><span class="v">${money(b.profit_projected_cents)}</span></div></div>
  <div class="card"><h3>Budget vs actual</h3><p class="muted small">Actual paid + incurred unpaid + committed (signed, not billed) + forecast remaining (estimate) = projected. Rows under review are counted and shown.</p>
    ${table(['Category', '#Budget', '#Actual paid', '#Incurred unpaid', '#Committed', '#Forecast (est.)', '#Projected', '#Variance', '#Under review'], [...r.rows.map(x => `<tr><td>${esc(x.category)}</td><td class="num">${money(x.budget_cents)}</td><td class="num">${money(x.actual_paid_cents)}</td><td class="num">${money(x.incurred_unpaid_cents)}</td><td class="num">${money(x.committed_cents)}</td><td class="num">${money(x.forecast_remaining_cents)}</td><td class="num">${money(x.projected_total_cents)}</td><td class="num">${money(x.variance_cents)}</td><td class="num">${x.flagged_cents ? money(x.flagged_cents) : ''}</td></tr>`),
      `<tr class="total"><td>Total</td><td class="num">${money(r.totals.budget_cents)}</td><td class="num">${money(r.totals.actual_paid_cents)}</td><td class="num">${money(r.totals.incurred_unpaid_cents)}</td><td class="num">${money(r.totals.committed_cents)}</td><td class="num">${money(r.totals.forecast_remaining_cents)}</td><td class="num">${money(r.totals.projected_total_cents)}</td><td class="num">${money(r.totals.variance_cents)}</td><td class="num">${money(r.totals.flagged_cents)}</td></tr>`])}
    <p class="small">${r.tie_out.ties ? pill('ties', 'good') : pill('does not tie', 'bad')} Category actuals ${moneyText(r.tie_out.category_actuals_cents)} = sum of ${r.lines.length} transaction lines ${moneyText(r.tie_out.lines_total_cents)}.</p></div>
  <div class="grid two"><div class="card"><h3>Profit bridge</h3><div class="eq">${esc(b.proceeds_note)}: <b>${moneyText(b.proceeds_cents)}</b><br>${b.costs.map(c => `− ${esc(c.category)} <b>${moneyText(c.projected_total_cents)}</b>`).join('<br>')}<br>= projected profit <b>${moneyText(b.profit_projected_cents)}</b><br>Actual-to-date view: proceeds − actual costs so far = ${moneyText(b.profit_actual_to_date_cents)}<br>If items under review are removed: ${moneyText(b.profit_projected_excluding_flagged_cents)}</div><p class="small muted">${esc(b.formula)}</p></div>
    ${r.sensitivity ? `<div class="card"><h3>Sale price sensitivity</h3>${table(['Case', '#Sale price', '#Total cost', '#Profit'], r.sensitivity.map(s => `<tr><td>${esc(s.label)}</td><td class="num">${money(s.sale_price_cents)}</td><td class="num">${money(s.total_cost_cents)}</td><td class="num">${money(s.profit_cents)}</td></tr>`))}<p class="small muted">Commission and seller closing costs scale with price at the forecast rates. Other costs stay fixed.</p></div>` : ''}</div>
  <div class="card"><h3>Commitments and forecast assumptions</h3>${table(['Type', 'Category', 'Detail', '#Amount'], [...r.commitments.map(c => `<tr><td>${pill('committed', 'info')}</td><td>${esc(c.category)}</td><td>${esc(c.vendor_name || '')} ${esc(c.description || '')}</td><td class="num">${money(c.amount_cents - c.billed_cents)}</td></tr>`), ...r.forecasts.map(f => `<tr><td>${pill('estimate', 'est')}</td><td>${esc(f.category)}</td><td>${esc(f.assumption)}</td><td class="num">${money(f.amount_cents)}</td></tr>`)])}</div>
  <div class="card"><h3>Transaction detail (${r.lines.length})</h3>${table(['Date', 'Category', 'Vendor / memo', 'Booked in', 'Status', '#Amount', 'Source'], r.lines.map(l => `<tr class="${l.flags.length ? 'flag' : ''}"><td class="num small">${esc(l.date)}</td><td>${esc(l.category)}</td><td>${esc(l.vendor || '')} ${esc(l.invoice_no || '')}<br><span class="muted small">${esc(l.memo || '')}</span>${l.flags.map(f => `<div>${srcLink({ kind: 'issue', id: f.issue_id }, '⚑ ' + f.type.replace(/_/g, ' '))}</div>`).join('')}</td><td class="small">${esc(l.entity_id)}</td><td>${pill(l.status.replace('_', ' '), l.status === 'actual_paid' ? 'good' : 'warn')}</td><td class="num">${money(l.amount_cents)}</td><td class="cite">${srcLink({ kind: 'txn', document_id: l.source.document_id, row: l.source.row, filename: l.source.filename })}</td></tr>`))}</div>`;
}

async function viewAging(kind) {
  const r = await api(`/api/reports/aging/${kind}`);
  return `<div class="head"><div><div class="eyebrow">Close & reports</div><h1>${kind === 'ap' ? 'A/P aging (what we owe)' : 'A/R aging (what we’re owed)'}</h1></div>
    <div class="row"><a class="btn ${kind === 'ap' ? '' : 'ghost'}" href="#/reports/aging/ap">A/P</a><a class="btn ${kind === 'ar' ? '' : 'ghost'}" href="#/reports/aging/ar">A/R</a></div></div>
  ${versionBar(kind + '_aging', '')}
  <div class="card"><p class="muted small">As of ${esc(r.as_of)}. Days past due are counted from the due date. All entities are listed separately by row.</p>
    ${table(r.buckets.map(b => '#' + b.label).concat(['#Total']), [`<tr class="total">${r.buckets.map(b => `<td class="num">${money(r.totals[b.key])}</td>`).join('')}<td class="num">${money(r.totals.total)}</td></tr>`])}</div>
  <div class="card">${table(['Entity', kind === 'ap' ? 'Vendor' : 'Customer', 'Invoice', 'Due', '#Days past due', '#Amount', 'Source'], r.rows.map(x => `<tr><td class="small">${esc(x.entity_id)}</td><td>${esc(x.name)}</td><td>${esc(x.invoice_no || '')}</td><td class="num small">${esc(x.due_date)}</td><td class="num">${x.days_past_due > 0 ? esc(x.days_past_due) : 'current'}</td><td class="num">${money(x.amount_cents)}</td><td class="cite">${srcLink(x.source)}</td></tr>`))}</div>`;
}

async function viewForecast(entity) {
  const f = await api(`/api/reports/forecast/${entity}`);
  return `<div class="head"><div><div class="eyebrow">Close & reports</div><h1>13-week cash forecast</h1></div>
    <select id="fcPick" data-act-change="fcGo">${S.boot.entities.map(e => `<option value="${esc(e.id)}" ${e.id === entity ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
  ${versionBar('forecast', entity)}
  <div class="grid"><div class="card tight kpi"><span class="l">Starting book cash ${f.start.reconciled ? pill('reconciled', 'good') : pill('not reconciled', 'warn')}</span><span class="v">${money(f.start.amount_cents)}</span></div>
    <div class="card tight kpi"><span class="l">Lowest week (week ${f.minimum.week}, ${esc(f.minimum.week_start)})</span><span class="v">${money(f.minimum.closing_cents)}</span></div>
    <div class="card tight kpi"><span class="l">Share of dollars that are estimates</span><span class="v">${Math.round(f.estimate_share * 100)}%</span></div></div>
  <div class="card"><p class="muted small">${esc(f.formula)}. Company cash is not profit and not all of it is available to spend.</p>
    ${table(['Week', 'Starts', '#Opening', '#In', '#Out', '#Closing'], f.weeks.map(w => `<tr class="${w.closing_cents < 0 ? 'err' : ''}"><td class="num">${w.index}</td><td class="num small">${esc(w.start)}</td><td class="num">${money(w.opening_cents)}</td><td class="num">${money(w.inflows_cents)}</td><td class="num">${money(w.outflows_cents)}</td><td class="num"><strong>${money(w.closing_cents)}</strong></td></tr>`))}</div>
  <div class="card"><h3>Every line and its assumption</h3>${table(['Week', 'Date', 'Line', 'Basis', 'Assumption / source', '#Amount'], f.weeks.flatMap(w => w.lines.map(l => `<tr><td class="num">${w.index}</td><td class="num small">${esc(l.date)}</td><td>${esc(l.label)}</td><td>${pill(l.basis, l.basis === 'known' ? 'good' : 'est')}</td><td class="small">${esc(l.assumption || '')} <span class="cite">${l.source?.kind ? srcLink(l.source) : ''}</span></td><td class="num">${money(l.amount_cents)}</td></tr>`)))}</div>
  ${f.excluded.length ? `<div class="card"><h3>Left out, and why</h3>${table(['Item', 'Reason', '#Amount'], f.excluded.map(x => `<tr><td>${esc(x.label || x.customer || x.vendor || '')} ${esc(x.invoice_no || '')}</td><td class="small">${esc(x.reason)}</td><td class="num">${money(x.amount_cents)}</td></tr>`))}</div>` : ''}`;
}

async function viewDraws() {
  const r = await api('/api/reports/draws');
  return `<div class="head"><div><div class="eyebrow">Close & reports</div><h1>Debt and lender draws</h1></div></div>${versionBar('draws', '')}
  ${r.loans.map(L => `<div class="card"><div class="row between"><h2>${esc(L.loan.lender)} · ${esc(L.loan.project_id || '')}</h2>${L.difference_cents ? pill('does not tie', 'bad') : pill('ties to lender', 'good')}</div>
    <div class="grid"><div class="kpi"><span class="l">Book balance</span><span class="v">${money(L.book_balance_cents)}</span></div><div class="kpi"><span class="l">Lender statement ${esc(L.loan.lender_statement_date || '')}</span><span class="v">${money(L.lender_balance_cents)}</span></div>
      <div class="kpi"><span class="l">Difference</span><span class="v">${money(L.difference_cents)}</span></div><div class="kpi"><span class="l">Left to draw on commitment</span><span class="v">${money(L.available_to_draw_cents)}</span></div></div>
    <p class="small muted">${esc(L.formula)}</p>
    ${table(['#', 'Submitted', '#Submitted', '#Approved', '#Holdback', '#Funded', 'Funded / expected', 'In books', 'Questions'], L.draws.map(d => `<tr class="${d.issues.length ? 'flag' : ''}"><td class="num">${d.number}</td><td class="num small">${esc(d.submitted_date || '—')}</td><td class="num">${money(d.submitted_cents)}</td><td class="num">${money(d.approved_cents)}</td><td class="num">${money(d.holdback_cents)}</td><td class="num">${money(d.funded_cents)}</td>
      <td class="num small">${esc(d.funded_date || '—')} / ${esc(d.expected_date || '—')}</td><td>${statusPill(d.status)}${d.recorded_txn ? `<div class="cite">${srcLink(d.recorded_txn.source)}</div>` : ''}</td><td class="small">${d.issues.map(esc).join('<br>')}</td></tr>`))}</div>`).join('')}`;
}

async function viewIntercompany() {
  const r = await api('/api/reports/intercompany');
  return `<div class="head"><div><div class="eyebrow">Close & reports</div><h1>Intercompany rollforward</h1></div></div>${versionBar('intercompany', '')}
  <p class="muted" style="max-width:72ch">For each pair of entities, what A says B owes it must be the exact opposite of what B says A owes it.</p>
  ${r.pairs.map(p => `<div class="card"><div class="row between"><h2>${esc(entName(p.entity_a))} ↔ ${esc(entName(p.entity_b))}</h2>${p.matches ? pill('matches', 'good') : pill(`off by ${moneyText(Math.abs(p.difference_cents))}`, 'bad')}</div>
    <div class="eq">${esc(p.entity_a)} net receivable from ${esc(p.entity_b)}: <b>${moneyText(p.a_net_receivable_cents)}</b><br>${esc(p.entity_b)} net receivable from ${esc(p.entity_a)}: <b>${moneyText(p.b_net_receivable_cents)}</b><br>Sum (must be $0.00): <b class="${p.difference_cents ? 'neg' : ''}">${moneyText(p.difference_cents)}</b></div>
    ${table(['Entity', 'Date', 'Memo', 'Account', '#Effect', 'Source'], [...p.a_lines, ...p.b_lines].map(t => `<tr><td class="small">${esc(t.entity_id)}</td><td class="num small">${esc(t.date)}</td><td>${esc(t.memo || '')}</td><td class="small">${esc(t.account_number)} ${esc(t.account_name)}</td><td class="num">${money(t.net_cents)}</td><td class="cite">${srcLink(t.source)}</td></tr>`))}</div>`).join('') || '<div class="card"><p class="muted">No intercompany activity.</p></div>'}`;
}

// ---------------- approvals ----------------
async function viewApprovals() {
  const [pays, jes, apprs] = await Promise.all([api('/api/payments'), api('/api/journals'), api('/api/approvals')]);
  const vendors = S.boot.vendors.filter(v => v.bank_changed_at);
  return `<div class="head"><div><div class="eyebrow">Controls</div><h1>Approvals</h1></div></div>
  <p class="muted" style="max-width:72ch">This app records approvals; it never moves money or posts to QuickBooks. Nobody approves what they requested or prepared, and a learner can't approve anything. The AI has no way to approve.</p>
  <div class="card"><h2>Payment requests</h2>${table(['Vendor', 'Bill', '#Amount', 'Requested', 'Status', ''], pays.map(p => `<tr><td>${esc(p.vendor_name)}${p.bank_changed_at && !p.bank_change_verified_by ? `<div>${pill('bank details changed ' + p.bank_changed_at.slice(0, 10), 'bad')}</div>` : ''}</td><td class="small">${esc(p.invoice_no)} due ${esc(p.due_date)}</td><td class="num">${money(p.amount_cents)}</td>
    <td class="small">${esc(userName(p.requested_by))}<br>${esc(p.requested_at.slice(0, 10))}</td><td>${statusPill(p.status)}</td><td>${p.status === 'requested' && can('payment.approve') ? `<button class="btn sm" data-act="payDecide" data-id="${esc(p.id)}" data-d="approved">Approve</button> <button class="btn sm ghost" data-act="payDecide" data-id="${esc(p.id)}" data-d="rejected">Reject</button>` : ''}</td></tr>`))}</div>
  <div class="card"><h2>Vendor bank-detail changes</h2>${table(['Vendor', 'Changed', 'Verified', ''], vendors.map(v => `<tr><td>${esc(v.name)}</td><td class="small">${esc(v.bank_changed_at.slice(0, 10))}</td><td>${v.bank_change_verified_by ? `${pill('verified', 'good')} ${esc(userName(v.bank_change_verified_by))}` : pill('not verified', 'bad')}</td><td>${!v.bank_change_verified_by && can('vendor.verify_bank') ? `<button class="btn sm" data-act="verifyBank" data-id="${esc(v.id)}">Record call-back verification</button>` : ''}</td></tr>`))}</div>
  <div class="card"><div class="row between"><h2>Journal entry proposals</h2>${can('journal.propose') ? '<button class="btn ghost sm" data-act="newJE">Propose an entry</button>' : ''}</div><p class="muted small">Approved entries still have to be entered in QuickBooks Online by an authorized person.</p>
    ${table(['Entity', 'Date', 'Memo', 'Lines', '#Amount', 'Prepared', 'Status', ''], jes.map(j => `<tr><td class="small">${esc(j.entity_id)}</td><td class="num small">${esc(j.date)}</td><td>${esc(j.memo)}<div class="cite">Source: ${esc(j.source_ref)}</div></td><td class="small">${j.lines.map(l => `${esc(l.account_id)} ${l.debit_cents ? 'Dr ' + moneyText(l.debit_cents) : 'Cr ' + moneyText(l.credit_cents)}`).join('<br>')}</td><td class="num">${money(j.amount_cents)}</td><td class="small">${esc(userName(j.prepared_by))}</td><td>${statusPill(j.status)}</td>
      <td>${j.status === 'proposed' && can('journal.approve') ? `<button class="btn sm" data-act="jeDecide" data-id="${esc(j.id)}" data-d="approved">Approve</button> <button class="btn sm ghost" data-act="jeDecide" data-id="${esc(j.id)}" data-d="rejected">Reject</button>` : ''}</td></tr>`))}</div>
  <div class="card"><h2>Approval log</h2>${table(['When', 'What', 'Requested by', 'Decided by', 'Decision', 'Note'], apprs.map(a => `<tr><td class="small num">${esc(a.decided_at.slice(0, 16).replace('T', ' '))}</td><td class="small">${esc(a.object_type)} ${esc(a.object_id)}</td><td class="small">${esc(userName(a.requested_by))}</td><td class="small">${esc(userName(a.approver_id))}</td><td>${statusPill(a.decision)}</td><td class="small">${esc(a.note || '')}</td></tr>`))}</div>`;
}

// ---------------- brief ----------------
async function viewBrief() {
  const b = await api('/api/brief');
  const cite = c => c.map(x => `<span>${esc(x.report)}${x.period ? `, ${esc(x.period)}` : ''}${x.filename ? `, ${esc(x.filename)}` : ''}${x.retrieved_at ? `, pulled ${esc(String(x.retrieved_at).slice(0, 10))}` : ''}</span>`).join('; ');
  const item = i => `<div class="row between" style="align-items:flex-start;border-top:1px solid var(--line);padding-top:8px"><div class="stack" style="gap:2px;flex:1;min-width:220px">
      <span>${i.link ? `<a href="${esc(i.link)}">${esc(i.label)}</a>` : esc(i.label)} ${i.basis === 'estimate' ? pill('estimate', 'est') : i.basis === 'unknown' ? pill('unknown', 'bad') : ''}</span>
      ${i.text ? `<span class="small">${esc(i.text)}</span>` : ''}${i.warnings.length ? `<span class="small">${i.warnings.map(w => pill(w, 'warn')).join(' ')}</span>` : ''}<span class="cite">Source: ${cite(i.citations) || '<em>none</em>'}</span></div>
      <div>${i.value_cents !== null ? money(i.value_cents) : ''}</div></div>`;
  return `<div class="head"><div><div class="eyebrow">For Juan · as of ${esc(b.as_of)}</div><h1>Weekly brief</h1></div>
    <div class="row">${b.status === 'reviewed' ? pill('reviewed', 'good') : pill('draft — not reviewed', 'warn')}${b.completeness.complete ? pill('complete', 'good') : pill('incomplete data', 'warn')}</div></div>
  <p class="muted small">Generated ${esc(b.generated_at.slice(0, 16).replace('T', ' '))} UTC${b.last_reviewed ? ` · last reviewed ${esc(b.last_reviewed.reviewed_at.slice(0, 10))} by ${esc(b.last_reviewed.reviewed_by)}` : ' · never reviewed'}${b.newer_draft_available ? ' · a newer draft exists' : ''}. Every number shows its source. If there is no source, it says unknown.</p>
  <div class="row">${can('data.view') && !S.me.roles.includes('executive') ? '<button class="btn ghost sm" data-act="saveVersion" data-kind="brief">Save this version for review</button>' : ''}
    ${can('report.review') && b.latest_version && b.latest_version.status === 'draft' ? `<button class="btn sm" data-act="reviewVersion" data-id="${esc(b.latest_version.id)}">Mark saved version reviewed</button>` : ''}
    <button class="btn ghost sm" data-act="aiDraft">Draft the narrative</button></div>
  <div class="card"><h2>Top 3 issues</h2><div class="grid">${b.top_issues.map(i => `<a class="card tight" href="${esc(i.link)}" style="text-decoration:none;color:inherit"><div class="row between">${pill(i.severity, i.severity)}${money(i.amount_cents)}</div><strong>${esc(i.title)}</strong>
    <span class="small">Owner: ${esc(i.owner)} · due ${esc(i.due_date || '—')}</span><span class="small"><strong>Action:</strong> ${esc(i.action)}</span><span class="cite">Evidence: ${i.evidence.map(e => esc(e.label)).join('; ')}</span></a>`).join('')}</div></div>
  <div class="card"><h2>Decisions needed</h2><ol class="stack" style="margin:0;padding-left:20px">${b.decisions.map(d => `<li><a href="${esc(d.link)}">${esc(d.question)}</a></li>`).join('') || '<li class="muted">None.</li>'}</ol></div>
  <div class="grid two">${b.sections.map(s => `<div class="card"><h3>${esc(s.question)}</h3>${s.items.map(item).join('') || '<p class="muted">Nothing to report.</p>'}</div>`).join('')}</div>
  <div class="card"><h3>Data completeness</h3>${table(['Entity', 'Last pulled', '#Age (days)', 'Bank reconciled', 'Imports ready'], b.completeness.entities.map(f => `<tr><td>${esc(f.entity_name)}</td><td class="small">${esc((f.last_retrieved_at || 'never').slice(0, 10))}</td><td class="num">${f.age_days ?? '—'}</td><td>${f.unreconciled_bank_accounts.length ? pill('no', 'warn') : pill('yes', 'good')}</td><td>${f.batches_not_ready.length ? pill('open questions', 'warn') : pill('yes', 'good')}</td></tr>`))}</div>`;
}

// ---------------- coach & scorecard ----------------
const PROMPTS = [
  ['Classify', 'Here is a redacted invoice and our approved chart of accounts. Which entity, project, and account are plausible? Show the evidence and what is missing. Do not post anything.'],
  ['Reconcile', 'Compare this ledger export to this bank statement. Calculate the difference, list unmatched items by source row, and propose investigation steps. Do not mark reconciled.'],
  ['Review a property', 'Using the attached budget and transaction detail, calculate actual costs, committed costs, forecast to complete, and profit sensitivity at three sale prices. Show formulas and source IDs. Flag uncoded or duplicate costs.'],
  ["Prepare Juan's brief", 'Draft one page from these reviewed reports only. Separate facts, estimates, risks, and decisions. For every number cite report name, period, and line. If a source is missing, say so.'],
  ['Challenge the analysis', 'Act as a skeptical controller reviewer. Find unsupported claims, mismatched dates, wrong entities, double counts, and assumptions disguised as facts. Give a correction checklist.'],
  ['Teach me', 'Act as my patient accounting coach. Give me one scenario from today’s exceptions, with private amounts redacted if possible. Ask me what entity, project, account, evidence and approval apply. Wait for my answer. Score my reasoning, explain the concept, identify what I missed, and give me a slightly harder follow-up.'],
];
async function viewCoach() {
  const learner = S.me.roles.includes('learner') ? S.me.user : S.boot.users.find(u => u.roles.includes('learner'));
  const [sc, wr] = await Promise.all([api(`/api/scorecard/${learner.id}`), api('/api/weekly-report')]);
  const calib = Object.entries(sc.calibration).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.attempts}</td><td class="num">${v.max ? Math.round(v.score / v.max * 100) : 0}%</td></tr>`);
  return `<div class="head"><div><div class="eyebrow">Section 5</div><h1>Coach & scorecard · ${esc(learner.name)}</h1></div></div>
  <div class="card"><h2>Weekly progress report for Juan</h2><div class="grid">
    <div class="kpi"><span class="l">Modules passed</span><span class="v">${wr.skills_passed.length} / ${sc.modules.length}</span></div>
    <div class="kpi"><span class="l">Exceptions resolved this week</span><span class="v">${wr.work.resolved_this_week}</span></div>
    <div class="kpi"><span class="l">Open / overdue</span><span class="v">${wr.work.open} / ${wr.work.overdue.length}</span></div>
    <div class="kpi"><span class="l">Setup answers missing</span><span class="v">${wr.unresolved_setup.length}</span></div></div>
    <p class="small"><strong>Recurring errors:</strong> ${wr.recurring_errors.length ? wr.recurring_errors.map(([m, n]) => `${esc(S.boot.lessons.find(l => l.id === m)?.title || m)} (${n})`).join(', ') : 'none logged yet'}.
    <strong>Unresolved data access:</strong> ${wr.unresolved_setup.map(esc).join(', ') || 'none'}.</p></div>
  <div class="card"><h2>Promotion gates</h2><p class="muted small">The title follows demonstrated performance, not elapsed time.</p>${table(['Gate', 'What must be shown', 'Evidence', 'Status'], sc.gates.map(g => `<tr><td class="num">${g.n}</td><td>${esc(g.title)}</td><td class="small">${esc(g.evidence)}</td><td>${g.met ? pill('met', 'good') : pill('not yet', 'warn')}</td></tr>`))}</div>
  <div class="card"><h2>Skills matrix</h2>${table(['Module', 'Skills', 'Practice', '#Quiz best', 'Task', 'Sign-off', 'Status'], sc.modules.map(m => `<tr class="click" data-act="go" data-href="#/learn/${esc(m.id)}"><td><strong>${esc(m.title)}</strong><br><span class="muted small">${esc(m.weeks)}</span></td><td class="small">${m.skills.map(esc).join(', ')}</td><td>${m.scenario_solved ? '✓' : '—'}</td><td class="num">${m.quiz_best ?? '—'}${m.quiz_max ? '/' + m.quiz_max : ''}</td><td>${m.task ? '✓' : '—'}</td><td>${m.signoff ? (m.signoff.passed ? '✓ ' + esc(m.signoff.reviewer_name) : '✗ retry') : '—'}</td><td>${statusPill(m.status)}</td></tr>`))}</div>
  <div class="grid two"><div class="card"><h2>Work quality</h2>${table(['Measure', '#Count'], [['Exceptions resolved with evidence', sc.work.issues_resolved], ['Open exceptions assigned', sc.work.issues_open_assigned], ['Reconciliations prepared', sc.work.recons_prepared], ['Reconciliations approved by reviewer', sc.work.recons_reviewed_ok], ['Closes signed off (as preparer)', sc.work.closes_prepared_signed]].map(([a, b]) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`))}</div>
    <div class="card"><h2>Confidence vs accuracy</h2><p class="muted small">Being very sure and wrong is the pattern to watch.</p>${table(['Confidence', '#Attempts', '#Accuracy'], calib)}</div></div>
  <div class="card"><div class="row between"><h2>Mistake log and corrected procedures</h2><button class="btn ghost sm" data-act="addMistake" data-user="${esc(learner.id)}">Log a mistake</button></div>
    ${table(['When', 'Module', 'What happened', 'Corrected procedure'], sc.mistakes.slice(0, 40).map(m => `<tr><td class="small num">${esc(m.created_at.slice(0, 10))}</td><td class="small">${esc(m.module_id || '')}</td><td class="small">${esc(m.description)}</td><td class="small">${esc(m.corrected_procedure || '')}</td></tr>`))}</div>
  <div class="card"><h2>Coaching prompts</h2><p class="muted small">Use these in an approved AI tool only. Each one inherits the standing rule: cite every number, calculate with formulas, separate fact from estimate, and never post, approve, change vendors or certify a close.</p>
    <div class="grid">${PROMPTS.map(([t, p], i) => `<div class="card tight"><strong>${esc(t)}</strong><p class="small" id="prompt-${i}">${esc(p)}</p><div><button class="btn ghost sm" data-act="copy" data-target="prompt-${i}">Copy</button></div></div>`).join('')}</div></div>`;
}

// ---------------- admin ----------------
async function viewAdmin() {
  const isAdmin = can('settings.manage');
  const [policies, connectors, auditLog, settings, users] = await Promise.all([
    api('/api/policies'), api('/api/connectors'), can('audit.view') ? api('/api/audit?limit=150') : Promise.resolve([]),
    isAdmin ? api('/api/admin/settings') : Promise.resolve(null), isAdmin ? api('/api/admin/users') : Promise.resolve([]),
  ]);
  return `<div class="head"><div><div class="eyebrow">Settings</div><h1>Admin</h1></div></div>
  ${isAdmin ? `<div class="card"><h2>AI and thresholds</h2>
    <p class="small">Provider now: <strong>${esc(settings.ai_status.provider === 'claude' ? 'Claude ' + settings.ai_status.model : 'rules-based (no model)')}</strong> · admin approved: ${settings.ai_status.approved_by_admin ? 'yes' : 'no'} · API key in environment: ${settings.ai_status.api_key_present ? 'yes' : 'no'}</p>
    <p class="muted small">${esc(settings.ai_status.note)} Approve only after checking the provider's business data terms. The key goes in the ANTHROPIC_API_KEY environment variable, never in code.</p>
    <form class="stack" data-form="settings"><div class="form">
      <label class="f">As-of date<input type="date" name="as_of_date" id="set-asof" value="${esc(settings.as_of_date || '')}"></label>
      <label class="f">Receipt required over ($)<input type="text" name="receipt" id="set-rcpt" value="${settings.receipt_required_over_cents / 100}"></label>
      <label class="f">Bill approval required over ($)<input type="text" name="approval" id="set-appr" value="${settings.approval_required_over_cents / 100}"></label>
      <label class="f">Data is stale after (days)<input type="number" name="stale_after_days" id="set-stale" value="${esc(settings.stale_after_days)}"></label>
      <label class="f">Collection lag (days)<input type="number" name="collection_lag_days" id="set-lag" value="${esc(settings.collection_lag_days)}"></label>
      <label class="row"><input type="checkbox" name="ai_approved" id="set-ai" ${settings.ai?.approved ? 'checked' : ''}> AI provider approved for minimized evidence</label></div>
      <div><button class="btn">Save settings</button> <a class="btn ghost" data-act="backup">Download a backup</a></div></form></div>
  <div class="card"><h2>Users and roles</h2><p class="muted small">Roles: learner, preparer, reviewer, executive, admin. A learner can't approve anything, whatever other roles she holds.</p>
    ${table(['ID', 'Name', 'Roles', ''], users.map(u => `<tr><td class="num">${esc(u.id)}</td><td>${esc(u.name)}</td><td><input type="text" id="roles-${esc(u.id)}" value="${esc(u.roles)}"></td><td><button class="btn sm ghost" data-act="saveUser" data-id="${esc(u.id)}" data-name="${esc(u.name)}">Save</button></td></tr>`))}</div>` : ''}
  <div class="card"><h2>Policy register</h2><p class="muted small">Decisions from the CPA or reviewer. Pending items are questions to settle before live data.</p>
    ${table(['ID', 'Policy', 'Question / decision', 'Status', ''], policies.map(p => `<tr><td class="num">${esc(p.id)}</td><td>${esc(p.title)}</td><td class="small">${esc(p.question)}${p.decision ? `<div><strong>Decision:</strong> ${esc(p.decision)} <span class="muted">— ${esc(userName(p.decided_by))}</span></div>` : ''}</td><td>${statusPill(p.status === 'decided' ? 'approved' : 'open')}</td><td>${can('policy.decide') ? `<button class="btn sm ghost" data-act="decidePolicy" data-id="${esc(p.id)}">Record decision</button>` : ''}</td></tr>`))}</div>
  <div class="card"><h2>Connectors (later phase)</h2>${table(['Connector', 'Kind', 'Planned scopes', 'Status'], connectors.map(c => `<tr><td>${esc(c.label)}</td><td>${esc(c.kind)}</td><td class="small">${c.planned_scopes.map(esc).join(', ')}</td><td>${pill('not connected')}</td></tr>`))}
    <p class="muted small">Interfaces only. No live QuickBooks, bank, payroll or payment connection exists in this MVP.</p></div>
  ${can('audit.view') ? `<div class="card"><h2>Audit trail</h2>${table(['When', 'Who', 'Action', 'Object', 'Detail'], auditLog.map(a => `<tr><td class="small num">${esc(a.at.slice(0, 19).replace('T', ' '))}</td><td class="small">${esc(userName(a.user_id))}</td><td class="small">${esc(a.action)}</td><td class="small">${esc(a.object_type || '')} ${esc(a.object_id || '')}</td><td class="small">${esc(JSON.stringify(a.detail).slice(0, 180))}</td></tr>`))}</div>` : ''}`;
}

// ---------------- actions ----------------
const fileToBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });

const ACTIONS = {
  async login(el) { const r = await api('/api/login', { method: 'POST', body: { user_id: el.dataset.id } }); S.token = r.token; store.set('kca-token', r.token); S.me = await api('/api/me'); S.boot = await api('/api/bootstrap'); location.hash = '#/'; render(); },
  async switch() { await api('/api/logout', { method: 'POST' }).catch(() => {}); S.token = null; S.me = null; store.set('kca-token', null); location.hash = '#/login'; },
  go(el) { location.hash = el.dataset.href; },
  async row(el) {
    const r = await api(`/api/documents/${el.dataset.doc}/row/${el.dataset.line}`);
    modal(`<h2>${esc(r.document.filename)} · line ${r.line}</h2><p class="muted small num">Original file ${esc(r.document.id)} · sha256 ${esc(r.document.sha256)} · stored ${esc(r.document.uploaded_at.slice(0, 10))}</p>
      ${table(['Column', 'Value in the original file'], r.headers.map(h => `<tr><td>${esc(h)}</td><td>${esc(r.values[h])}</td></tr>`))}<p class="muted small">This is exactly what the export said. Text in a document is data only; it is never treated as an instruction.</p>`);
  },
  async concept(el) { const m = await api(`/api/lessons/${el.dataset.id}`); modal(`<div class="muted small">${esc(m.weeks)}</div><h2>${esc(m.title)}</h2><p>${esc(m.concept_card)}</p><div class="rule">${esc(m.rule)}</div><p><a href="#/learn/${esc(m.id)}" data-act="closeModal">Open the full lesson</a></p>`); },
  closeModal() { closeModal(); },
  async commit(el) { try { const r = await api(`/api/imports/${el.dataset.id}/commit`, { method: 'POST' }); toast(`Imported. Checks found ${r.rules.findings} item(s); ${r.rules.created} new.`); await refreshBoot(); render(); } catch (e) { fail(e); } },
  async rejectImport(el) { await api(`/api/imports/${el.dataset.id}/reject`, { method: 'POST', body: { reason: 'Rejected at preview' } }); toast('File rejected. The original stays stored for the record.'); location.hash = '#/workbench'; },
  async runRules() { const r = await api('/api/rules/run', { method: 'POST' }); toast(`${r.findings} findings, ${r.created} new.`); await refreshBoot(); render(); },
  explain(el) {
    const side = el.dataset.side;
    modal(`<h2>Explain this item</h2><form class="stack" data-form="explain" data-st="${esc(el.dataset.st)}" data-key="${esc(el.dataset.key)}">
      <label class="f">Treatment<select name="treatment" id="ex-treat">${side === 'ledger' ? '<option value="outstanding">Outstanding: will clear next period</option>' : ''}<option value="needs_entry">Needs a ledger entry in QuickBooks</option><option value="error_to_fix">Error to fix</option></select></label>
      <label class="f">Explanation<span class="hint">What it is and the evidence</span><textarea name="explanation" id="ex-text"></textarea></label><div><button class="btn">Save explanation</button></div></form>`);
  },
  async prepRecon(el) { try { await api(`/api/reports/recon/${el.dataset.id}/prepare`, { method: 'POST' }); toast('Marked prepared. A reviewer must approve it.'); render(); } catch (e) { fail(e); } },
  async reviewRecon(el) { try { await api(`/api/reports/recon/${el.dataset.id}/review`, { method: 'POST' }); toast('Reconciliation reviewed.'); render(); } catch (e) { fail(e); } },
  prepTask(el) { modal(`<h2>Prepare this step</h2><form class="stack" data-form="prepTask" data-id="${esc(el.dataset.id)}"><label class="f">Evidence<span class="hint">Workpaper, report, import ID or file that supports it</span><textarea name="evidence" id="task-ev"></textarea></label><div><button class="btn">Mark prepared</button></div></form>`); },
  reviewTask(el) { modal(`<h2>Review this step</h2><form class="stack" data-form="reviewTask" data-id="${esc(el.dataset.id)}"><label class="f">Review note<textarea name="note" id="rev-note"></textarea></label><div><button class="btn">Mark reviewed</button></div></form>`); },
  async signoffClose(el) { try { await api(`/api/close/${el.dataset.entity}/${el.dataset.period}/signoff`, { method: 'POST', body: { note: 'Reviewed checklist, workpapers and exceptions.' } }); toast('Close signed off. Now set the closing date in QuickBooks Online.'); render(); } catch (e) { fail(e); } },
  async payDecide(el) { try { await api(`/api/payments/${el.dataset.id}/decide`, { method: 'POST', body: { decision: el.dataset.d } }); toast(`Payment ${el.dataset.d}. Release it in the bank; this app doesn't move money.`); render(); } catch (e) { fail(e); } },
  verifyBank(el) { modal(`<h2>Record call-back verification</h2><form class="stack" data-form="verifyBank" data-id="${esc(el.dataset.id)}"><label class="f">Who you called, at which number already on file, and what they confirmed<textarea name="note" id="vb-note"></textarea></label><div><button class="btn">Record verification</button></div></form>`); },
  async jeDecide(el) { try { await api(`/api/journals/${el.dataset.id}/decide`, { method: 'POST', body: { decision: el.dataset.d } }); toast(`Journal entry ${el.dataset.d}. Enter it in QuickBooks Online.`); render(); } catch (e) { fail(e); } },
  newJE() {
    const accts = S.boot.accounts.filter(a => a.entity_id === 'ENT-THB');
    const opts = accts.map(a => `<option value="${esc(a.id)}">${esc(a.number)} ${esc(a.name)}</option>`).join('');
    modal(`<h2>Propose a journal entry (Twin Home Buyer)</h2><p class="muted small">A proposal only. A reviewer approves; an authorized person enters it in QuickBooks.</p><form class="stack" data-form="je">
      <div class="form"><label class="f">Date<input type="date" name="date" id="je-date" value="2026-09-30"></label><label class="f">Supporting source<input type="text" name="source_ref" id="je-src" placeholder="Issue ID or document"></label></div>
      <label class="f">Memo<input type="text" name="memo" id="je-memo"></label>
      <div class="form"><label class="f">Debit account<select name="dr" id="je-dr">${opts}</select></label><label class="f">Credit account<select name="cr" id="je-cr">${opts}</select></label><label class="f">Amount<input type="text" name="amount" id="je-amt" inputmode="decimal"></label></div>
      <div><button class="btn">Propose</button></div></form>`);
  },
  async saveVersion(el) { try { const v = await api('/api/reports/versions', { method: 'POST', body: { kind: el.dataset.kind, scope: el.dataset.scope || null } }); toast(`Saved version ${v.id} as draft. A reviewer can mark it reviewed.`); render(); } catch (e) { fail(e); } },
  async versions(el) {
    const vs = await api(`/api/reports/versions?kind=${encodeURIComponent(el.dataset.kind)}`);
    modal(`<h2>Saved versions</h2>${table(['Version', 'Scope', 'Saved', 'Status', ''], vs.map(v => `<tr><td class="num">${esc(v.id)}</td><td>${esc(v.scope || '')}</td><td class="small">${esc(v.created_at.slice(0, 16).replace('T', ' '))} · ${esc(userName(v.created_by))}</td><td>${statusPill(v.status)}${v.reviewed_by ? ` <span class="small">${esc(userName(v.reviewed_by))}</span>` : ''}</td><td>${v.status === 'draft' && can('report.review') ? `<button class="btn sm" data-act="reviewVersion" data-id="${esc(v.id)}">Mark reviewed</button>` : ''}</td></tr>`))}`);
  },
  async reviewVersion(el) { try { await api(`/api/reports/versions/${el.dataset.id}/review`, { method: 'POST' }); closeModal(); toast('Marked reviewed.'); render(); } catch (e) { fail(e); } },
  async aiDraft() {
    try {
      const r = await api('/api/brief/draft', { method: 'POST' });
      modal(`<h2>Narrative draft ${pill(r.provider === 'claude' ? 'Claude' : 'rules-based', 'info')} ${pill('draft', 'warn')}</h2><p class="muted small">${esc(r.label)} ${esc(r.note || '')}</p>
        <div class="feedback">${esc(r.text)}</div>${r.removed?.length ? `<details open><summary>${r.removed.length} sentence(s) removed for missing or wrong citations</summary><ul>${r.removed.map(x => `<li>${esc(x.sentence)} <em>(${esc(x.reason)})</em></li>`).join('')}</ul></details>` : ''}
        <details><summary>Evidence sent (${r.evidence.length} items, minimized)</summary>${table(['ID', 'Label', 'Value'], r.evidence.map(e => `<tr><td class="num">${esc(e.id)}</td><td class="small">${esc(e.label)}</td><td class="small">${esc(e.value)}</td></tr>`))}</details>`);
    } catch (e) { fail(e); }
  },
  async tutor(el) {
    const i = el.dataset.i, form = el.closest('form');
    const choice = form.querySelector(`input[name=q${i}]:checked`);
    const fb = document.getElementById('fb' + i);
    if (!choice) { toast('Pick an answer first.', true); return; }
    try {
      const r = await api(`/api/lessons/${el.dataset.module}/tutor`, { method: 'POST', body: { index: i, choice: Number(choice.value), reasoning: form.querySelector(`#why${i}`).value, confidence: form.querySelector('#quiz-conf').value } });
      fb.hidden = false; fb.className = 'feedback ' + (r.correct ? 'good' : 'bad'); fb.textContent = r.feedback;
    } catch (e) { fail(e); }
  },
  addMistake(el) { modal(`<h2>Log a mistake</h2><form class="stack" data-form="mistake" data-user="${esc(el.dataset.user)}"><label class="f">Module<select name="module_id" id="mk-mod">${S.boot.lessons.map(l => `<option value="${esc(l.id)}">${esc(l.title)}</option>`).join('')}</select></label><label class="f">What happened<textarea name="description" id="mk-desc"></textarea></label><label class="f">Corrected procedure<textarea name="corrected_procedure" id="mk-fix"></textarea></label><div><button class="btn">Save</button></div></form>`); },
  async copy(el) { const t = document.getElementById(el.dataset.target).textContent; try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch { toast('Copy blocked by the browser. Select the text instead.', true); } },
  decidePolicy(el) { modal(`<h2>Record a decision · ${esc(el.dataset.id)}</h2><form class="stack" data-form="policy" data-id="${esc(el.dataset.id)}"><label class="f">Decision (who decided and what)<textarea name="decision" id="pol-dec"></textarea></label><div><button class="btn">Save decision</button></div></form>`); },
  async saveUser(el) { try { await api(`/api/admin/users/${el.dataset.id}`, { method: 'PUT', body: { name: el.dataset.name, roles: document.getElementById('roles-' + el.dataset.id).value } }); toast('User saved.'); await refreshBoot(); } catch (e) { fail(e); } },
  async backup() {
    const res = await fetch('/api/admin/backup', { headers: { 'X-Session': S.token } });
    if (!res.ok) { toast('Backup failed.', true); return; }
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `academy-backup-${S.boot.as_of}.db`; a.click(); URL.revokeObjectURL(url);
  },
};

const FORMS = {
  async setup(f, fd) { await api('/api/setup', { method: 'PUT', body: Object.fromEntries(fd) }); toast('Setup saved.'); await refreshBoot(); render(); },
  async scenario(f, fd) {
    const out = $('#scnOut');
    try {
      const r = await api(`/api/lessons/${f.dataset.module}/scenario`, { method: 'POST', body: Object.fromEntries(fd) });
      out.innerHTML = r.correct ? `<div class="feedback good"><strong>Correct.</strong> ${esc(r.explain)}${r.followup ? `<br><strong>Try next:</strong> ${esc(r.followup)}` : ''}</div>` : `<div class="feedback bad">${esc(r.hint)}</div>`;
    } catch (e) { out.innerHTML = `<div class="feedback bad">${esc(e.message)}</div>`; }
  },
  async quiz(f, fd) {
    const n = f.querySelectorAll('fieldset.q').length;
    const answers = [...Array(n)].map((_, i) => fd.get('q' + i) === null ? null : Number(fd.get('q' + i)));
    const reasons = [...Array(n)].map((_, i) => fd.get('why' + i) || '');
    try {
      const r = await api(`/api/lessons/${f.dataset.module}/quiz`, { method: 'POST', body: { answers, reasons, confidence: fd.get('confidence') } });
      r.results.forEach((x, i) => {
        f.querySelectorAll(`.opt[data-q="${i}"]`).forEach(o => o.classList.remove('right', 'wrong'));
        f.querySelector(`.opt[data-q="${i}"][data-o="${x.answer}"]`).classList.add('right');
        if (!x.correct) f.querySelector(`.opt[data-q="${i}"][data-o="${answers[i]}"]`)?.classList.add('wrong');
        const fb = document.getElementById('fb' + i); fb.hidden = false; fb.className = 'feedback ' + (x.correct ? 'good' : 'bad');
        fb.textContent = (x.correct ? 'Right. ' : 'Not this one. ') + x.why + (x.policy ? ` (Policy ${x.policy})` : '') + (x.followup ? ` Next: ${x.followup}` : '');
      });
      $('#quizOut').innerHTML = `<div class="feedback ${r.pass ? 'good' : 'bad'}"><strong>${r.score} of ${r.max}.</strong> ${r.pass ? 'Passed. Now do the real task.' : 'Read the explanations; wrong answers went to your mistake log. Try again.'}</div>`;
    } catch (e) { fail(e); }
  },
  async task(f, fd) { try { await api(`/api/lessons/${f.dataset.module}/task`, { method: 'POST', body: Object.fromEntries(fd) }); toast('Submitted for review.'); render(); } catch (e) { fail(e); } },
  async signoff(f, fd, submitter) {
    const rubric = [...f.querySelectorAll('input[type=checkbox]')].map(c => ({ item: c.parentElement.textContent.trim(), met: c.checked }));
    try { await api(`/api/lessons/${f.dataset.module}/signoff`, { method: 'POST', body: { learner_id: f.dataset.learner, rubric, passed: submitter?.value === '1', note: fd.get('note') } }); toast('Sign-off recorded.'); render(); } catch (e) { fail(e); }
  },
  async import(f, fd) {
    const file = fd.get('file');
    if (!file || !file.size) { toast('Choose a file.', true); return; }
    const body = { kind: fd.get('kind'), entity_id: fd.get('entity_id'), filename: file.name, content_base64: await fileToBase64(file),
      expected_rows: fd.get('expected_rows') || null, control_total: fd.get('control_total') || null, retrieved_at: fd.get('retrieved_at') ? fd.get('retrieved_at') + 'T00:00:00Z' : null,
      bank_account_id: fd.get('bank_account_id') || null };
    if (body.kind === 'bank_statement') body.statement = { opening: fd.get('opening'), closing: fd.get('closing'), period_start: fd.get('period_start'), period_end: fd.get('period_end') };
    try { const p = await api('/api/imports/preview', { method: 'POST', body }); location.hash = `#/workbench/import/${p.batch_id}`; } catch (e) { fail(e); }
  },
  async remap(f, fd) {
    const mapping = Object.fromEntries([...fd].filter(([, v]) => v));
    try { await api(`/api/imports/${f.dataset.id}/remap`, { method: 'POST', body: { mapping } }); toast('Re-checked with the new mapping. The change is in the audit trail.'); render(); } catch (e) { fail(e); }
  },
  async doc(f, fd) { const file = fd.get('file'); try { const r = await api('/api/documents', { method: 'POST', body: { filename: file.name, mime: file.type, content_base64: await fileToBase64(file) } }); toast(r.existed ? 'That exact file is already stored.' : r.note); render(); } catch (e) { fail(e); } },
  async issue(f, fd) { try { await api(`/api/issues/${f.dataset.id}`, { method: 'PATCH', body: Object.fromEntries(fd) }); toast('Saved.'); await refreshBoot(); render(); } catch (e) { fail(e); } },
  async explain(f, fd) { try { await api(`/api/reports/recon/${f.dataset.st}/explain`, { method: 'POST', body: { item_key: f.dataset.key, ...Object.fromEntries(fd) } }); closeModal(); render(); } catch (e) { fail(e); } },
  async prepTask(f, fd) { try { await api(`/api/close/tasks/${f.dataset.id}/prepare`, { method: 'POST', body: Object.fromEntries(fd) }); closeModal(); render(); } catch (e) { fail(e); } },
  async reviewTask(f, fd) { try { await api(`/api/close/tasks/${f.dataset.id}/review`, { method: 'POST', body: Object.fromEntries(fd) }); closeModal(); render(); } catch (e) { fail(e); } },
  async verifyBank(f, fd) { try { await api(`/api/vendors/${f.dataset.id}/verify-bank`, { method: 'POST', body: Object.fromEntries(fd) }); closeModal(); await refreshBoot(); render(); } catch (e) { fail(e); } },
  async je(f, fd) {
    const cents = Math.round(parseFloat(String(fd.get('amount')).replace(/[$,]/g, '')) * 100);
    try { await api('/api/journals', { method: 'POST', body: { entity_id: 'ENT-THB', date: fd.get('date'), memo: fd.get('memo'), source_ref: fd.get('source_ref'), lines: [{ account_id: fd.get('dr'), debit_cents: cents }, { account_id: fd.get('cr'), credit_cents: cents }] } }); closeModal(); toast('Proposed. A reviewer must approve it.'); render(); } catch (e) { fail(e); }
  },
  async mistake(f, fd) { try { await api('/api/mistakes', { method: 'POST', body: { user_id: f.dataset.user, ...Object.fromEntries(fd), source: 'manual' } }); closeModal(); render(); } catch (e) { fail(e); } },
  async policy(f, fd) { try { await api(`/api/policies/${f.dataset.id}`, { method: 'PUT', body: Object.fromEntries(fd) }); closeModal(); render(); } catch (e) { fail(e); } },
  async settings(f, fd) {
    const toC = v => Math.round(parseFloat(String(v).replace(/[$,]/g, '')) * 100);
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { as_of_date: fd.get('as_of_date'), receipt_required_over_cents: toC(fd.get('receipt')), approval_required_over_cents: toC(fd.get('approval')), stale_after_days: Number(fd.get('stale_after_days')), collection_lag_days: Number(fd.get('collection_lag_days')), ai_approved: fd.get('ai_approved') === 'on' } });
      toast('Settings saved.'); await refreshBoot(); render();
    } catch (e) { fail(e); }
  },
};

const CHANGES = {
  exFilter: async el => { const issues = await api('/api/issues'); $('#exList').innerHTML = issueList(issues, el.value); },
  closeGo: () => { location.hash = `#/close/${$('#closeEntity').value}/${$('#closePeriod').value}`; },
  projGo: el => { location.hash = `#/reports/project/${el.value}`; },
  fcGo: el => { location.hash = `#/reports/forecast/${el.value}`; },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (fn) Promise.resolve(fn(el, e)).catch(fail);
});
document.addEventListener('change', e => { const el = e.target.closest('[data-act-change]'); if (el) Promise.resolve(CHANGES[el.dataset.actChange](el)).catch(fail); });
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  Promise.resolve(FORMS[f.dataset.form](f, new FormData(f), e.submitter)).catch(fail);
});
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
boot();
