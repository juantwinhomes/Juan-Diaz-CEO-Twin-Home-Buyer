/*
 * Equity Track contract signing — page logic.
 *
 * Privacy model: the page source holds no employee data. Every record lives in the
 * artifact's db under access rules enforced by the server (see README.md):
 *   public/directory            names only, readable by every signed-in viewer
 *   hr/**                       HR (owner) and the company signatory (Editor) only
 *   issued/<uid>/**             one employee's own contract and pay data; readable only by that account and admins
 *   esign/<uid>, claims/<uid>, activity/<uid>   written by that account, read by admins only
 *   signatory/<uid>/**          the signatory's own batch authorizations
 * An employee's browser never receives another employee's data because the server refuses to send it.
 */
(function () {
  'use strict';
  const ET = window.ET;
  const app = document.getElementById('app');
  const layer = document.getElementById('layer');
  const CONFIDENTIAL = 'Employee compensation and employment records are confidential. You may only access your own information.';
  const STATUS = {
    draft: 'Draft — not issued',
    awaiting_employee: 'Awaiting Employee Signature',
    awaiting_company: "Awaiting Juan's Signature",
    fully_signed: 'Fully Signed',
    returned: 'Returned for Correction',
  };
  const S = { db: null, user: null, uid: null, me: null, role: null, cfg: {}, employees: {}, esign: {}, claims: {}, profiles: {} };

  /* ---------------- tiny DOM helpers ---------------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') el.value = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const mount = (...nodes) => { app.replaceChildren(...nodes); };
  function toast(msg, kind) {
    const t = h('div', { class: 'toast' + (kind === 'error' ? ' error' : ''), role: 'status', text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), kind === 'error' ? 6500 : 3500);
  }
  function modal(title, body, opts = {}) {
    const close = () => { scrim.remove(); opts.onClose && opts.onClose(); };
    const dlg = h('div', { class: 'dialog' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', {}, h('h2', { class: 'title', style: 'font-size:1.3rem', text: title }), h('button', { class: 'btn ghost', onclick: close, 'aria-label': 'Close', text: 'Close' })),
      body);
    const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim && !opts.sticky) close(); } }, dlg);
    layer.append(scrim);
    return close;
  }
  const pill = (st) => h('span', { class: 'pill s-' + st, text: STATUS[st] || st });
  const spinner = (msg) => h('div', { class: 'center' }, h('div', { class: 'spinner' }), h('p', { class: 'muted', text: msg }));
  const nowIso = () => new Date().toISOString();
  function busy(btn, label) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = label || 'Working…';
    return () => { btn.disabled = false; btn.textContent = old; };
  }
  function errText(e) { return (e && (e.message || e.code)) || String(e); }

  /* ---------------- capabilities ---------------- */
  async function saveFile(filename, data) {
    const dl = await window.claude.use('downloads');
    if (!dl) { toast('Downloads are not available in this view.', 'error'); return false; }
    try { await dl.save({ filename, data }); return true; }
    catch (e) { if (e && e.code !== 'declined') toast('Download failed: ' + errText(e), 'error'); return false; }
  }

  /* ---------------- activity history ---------------- */
  let logQueue = Promise.resolve();
  function logEvent(ev) {
    const entry = Object.assign({ at: nowIso(), actorUid: S.uid, role: S.role, outcome: 'success' }, ev);
    logQueue = logQueue.then(async () => {
      const ref = S.db.doc('activity/' + S.uid);
      const snap = await ref.get();
      const events = snap.exists ? (snap.data().events || []).slice() : [];
      events.push(entry);
      if (events.length > 800) events.splice(0, events.length - 800);
      await ref.set({ events, role: S.role });
    }).catch((e) => console.warn('activity log write failed', e));
    return logQueue;
  }

  /* ---------------- pdf.js (worker runs on the main thread) ---------------- */
  let pdfReady = null;
  function pdfjs() {
    if (!pdfReady) pdfReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = s.src; resolve(window.pdfjsLib); };
      s.onerror = () => reject(new Error('Could not load the PDF viewer.'));
      document.head.append(s);
    });
    return pdfReady;
  }
  async function renderPdf(container, bytes) {
    container.replaceChildren(spinner('Loading document…'));
    try {
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
      const canvases = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const scale = Math.min(2.5, Math.max(1.5, (window.devicePixelRatio || 1) * 1.4));
        const vp = page.getViewport({ scale });
        const c = h('canvas', { width: vp.width, height: vp.height, 'aria-label': `Page ${p} of ${doc.numPages}` });
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        canvases.push(c);
      }
      container.replaceChildren(...canvases);
    } catch (e) {
      container.replaceChildren(h('p', { class: 'note bad', text: 'The document could not be displayed: ' + errText(e) }));
    }
  }
  const docFrame = (bytes) => { const f = h('div', { class: 'doc-frame' }); renderPdf(f, bytes); return f; };

  /* ---------------- shared status logic ---------------- */
  function sigFor(rec) {
    const e = rec.uid && S.esign[rec.uid];
    return e && e.signature && e.signature.sha === rec.sha && e.signature.contractId === rec.contractId ? e.signature : null;
  }
  function statusOf(rec) {
    if (rec.status === 'fully_signed') return 'fully_signed';
    if (rec.status === 'returned') return 'returned';
    if (rec.status !== 'issued') return 'draft';
    if (rec.employeeSig && rec.employeeSig.sha === rec.sha) return 'awaiting_company';
    if (sigFor(rec)) return 'awaiting_company';
    return 'awaiting_employee';
  }
  function codes() { return ET.assignCodes(Object.values(S.employees)); }

  /** Copies each newly signed employee signature into the HR record, which only admins can write. That copy is the locked version. */
  const ingesting = new Set();
  async function ingestEmployeeActions() {
    for (const rec of Object.values(S.employees)) {
      if (rec.status !== 'issued' || ingesting.has(rec.key)) continue;
      const e = rec.uid && S.esign[rec.uid];
      if (!e) continue;
      const sig = sigFor(rec);
      if (sig && !(rec.employeeSig && rec.employeeSig.sha === rec.sha)) {
        ingesting.add(rec.key);
        try {
          await S.db.doc('hr/data/employees/' + rec.key).update({ employeeSig: sig });
          await S.db.doc('issued/' + rec.uid).update({ status: 'awaiting_company', employeeSignedAt: sig.signedAt });
          await logEvent({ action: 'Employee signature locked; contract placed in Juan’s signing queue', contractId: rec.contractId, version: rec.versionNo, employeeKey: rec.key });
        } catch (err) { console.warn(err); }
        ingesting.delete(rec.key);
      } else if (!sig && e.correction && e.correction.sha === rec.sha && !e.correction.handled) {
        ingesting.add(rec.key);
        try {
          await S.db.doc('hr/data/employees/' + rec.key).update({ status: 'returned', returnNote: 'Employee: ' + e.correction.note, returnedAt: e.correction.at });
          await S.db.doc('issued/' + rec.uid).update({ status: 'returned', returnNote: e.correction.note });
          await logEvent({ action: 'Employee requested a correction', contractId: rec.contractId, version: rec.versionNo, employeeKey: rec.key, detail: e.correction.note });
        } catch (err) { console.warn(err); }
        ingesting.delete(rec.key);
      }
    }
  }

  /* ---------------- signature pad ---------------- */
  const TYPED_FONTS = [
    { id: 'dancing', family: 'Dancing Script', weight: '600' },
    { id: 'vibes', family: 'Great Vibes', weight: '400' },
    { id: 'allura', family: 'Allura', weight: '400' },
  ];
  const INK = '#0f2154';

  function trimToPng(src) {
    const ctx = src.getContext('2d');
    const { width, height } = src;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX < 0) return null;
    const pad = 8;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
    const w = maxX - minX + 1, hgt = maxY - minY + 1;
    const s = Math.min(1, 600 / w, 160 / hgt);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * s)); out.height = Math.max(1, Math.round(hgt * s));
    out.getContext('2d').drawImage(src, minX, minY, w, hgt, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL('image/png');
    return { dataUrl, b64: dataUrl.split(',')[1] };
  }

  /** Draw or type a signature. Returns {el, capture(): Promise<{b64,dataUrl,method,typedName,style}|null>}. */
  function signaturePad(fullName) {
    let mode = 'draw';
    const drawCanvas = h('canvas', { 'aria-label': 'Signature drawing area' });
    let drawn = false;
    const padBox = h('div', { class: 'pad' }, drawCanvas, h('span', { class: 'hint', text: 'Sign above the line with your finger, stylus, mouse or trackpad' }));
    function sizeCanvas() {
      const r = drawCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (!r.width) return;
      drawCanvas.width = Math.round(r.width * dpr); drawCanvas.height = Math.round(190 * dpr);
      const c = drawCanvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 2.4;
      drawn = false;
    }
    let last = null;
    drawCanvas.addEventListener('pointerdown', (e) => { drawCanvas.setPointerCapture(e.pointerId); const r = drawCanvas.getBoundingClientRect(); last = { x: e.clientX - r.left, y: e.clientY - r.top }; e.preventDefault(); });
    drawCanvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const r = drawCanvas.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      const c = drawCanvas.getContext('2d');
      c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke();
      last = p; drawn = true; e.preventDefault();
    });
    const end = () => { last = null; };
    drawCanvas.addEventListener('pointerup', end); drawCanvas.addEventListener('pointercancel', end);
    const clearBtn = h('button', { class: 'btn secondary sm', type: 'button', text: 'Clear', onclick: sizeCanvas });
    const drawPane = h('div', { class: 'stack' }, padBox, h('div', { class: 'row end' }, clearBtn));

    const nameInput = h('input', { type: 'text', id: 'typed-name', autocomplete: 'name', placeholder: fullName });
    const opts = TYPED_FONTS.map((f, i) => {
      const span = h('span', { style: `font-family:'${f.family}',cursive;font-weight:${f.weight}`, text: fullName });
      const radio = h('input', { type: 'radio', name: 'sigstyle', value: f.id, checked: i === 0 });
      return { f, span, radio, el: h('label', { class: 'typed-opt' }, radio, span) };
    });
    nameInput.addEventListener('input', () => opts.forEach((o) => { o.span.textContent = nameInput.value || fullName; }));
    const typePane = h('div', { class: 'stack', hidden: true },
      h('label', { class: 'f', for: 'typed-name' }, 'Type your full legal name', h('span', { class: 'h', text: `Must match the name on the contract: ${fullName}` }), nameInput),
      h('div', { class: 'typed-opts', role: 'radiogroup', 'aria-label': 'Signature style' }, opts.map((o) => o.el)));

    const tDraw = h('button', { type: 'button', 'aria-pressed': 'true', text: 'Draw' });
    const tType = h('button', { type: 'button', 'aria-pressed': 'false', text: 'Type' });
    function setMode(m) { mode = m; tDraw.setAttribute('aria-pressed', m === 'draw'); tType.setAttribute('aria-pressed', m === 'type'); drawPane.hidden = m !== 'draw'; typePane.hidden = m !== 'type'; if (m === 'draw') requestAnimationFrame(sizeCanvas); }
    tDraw.onclick = () => setMode('draw'); tType.onclick = () => setMode('type');
    const el = h('div', { class: 'stack' }, h('div', { class: 'sig-tabs', role: 'group', 'aria-label': 'Signature method' }, tDraw, tType), drawPane, typePane);
    requestAnimationFrame(sizeCanvas);
    window.addEventListener('resize', () => { if (!drawn && mode === 'draw') sizeCanvas(); });

    async function capture() {
      if (mode === 'draw') {
        if (!drawn) { toast('Draw your signature first.', 'error'); return null; }
        const r = trimToPng(drawCanvas);
        return r && Object.assign(r, { method: 'drawn' });
      }
      const typed = nameInput.value.trim().replace(/\s+/g, ' ');
      if (ET.normName(typed) !== ET.normName(fullName)) { toast(`Type your full legal name exactly as on the contract: ${fullName}`, 'error'); return null; }
      const o = opts.find((x) => x.radio.checked) || opts[0];
      const font = `${o.f.weight} 96px "${o.f.family}"`;
      try { await document.fonts.load(font, typed); } catch (_) { /* fall back to cursive */ }
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d'); ctx.font = font;
      c.width = Math.ceil(ctx.measureText(typed).width + 60); c.height = 170;
      const ctx2 = c.getContext('2d'); ctx2.font = font + ', cursive'; ctx2.fillStyle = INK; ctx2.textBaseline = 'middle'; ctx2.fillText(typed, 30, 90);
      const r = trimToPng(c);
      return r && Object.assign(r, { method: 'typed', typedName: typed, style: o.f.family });
    }
    return { el, capture };
  }

  /* ---------------- payroll explanation (informational) ---------------- */
  function payrollView(d) {
    const st = d.statutory || ET.DEFAULT_STATUTORY;
    const p = ET.computePayroll(d, st);
    const row = (label, why, amount, cls) => h('tr', { class: cls || '' }, h('td', {}, label, why ? h('span', { class: 'why', text: why }) : null), h('td', { class: amount < 0 ? 'neg' : '', text: amount < 0 ? '−' + ET.peso(-amount) : ET.peso(amount) }));
    const ndWhy = d.hasNightDiff
      ? `Estimate: about ${d.ndHoursPerMonth || 0} night hours a month × 10% × your hourly rate of ${ET.peso(p.hourly)}. Actual pay depends on hours worked between 10:00 PM and 6:00 AM.`
      : 'Not part of your contract.';
    const table = h('table', { class: 'pay' },
      row('Monthly basic salary', 'From section SALARY of your contract.', p.monthly),
      row('Guaranteed monthly gross compensation', 'Your fixed monthly salary. It does not change with hours.', p.guaranteed),
      row('Estimated night differential', ndWhy, p.nd),
      row('Qualifying de minimis benefits', p.deMinimis ? 'Tax-exempt within BIR limits.' : 'None under your contract.', p.deMinimis),
      row('Estimated gross pay for the month', null, p.gross, 'sub'),
      row('SSS contribution (your share)', `${(st.sss.employeeRate * 100).toFixed(1)}% of a monthly salary credit of ${ET.peso(ET.sssMsc(p.monthly + p.nd, st.sss))}.`, -p.sss),
      row('PhilHealth contribution (your share)', `${(st.philhealth.rate * st.philhealth.employeeShare * 100).toFixed(2)}% of your basic salary (half of the ${(st.philhealth.rate * 100).toFixed(0)}% premium).`, -p.philhealth),
      row('Pag-IBIG contribution (your share)', `${(st.pagibig.rate * 100).toFixed(0)}% of up to ${ET.peso(st.pagibig.maxFundSalary)}.`, -p.pagibig),
      row('BIR withholding tax', `Monthly withholding table, on taxable pay of ${ET.peso(p.taxable)} after contributions.`, -p.tax),
      p.others.map((o) => row(o.label, 'Other authorized deduction.', -o.amount)),
      row('Estimated monthly take-home pay', null, p.takeHome, 'total'),
      row('Estimated take-home per cut-off', 'Paid on the 20th and on the 5th of the next month.', p.perCutoff, 'total'));
    const thirteenth = d.thirteenthApplicable
      ? `13th-month pay: by December 24 each year you receive one-twelfth of the basic salary you earned during the calendar year. A full year at your salary comes to about ${ET.peso(p.thirteenth)}. It is tax-free up to ${ET.peso(st.thirteenthExemptCap)} when combined with other qualifying benefits.`
      : 'Your contract classifies your position as managerial. Under Presidential Decree No. 851 the 13th-month pay requirement covers rank-and-file employees. Your contract says you receive only the benefits Philippine law requires for a managerial employee. Ask HR if you have questions.';
    return h('div', { class: 'stack' },
      h('div', { class: 'table-wrap', style: 'border:0;background:none' }, table),
      h('p', { class: 'small', text: 'Why gross and take-home differ: your gross pay is what the Company pays you before deductions. Philippine law requires the Company to withhold your share of SSS, PhilHealth and Pag-IBIG contributions and your income tax, and remit them to the government for you. What remains is your take-home pay.' }),
      h('p', { class: 'small', text: thirteenth }),
      h('p', { class: 'note info small', text: 'These figures are estimates for your information. Actual payslips depend on days and hours worked, absences, approved overtime and current government rates. This page is not part of your employment contract and you do not sign it.' }));
  }

  /* ================================================================
   *  EMPLOYEE
   * ================================================================ */
  const E = { issued: undefined, esign: undefined, claim: undefined, step: 'pay', source: null, sourceSha: null, final: null, routeKey: '', loggedAccess: false, loggedPay: false };

  async function employeeMain() {
    S.role = 'employee';
    const ready = () => E.issued !== undefined && E.esign !== undefined && E.claim !== undefined;
    const onErr = (e) => mount(blocked('Your records could not be loaded', errText(e)));
    S.db.doc('issued/' + S.uid).onSnapshot((s) => { E.issued = s.exists ? s.data() : null; if (ready()) routeEmployee(); }, onErr);
    S.db.doc('esign/' + S.uid).onSnapshot((s) => { E.esign = s.exists ? s.data() : null; if (ready()) routeEmployee(); }, onErr);
    S.db.doc('claims/' + S.uid).onSnapshot((s) => { E.claim = s.exists ? s.data() : null; if (ready()) routeEmployee(); }, onErr);
  }

  function employeeState() {
    const i = E.issued;
    if (!i) {
      if (E.claim && E.claim.kind === 'employee' && E.claim.status === 'pending') return 'waiting';
      return 'welcome';
    }
    if (i.status === 'fully_signed') return 'complete';
    if (i.status === 'returned') return 'returned';
    const sig = E.esign && E.esign.signature;
    if (i.status === 'awaiting_company' || (sig && sig.sha === i.sha && sig.contractId === i.contractId)) return 'awaiting';
    return E.step;
  }

  function routeEmployee(force) {
    const st = employeeState();
    const key = [st, E.issued && E.issued.sha, E.issued && E.issued.status, E.claim && E.claim.status].join('|');
    if (!force && key === E.routeKey) return;
    E.routeKey = key;
    if (E.issued && !E.loggedAccess) { E.loggedAccess = true; logEvent({ action: 'Employee accessed contract', contractId: E.issued.contractId, version: E.issued.version }); }
    ({ welcome: empWelcome, waiting: empWaiting, pay: empPay, contract: empContract, sign: empSign, awaiting: empAwaiting, complete: empComplete, returned: empReturned }[st])();
  }
  function goStep(step) { E.step = step; routeEmployee(true); window.scrollTo(0, 0); }

  function stepper(now) {
    const steps = [['pay', 'Your pay'], ['contract', 'Review contract'], ['sign', 'Sign'], ['awaiting', "Juan's signature"], ['complete', 'Complete']];
    const idx = steps.findIndex((s) => s[0] === now);
    return h('ol', { class: 'steps', 'aria-label': 'Signing progress' }, steps.map((s, i) => h('li', { class: i < idx ? 'done' : i === idx ? 'now' : '', 'aria-current': i === idx ? 'step' : null, text: s[1] })));
  }

  async function empWelcome() {
    let names = [];
    try { const d = await S.db.doc('public/directory').get(); names = d.exists ? (d.data().names || []) : []; } catch (_) { /* empty list below */ }
    let chosen = null;
    const input = h('input', { type: 'text', id: 'emp-name', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'emp-name-list', autocomplete: 'off', placeholder: 'Start typing your name' });
    const list = h('ul', { id: 'emp-name-list', role: 'listbox', hidden: true });
    function show() {
      const q = ET.normName(input.value);
      const hits = names.filter((n) => !q || ET.normName(n.name).includes(q)).slice(0, 50);
      list.replaceChildren(...hits.map((n) => h('li', { role: 'option', text: n.name, onmousedown: (e) => { e.preventDefault(); pick(n); } })));
      list.hidden = !hits.length; input.setAttribute('aria-expanded', String(!list.hidden));
    }
    function pick(n) { chosen = n; input.value = n.name; list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    input.addEventListener('input', () => { chosen = null; show(); });
    input.addEventListener('focus', show);
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 120));
    const dob = h('input', { type: 'date', id: 'emp-dob', max: ET.phYMD(nowIso()) });
    const msg = h('div');
    const btn = h('button', { class: 'btn big', type: 'submit', text: 'Continue' });
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      if (!chosen) { const exact = names.find((n) => ET.normName(n.name) === ET.normName(input.value)); if (exact) pick(exact); }
      if (!chosen) { msg.append(h('p', { class: 'note bad', text: 'Select your name from the list.' })); return; }
      if (!dob.value) { msg.append(h('p', { class: 'note bad', text: 'Enter your date of birth.' })); return; }
      const done = busy(btn, 'Sending…');
      try {
        await S.db.doc('claims/' + S.uid).set({ kind: 'employee', key: chosen.key, dob: dob.value, at: nowIso(), status: 'pending' });
        await logEvent({ action: 'Employee requested access', employeeKey: chosen.key });
      } catch (err) {
        done();
        if (err && err.code === 'invalid_argument') msg.append(h('p', { class: 'note bad', text: 'Your Claude account can view this page but cannot submit. Ask HR to give your account Contributor access in the company Claude organization.' }));
        else msg.append(h('p', { class: 'note bad', text: 'Your request could not be sent: ' + errText(err) }));
      }
    } },
      h('label', { class: 'f', for: 'emp-name' }, 'Your full name', h('div', { class: 'combo' }, input, list)),
      h('label', { class: 'f', for: 'emp-dob' }, 'Date of birth', dob),
      msg, h('div', { class: 'row' }, btn));
    const rejected = E.claim && E.claim.status === 'rejected';
    mount(h('div', { class: 'narrow' },
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: 'Welcome' }),
        h('h1', { class: 'title', text: 'Review and sign your employment contract' }),
        h('p', { class: 'lede', text: 'Select your name and enter your date of birth. HR confirms these details against your employee record before your contract opens on this account.' }),
        rejected ? h('p', { class: 'note bad', text: 'HR could not confirm your last request. ' + CONFIDENTIAL + ' Check your details and try again, or contact HR.' }) : null,
        names.length ? form : h('p', { class: 'note warn', text: 'No contracts are open for signing yet. HR will tell you when yours is ready.' })),
      h('p', { class: 'confidential', text: 'Your name and birthdate identify your record. Access is protected by your Claude sign-in: your contract opens only on the account HR links to your record. ' + CONFIDENTIAL })));
  }

  function empWaiting() {
    mount(h('div', { class: 'narrow' }, h('section', { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'Request sent' }),
      h('h1', { class: 'title', text: 'HR is confirming your details' }),
      h('p', { class: 'lede', text: 'Your contract will open on this page as soon as HR links your record to this Claude account. You can keep this page open or come back later.' }),
      h('div', { class: 'row' }, h('div', { class: 'spinner' }), h('span', { class: 'muted small', text: 'Waiting for HR…' })),
      h('div', { class: 'row' }, h('button', { class: 'btn secondary sm', text: 'Change my details', onclick: async () => { await S.db.doc('claims/' + S.uid).delete(); } })))));
  }

  async function loadSource() {
    if (E.source && E.sourceSha === E.issued.sha) return E.source;
    const s = await S.db.doc(`issued/${S.uid}/docs/source`).get();
    if (!s.exists) throw new Error('Your contract file is not available yet.');
    const bytes = ET.bytesFromB64(s.data().b64);
    if ((await ET.sha256Hex(bytes)) !== E.issued.sha) throw new Error('The contract file failed its integrity check. Contact HR.');
    E.source = bytes; E.sourceSha = E.issued.sha;
    return bytes;
  }

  function empPay() {
    const i = E.issued;
    if (!E.loggedPay) { E.loggedPay = true; logEvent({ action: 'Payroll explanation viewed', contractId: i.contractId, version: i.version }); }
    mount(h('div', { class: 'narrow' }, stepper('pay'),
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: `${i.name} · ${i.position}` }),
        h('h1', { class: 'title', text: 'Understanding Your Monthly Compensation' }),
        h('p', { class: 'lede', text: 'This page shows only your own salary and estimated deductions, based on the amounts in your contract.' }),
        payrollView(i.payroll || {}),
        h('div', { class: 'row end' }, h('button', { class: 'btn big', text: 'I Understand — Review My Contract', onclick: () => goStep('contract') })),
        h('p', { class: 'confidential', text: CONFIDENTIAL }))));
  }

  function factsList(i) {
    const f = (k, v) => h('div', {}, h('dt', { text: k }), h('dd', { text: v || '—' }));
    return h('dl', { class: 'facts' },
      f('Employee', i.name), f('Date of birth', ET.dobLong(i.dob)), f('Position', i.position), f('Employment start date', i.startDate),
      f('Pay effective from cut-off', i.effective), f('Monthly salary (gross)', ET.peso(i.monthly)), f('Per cut-off (gross)', ET.peso(i.perCutoff)),
      f('Contract reference', `${i.contractId} · v${i.version}`));
  }

  function empContract() {
    const i = E.issued;
    const frame = h('div', { class: 'doc-frame' }, spinner('Loading your contract…'));
    loadSource().then((b) => renderPdf(frame, b)).catch((e) => frame.replaceChildren(h('p', { class: 'note bad', text: errText(e) })));
    mount(h('div', { class: 'narrow' }, stepper('contract'),
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: 'Official contract' }),
        h('h1', { class: 'title', text: 'Review your employment contract' }),
        h('p', { class: 'lede', text: 'Read the whole contract. Then confirm that your personal details and salary below are correct. The contract terms were approved by Juan Diaz and cannot be edited here.' }),
        factsList(i), frame,
        h('div', { class: 'row between' },
          h('button', { class: 'btn ghost', text: 'Report a correction', onclick: reportCorrection }),
          h('div', { class: 'row' },
            h('button', { class: 'btn secondary', text: 'Back to my pay', onclick: () => goStep('pay') }),
            h('button', { class: 'btn big', text: 'My details are correct — Continue to sign', onclick: () => goStep('sign') }))))));
  }

  function reportCorrection() {
    const ta = h('textarea', { id: 'corr-note', placeholder: 'Example: my start date should be March 3, 2025.' });
    const btn = h('button', { class: 'btn', text: 'Send to HR' });
    const close = modal('Report a correction', h('div', { class: 'stack' },
      h('p', { text: 'Tell HR what is wrong. Your contract will be returned for correction and you will sign the corrected version.' }),
      h('label', { class: 'f', for: 'corr-note' }, 'What needs to change?', ta), h('div', { class: 'row end' }, btn)));
    btn.onclick = async () => {
      if (!ta.value.trim()) { toast('Describe the correction first.', 'error'); return; }
      const done = busy(btn, 'Sending…');
      try {
        await S.db.doc('esign/' + S.uid).set({ correction: { note: ta.value.trim().slice(0, 1000), sha: E.issued.sha, contractId: E.issued.contractId, at: nowIso() } });
        await logEvent({ action: 'Employee requested a correction', contractId: E.issued.contractId, version: E.issued.version, detail: ta.value.trim().slice(0, 200) });
        close(); toast('Sent to HR.');
        mount(h('div', { class: 'narrow' }, h('section', { class: 'panel' }, h('h1', { class: 'title', text: 'Correction sent to HR' }), h('p', { class: 'lede', text: 'HR will review your note. You will sign the corrected contract once it is ready.' }))));
      } catch (e) { done(); toast('Could not send: ' + errText(e), 'error'); }
    };
  }

  function consentText(i) {
    return `I agree to sign this Employment Contract electronically. I understand that my electronic signature has the same legal effect as my handwritten signature under the Electronic Commerce Act of 2000 (Republic Act No. 8792). I am signing contract ${i.contractId}, version ${i.version}, exactly as shown to me. I consent to Equity Track Inc. Philippines recording my signature, the date and time, and this consent as part of my employment records under the Data Privacy Act of 2012 (Republic Act No. 10173).`;
  }

  function empSign() {
    const i = E.issued;
    const pad = signaturePad(i.name);
    const preview = h('div', { class: 'sig-preview' }, h('span', { class: 'muted small', text: 'Your signature preview appears here.' }));
    const consent = h('input', { type: 'checkbox', id: 'consent' });
    const submit = h('button', { class: 'btn big', text: 'Submit My Signature', disabled: true });
    let captured = null;
    const refresh = () => { submit.disabled = !(captured && consent.checked); };
    consent.onchange = refresh;
    const previewBtn = h('button', { class: 'btn secondary', text: 'Preview signature', onclick: async () => {
      captured = await pad.capture();
      preview.replaceChildren(captured ? h('img', { src: captured.dataUrl, alt: 'Signature preview' }) : h('span', { class: 'muted small', text: 'Nothing to preview yet.' }));
      refresh();
    } });
    submit.onclick = async () => {
      if (!captured || !consent.checked) return;
      const done = busy(submit, 'Submitting…');
      try {
        const bytes = await loadSource();
        const sha = await ET.sha256Hex(bytes);
        if (sha !== i.sha) throw new Error('Your contract changed while you were signing. Review it again.');
        const signedAt = nowIso();
        const signature = { contractId: i.contractId, version: i.version, sha, sigPng: captured.b64, method: captured.method, typedName: captured.typedName || null, style: captured.style || null, consentText: consentText(i), consentAt: signedAt, signedAt, userAgent: navigator.userAgent.slice(0, 200) };
        await logEvent({ action: 'Employee consent recorded', contractId: i.contractId, version: i.version });
        await S.db.doc('esign/' + S.uid).set({ signature });
        await logEvent({ action: 'Employee signed', contractId: i.contractId, version: i.version, detail: captured.method });
        await logEvent({ action: 'Contract placed in Juan’s signing queue', contractId: i.contractId, version: i.version });
        toast('Signature submitted.');
      } catch (e) {
        done();
        toast(e && e.code === 'invalid_argument' ? 'Your account cannot sign. Ask HR for Contributor access.' : 'Could not submit: ' + errText(e), 'error');
      }
    };
    mount(h('div', { class: 'narrow' }, stepper('sign'),
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: `${i.contractId} · version ${i.version}` }),
        h('h1', { class: 'title', text: 'Sign your contract' }),
        h('p', { class: 'lede', text: 'Draw your signature or type your full legal name. Preview it, give your consent, then submit.' }),
        pad.el,
        h('div', { class: 'row' }, previewBtn),
        preview,
        h('label', { class: 'check', for: 'consent' }, consent, h('span', { text: consentText(i) })),
        h('div', { class: 'row between' }, h('button', { class: 'btn secondary', text: 'Back to contract', onclick: () => goStep('contract') }), submit))));
  }

  function empAwaiting() {
    const i = E.issued;
    const sig = (E.esign && E.esign.signature) || {};
    mount(h('div', { class: 'narrow' }, stepper('awaiting'),
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: 'Signed by you' }),
        h('h1', { class: 'title', text: "Awaiting Juan's signature" }),
        h('p', { class: 'lede', text: `You signed on ${sig.signedAt ? ET.phDateTime(sig.signedAt) : (i.employeeSignedAt ? ET.phDateTime(i.employeeSignedAt) : '—')}. Your signed version is locked. When Juan Diaz signs for the Company, your fully signed contract will appear on this page.` }),
        sig.sigPng ? h('div', { class: 'sig-preview' }, h('img', { src: 'data:image/png;base64,' + sig.sigPng, alt: 'Your signature' })) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn secondary', text: 'View the contract I signed', onclick: async () => { try { modal('Your contract', docFrame(await loadSource()), { wide: true }); } catch (e) { toast(errText(e), 'error'); } } })))));
  }

  function empReturned() {
    const i = E.issued;
    mount(h('div', { class: 'narrow' }, h('section', { class: 'panel' },
      h('div', { class: 'eyebrow', text: STATUS.returned }),
      h('h1', { class: 'title', text: 'Your contract is being corrected' }),
      h('p', { class: 'lede', text: 'HR is preparing a corrected version. You will review and sign it here when it is ready.' }),
      i.returnNote ? h('p', { class: 'note warn', text: 'Note: ' + i.returnNote }) : null)));
  }

  async function loadFinal() {
    if (E.final && E.final.sha === E.issued.finalSha) return E.final.bytes;
    const s = await S.db.doc(`issued/${S.uid}/docs/final`).get();
    if (!s.exists) throw new Error('The signed copy is still being prepared.');
    const bytes = ET.bytesFromB64(s.data().b64);
    if ((await ET.sha256Hex(bytes)) !== E.issued.finalSha) throw new Error('The signed copy failed its integrity check. Contact HR.');
    E.final = { sha: E.issued.finalSha, bytes };
    return bytes;
  }

  function empComplete() {
    const i = E.issued;
    const view = h('button', { class: 'btn secondary big', text: 'View My Signed Contract', onclick: async () => { try { modal('Your signed contract', docFrame(await loadFinal()), { wide: true }); } catch (e) { toast(errText(e), 'error'); } } });
    const dlBtn = h('button', { class: 'btn big', text: 'Download My Signed Contract (PDF)' });
    dlBtn.onclick = async () => {
      try {
        const b = await loadFinal();
        if (await saveFile(ET.employeeFileName(i.name, i.companySignedAt), new Blob([b], { type: 'application/pdf' })))
          logEvent({ action: 'Employee PDF downloaded', contractId: i.contractId, version: i.version });
      } catch (e) { toast(errText(e), 'error'); }
    };
    mount(h('div', { class: 'narrow' }, stepper('complete'),
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: `${i.contractId} · version ${i.version}` }),
        h('h1', { class: 'title', text: 'Your Employment Contract Is Complete' }),
        h('p', { class: 'lede', text: 'Both you and the Company have signed the agreement.' }),
        h('dl', { class: 'facts' },
          h('div', {}, h('dt', { text: 'You signed' }), h('dd', { text: i.employeeSignedAt ? ET.phDateTime(i.employeeSignedAt) : '—' })),
          h('div', {}, h('dt', { text: 'Juan Diaz signed for the Company' }), h('dd', { text: i.companySignedAt ? ET.phDateTime(i.companySignedAt) : '—' }))),
        h('div', { class: 'row' }, view, dlBtn),
        h('p', { class: 'confidential', text: 'This copy stays available on this page whenever you sign in. ' + CONFIDENTIAL }))));
  }

  /* ================================================================
   *  HR (artifact owner) and JUAN (designated signatory)
   * ================================================================ */
  function subscribeAdminData(onChange) {
    let n = 0; const need = 3; const seen = new Set();
    const tick = (k) => { if (!seen.has(k)) { seen.add(k); n++; } if (n >= need) onChange(); };
    const err = (e) => mount(blocked('Records could not be loaded', errText(e)));
    S.db.doc('hr/config').onSnapshot((s) => { S.cfg = s.exists ? s.data() : {}; if (n >= need) onChange(); }, err);
    S.db.collection('hr/data/employees').onSnapshot((q) => { S.employees = {}; q.docs.forEach((d) => { S.employees[d.id] = d.data(); }); tick('e'); ingestEmployeeActions(); }, err);
    S.db.collection('esign').onSnapshot((q) => { S.esign = {}; q.docs.forEach((d) => { S.esign[d.id] = d.data(); }); tick('s'); ingestEmployeeActions(); }, err);
    S.db.collection('claims').onSnapshot((q) => { S.claims = {}; q.docs.forEach((d) => { S.claims[d.id] = d.data(); }); tick('c'); }, err);
  }
  async function resolveProfiles(ids) {
    ids = ids.filter(Boolean);
    if (!ids.length) return S.profiles;
    try { Object.assign(S.profiles, await S.user.profiles(ids)); } catch (_) { /* names stay blank */ }
    return S.profiles;
  }
  const personLabel = (uid) => { const p = S.profiles[uid]; return p ? [p.name, p.email].filter(Boolean).join(' · ') || 'Unnamed account' : 'Account'; };

  /* ---------------- HR console ---------------- */
  const H = { tab: 'contracts', filter: '', statusFilter: 'all', focus: null };

  function hrMain() {
    S.role = 'hr';
    mount(spinner('Loading HR records…'));
    subscribeAdminData(() => renderHr(false));
  }

  /** Live data refreshes skip tabs that hold a form or a one-time load, so nothing HR is typing gets wiped. */
  function renderHr(force = true) {
    if (!force && H.rendered && (H.tab === 'settings' || H.tab === 'activity')) return;
    H.rendered = true;
    const active = document.activeElement;
    H.focus = active && active.id && app.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    const recs = Object.values(S.employees);
    const pendingClaims = Object.entries(S.claims).filter(([, c]) => c.status === 'pending');
    const done = recs.filter((r) => statusOf(r) === 'fully_signed');
    const tabs = [['contracts', 'Contracts', recs.length], ['access', 'Access requests', pendingClaims.length], ['signing', 'Signing status', recs.filter((r) => statusOf(r) === 'awaiting_company').length], ['completed', 'Signed PDFs', done.length], ['activity', 'Activity history'], ['settings', 'Settings']];
    const tabBar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label, count]) =>
      h('button', { class: 'tab', role: 'tab', 'aria-selected': String(H.tab === id), onclick: () => { H.tab = id; renderHr(); } }, label, count ? h('span', { class: 'count', text: count }) : null)));
    const body = { contracts: hrContracts, access: hrAccess, signing: hrSigning, completed: hrCompleted, activity: hrActivity, settings: hrSettings }[H.tab]();
    mount(h('div', { class: 'stack', style: 'gap:18px' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'HR console' }), h('h1', { class: 'title', text: 'Employment contracts' })),
      setupWarnings(), tabBar, body));
    if (H.focus) { const el = document.getElementById(H.focus.id); if (el) { el.focus(); try { el.setSelectionRange(H.focus.start, H.focus.end); } catch (_) { /* not a text input */ } } }
  }

  function setupWarnings() {
    const w = [];
    if (!S.cfg.signatoryUid) w.push('No company signatory is designated yet. Share this artifact with Juan Diaz as an Editor; when he opens it and requests the signatory role, approve it under Access requests.');
    return w.length ? h('div', { class: 'stack' }, w.map((t) => h('p', { class: 'note warn', text: t }))) : null;
  }

  function searchBox(id, placeholder) {
    return h('input', { type: 'search', id, value: H.filter, placeholder, oninput: (e) => { H.filter = e.target.value; renderHr(); } });
  }
  function matches(rec, code) {
    const q = H.filter.trim().toLowerCase();
    if (!q) return true;
    return [rec.name, code, STATUS[statusOf(rec)], rec.contractId, rec.position].some((v) => String(v || '').toLowerCase().includes(q));
  }

  function hrContracts() {
    const c = codes();
    const recs = Object.values(S.employees).sort((a, b) => a.name.localeCompare(b.name)).filter((r) => matches(r, c[r.key]));
    const input = h('input', { type: 'file', id: 'upload', accept: 'application/pdf', multiple: true, hidden: true, onchange: (e) => uploadContracts([...e.target.files]) });
    const drop = h('div', { class: 'drop' },
      h('strong', { text: "Upload Juan's drafted contracts (PDF)" }),
      h('span', { class: 'muted small', text: 'Drop files here or choose them. Each PDF is matched to an employee by the name in its opening paragraph. Juan’s wording is kept exactly and laid out in the company onboarding format; the app reads the result back to prove no word changed.' }),
      h('button', { class: 'btn secondary', text: 'Choose PDF files', onclick: () => input.click() }), input);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); uploadContracts([...e.dataTransfer.files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))); });
    const table = h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Employee', 'Code', 'Position', 'Monthly salary', 'Status', 'Account', ''].map((t, i) => h('th', { class: i === 3 ? 'num' : '', text: t })))),
      h('tbody', {}, recs.length ? recs.map((r) => h('tr', {},
        h('td', {}, h('strong', { text: r.name }), r.pendingVid ? h('div', { class: 'small', style: 'color:var(--warn)', text: 'Revised draft waiting for review' }) : null),
        h('td', { class: 'code', text: c[r.key] || '—' }),
        h('td', { class: 'small', text: r.position || '—' }),
        h('td', { class: 'num', text: r.monthly ? ET.peso(r.monthly) : '—' }),
        h('td', {}, pill(statusOf(r))),
        h('td', { class: 'small muted', text: r.uid ? 'Linked' : 'Not linked' }),
        h('td', {}, h('button', { class: 'btn secondary sm', text: 'Open', onclick: () => openEmployee(r.key) }))))
        : h('tr', {}, h('td', { colspan: 7, class: 'muted', text: 'No contracts yet. Upload the PDFs above to start.' })))));
    return h('div', { class: 'stack', style: 'gap:16px' }, drop, h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:220px' }, searchBox('hr-search', 'Search by name, employee code, status or contract ID'))), table);
  }

  async function uploadContracts(files) {
    if (!files.length) return;
    const results = [];
    const list = h('ul', { class: 'stack small', style: 'padding-left:18px' });
    const close = modal('Uploading contracts', h('div', { class: 'stack' }, list), { sticky: true });
    const lib = await pdfjs();
    for (const file of files) {
      const li = h('li', { text: `${file.name}: reading…` }); list.append(li);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length > 180000) throw new Error('File is larger than 180 KB and cannot be stored. Export the contract again without embedded images.');
        const sha = await ET.sha256Hex(bytes);
        const { pages } = await ET.extractPdf(lib, bytes);
        const parsed = ET.parseContract(pages);
        if (!parsed.name) throw new Error('No employee name found. Is this one of Juan’s drafted contracts?');
        const vid = sha.slice(0, 32);
        const rec = Object.values(S.employees).find((r) => ET.normName(r.name) === ET.normName(parsed.name));
        if (rec && (rec.currentVid === vid || rec.pendingVid === vid)) { li.textContent = `${file.name}: already uploaded for ${parsed.name}.`; continue; }
        li.textContent = `${file.name}: laying out in the onboarding format…`;
        const fmt = await formatDraft(lib, pages);
        if (!fmt.fidelity.ok) parsed.issues.push(fmt.fidelity.detail);
        await S.db.doc('hr/data/formatted/' + vid).set({ b64: fmt.b64, sha: fmt.sha });
        await S.db.doc('hr/data/versions/' + vid).set({ b64: ET.b64FromBytes(bytes), draftSha: sha, sha: fmt.sha, anchors: fmt.anchors, fidelity: fmt.fidelity, lines: ET.textLines(pages), parsed, fileName: file.name, uploadedAt: nowIso(), uploadedBy: S.uid });
        if (!rec) {
          const key = ET.randomId(6);
          await S.db.doc('hr/data/employees/' + key).set(Object.assign(versionFields(parsed, vid, fmt), {
            key, name: parsed.name, createdAt: nowIso(), status: 'draft', versionNo: 1, dob: '', email: '', uid: null,
            ndHoursPerMonth: parsed.hasNightDiff ? 208 : 0, deMinimis: 0, otherDeductions: [], thirteenthApplicable: !parsed.managerial,
          }));
          await logEvent({ action: 'Contract created', employeeKey: key, version: 1, detail: file.name });
          li.textContent = `${file.name}: added ${parsed.name}.` + (parsed.issues.length ? ' Needs attention: ' + parsed.issues.join(' ') : '');
        } else if (!rec.currentVid) {
          await S.db.doc('hr/data/employees/' + rec.key).update(versionFields(parsed, vid, fmt));
          li.textContent = `${file.name}: attached to ${parsed.name}.`;
        } else {
          await S.db.doc('hr/data/employees/' + rec.key).update({ pendingVid: vid });
          await logEvent({ action: 'Revised contract uploaded for review', employeeKey: rec.key, contractId: rec.contractId, version: (rec.versionNo || 1) + 1, detail: file.name });
          li.textContent = `${file.name}: revised draft for ${parsed.name}. Open the employee to review the changes before approving.`;
        }
        results.push(parsed.name);
      } catch (e) {
        li.textContent = `${file.name}: not added. ${errText(e)}`; li.style.color = 'var(--bad)';
      }
    }
    list.append(h('li', { style: 'list-style:none;margin-top:8px' }, h('button', { class: 'btn', text: 'Done', onclick: close })));
  }
  /* Juan's wording, re-typeset in the onboarding-packet layout and read back to prove nothing changed. */
  let assetsP = null;
  function formatAssets() {
    if (!assetsP) {
      assetsP = Promise.all(['assets/LiberationSans-Regular.ttf', 'assets/LiberationSans-Bold.ttf', 'assets/letterhead-banner.jpg'].map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error('Could not load ' + u);
        return new Uint8Array(await r.arrayBuffer());
      })).then(([regular, bold, banner]) => ({ regular, bold, banner }));
      assetsP.catch(() => { assetsP = null; });
    }
    return assetsP;
  }
  async function formatDraft(lib, pages) {
    if (!window.fontkit) throw new Error('The contract font engine did not load. Reload the page and try again.');
    const model = ET.structureDraft(pages);
    const expected = ET.fingerprintText(pages);
    if (ET.modelText(model) !== expected) throw new Error('The structure of this draft could not be read exactly, so it was not reformatted.');
    const out = await ET.renderPacketPdf(window.PDFLib, window.fontkit, await formatAssets(), model);
    const fidelity = await ET.verifyFormatted(lib, out.bytes, expected);
    return { b64: ET.b64FromBytes(out.bytes), sha: await ET.sha256Hex(out.bytes), anchors: out.anchors, fidelity };
  }

  /** fmt: the formatted version ({sha, anchors, fidelity}). */
  function versionFields(p, vid, fmt) {
    return { currentVid: vid, sha: fmt.sha, anchors: fmt.anchors, fidelity: fmt.fidelity, position: p.position, startDate: p.startDate, effective: p.effective, monthly: p.monthly, perCutoff: p.perCutoff, hourly: p.hourly, daily: p.daily, managerial: p.managerial, hasNightDiff: p.hasNightDiff, issues: p.issues, pendingVid: null };
  }

  /** The formatted contract that employees review and sign. */
  async function getVersionBytes(vid, sha) {
    const v = await S.db.doc('hr/data/formatted/' + vid).get();
    if (!v.exists) throw new Error('Contract file not found.');
    const bytes = ET.bytesFromB64(v.data().b64);
    if (sha && (await ET.sha256Hex(bytes)) !== sha) throw new Error('Stored contract failed its integrity check.');
    return { bytes, data: v.data() };
  }

  /** Juan's original draft, kept for comparison. */
  async function getDraftBytes(vid) {
    const v = await S.db.doc('hr/data/versions/' + vid).get();
    if (!v.exists) throw new Error('Original draft not found.');
    return ET.bytesFromB64(v.data().b64);
  }

  function payrollInputs(rec) {
    return { monthly: rec.monthly, hourly: rec.hourly, ndHoursPerMonth: rec.ndHoursPerMonth, deMinimis: rec.deMinimis, otherDeductions: rec.otherDeductions || [], thirteenthApplicable: !!rec.thirteenthApplicable, hasNightDiff: !!rec.hasNightDiff, statutory: S.cfg.statutory || ET.DEFAULT_STATUTORY };
  }

  /** Writes the employee's own copy. Only called for a record linked to a verified account. */
  async function publishToEmployee(rec) {
    if (!rec.uid || !['issued', 'returned', 'fully_signed'].includes(rec.status)) return;
    const { bytes } = await getVersionBytes(rec.currentVid, rec.sha);
    await S.db.doc(`issued/${rec.uid}/docs/source`).set({ b64: ET.b64FromBytes(bytes), sha: rec.sha, contractId: rec.contractId, version: rec.versionNo });
    if (rec.status === 'fully_signed') {
      const f = await S.db.doc('hr/data/finals/' + rec.key).get();
      if (f.exists) await S.db.doc(`issued/${rec.uid}/docs/final`).set({ b64: f.data().b64, sha: f.data().sha, contractId: rec.contractId, version: rec.versionNo });
    }
    const st = statusOf(rec);
    await S.db.doc('issued/' + rec.uid).set({
      key: rec.key, contractId: rec.contractId, version: rec.versionNo, sha: rec.sha, name: rec.name, dob: rec.dob, position: rec.position,
      startDate: rec.startDate, effective: rec.effective, monthly: rec.monthly, perCutoff: rec.perCutoff,
      status: st === 'draft' ? 'awaiting_employee' : st, issuedAt: rec.issuedAt, returnNote: rec.status === 'returned' ? (rec.returnNote || '') : '',
      payroll: payrollInputs(rec), employeeSignedAt: rec.employeeSig ? rec.employeeSig.signedAt : null,
      companySignedAt: rec.companySig ? rec.companySig.signedAt : null, finalSha: rec.finalSha || null,
    });
  }
  async function unpublishFromEmployee(uid) {
    for (const p of [`issued/${uid}/docs/final`, `issued/${uid}/docs/source`, `issued/${uid}`]) await S.db.doc(p).delete();
  }
  async function updateDirectory() {
    const names = Object.values(S.employees).filter((r) => r.status !== 'draft').map((r) => ({ key: r.key, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
    await S.db.doc('public/directory').set({ names });
  }

  async function openEmployee(key) {
    const rec = S.employees[key];
    if (!rec) return;
    const c = codes();
    const st = statusOf(rec);
    const fresh = () => S.employees[key];
    let close;
    const reopen = () => { close && close(); setTimeout(() => openEmployee(key), 0); };

    const dob = h('input', { type: 'date', id: 'f-dob', value: rec.dob || '' });
    const email = h('input', { type: 'text', id: 'f-email', value: rec.email || '', placeholder: 'name@example.com', autocomplete: 'off' });
    const codePreview = h('span', { class: 'code', text: c[key] || 'Enter the birthdate to generate' });
    dob.oninput = () => { codePreview.textContent = ET.employeeCode(rec.name, dob.value) || '—'; };
    const nd = h('input', { type: 'number', id: 'f-nd', min: 0, step: 1, value: rec.ndHoursPerMonth || 0, disabled: !rec.hasNightDiff });
    const dm = h('input', { type: 'number', id: 'f-dm', min: 0, step: 0.01, value: rec.deMinimis || 0 });
    const th = h('input', { type: 'checkbox', id: 'f-13', checked: !!rec.thirteenthApplicable });
    const others = h('textarea', { id: 'f-other', placeholder: 'One per line: label, amount\nSSS salary loan, 1200', value: (rec.otherDeductions || []).map((o) => `${o.label}, ${o.amount}`).join('\n') });
    const saveBtn = h('button', { class: 'btn', text: 'Save details' });
    saveBtn.onclick = async () => {
      const otherDeductions = others.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf(','); return { label: l.slice(0, i).trim(), amount: Number(l.slice(i + 1)) }; }).filter((o) => o.label && o.amount > 0);
      const em = email.value.trim();
      if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Enter a valid email address or leave it blank.', 'error'); return; }
      const done = busy(saveBtn, 'Saving…');
      try {
        const patch = { dob: dob.value, email: em, ndHoursPerMonth: Number(nd.value) || 0, deMinimis: Number(dm.value) || 0, thirteenthApplicable: th.checked, otherDeductions };
        await S.db.doc('hr/data/employees/' + key).update(patch);
        const r = Object.assign({}, fresh(), patch);
        if (r.uid && r.status !== 'draft') await publishToEmployee(r);
        toast('Saved.'); reopen();
      } catch (e) { done(); toast('Could not save: ' + errText(e), 'error'); }
    };

    const checks = h('ul', { class: 'stack small', style: 'padding-left:18px;margin:0' },
      (rec.issues || []).length ? rec.issues.map((t) => h('li', { class: 'check-bad', text: t })) : h('li', { class: 'check-ok', text: 'Name, salary, start date and signature fields found in the PDF.' }),
      h('li', { class: rec.fidelity && rec.fidelity.ok ? 'check-ok' : 'check-bad', text: rec.fidelity && rec.fidelity.ok ? `Wording check passed: the formatted contract contains Juan's draft character for character (${rec.fidelity.chars} characters).` : 'Wording check failed. The formatted contract cannot be issued.' }),
      h('li', { class: rec.dob ? 'check-ok' : 'check-bad', text: rec.dob ? 'Birthdate on file.' : 'Birthdate missing. Required before issuing.' }));

    const frame = h('div', { class: 'doc-frame' }, spinner('Loading contract…'));
    getVersionBytes(rec.currentVid, rec.sha).then(({ bytes }) => renderPdf(frame, bytes)).catch((e) => frame.replaceChildren(h('p', { class: 'note bad', text: errText(e) })));

    const actions = h('div', { class: 'row' });
    const blocking = !rec.anchors || !rec.monthly || !rec.name || !rec.startDate || !(rec.fidelity && rec.fidelity.ok);
    if (st === 'draft' || st === 'returned') {
      const issueBtn = h('button', { class: 'btn', text: st === 'returned' ? 'Re-issue for signature' : 'Issue for employee signature', disabled: blocking || !rec.dob || !!rec.pendingVid });
      issueBtn.onclick = async () => {
        const done = busy(issueBtn, 'Issuing…');
        try {
          const contractId = rec.contractId || `ETP-EC-${new Date().getFullYear()}-${ET.randomId(3)}`;
          const patch = { status: 'issued', contractId, issuedAt: nowIso(), returnNote: '', employeeSig: null };
          await S.db.doc('hr/data/employees/' + key).update(patch);
          const r = Object.assign({}, fresh(), patch);
          if (r.uid) {
            const e = S.esign[r.uid];
            if (e && e.correction && !e.correction.handled) await S.db.doc('esign/' + r.uid).update({ correction: Object.assign({}, e.correction, { handled: true }) });
            await publishToEmployee(r);
          }
          await updateDirectory();
          await logEvent({ action: st === 'returned' ? 'Contract re-issued after correction' : 'Contract issued for employee review and signature', contractId, version: r.versionNo, employeeKey: key });
          toast('Issued.'); reopen();
        } catch (e) { done(); toast('Could not issue: ' + errText(e), 'error'); }
      };
      actions.append(issueBtn);
      if (rec.pendingVid) actions.append(h('span', { class: 'small muted', text: 'Review the revised draft first.' }));
    }
    if (st === 'awaiting_employee' || st === 'awaiting_company') {
      const retBtn = h('button', { class: 'btn danger', text: 'Return for correction' });
      retBtn.onclick = () => {
        const ta = h('textarea', { id: 'ret-note', placeholder: 'What needs to be corrected?' });
        const ok = h('button', { class: 'btn danger', text: 'Return for correction' });
        const c2 = modal('Return for correction', h('div', { class: 'stack' }, h('p', { text: 'The employee will not be able to sign until you re-issue the contract. Any signature already given for this version is set aside.' }), h('label', { class: 'f', for: 'ret-note' }, 'Note shown to the employee', ta), h('div', { class: 'row end' }, ok)));
        ok.onclick = async () => {
          const done = busy(ok);
          try {
            await S.db.doc('hr/data/employees/' + key).update({ status: 'returned', returnNote: ta.value.trim(), employeeSig: null });
            if (rec.uid) await S.db.doc('issued/' + rec.uid).update({ status: 'returned', returnNote: ta.value.trim() });
            if (rec.uid && S.esign[rec.uid]) await S.db.doc('esign/' + rec.uid).delete();
            await logEvent({ action: 'Contract returned for correction', contractId: rec.contractId, version: rec.versionNo, employeeKey: key, detail: ta.value.trim() });
            c2(); reopen();
          } catch (e) { done(); toast(errText(e), 'error'); }
        };
      };
      actions.append(retBtn);
    }

    let diffSection = null;
    if (rec.pendingVid) {
      diffSection = h('section', { class: 'stack' }, h('h3', { text: 'Revised draft waiting for review' }), spinner('Comparing versions…'));
      Promise.all([S.db.doc('hr/data/versions/' + rec.currentVid).get(), S.db.doc('hr/data/versions/' + rec.pendingVid).get()]).then(([a, b]) => {
        const d = ET.diffLines(a.data().lines || [], b.data().lines || []);
        const changed = d.filter((x) => x.op !== '=').length;
        const np = b.data().parsed || {};
        const approve = h('button', { class: 'btn', text: 'Approve revised draft', disabled: st === 'fully_signed' || !(b.data().fidelity && b.data().fidelity.ok) });
        const discard = h('button', { class: 'btn secondary', text: 'Discard revised draft' });
        approve.onclick = async () => {
          const done = busy(approve, 'Approving…');
          try {
            const v = b.data();
            const patch = Object.assign(versionFields(v.parsed, rec.pendingVid, v), { versionNo: (rec.versionNo || 1) + 1, employeeSig: null, name: v.parsed.name || rec.name });
            if (rec.status === 'issued') { patch.status = 'returned'; patch.returnNote = 'A corrected version is being prepared.'; }
            await S.db.doc('hr/data/employees/' + key).update(patch);
            if (rec.uid && S.esign[rec.uid] && S.esign[rec.uid].signature) await S.db.doc('esign/' + rec.uid).delete();
            const r = Object.assign({}, fresh(), patch);
            if (r.uid && r.status !== 'draft') await publishToEmployee(r);
            await logEvent({ action: 'Revised contract approved by HR', contractId: rec.contractId, version: patch.versionNo, employeeKey: key, detail: `${changed} changed lines` });
            toast('Revised draft approved. Re-issue it when ready.'); reopen();
          } catch (e) { done(); toast(errText(e), 'error'); }
        };
        discard.onclick = async () => { await S.db.doc('hr/data/employees/' + key).update({ pendingVid: null }); await S.db.doc('hr/data/versions/' + rec.pendingVid).delete(); await S.db.doc('hr/data/formatted/' + rec.pendingVid).delete(); reopen(); };
        diffSection.replaceChildren(
          h('h3', { text: 'Revised draft waiting for review' }),
          h('p', { class: 'small muted', text: `${changed} line(s) differ. Removed text is struck through; added text is green. Nothing changes until you approve.` }),
          np.monthly !== rec.monthly ? h('p', { class: 'note warn', text: `Salary changes from ${ET.peso(rec.monthly)} to ${ET.peso(np.monthly)}. Confirm Juan approved this amount.` }) : null,
          (np.issues || []).length ? h('p', { class: 'note bad', text: np.issues.join(' ') }) : null,
          h('div', { class: 'diff' }, d.map((x) => h('div', { class: x.op === '+' ? 'add' : x.op === '-' ? 'del' : 'same', text: (x.op === '=' ? '  ' : x.op + ' ') + x.text }))),
          h('div', { class: 'row' }, approve, discard));
      }).catch((e) => diffSection.replaceChildren(h('p', { class: 'note bad', text: errText(e) })));
    }

    const account = rec.uid ? (await resolveProfiles([rec.uid]), personLabel(rec.uid)) : 'No Claude account linked yet. The employee links their account by selecting their name and entering their birthdate; you approve it under Access requests.';
    const unlink = rec.uid ? h('button', { class: 'btn ghost sm', text: 'Unlink account', onclick: async () => {
      await unpublishFromEmployee(rec.uid);
      await S.db.doc('hr/data/employees/' + key).update({ uid: null });
      await logEvent({ action: 'Employee account unlinked', contractId: rec.contractId, employeeKey: key });
      reopen();
    } }) : null;

    close = modal(rec.name, h('div', { class: 'stack', style: 'gap:18px' },
      h('div', { class: 'row between' }, pill(st), h('span', { class: 'small muted', text: rec.contractId ? `${rec.contractId} · version ${rec.versionNo}` : `Version ${rec.versionNo || 1} (not issued)` })),
      rec.status === 'returned' && rec.returnNote ? h('p', { class: 'note warn', text: 'Returned: ' + rec.returnNote }) : null,
      h('section', { class: 'stack' }, h('h3', { text: 'Terms from Juan’s approved contract' }),
        h('p', { class: 'small muted', text: 'Read from the PDF. To change any of these, upload a revised PDF from Juan; you will see the differences before approving.' }),
        factsFromRec(rec)),
      h('section', { class: 'stack' }, h('h3', { text: 'Checks' }), checks),
      diffSection,
      h('section', { class: 'stack' }, h('h3', { text: 'Employee details (HR only)' }),
        h('div', { class: 'grid2' },
          h('label', { class: 'f', for: 'f-dob' }, 'Date of birth', dob),
          h('label', { class: 'f', for: 'f-email' }, 'Work or personal email', h('span', { class: 'h', text: 'Optional. Checked against the requesting Claude account when Claude shares account emails with this page.' }), email)),
        h('p', { class: 'small' }, 'Internal employee code: ', codePreview, h('span', { class: 'muted', text: ' (HR only; never shown to employees)' })),
        h('p', { class: 'small' }, h('strong', { text: 'Linked account: ' }), account, ' ', unlink)),
      h('section', { class: 'stack' }, h('h3', { text: 'Payroll explanation settings' }),
        h('p', { class: 'small muted', text: 'These only change the informational pay estimate. They never change the contract.' }),
        h('div', { class: 'grid2' },
          h('label', { class: 'f', for: 'f-nd' }, 'Estimated night-shift hours per month', h('span', { class: 'h', text: rec.hasNightDiff ? 'Hours between 10 PM and 6 AM. 208 = 8 hours × 26 days.' : 'This contract has no night differential.' }), nd),
          h('label', { class: 'f', for: 'f-dm' }, 'Qualifying de minimis benefits per month', h('span', { class: 'h', text: 'Leave at 0 unless Juan approved one in writing.' }), dm)),
        h('label', { class: 'f', for: 'f-other' }, 'Other authorized deductions', others),
        h('label', { class: 'check', for: 'f-13' }, th, h('span', { text: 'Show 13th-month pay as a statutory benefit (rank-and-file employees)' })),
        h('div', { class: 'row end' }, saveBtn)),
      h('details', {}, h('summary', { text: 'Preview the employee’s pay explanation' }), h('div', { style: 'margin-top:10px' }, payrollView(payrollInputs(rec)))),
      h('section', { class: 'stack' },
        h('div', { class: 'row between' }, h('h3', { text: 'Contract preview (onboarding format)' }),
          h('button', { class: 'btn ghost sm', text: 'View Juan’s original draft', onclick: async () => { try { modal('Juan’s original draft', docFrame(await getDraftBytes(rec.currentVid)), { wide: true }); } catch (e) { toast(errText(e), 'error'); } } })),
        frame),
      actions), { wide: true });
  }
  function factsFromRec(rec) {
    const f = (k, v) => h('div', {}, h('dt', { text: k }), h('dd', { text: v || '—' }));
    return h('dl', { class: 'facts' }, f('Position', rec.position), f('Start date', rec.startDate), f('Effective cut-off', rec.effective), f('Monthly salary', ET.peso(rec.monthly)), f('Per cut-off', ET.peso(rec.perCutoff)), f('Hourly rate', rec.hourly ? ET.peso(rec.hourly) : 'Not stated'));
  }

  function hrAccess() {
    const entries = Object.entries(S.claims).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
    const unknown = entries.map(([u]) => u).filter((u) => !S.profiles[u]);
    if (unknown.length) resolveProfiles(unknown).then(() => { if (H.tab === 'access') renderHr(); });
    const byUid = {}; Object.values(S.employees).forEach((r) => { if (r.uid) byUid[r.uid] = r; });
    const verify = (uid, c) => {
      const rec = S.employees[c.key];
      if (!rec) return { ok: false, reasons: ['Record no longer exists'] };
      const p = S.profiles[uid] || {};
      const reasons = [];
      const dobOk = !!rec.dob && rec.dob === c.dob;
      reasons.push(dobOk ? '✓ Birthdate matches' : rec.dob ? '✗ Birthdate does not match' : '✗ No birthdate on file');
      let emailOk = true;
      if (rec.email && p.email) { emailOk = p.email.toLowerCase() === rec.email.toLowerCase(); reasons.push(emailOk ? '✓ Email matches' : '✗ Account email differs from email on file'); }
      reasons.push(p.name ? `• Claude account name: ${p.name}. Confirm it is this employee.` : '• Account name not available. Confirm with the employee before approving.');
      if (rec.uid && rec.uid !== uid) reasons.push('✗ Record is already linked to another account');
      if (byUid[uid] && byUid[uid].key !== rec.key) reasons.push('✗ This account is linked to another employee');
      return { rec, ok: dobOk && emailOk && !(rec.uid && rec.uid !== uid) && !(byUid[uid] && byUid[uid].key !== rec.key), reasons };
    };
    async function grant(uid, c) {
      const rec = S.employees[c.key];
      await S.db.doc('hr/data/employees/' + rec.key).update({ uid, linkedAt: nowIso() });
      await S.db.doc('claims/' + uid).update({ status: 'approved', decidedAt: nowIso() });
      const r = Object.assign({}, rec, { uid });
      if (r.status !== 'draft') await publishToEmployee(r);
      await logEvent({ action: 'Contract assigned to verified employee account', contractId: rec.contractId, version: rec.versionNo, employeeKey: rec.key });
    }
    const pending = entries.filter(([, c]) => c.status === 'pending');
    const verifiedPending = pending.filter(([u, c]) => c.kind === 'employee' && verify(u, c).ok);
    const grantAll = h('button', { class: 'btn', text: `Approve all verified (${verifiedPending.length})`, disabled: !verifiedPending.length });
    grantAll.onclick = async () => { const done = busy(grantAll); for (const [u, c] of verifiedPending) { try { await grant(u, c); } catch (e) { toast(errText(e), 'error'); } } done(); toast('Approved.'); };
    const rows = entries.map(([uid, c]) => {
      const actions = h('div', { class: 'row' });
      let detail;
      if (c.kind === 'signatory') {
        detail = h('span', { text: 'Requests the company signatory role (Juan Diaz)' });
        if (c.status === 'pending') {
          actions.append(h('button', { class: 'btn sm', text: 'Designate as signatory', onclick: async (e) => {
            const done = busy(e.target);
            try {
              await S.db.doc('hr/config').set(Object.assign({}, S.cfg, { signatoryUid: uid, signatoryAt: nowIso() }));
              await S.db.doc('claims/' + uid).update({ status: 'approved', decidedAt: nowIso() });
              await logEvent({ action: 'Company signatory designated', detail: personLabel(uid) });
            } catch (er) { done(); toast(errText(er), 'error'); }
          } }));
        }
      } else {
        const v = verify(uid, c);
        detail = h('div', { class: 'stack', style: 'gap:2px' }, h('span', {}, 'Requests the record of ', h('strong', { text: v.rec ? v.rec.name : 'unknown' })), v.reasons.map((t) => h('span', { class: 'small ' + (t.startsWith('✓') ? 'check-ok' : t.startsWith('✗') ? 'check-bad' : 'muted'), text: t })));
        if (c.status === 'pending') {
          actions.append(h('button', { class: 'btn sm', text: 'Approve', disabled: !v.rec || (v.rec.uid && v.rec.uid !== uid), onclick: async (e) => { const done = busy(e.target); try { await grant(uid, c); } catch (er) { done(); toast(errText(er), 'error'); } } }));
        }
      }
      if (c.status === 'pending') actions.append(h('button', { class: 'btn danger sm', text: 'Reject', onclick: async () => { await S.db.doc('claims/' + uid).update({ status: 'rejected', decidedAt: nowIso() }); await logEvent({ action: 'Access request rejected', employeeKey: c.key || null, outcome: 'info' }); } }));
      return h('tr', {},
        h('td', {}, h('span', { 'data-person': uid, text: personLabel(uid) }), h('div', { class: 'small muted', text: c.at ? ET.phDateTime(c.at) : '' })),
        h('td', {}, detail),
        h('td', { text: c.status }),
        h('td', {}, actions));
    });
    return h('div', { class: 'stack', style: 'gap:14px' },
      h('p', { class: 'lede', text: 'Each request comes from a signed-in Claude account. Approving links that account to the employee record, and only that account can then open the contract and pay details. Approve only when the birthdate matches and you recognise the person.' }),
      h('div', { class: 'row' }, grantAll),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Claude account', 'Request', 'Status', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: 4, class: 'muted', text: 'No access requests yet.' }))))));
  }

  function statusBoard(recs, onPick, current) {
    const order = ['awaiting_employee', 'awaiting_company', 'fully_signed', 'returned'];
    return h('div', { class: 'stats' }, order.map((k) => h('button', { class: 'stat', 'aria-pressed': String(current === k), onclick: () => onPick(current === k ? 'all' : k) },
      h('span', { class: 'pill s-' + k, text: STATUS[k] }), h('b', { text: recs.filter((r) => statusOf(r) === k).length }))));
  }

  function hrSigning() {
    const recs = Object.values(S.employees).filter((r) => r.status !== 'draft');
    const c = codes();
    const shown = recs.filter((r) => (H.statusFilter === 'all' || statusOf(r) === H.statusFilter) && matches(r, c[r.key])).sort((a, b) => a.name.localeCompare(b.name));
    return h('div', { class: 'stack', style: 'gap:14px' },
      statusBoard(recs, (k) => { H.statusFilter = k; renderHr(); }, H.statusFilter),
      searchBox('sign-search', 'Search by name, code or status'),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Employee', 'Code', 'Contract', 'Status', 'Employee signed', 'Juan signed'].map((t) => h('th', { text: t })))),
        h('tbody', {}, shown.length ? shown.map((r) => h('tr', {},
          h('td', { text: r.name }), h('td', { class: 'code', text: c[r.key] || '—' }), h('td', { class: 'code', text: `${r.contractId || '—'} v${r.versionNo}` }), h('td', {}, pill(statusOf(r))),
          h('td', { class: 'small', text: (r.employeeSig && r.employeeSig.sha === r.sha) ? ET.phDateTime(r.employeeSig.signedAt) : (sigFor(r) ? ET.phDateTime(sigFor(r).signedAt) : '—') }),
          h('td', { class: 'small', text: r.companySig ? ET.phDateTime(r.companySig.signedAt) : '—' }))) : h('tr', {}, h('td', { colspan: 6, class: 'muted', text: 'Nothing here.' }))))),
      h('p', { class: 'small muted', text: 'Juan signs from his own view of this page, signed in with his own Claude account. HR cannot sign for him.' }));
  }

  async function getFinal(rec) {
    const f = await S.db.doc('hr/data/finals/' + rec.key).get();
    if (!f.exists) throw new Error('Signed PDF not found for ' + rec.name);
    const bytes = ET.bytesFromB64(f.data().b64);
    if ((await ET.sha256Hex(bytes)) !== rec.finalSha) throw new Error('Signed PDF for ' + rec.name + ' failed its integrity check.');
    return { bytes, b64: f.data().b64 };
  }
  async function saveToDrive(rec, fileName) {
    if (!S.cfg.driveFolderId) throw new Error('Set the HR Contracts Google Drive folder in Settings first.');
    const mcp = await window.claude.use('mcp');
    if (!mcp) throw new Error('Google Drive is not available in this view.');
    const { b64 } = await getFinal(rec);
    const res = await mcp.callTool('Google Drive', 'create_file', { title: fileName, base64Content: b64, contentMimeType: 'application/pdf', disableConversionToGoogleType: true, parentId: S.cfg.driveFolderId }, { cache: false });
    const id = res && res.payload && (res.payload.id || (res.payload.file && res.payload.file.id));
    await S.db.doc('hr/data/employees/' + rec.key).update({ driveFileId: id || 'saved', driveSavedAt: nowIso() });
    await logEvent({ action: 'HR copy saved to Google Drive', contractId: rec.contractId, version: rec.versionNo, employeeKey: rec.key, detail: fileName });
  }

  function hrCompleted() {
    const c = codes();
    const recs = Object.values(S.employees).filter((r) => statusOf(r) === 'fully_signed' && matches(r, c[r.key])).sort((a, b) => a.name.localeCompare(b.name));
    const fname = (r) => ET.hrFileName(c[r.key] || r.key, r.name, r.fullySignedAt);
    const zipBtn = h('button', { class: 'btn', text: `Download all as ZIP (${recs.length})`, disabled: !recs.length });
    zipBtn.onclick = async () => {
      const done = busy(zipBtn, 'Building ZIP…');
      try {
        const zip = new window.JSZip();
        for (const r of recs) zip.file(fname(r), (await getFinal(r)).bytes);
        const blob = await zip.generateAsync({ type: 'blob' });
        if (await saveFile(`EquityTrack_EmploymentContracts_${ET.phYMD(nowIso())}.zip`, blob)) await logEvent({ action: 'HR batch ZIP exported', detail: `${recs.length} contracts` });
      } catch (e) { toast(errText(e), 'error'); }
      done();
    };
    const driveAll = h('button', { class: 'btn secondary', text: 'Save all to Google Drive', disabled: !recs.length });
    driveAll.onclick = async () => {
      const done = busy(driveAll, 'Saving…');
      let ok = 0; const failed = [];
      for (const r of recs) { try { await saveToDrive(r, fname(r)); ok++; } catch (e) { failed.push(`${r.name}: ${errText(e)}`); } }
      done();
      if (failed.length) modal('Google Drive results', h('div', { class: 'stack' }, h('p', { text: `${ok} saved. ${failed.length} not saved:` }), h('ul', {}, failed.map((t) => h('li', { class: 'check-bad', text: t })))));
      else toast(`${ok} contracts saved to Google Drive.`);
    };
    return h('div', { class: 'stack', style: 'gap:14px' },
      h('p', { class: 'lede', text: 'Fully signed contracts are stored in this artifact’s database with a SHA-256 fingerprint and stay available here. Download copies or save them to the HR Contracts folder in Google Drive.' }),
      h('div', { class: 'row' }, zipBtn, driveAll, h('div', { style: 'flex:1;min-width:220px' }, searchBox('done-search', 'Search by code, name or status'))),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['File', 'Fully signed', 'Drive', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, recs.length ? recs.map((r) => h('tr', {},
          h('td', {}, h('div', { class: 'code', text: fname(r) }), h('div', { class: 'small muted', text: `${r.contractId} v${r.versionNo}` })),
          h('td', { class: 'small', text: ET.phDateTime(r.fullySignedAt) }),
          h('td', { class: 'small', text: r.driveSavedAt ? 'Saved ' + ET.phDateTime(r.driveSavedAt) : '—' }),
          h('td', {}, h('div', { class: 'row' },
            h('button', { class: 'btn secondary sm', text: 'View', onclick: async () => { try { modal(r.name, docFrame((await getFinal(r)).bytes), { wide: true }); } catch (e) { toast(errText(e), 'error'); } } }),
            h('button', { class: 'btn secondary sm', text: 'Download', onclick: async () => { try { if (await saveFile(fname(r), new Blob([(await getFinal(r)).bytes]))) await logEvent({ action: 'HR copy downloaded', contractId: r.contractId, version: r.versionNo, employeeKey: r.key }); } catch (e) { toast(errText(e), 'error'); } } }),
            h('button', { class: 'btn secondary sm', text: 'Save to Drive', onclick: async (e) => { const done = busy(e.target, 'Saving…'); try { await saveToDrive(r, fname(r)); toast('Saved to Google Drive.'); } catch (er) { done(); toast(errText(er), 'error'); } } }))))) :
          h('tr', {}, h('td', { colspan: 4, class: 'muted', text: 'No fully signed contracts yet.' }))))));
  }

  function hrActivity() {
    const box = h('div', { class: 'stack' }, spinner('Loading activity…'));
    (async () => {
      const q = await S.db.collection('activity').get();
      const events = [];
      q.docs.forEach((d) => (d.data().events || []).forEach((e) => events.push(Object.assign({ docUid: d.id }, e))));
      events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      await resolveProfiles([...new Set(events.map((e) => e.actorUid))]);
      const c = codes();
      const empName = (k) => (S.employees[k] ? S.employees[k].name : '');
      const roleLabel = { hr: 'HR', signatory: 'Juan Diaz (signatory)', employee: 'Employee', admin: 'Editor' };
      const rows = events.map((e) => [ET.phDateTime(e.at), `${roleLabel[e.role] || e.role}: ${personLabel(e.actorUid)}`, e.action, empName(e.employeeKey) || (e.employeeKey ? e.employeeKey : ''), e.employeeKey ? (c[e.employeeKey] || '') : '', e.contractId || '', e.version || '', e.outcome || '', e.detail || '']);
      const exp = h('button', { class: 'btn', text: 'Export activity (CSV)', onclick: async () => {
        const csv = ET.csv([['Date and time (PHT)', 'Actor', 'Action', 'Employee', 'Employee code', 'Contract ID', 'Version', 'Outcome', 'Detail'], ...rows]);
        if (await saveFile(`EquityTrack_ContractActivity_${ET.phYMD(nowIso())}.csv`, csv)) logEvent({ action: 'Activity history exported' });
      } });
      box.replaceChildren(h('div', { class: 'row between' }, h('p', { class: 'small muted', text: `${events.length} events. Times are Philippine time as recorded by each signer’s device.` }), exp),
        h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Actor', 'Action', 'Employee', 'Contract', 'Outcome'].map((t) => h('th', { text: t })))),
          h('tbody', {}, rows.slice(0, 500).map((r) => h('tr', {}, h('td', { class: 'small', text: r[0] }), h('td', { class: 'small', text: r[1] }), h('td', {}, r[2], r[8] ? h('div', { class: 'small muted', text: r[8] }) : null), h('td', { class: 'small', text: r[3] }), h('td', { class: 'code', text: r[5] ? `${r[5]} v${r[6]}` : '' }), h('td', { class: 'small', text: r[7] })))))));
    })().catch((e) => box.replaceChildren(h('p', { class: 'note bad', text: errText(e) })));
    return box;
  }

  function hrSettings() {
    const st = S.cfg.statutory || ET.DEFAULT_STATUTORY;
    const folder = h('input', { type: 'text', id: 's-folder', value: S.cfg.driveFolderId || '', placeholder: 'Paste the folder link or ID' });
    const fields = [
      ['sss.employeeRate', 'SSS employee rate', st.sss.employeeRate], ['sss.mscMin', 'SSS minimum salary credit', st.sss.mscMin], ['sss.mscMax', 'SSS maximum salary credit', st.sss.mscMax],
      ['philhealth.rate', 'PhilHealth premium rate (total)', st.philhealth.rate], ['philhealth.floor', 'PhilHealth salary floor', st.philhealth.floor], ['philhealth.ceiling', 'PhilHealth salary ceiling', st.philhealth.ceiling],
      ['pagibig.rate', 'Pag-IBIG employee rate', st.pagibig.rate], ['pagibig.maxFundSalary', 'Pag-IBIG maximum fund salary', st.pagibig.maxFundSalary],
      ['ndRate', 'Night differential rate', st.ndRate], ['workDaysPerYear', 'Working days per year (daily-rate divisor)', st.workDaysPerYear], ['thirteenthExemptCap', '13th-month and benefits tax-exempt cap', st.thirteenthExemptCap],
    ].map(([path, label, val]) => ({ path, input: h('input', { type: 'number', step: 'any', id: 's-' + path.replace('.', '-'), value: val }), label }));
    const taxTa = h('textarea', { id: 's-tax', style: 'font-family:var(--mono);min-height:150px', value: st.tax.map((r) => `${r.over}, ${r.base}, ${r.rate}`).join('\n') });
    const save = h('button', { class: 'btn', text: 'Save settings' });
    save.onclick = async () => {
      const ns = JSON.parse(JSON.stringify(st));
      for (const f of fields) { const v = Number(f.input.value); if (!isFinite(v) || v < 0) { toast(`${f.label} must be a number.`, 'error'); return; } const [a, b] = f.path.split('.'); if (b) ns[a][b] = v; else ns[a] = v; }
      try { ns.tax = taxTa.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [over, base, rate] = l.split(',').map(Number); if (![over, base, rate].every(isFinite)) throw 0; return { over, base, rate }; }); }
      catch (_) { toast('Each tax row must read: over, base tax, rate', 'error'); return; }
      const m = folder.value.match(/folders\/([A-Za-z0-9_-]+)/);
      const done = busy(save, 'Saving…');
      try {
        await S.db.doc('hr/config').set(Object.assign({}, S.cfg, { statutory: ns, driveFolderId: m ? m[1] : folder.value.trim() }));
        for (const r of Object.values(S.employees)) if (r.uid && r.status !== 'draft') await S.db.doc('issued/' + r.uid).update({ payroll: Object.assign(payrollInputs(r), { statutory: ns }) });
        await logEvent({ action: 'Settings updated', outcome: 'info' });
        toast('Settings saved.');
      } catch (e) { toast(errText(e), 'error'); }
      done();
    };
    resolveProfiles([S.cfg.signatoryUid]).then(() => { const el = document.getElementById('sig-who'); if (el) el.textContent = S.cfg.signatoryUid ? personLabel(S.cfg.signatoryUid) : 'Not designated'; });
    return h('div', { class: 'stack', style: 'gap:16px' },
      h('section', { class: 'panel' }, h('h3', { text: 'Company signatory' }),
        h('p', {}, 'Designated account: ', h('strong', { id: 'sig-who', text: S.cfg.signatoryUid ? personLabel(S.cfg.signatoryUid) : 'Not designated' })),
        S.cfg.signatoryUid ? h('div', { class: 'row' }, h('button', { class: 'btn danger sm', text: 'Remove designation', onclick: async () => { const n = Object.assign({}, S.cfg); delete n.signatoryUid; await S.db.doc('hr/config').set(n); await logEvent({ action: 'Company signatory designation removed' }); } })) : null),
      h('section', { class: 'panel' }, h('h3', { text: 'HR Contracts folder (Google Drive)' }),
        h('label', { class: 'f', for: 's-folder' }, 'Folder link or ID', h('span', { class: 'h', text: 'Signed PDFs are uploaded here with your own Google Drive connection when you choose Save to Drive.' }), folder)),
      h('section', { class: 'panel' }, h('h3', { text: 'Payroll assumptions' }),
        h('p', { class: 'small muted', text: 'Used only for the employee pay explanation. Rates are decimals (0.05 = 5%). Check them against current SSS, PhilHealth, Pag-IBIG and BIR issuances.' }),
        h('div', { class: 'grid2' }, fields.map((f) => h('label', { class: 'f', for: f.input.id }, f.label, f.input))),
        h('label', { class: 'f', for: 's-tax' }, 'Monthly withholding tax table', h('span', { class: 'h', text: 'One row per bracket: taxable pay over, base tax, rate on the excess.' }), taxTa)),
      h('div', { class: 'row end' }, save));
  }

  /* ---------------- Juan / company signatory ---------------- */
  const J = { filter: 'awaiting_company', selected: new Set() };

  function juanMain() {
    S.role = 'signatory';
    mount(spinner('Loading contracts…'));
    subscribeAdminData(() => { if (!J.busy) renderJuan(); });
  }

  function renderJuan() {
    const recs = Object.values(S.employees).filter((r) => r.status !== 'draft');
    for (const k of [...J.selected]) if (!S.employees[k] || statusOf(S.employees[k]) !== 'awaiting_company') J.selected.delete(k);
    const shown = recs.filter((r) => J.filter === 'all' || statusOf(r) === J.filter).sort((a, b) => a.name.localeCompare(b.name));
    const pendingShown = shown.filter((r) => statusOf(r) === 'awaiting_company');
    const allBox = h('input', { type: 'checkbox', id: 'sel-all', 'aria-label': 'Select all pending', checked: pendingShown.length > 0 && pendingShown.every((r) => J.selected.has(r.key)), onchange: (e) => { pendingShown.forEach((r) => e.target.checked ? J.selected.add(r.key) : J.selected.delete(r.key)); renderJuan(); } });
    const signBtn = h('button', { class: 'btn big', text: `Review and Sign Selected Contracts (${J.selected.size})`, disabled: !J.selected.size, onclick: batchReview });
    mount(h('div', { class: 'stack', style: 'gap:18px' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'Authorized company signatory' }), h('h1', { class: 'title', text: 'Contracts waiting for your signature' }),
        h('p', { class: 'lede', text: 'Employees have signed the contracts below. Select the ones you have reviewed, then sign them together in one step.' })),
      statusBoard(recs, (k) => { J.filter = k; renderJuan(); }, J.filter),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, allBox), ['Employee', 'Position', 'Monthly salary', 'Contract', 'Employee signed', 'Status', ''].map((t, i) => h('th', { class: i === 2 ? 'num' : '', text: t })))),
        h('tbody', {}, shown.length ? shown.map((r) => {
          const st = statusOf(r);
          const sig = (r.employeeSig && r.employeeSig.sha === r.sha) ? r.employeeSig : sigFor(r);
          return h('tr', {},
            h('td', {}, st === 'awaiting_company' ? h('input', { type: 'checkbox', 'aria-label': 'Select ' + r.name, checked: J.selected.has(r.key), onchange: (e) => { e.target.checked ? J.selected.add(r.key) : J.selected.delete(r.key); renderJuan(); } }) : null),
            h('td', {}, h('strong', { text: r.name })), h('td', { class: 'small', text: r.position }), h('td', { class: 'num', text: ET.peso(r.monthly) }),
            h('td', { class: 'code', text: `${r.contractId} v${r.versionNo}` }), h('td', { class: 'small', text: sig ? ET.phDateTime(sig.signedAt) : '—' }), h('td', {}, pill(st)),
            h('td', {}, h('button', { class: 'btn secondary sm', text: 'Preview', onclick: () => previewForJuan(r) })));
        }) : h('tr', {}, h('td', { colspan: 8, class: 'muted', text: J.filter === 'awaiting_company' ? 'No contracts are waiting for your signature.' : 'Nothing here.' }))))),
      h('div', { class: 'row end' }, signBtn)));
  }

  async function previewForJuan(r) {
    const sig = (r.employeeSig && r.employeeSig.sha === r.sha) ? r.employeeSig : sigFor(r);
    const frame = h('div', { class: 'doc-frame' }, spinner('Loading…'));
    modal(`${r.name} — ${r.contractId} v${r.versionNo}`, h('div', { class: 'stack' }, factsFromRec(r),
      sig ? h('div', { class: 'stack' }, h('span', { class: 'small muted', text: `Employee signature (${sig.method}), ${ET.phDateTime(sig.signedAt)}` }), h('div', { class: 'sig-preview' }, h('img', { src: 'data:image/png;base64,' + sig.sigPng, alt: 'Employee signature' }))) : null,
      frame), { wide: true });
    try { renderPdf(frame, (await getVersionBytes(r.currentVid, r.sha)).bytes); } catch (e) { frame.replaceChildren(h('p', { class: 'note bad', text: errText(e) })); }
  }

  function batchReview() {
    const list = [...J.selected].map((k) => S.employees[k]).filter(Boolean).map((r) => ({ key: r.key, name: r.name, contractId: r.contractId, version: r.versionNo, sha: r.sha, position: r.position }));
    if (!list.length) return;
    J.busy = true;
    const pad = signaturePad('Juan Diaz');
    const preview = h('div', { class: 'sig-preview' }, h('span', { class: 'muted small', text: 'Your signature preview appears here.' }));
    const nameConfirm = h('input', { type: 'text', id: 'juan-name', autocomplete: 'off', placeholder: 'Juan Diaz' });
    const consent = h('input', { type: 'checkbox', id: 'juan-consent' });
    const consentTxt = `I, Juan Diaz, Chief Executive Officer and authorized signatory of Equity Track Inc. Philippines, have reviewed the ${list.length} employment contract(s) listed above. I authorize and apply my electronic signature to each of them, on the exact versions listed, on behalf of the Company, under the Electronic Commerce Act of 2000 (Republic Act No. 8792).`;
    const go = h('button', { class: 'btn big', text: `Sign ${list.length} Contract${list.length > 1 ? 's' : ''}`, disabled: true });
    let captured = null;
    const refresh = () => { go.disabled = !(captured && consent.checked && ET.normName(nameConfirm.value) === 'juan diaz'); };
    consent.onchange = refresh; nameConfirm.oninput = refresh;
    const prevBtn = h('button', { class: 'btn secondary', text: 'Preview signature', onclick: async () => { captured = await pad.capture(); preview.replaceChildren(captured ? h('img', { src: captured.dataUrl, alt: 'Signature preview' }) : h('span', { class: 'muted small', text: 'Nothing to preview yet.' })); refresh(); } });
    const body = h('div', { class: 'stack', style: 'gap:16px' },
      h('p', { class: 'note info', text: `Signed in as ${[S.me.name, S.me.email].filter(Boolean).join(' · ') || 'your Claude account'}, the account HR designated as the company signatory.` }),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Employee', 'Contract', 'Version', 'Document fingerprint (SHA-256)'].map((t) => h('th', { text: t })))),
        h('tbody', {}, list.map((r) => h('tr', {}, h('td', { text: r.name }), h('td', { class: 'code', text: r.contractId }), h('td', { text: 'v' + r.version }), h('td', { class: 'code', text: r.sha.slice(0, 24) + '…' })))))),
      h('h3', { text: 'Your signature' }), pad.el, h('div', { class: 'row' }, prevBtn), preview,
      h('label', { class: 'f', for: 'juan-name' }, 'Type your full name to confirm it is you', nameConfirm),
      h('label', { class: 'check', for: 'juan-consent' }, consent, h('span', { text: consentTxt })),
      h('div', { class: 'row end' }, go));
    const close = modal('Review and sign selected contracts', body, { wide: true, sticky: true, onClose: () => { J.busy = false; renderJuan(); } });
    go.onclick = async () => {
      go.disabled = true;
      const batchId = 'B' + Date.now().toString(36).toUpperCase() + ET.randomId(2);
      const authorizedAt = nowIso();
      const progress = h('ul', { class: 'stack small', style: 'padding-left:18px' });
      body.replaceChildren(h('p', { text: 'Signing… keep this window open.' }), progress);
      const batchRef = S.db.doc(`signatory/${S.uid}/batches/${batchId}`);
      try {
        await batchRef.set({ batchId, authorizedAt, consentText: consentTxt, typedName: nameConfirm.value.trim(), items: list.map((r) => ({ contractId: r.contractId, version: r.version, sha: r.sha, key: r.key })), sigMethod: captured.method });
        await logEvent({ action: 'Juan approved the batch', detail: `${batchId}: ${list.length} contracts` });
      } catch (e) {
        body.replaceChildren(h('p', { class: 'note bad', text: 'The batch authorization could not be recorded, so nothing was signed: ' + errText(e) }), h('div', { class: 'row end' }, h('button', { class: 'btn', text: 'Close', onclick: close })));
        return;
      }
      const results = [];
      for (const item of list) {
        const li = h('li', { text: `${item.name}: signing…` }); progress.append(li);
        try {
          await signOne(item, captured, batchId, consentTxt);
          li.textContent = `${item.name}: fully signed.`; li.className = 'check-ok';
          results.push({ contractId: item.contractId, ok: true });
        } catch (e) {
          li.textContent = `${item.name} (${item.contractId}): NOT signed. ${errText(e)}`; li.className = 'check-bad';
          results.push({ contractId: item.contractId, ok: false, error: errText(e) });
          await logEvent({ action: 'Juan signed', contractId: item.contractId, version: item.version, employeeKey: item.key, outcome: 'failed', detail: errText(e) });
        }
      }
      try { await batchRef.update({ results, completedAt: nowIso() }); } catch (_) { /* results are also in the activity history */ }
      J.selected.clear();
      const okN = results.filter((r) => r.ok).length;
      body.replaceChildren(
        h('p', { class: okN === results.length ? 'note ok' : 'note warn', text: `${okN} of ${results.length} contracts fully signed.` + (okN < results.length ? ' The contracts marked NOT signed keep their status; fix the reason shown and sign them again.' : '') }),
        progress, h('div', { class: 'row end' }, h('button', { class: 'btn', text: 'Done', onclick: close })));
    };
  }

  async function signOne(item, juanSig, batchId, consentTxt) {
    const snap = await S.db.doc('hr/data/employees/' + item.key).get();
    if (!snap.exists) throw new Error('Record not found.');
    const r = snap.data();
    if (r.sha !== item.sha || r.versionNo !== item.version) throw new Error('The contract changed after you reviewed it.');
    if (statusOf(r) !== 'awaiting_company') throw new Error('It is no longer waiting for your signature (status: ' + STATUS[statusOf(r)] + ').');
    const empSig = (r.employeeSig && r.employeeSig.sha === r.sha) ? r.employeeSig : sigFor(r);
    if (!empSig) throw new Error('The employee signature for this version is missing.');
    if (!r.uid) throw new Error('No employee account is linked.');
    const { bytes } = await getVersionBytes(r.currentVid, r.sha);
    const signedAt = nowIso();
    const finalBytes = await ET.buildFinalPdf(window.PDFLib, {
      sourceBytes: bytes, anchors: r.anchors, ref: r.contractId, version: r.versionNo, sourceSha: r.sha,
      employee: { name: r.name, sigPng: ET.bytesFromB64(empSig.sigPng), signedAt: empSig.signedAt },
      company: { name: 'Juan Diaz', sigPng: ET.bytesFromB64(juanSig.b64), signedAt },
    });
    const finalSha = await ET.sha256Hex(finalBytes);
    const b64 = ET.b64FromBytes(finalBytes);
    if (b64.length > 250000) throw new Error('The signed PDF is too large to store. Use a simpler signature and try again.');
    const companySig = { signedAt, signerUid: S.uid, batchId, method: juanSig.method, sigPng: juanSig.b64, consentText: consentTxt };
    await S.db.doc('hr/data/finals/' + r.key).set({ b64, sha: finalSha, contractId: r.contractId, version: r.versionNo, createdAt: signedAt });
    await S.db.doc(`issued/${r.uid}/docs/final`).set({ b64, sha: finalSha, contractId: r.contractId, version: r.versionNo });
    await S.db.doc('hr/data/employees/' + r.key).update({ status: 'fully_signed', employeeSig: empSig, companySig, finalSha, fullySignedAt: signedAt });
    await S.db.doc('issued/' + r.uid).update({ status: 'fully_signed', companySignedAt: signedAt, employeeSignedAt: empSig.signedAt, finalSha });
    await logEvent({ action: 'Juan signed', contractId: r.contractId, version: r.versionNo, employeeKey: r.key, detail: batchId });
    await logEvent({ action: 'Final PDF generated', contractId: r.contractId, version: r.versionNo, employeeKey: r.key, detail: 'SHA-256 ' + finalSha.slice(0, 16) });
  }

  /* ---------------- Editors who are not the designated signatory ---------------- */
  function signatoryRequest() {
    S.role = 'admin';
    const render = (claim) => mount(h('div', { class: 'narrow' }, h('section', { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'Company signatory' }),
      h('h1', { class: 'title', text: 'This account is not the designated signatory' }),
      h('p', { class: 'lede', text: 'Only the Claude account HR designates for Juan Diaz can sign for the Company. If you are Juan, request the role and HR will confirm it.' }),
      claim && claim.status === 'pending' ? h('p', { class: 'note info', text: 'Request sent. This page opens your signing dashboard once HR approves it.' })
        : h('div', { class: 'row' }, h('button', { class: 'btn', text: 'Request signatory role', onclick: async () => { await S.db.doc('claims/' + S.uid).set({ kind: 'signatory', at: nowIso(), status: 'pending' }); await logEvent({ action: 'Signatory role requested', outcome: 'info' }); } })))));
    S.db.doc('claims/' + S.uid).onSnapshot((s) => render(s.exists ? s.data() : null));
    S.db.doc('hr/config').onSnapshot((s) => { const c = s.exists ? s.data() : {}; if (c.signatoryUid === S.uid) location.reload(); });
  }

  function blocked(title, text) {
    return h('div', { class: 'narrow' }, h('section', { class: 'panel' }, h('h1', { class: 'title', text: title }), h('p', { class: 'lede', text })));
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    if (!window.claude || !window.claude.use) { mount(blocked('Open this page in Claude', 'Sign in to Claude and open the link HR sent you. Your contract is only available to your own signed-in account.')); return; }
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) { mount(blocked('Sign in to continue', 'Sign in to Claude with the account HR invited, then reload this page.')); return; }
    S.db = db; S.user = user;
    S.me = await user.me();
    S.uid = S.me.id;
    if (!S.uid) { mount(blocked('Sign in to continue', 'This page needs a signed-in Claude account that HR has invited.')); return; }
    const who = document.getElementById('who');
    const roleChip = (t) => who.replaceChildren(h('span', { text: S.me.name || '' }), h('span', { class: 'chip', text: t }));
    if (S.me.isOwner) { roleChip('HR'); return hrMain(); }
    if (S.me.canEdit) {
      const c = await db.doc('hr/config').get();
      S.cfg = c.exists ? c.data() : {};
      if (S.cfg.signatoryUid === S.uid) { roleChip('Company signatory'); return juanMain(); }
      roleChip('Editor');
      return signatoryRequest();
    }
    roleChip('Employee');
    return employeeMain();
  }
  boot().catch((e) => mount(blocked('Something went wrong', errText(e))));
})();
