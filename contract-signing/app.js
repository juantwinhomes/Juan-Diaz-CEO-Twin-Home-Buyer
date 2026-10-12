/*
 * Equity Track contract signing — page logic.
 *
 * Privacy model: the page source holds no employee data. Every record lives in the
 * artifact's db under access rules enforced by the server (see README.md):
 *   public/directory            names only, readable by every signed-in viewer
 *   hr/**                       HR (owner) and the company signatory (Editor) only
 *   vault/<id>/d/*              one employee's contract, pay data and signed copy; <id> is derived from their
 *                               personal access code, so the record cannot be found or listed without the code
 *   vsign/<id>/d/signature      that employee's signature, written with the same code
 *   claims/<uid>, activity/<uid>   written by that account, read by admins only
 *   signatory/<uid>/**          the signatory's own batch authorizations
 * An employee's browser only ever requests the one record their code points to.
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
  const ARTIFACT_URL = 'https://claude.ai/artifact/NoKxD18fdtPjajyHHywzQx';
  const P = {
    record: (v) => `vault/${v}/d/record`,
    source: (v) => `vault/${v}/d/source`,
    final: (v) => `vault/${v}/d/final`,
    sign: (v) => `vsign/${v}/d/signature`,
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
    const entry = Object.assign({ at: nowIso(), actorUid: S.uid, role: S.role, outcome: 'success' }, S.role === 'employee' && E.key ? { employeeKey: E.key } : {}, ev);
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

  /** The contract with only the employee's signature on it, for viewing while it waits for Juan. Nothing is stored. */
  async function employeeSignedPdf(sourceBytes, c, sig) {
    return ET.buildFinalPdf(window.PDFLib, {
      sourceBytes, anchors: c.anchors, ref: c.contractId, version: c.version, sourceSha: c.sha,
      employee: { name: c.name, sigPng: ET.bytesFromB64(sig.sigPng), signedAt: sig.signedAt },
    });
  }

  /* ---------------- shared status logic ---------------- */
  function sigFor(rec) {
    const e = rec.vault && S.esign[rec.key];
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
      const e = rec.vault && S.esign[rec.key];
      if (!e) continue;
      const sig = sigFor(rec);
      if (sig && !(rec.employeeSig && rec.employeeSig.sha === rec.sha)) {
        ingesting.add(rec.key);
        try {
          await S.db.doc('hr/data/employees/' + rec.key).update({ employeeSig: sig });
          await S.db.doc(P.record(rec.vault)).update({ status: 'awaiting_company', employeeSignedAt: sig.signedAt });
          await logEvent({ action: 'Employee signature locked; contract placed in Juan’s signing queue', contractId: rec.contractId, version: rec.versionNo, employeeKey: rec.key });
        } catch (err) { console.warn(err); }
        ingesting.delete(rec.key);
      } else if (!sig && e.correction && e.correction.sha === rec.sha && !e.correction.handled) {
        ingesting.add(rec.key);
        try {
          await S.db.doc('hr/data/employees/' + rec.key).update({ status: 'returned', returnNote: 'Employee: ' + e.correction.note, returnedAt: e.correction.at });
          await S.db.doc(P.record(rec.vault)).update({ status: 'returned', returnNote: e.correction.note });
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

  /* ---------------- salary packages (HR's pay breakdowns; informational, never in the contract) ---------------- */
  const sumAmt = (rows) => ET.round2((rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0));
  function pkgFor(rec) {
    const list = (S.cfg && S.cfg.packages) || [];
    return (rec.packageId ? list.find((p) => p.id === rec.packageId) : list.find((p) => Math.abs(p.gross - rec.monthly) < 0.005)) || null;
  }
  function pkgProblems(p, rec) {
    const out = [];
    if (Math.abs(sumAmt(p.earnings) - p.gross) > 0.005) out.push(`Earnings add up to ${ET.peso(sumAmt(p.earnings))}, not ${ET.peso(p.gross)}.`);
    if (rec && Math.abs(p.gross - rec.monthly) > 0.005) out.push(`Package gross ${ET.peso(p.gross)} differs from the contract's monthly salary ${ET.peso(rec.monthly)}.`);
    return out;
  }
  const parseRows = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf(','); return { label: l.slice(0, i).trim(), amount: Number(l.slice(i + 1).replace(/[₱\s,]/g, '')) }; }).filter((r) => r.label && isFinite(r.amount));
  const rowsText = (rows) => (rows || []).map((r) => `${r.label}, ${r.amount}`).join('\n');

  function packageView(d) {
    const p = d.pkg;
    const gross = sumAmt(p.earnings), ded = sumAmt(p.deductions), net = ET.round2(gross - ded);
    const row = (label, amount, cls) => h('tr', { class: cls || '' }, h('td', { text: label }), h('td', { class: amount < 0 ? 'neg' : '', text: amount < 0 ? '−' + ET.peso(-amount) : ET.peso(amount) }));
    return h('div', { class: 'stack' },
      h('div', { class: 'table-wrap', style: 'border:0;background:none' }, h('table', { class: 'pay' },
        p.earnings.map((r) => row(r.label, r.amount)),
        row('Total gross', gross, 'sub'),
        p.deductions.map((r) => row(r.label, -r.amount)),
        row('Total deductions', -ded, 'sub'),
        row('Estimated monthly take-home pay', net, 'total'),
        row('Estimated take-home per cut-off', ET.round2(net / 2), 'total'))),
      p.note ? h('p', { class: 'small', text: p.note }) : null,
      h('p', { class: 'small', text: 'Why gross and take-home differ: your gross pay is what the Company pays you before deductions. Philippine law requires the Company to withhold your share of SSS, PhilHealth and Pag-IBIG contributions and your income tax, and remit them to the government for you. What remains is your take-home pay.' }),
      h('p', { class: 'small', text: d.thirteenthApplicable ? '13th-month pay: by December 24 each year you receive one-twelfth of the basic salary you earned during the calendar year, as Philippine law requires.' : 'Your contract classifies your position as managerial. Under Presidential Decree No. 851 the 13th-month pay requirement covers rank-and-file employees. Ask HR if you have questions.' }),
      h('p', { class: 'note info small', text: 'These figures are estimates for a full month with complete attendance. Actual payslips depend on days and hours worked, absences, approved overtime and current government rates, and a cut-off may differ from half the monthly figure. Your employment contract is what governs your pay. This page is not part of the contract and you do not sign it.' }));
  }

  /* ---------------- payroll explanation (informational) ---------------- */
  function payrollView(d) {
    if (d.pkg) return packageView(d);
    const st = d.statutory || ET.DEFAULT_STATUTORY;
    const p = ET.computePayroll(d, st);
    const row = (label, why, amount, cls) => h('tr', { class: cls || '' }, h('td', {}, label, why ? h('span', { class: 'why', text: why }) : null), h('td', { class: amount < 0 ? 'neg' : '', text: amount < 0 ? '−' + ET.peso(-amount) : ET.peso(amount) }));
    const ndWhy = !d.hasNightDiff ? 'Not part of your contract.'
      : d.ndHoursPerMonth
        ? `Estimate: about ${d.ndHoursPerMonth} night hours a month × 10% × your hourly rate of ${ET.peso(p.hourly)}. Actual pay depends on hours worked between 10:00 PM and 6:00 AM.`
        : 'See section 4 of your contract. Not estimated here because it depends on the hours you actually work between 10:00 PM and 6:00 AM.';
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
  const E_INIT = { vault: null, key: null, unsubs: [], issued: undefined, esign: undefined, step: 'pay', source: null, sourceSha: null, final: null, routeKey: '', loggedAccess: false, loggedPay: false, failures: 0 };
  const E = Object.assign({}, E_INIT);

  function employeeMain() { S.role = 'employee'; empLogin(); }

  /** Leaves this employee's contract, e.g. on a shared department account. */
  function empSignOut(message) {
    E.unsubs.forEach((u) => u());
    Object.assign(E, E_INIT, { unsubs: [], failures: E.failures });
    empLogin(message);
  }

  function empOpen(vault, key) {
    E.vault = vault; E.key = key;
    const onErr = (e) => mount(blocked('Your records could not be loaded', errText(e)));
    E.unsubs.push(S.db.doc(P.record(vault)).onSnapshot((s) => {
      if (!s.exists) { empSignOut('Your access code is no longer valid. Ask HR for your current code.'); return; }
      E.issued = s.data();
      if (E.esign !== undefined) routeEmployee();
    }, onErr));
    E.unsubs.push(S.db.doc(P.sign(vault)).onSnapshot((s) => { E.esign = s.exists ? s.data() : null; if (E.issued !== undefined) routeEmployee(); }, onErr));
  }

  function employeeState() {
    const i = E.issued;
    if (i.status === 'fully_signed') return 'complete';
    if (i.status === 'returned') return 'returned';
    const sig = E.esign && E.esign.signature;
    if (i.status === 'awaiting_company' || (sig && sig.sha === i.sha && sig.contractId === i.contractId)) return 'awaiting';
    return E.step;
  }

  function routeEmployee(force) {
    const st = employeeState();
    const key = [st, E.issued.sha, E.issued.status].join('|');
    if (!force && key === E.routeKey) return;
    E.routeKey = key;
    if (!E.loggedAccess) { E.loggedAccess = true; logEvent({ action: 'Employee accessed contract', contractId: E.issued.contractId, version: E.issued.version }); }
    ({ pay: empPay, contract: empContract, sign: empSign, awaiting: empAwaiting, complete: empComplete, returned: empReturned }[st])();
  }
  function goStep(step) { E.step = step; routeEmployee(true); window.scrollTo(0, 0); }

  function empBar() {
    return h('div', { class: 'row between small' },
      h('span', { class: 'muted', text: E.issued ? `Contract of ${E.issued.name}` : '' }),
      h('button', { class: 'btn ghost sm', text: 'Not you? Exit', onclick: () => empSignOut() }));
  }
  function stepper(now) {
    const steps = [['pay', 'Your pay'], ['contract', 'Review contract'], ['sign', 'Sign'], ['awaiting', "Juan's signature"], ['complete', 'Complete']];
    const idx = steps.findIndex((s) => s[0] === now);
    return h('div', { class: 'stack' }, empBar(),
      h('ol', { class: 'steps', 'aria-label': 'Signing progress' }, steps.map((s, i) => h('li', { class: i < idx ? 'done' : i === idx ? 'now' : '', 'aria-current': i === idx ? 'step' : null, text: s[1] }))));
  }

  async function empLogin(message) {
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
    const fromLink = /^#[A-Za-z0-9-]{12,16}$/.test(location.hash) ? location.hash.slice(1) : '';
    const code = h('input', { type: 'text', id: 'emp-code', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX', value: fromLink, style: 'font-family:var(--mono);letter-spacing:.08em' });
    const msg = h('div');
    if (message) msg.append(h('p', { class: 'note warn', text: message }));
    const btn = h('button', { class: 'btn big', type: 'submit', text: 'Open my contract' });
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      if (!chosen) { const exact = names.find((n) => ET.normName(n.name) === ET.normName(input.value)); if (exact) pick(exact); }
      if (!chosen) { msg.append(h('p', { class: 'note bad', text: 'Select your name from the list.' })); return; }
      const norm = ET.normCode(code.value);
      if (norm.length !== 12) { msg.append(h('p', { class: 'note bad', text: 'Your access code has 12 letters and numbers, like ABCD-EFGH-JKMN.' })); return; }
      const done = busy(btn, 'Checking…');
      try {
        if (E.failures >= 5) await new Promise((r) => setTimeout(r, 15000));
        const vault = await ET.vaultId(norm);
        const r = await S.db.doc(P.record(vault)).get();
        if (!r.exists || r.data().key !== chosen.key) {
          E.failures++;
          done();
          msg.append(h('p', { class: 'note bad', text: 'That name and access code do not match. Check the code HR gave you. ' + CONFIDENTIAL }));
          logEvent({ action: 'Contract access refused: name and code did not match', employeeKey: chosen.key, outcome: 'failed' });
          return;
        }
        E.failures = 0;
        mount(spinner('Opening your contract…'));
        empOpen(vault, chosen.key);
      } catch (err) { done(); msg.append(h('p', { class: 'note bad', text: 'Your contract could not be opened: ' + errText(err) })); }
    } },
      h('label', { class: 'f', for: 'emp-name' }, 'Your full name', h('div', { class: 'combo' }, input, list)),
      h('label', { class: 'f', for: 'emp-code' }, 'Your access code', h('span', { class: 'h', text: 'The personal code HR gave you. It is not your birthdate or employee ID.' }), code),
      msg, h('div', { class: 'row' }, btn));
    mount(h('div', { class: 'narrow' },
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: 'Welcome' }),
        h('h1', { class: 'title', text: 'Review and sign your employment contract' }),
        h('p', { class: 'lede', text: 'Select your name and enter the personal access code HR gave you.' }),
        names.length ? form : h('p', { class: 'note warn', text: 'No contracts are open for signing yet. HR will tell you when yours is ready.' })),
      h('p', { class: 'confidential', text: 'Keep your access code private: anyone with it can open your contract and pay details. If you share a computer or a department account, click "Not you? Exit" when you finish. ' + CONFIDENTIAL })));
    if (!fromLink) input.focus();
  }

  async function loadSource() {
    if (E.source && E.sourceSha === E.issued.sha) return E.source;
    const s = await S.db.doc(P.source(E.vault)).get();
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
        await S.db.doc(P.sign(E.vault)).set({ correction: { note: ta.value.trim().slice(0, 1000), sha: E.issued.sha, contractId: E.issued.contractId, at: nowIso() } });
        await logEvent({ action: 'Employee requested a correction', contractId: E.issued.contractId, version: E.issued.version, detail: ta.value.trim().slice(0, 200) });
        close(); toast('Sent to HR.');
        mount(h('div', { class: 'narrow' }, empBar(), h('section', { class: 'panel' }, h('h1', { class: 'title', text: 'Correction sent to HR' }), h('p', { class: 'lede', text: 'HR will review your note. You will sign the corrected contract once it is ready.' }))));
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
        const signature = { contractId: i.contractId, version: i.version, sha, sigPng: captured.b64, method: captured.method, typedName: captured.typedName || null, style: captured.style || null, consentText: consentText(i), consentAt: signedAt, signedAt, accountUid: S.uid, userAgent: navigator.userAgent.slice(0, 200) };
        await logEvent({ action: 'Employee consent recorded', contractId: i.contractId, version: i.version });
        await S.db.doc(P.sign(E.vault)).set({ signature });
        await logEvent({ action: 'Employee signed', contractId: i.contractId, version: i.version, detail: captured.method });
        await logEvent({ action: 'Contract placed in Juan’s signing queue', contractId: i.contractId, version: i.version });
        toast('Signature submitted.');
      } catch (e) {
        done();
        toast(e && e.code === 'invalid_argument' ? 'This Claude account can view but cannot sign. Ask HR to give it Contributor access.' : 'Could not submit: ' + errText(e), 'error');
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
    const sig = (E.esign && E.esign.signature && E.esign.signature.sha === i.sha) ? E.esign.signature : null;
    const frame = h('div', { class: 'doc-frame' }, spinner('Loading your signed contract…'));
    let signedBytes = null;
    (async () => {
      const src = await loadSource();
      signedBytes = sig && i.anchors ? await employeeSignedPdf(src, i, sig) : src;
      renderPdf(frame, signedBytes);
      if (sig && !i.anchors) frame.before(h('div', { class: 'stack' }, h('p', { class: 'note info', text: 'Your signature is saved. HR’s next visit refreshes this copy so your signature also appears on the signature line.' }), h('div', { class: 'sig-preview' }, h('img', { src: 'data:image/png;base64,' + sig.sigPng, alt: 'Your signature' }))));
    })().catch((e) => frame.replaceChildren(h('p', { class: 'note bad', text: errText(e) })));
    const dl = h('button', { class: 'btn secondary', text: 'Download my signed copy (PDF)', onclick: async () => {
      if (!signedBytes) { toast('The document is still loading.', 'error'); return; }
      if (await saveFile(ET.employeeFileName(i.name, (sig && sig.signedAt) || nowIso()).replace('.pdf', '_AwaitingCompanySignature.pdf'), new Blob([signedBytes]))) logEvent({ action: 'Employee downloaded the employee-signed copy', contractId: i.contractId, version: i.version });
    } });
    mount(h('div', { class: 'narrow' }, stepper('awaiting'),
      h('section', { class: 'panel' },
        h('div', { class: 'eyebrow', text: 'Signed by you' }),
        h('h1', { class: 'title', text: "Awaiting Juan's signature" }),
        h('p', { class: 'lede', text: `You signed on ${sig ? ET.phDateTime(sig.signedAt) : (i.employeeSignedAt ? ET.phDateTime(i.employeeSignedAt) : '—')}. Your signature is on the contract below and your signed version is locked. Juan Diaz's line stays blank until he signs for the Company; then your fully signed contract appears on this page.` }),
        frame,
        h('div', { class: 'row' }, dl))));
  }

  function empReturned() {
    const i = E.issued;
    mount(h('div', { class: 'narrow' }, empBar(), h('section', { class: 'panel' },
      h('div', { class: 'eyebrow', text: STATUS.returned }),
      h('h1', { class: 'title', text: 'Your contract is being corrected' }),
      h('p', { class: 'lede', text: 'HR is preparing a corrected version. You will review and sign it here when it is ready.' }),
      i.returnNote ? h('p', { class: 'note warn', text: 'Note: ' + i.returnNote }) : null)));
  }

  async function loadFinal() {
    if (E.final && E.final.sha === E.issued.finalSha) return E.final.bytes;
    const s = await S.db.doc(P.final(E.vault)).get();
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
        h('p', { class: 'confidential', text: 'This copy stays available here whenever you open the page with your name and access code. ' + CONFIDENTIAL }))));
  }

  /* ================================================================
   *  HR (artifact owner) and JUAN (designated signatory)
   * ================================================================ */
  /** One live subscription per issued contract to that employee's signature record. */
  const signSubs = {};
  function syncSignSubs(onChange) {
    for (const [k, sub] of Object.entries(signSubs)) {
      const r = S.employees[k];
      if (!r || r.vault !== sub.vault) { sub.unsub(); delete signSubs[k]; delete S.esign[k]; }
    }
    for (const r of Object.values(S.employees)) {
      if (!r.vault || signSubs[r.key]) continue;
      const key = r.key;
      signSubs[key] = { vault: r.vault, unsub: S.db.doc(P.sign(r.vault)).onSnapshot((snap) => { S.esign[key] = snap.exists ? snap.data() : null; onChange(); ingestEmployeeActions(); }, () => {}) };
    }
  }
  function subscribeAdminData(onChange) {
    const ready = { e: false, c: false, f: false };
    const go = () => { if (ready.e && ready.c && ready.f) onChange(); };
    const err = (e) => mount(blocked('Records could not be loaded', errText(e)));
    S.db.doc('hr/config').onSnapshot((s) => { S.cfg = s.exists ? s.data() : {}; ready.f = true; go(); }, err);
    S.db.collection('hr/data/employees').onSnapshot((q) => { S.employees = {}; q.docs.forEach((d) => { S.employees[d.id] = d.data(); }); ready.e = true; syncSignSubs(go); go(); ingestEmployeeActions(); }, err);
    S.db.collection('claims').onSnapshot((q) => { S.claims = {}; q.docs.forEach((d) => { S.claims[d.id] = d.data(); }); ready.c = true; go(); }, err);
  }
  async function resolveProfiles(ids) {
    ids = ids.filter(Boolean);
    if (!ids.length) return S.profiles;
    try { Object.assign(S.profiles, await S.user.profiles(ids)); } catch (_) { /* names stay blank */ }
    return S.profiles;
  }
  const personLabel = (uid) => { const p = S.profiles[uid]; return p ? [p.name, p.email].filter(Boolean).join(' · ') || 'Unnamed account' : 'Account'; };

  /* ---------------- HR console ---------------- */
  const H = { tab: 'contracts', filter: '', statusFilter: 'all', focus: null, upgradeNote: null, upgradeFailed: {} };

  function hrMain() {
    S.role = 'hr';
    mount(spinner('Loading HR records…'));
    subscribeAdminData(() => { renderHr(false); upgradeUnformatted(); repairEmployeeCopies(); });
  }

  /** Rewrites any employee copy that is missing or out of date (e.g. issued by an older version of this page). */
  let repairing = false, repairedOnce = false;
  async function repairEmployeeCopies() {
    if (repairing || repairedOnce) return;
    repairing = true;
    let fixed = 0;
    for (const r of Object.values(S.employees)) {
      if (!r.vault || !['issued', 'returned', 'fully_signed'].includes(r.status)) continue;
      try {
        const d = await S.db.doc(P.record(r.vault)).get();
        const src = await S.db.doc(P.source(r.vault)).get();
        const cur = d.exists ? d.data() : null;
        if (!cur || !cur.anchors || cur.sha !== r.sha || !src.exists) { await publishToEmployee(r); fixed++; }
      } catch (e) { console.warn('repair failed for', r.key, e); }
    }
    repairing = false; repairedOnce = true;
    if (fixed) { logEvent({ action: `Refreshed ${fixed} employee contract copies`, outcome: 'info' }); toast(`Refreshed ${fixed} employee contract copies.`); }
  }

  /** Contracts uploaded before the onboarding format existed have no formatted copy yet. Build it from Juan's saved draft. */
  let upgrading = false;
  async function upgradeUnformatted() {
    if (upgrading) return;
    const todo = Object.values(S.employees).filter((r) => !r.fidelity && r.currentVid && r.status === 'draft' && !H.upgradeFailed[r.key]);
    if (!todo.length) return;
    upgrading = true;
    H.upgradeNote = `Laying out ${todo.length} uploaded contract(s) in the onboarding format. This takes a few seconds…`;
    renderHr();
    let done = 0;
    try {
      const lib = await pdfjs();
      for (const r of todo) {
        try {
          const v = await S.db.doc('hr/data/versions/' + r.currentVid).get();
          if (!v.exists) throw new Error('Juan’s draft is missing; upload it again.');
          const vd = v.data();
          const { pages } = await ET.extractPdf(lib, ET.bytesFromB64(vd.b64));
          const parsed = ET.parseContract(pages);
          const fmt = await formatDraft(lib, pages);
          if (!fmt.fidelity.ok) parsed.issues.push(fmt.fidelity.detail);
          await S.db.doc('hr/data/formatted/' + r.currentVid).set({ b64: fmt.b64, sha: fmt.sha });
          await S.db.doc('hr/data/versions/' + r.currentVid).update({ draftSha: vd.draftSha || vd.sha, sha: fmt.sha, anchors: fmt.anchors, fidelity: fmt.fidelity, parsed });
          await S.db.doc('hr/data/employees/' + r.key).update(Object.assign(versionFields(parsed, r.currentVid, fmt), { pendingVid: r.pendingVid || null }));
          done++;
        } catch (e) { H.upgradeFailed[r.key] = `${r.name}: ${errText(e)}`; }
      }
    } catch (e) { todo.forEach((r) => { H.upgradeFailed[r.key] = `${r.name}: ${errText(e)}`; }); }
    upgrading = false;
    const failed = Object.values(H.upgradeFailed);
    H.upgradeNote = failed.length ? 'These contracts could not be laid out in the onboarding format: ' + failed.join(' · ') : null;
    renderHr();
    if (done) toast(`${done} contract(s) are now in the onboarding format.`);
  }

  /** Live data refreshes skip tabs that hold a form or a one-time load, so nothing HR is typing gets wiped. */
  function renderHr(force = true) {
    if (!force && H.rendered && (H.tab === 'settings' || H.tab === 'activity')) return;
    H.rendered = true;
    const active = document.activeElement;
    H.focus = active && active.id && app.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    const recs = Object.values(S.employees);
    const pendingClaims = Object.entries(S.claims).filter(([, c]) => c.status === 'pending' && c.kind === 'signatory');
    const done = recs.filter((r) => statusOf(r) === 'fully_signed');
    const tabs = [['contracts', 'Contracts', recs.length], ['access', 'Access codes', pendingClaims.length], ['signing', 'Signing status', recs.filter((r) => statusOf(r) === 'awaiting_company').length], ['completed', 'Signed PDFs', done.length], ['activity', 'Activity history'], ['settings', 'Settings']];
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
    if (H.upgradeNote) w.push(H.upgradeNote);
    if (!S.cfg.signatoryUid) w.push('No company signatory is designated yet. Share this artifact with Juan Diaz as an Editor; when he opens it and requests the signatory role, approve it under Access codes.');
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
      h('thead', {}, h('tr', {}, ['Employee', 'Code', 'Position', 'Monthly salary', 'Status', 'Access', ''].map((t, i) => h('th', { class: i === 3 ? 'num' : '', text: t })))),
      h('tbody', {}, recs.length ? recs.map((r) => h('tr', {},
        h('td', {}, h('strong', { text: r.name }), r.pendingVid ? h('div', { class: 'small', style: 'color:var(--warn)', text: 'Revised draft waiting for review' }) : null),
        h('td', { class: 'code', text: c[r.key] || '—' }),
        h('td', { class: 'small', text: r.position || '—' }),
        h('td', { class: 'num', text: r.monthly ? ET.peso(r.monthly) : '—' }),
        h('td', {}, pill(statusOf(r))),
        h('td', { class: 'small muted', text: r.accessCode ? 'Code ready' : '—' }),
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
            key, name: parsed.name, createdAt: nowIso(), status: 'draft', versionNo: 1, dob: '', email: '', vault: null, accessCode: null,
            ndHoursPerMonth: 0, deMinimis: 0, otherDeductions: [], thirteenthApplicable: !parsed.managerial,
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
    if (!v.exists) throw new Error('The formatted contract is not ready yet. Close this window; the app is laying it out now.');
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
    const p = pkgFor(rec);
    const pkg = p && p.confirmed && !pkgProblems(p, rec).length ? { name: p.name, gross: p.gross, earnings: p.earnings, deductions: p.deductions, note: p.note || '' } : null;
    return { monthly: rec.monthly, hourly: rec.hourly, ndHoursPerMonth: rec.ndHoursPerMonth, deMinimis: rec.deMinimis, otherDeductions: rec.otherDeductions || [], thirteenthApplicable: !!rec.thirteenthApplicable, hasNightDiff: !!rec.hasNightDiff, statutory: S.cfg.statutory || ET.DEFAULT_STATUTORY, pkg };
  }

  /** Writes the employee's own copy to the location their access code points to. */
  async function publishToEmployee(rec) {
    if (!rec.vault || !['issued', 'returned', 'fully_signed'].includes(rec.status)) return;
    const { bytes } = await getVersionBytes(rec.currentVid, rec.sha);
    await S.db.doc(P.source(rec.vault)).set({ b64: ET.b64FromBytes(bytes), sha: rec.sha, contractId: rec.contractId, version: rec.versionNo });
    if (rec.status === 'fully_signed') {
      const f = await S.db.doc('hr/data/finals/' + rec.key).get();
      if (f.exists) await S.db.doc(P.final(rec.vault)).set({ b64: f.data().b64, sha: f.data().sha, contractId: rec.contractId, version: rec.versionNo });
    }
    const st = statusOf(rec);
    await S.db.doc(P.record(rec.vault)).set({
      key: rec.key, contractId: rec.contractId, version: rec.versionNo, sha: rec.sha, name: rec.name, dob: rec.dob, position: rec.position,
      startDate: rec.startDate, effective: rec.effective, monthly: rec.monthly, perCutoff: rec.perCutoff,
      status: st === 'draft' ? 'awaiting_employee' : st, issuedAt: rec.issuedAt, returnNote: rec.status === 'returned' ? (rec.returnNote || '') : '',
      payroll: payrollInputs(rec), employeeSignedAt: rec.employeeSig ? rec.employeeSig.signedAt : null,
      companySignedAt: rec.companySig ? rec.companySig.signedAt : null, finalSha: rec.finalSha || null, anchors: rec.anchors,
    });
  }
  async function unpublishFromEmployee(vault) {
    for (const p of [P.final(vault), P.source(vault), P.record(vault), P.sign(vault)]) await S.db.doc(p).delete();
  }
  const personalLink = (code) => `${ARTIFACT_URL}#${code}`;
  const inviteMessage = (rec) => `Hi ${rec.name.split(' ')[0]}, your employment contract with Equity Track Inc. Philippines is ready for review and signature.\n\n1. Open this link (sign in to Claude if asked): ${personalLink(rec.accessCode)}\n2. Select your name: ${rec.name}\n3. Your access code: ${rec.accessCode}\n\nKeep this code private. It opens your contract and pay details. If you use a shared or department account, click "Not you? Exit" when you finish.`;
  function copyButton(label, text, cls) {
    return h('button', { class: cls || 'btn secondary sm', text: label, onclick: async () => {
      try { await navigator.clipboard.writeText(text); toast('Copied.'); }
      catch (_) { const ta = h('textarea', { readonly: true, value: text, style: 'min-height:160px' }); modal(label, h('div', { class: 'stack' }, h('p', { class: 'small muted', text: 'Copy this text:' }), ta)); ta.select(); }
    } });
  }
  async function newAccessCode(rec) {
    if (rec.vault) await unpublishFromEmployee(rec.vault);
    const accessCode = ET.newAccessCode();
    const vault = await ET.vaultId(accessCode);
    await updateRec(rec.key, { accessCode, vault });
    await publishToEmployee(Object.assign({}, rec, { accessCode, vault }));
    await logEvent({ action: rec.vault ? 'Access code replaced (old code no longer works)' : 'Access code created', contractId: rec.contractId, version: rec.versionNo, employeeKey: rec.key });
  }
  async function updateDirectory() {
    const names = Object.values(S.employees).filter((r) => r.status !== 'draft').map((r) => ({ key: r.key, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
    await S.db.doc('public/directory').set({ names });
  }

  /** Saves a change to an employee record and applies it locally at once, so a reopened window shows it. */
  async function updateRec(key, patch) {
    await S.db.doc('hr/data/employees/' + key).update(patch);
    S.employees[key] = Object.assign({}, S.employees[key], patch);
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
    const pkgSel = h('select', { id: 'f-pkg' }, h('option', { value: '', text: 'Match by the contract’s monthly salary' }),
      ((S.cfg && S.cfg.packages) || []).map((p) => h('option', { value: p.id, text: `${p.name} (${ET.peso(p.gross)})`, selected: rec.packageId === p.id })));
    const curPkg = pkgFor(rec);
    const pkgStatus = !curPkg ? 'No salary package matches this contract. The employee sees the standard pay explanation.'
      : pkgProblems(curPkg, rec).length ? `Package “${curPkg.name}” is not shown: ${pkgProblems(curPkg, rec).join(' ')}`
        : curPkg.confirmed ? `Package “${curPkg.name}” is confirmed and shown to the employee.`
          : `Package “${curPkg.name}” is not confirmed yet, so the employee sees the standard pay explanation. Confirm it under Settings → Salary packages.`;
    const saveBtn = h('button', { class: 'btn', text: 'Save details' });
    saveBtn.onclick = async () => {
      const otherDeductions = others.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.lastIndexOf(','); return { label: l.slice(0, i).trim(), amount: Number(l.slice(i + 1)) }; }).filter((o) => o.label && o.amount > 0);
      const em = email.value.trim();
      if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Enter a valid email address or leave it blank.', 'error'); return; }
      const done = busy(saveBtn, 'Saving…');
      try {
        const patch = { packageId: pkgSel.value || null, dob: dob.value, email: em, ndHoursPerMonth: Number(nd.value) || 0, deMinimis: Number(dm.value) || 0, thirteenthApplicable: th.checked, otherDeductions };
        await updateRec(key, patch);
        const r = Object.assign({}, fresh(), patch);
        if (r.vault && r.status !== 'draft') await publishToEmployee(r);
        toast('Saved.'); reopen();
      } catch (e) { done(); toast('Could not save: ' + errText(e), 'error'); }
    };

    const checks = h('ul', { class: 'stack small', style: 'padding-left:18px;margin:0' },
      (rec.issues || []).length ? rec.issues.map((t) => h('li', { class: 'check-bad', text: t })) : h('li', { class: 'check-ok', text: 'Name, salary, start date and signature fields found in the PDF.' }),
      h('li', { class: rec.fidelity && rec.fidelity.ok ? 'check-ok' : 'check-bad', text: rec.fidelity && rec.fidelity.ok ? `Wording check passed: the formatted contract contains Juan's draft character for character${(rec.fills || []).length ? ', apart from the filled-in blank below' : ''} (${rec.fidelity.chars} characters).` : 'Wording check failed. The formatted contract cannot be issued.' }),
      (rec.fills || []).map((f) => h('li', { class: 'check-ok', text: f.kind === 'renamed'
        ? `Employee name corrected from “${f.from}” to “${f.value}” (${ET.phDateTime(f.at)}). No other wording changed.`
        : f.kind === 'removed-note'
        ? `Pre-approval note removed: “${f.value}”. No other wording changed. Removed ${ET.phDateTime(f.at)} on HR's instruction; Juan's signature confirms his approval.`
        : `Blank filled in: ${f.field} → ${f.value}. Juan's draft left this blank “(to be filled in before signing)”. Entered ${ET.phDateTime(f.at)} on HR's instruction.` })),
      h('li', { class: rec.dob ? 'check-ok' : 'check-bad', text: rec.dob ? 'Birthdate on file.' : 'Birthdate missing. Required before issuing.' }));

    const frame = h('div', { class: 'doc-frame' }, spinner('Loading contract…'));
    const shownSig = (rec.employeeSig && rec.employeeSig.sha === rec.sha) ? rec.employeeSig : sigFor(rec);
    getVersionBytes(rec.currentVid, rec.sha)
      .then(async ({ bytes }) => renderPdf(frame, shownSig && rec.status !== 'fully_signed' ? await employeeSignedPdf(bytes, { anchors: rec.anchors, contractId: rec.contractId, version: rec.versionNo, sha: rec.sha, name: rec.name }, shownSig) : bytes))
      .catch((e) => frame.replaceChildren(h('p', { class: 'note bad', text: errText(e) })));

    const actions = h('div', { class: 'row' });
    const blocking = !rec.anchors || !rec.monthly || !rec.name || !rec.startDate || !!rec.preApproval || !(rec.fidelity && rec.fidelity.ok);
    if (st === 'draft' || st === 'returned') {
      const issueBtn = h('button', { class: 'btn', text: st === 'returned' ? 'Re-issue for signature' : 'Issue for employee signature', disabled: blocking || !rec.dob || !!rec.pendingVid });
      issueBtn.onclick = async () => {
        const done = busy(issueBtn, 'Issuing…');
        try {
          const contractId = rec.contractId || `ETP-EC-${new Date().getFullYear()}-${ET.randomId(3)}`;
          // Order matters: keep the code, write the employee's copy, and only then mark the contract issued,
          // so a failure part-way never leaves an "issued" contract that the employee cannot open.
          if (!rec.vault) { const accessCode = ET.newAccessCode(); await updateRec(key, { accessCode, vault: await ET.vaultId(accessCode) }); }
          const patch = { status: 'issued', contractId, issuedAt: nowIso(), returnNote: '', employeeSig: null };
          const r = Object.assign({}, fresh(), patch);
          const e = S.esign[key];
          if (e && e.correction && !e.correction.handled) await S.db.doc(P.sign(r.vault)).update({ correction: Object.assign({}, e.correction, { handled: true }) });
          await publishToEmployee(r);
          await updateRec(key, patch);
          await updateDirectory();
          await logEvent({ action: st === 'returned' ? 'Contract re-issued after correction' : 'Contract issued for employee review and signature', contractId, version: r.versionNo, employeeKey: key });
          toast('Issued.'); reopen();
        } catch (e) { done(); toast('Could not issue: ' + errText(e), 'error'); }
      };
      actions.append(issueBtn);
      if (rec.pendingVid) actions.append(h('span', { class: 'small muted', text: 'Review the revised draft first.' }));
    }
    if (st === 'awaiting_company') {
      const clr = h('button', { class: 'btn secondary', text: 'Clear signature (employee signs again)' });
      clr.onclick = () => {
        const ok = h('button', { class: 'btn danger', text: 'Clear signature' });
        const c2 = modal('Clear employee signature', h('div', { class: 'stack' }, h('p', { text: `${rec.name}'s signature is removed from this contract and they can sign again with the same access code. The old signature is kept in the HR record for the audit trail.` }), h('div', { class: 'row end' }, ok)));
        ok.onclick = async () => {
          const done = busy(ok, 'Clearing…');
          try {
            const old = (rec.employeeSig && rec.employeeSig.sha === rec.sha) ? rec.employeeSig : sigFor(rec);
            await S.db.doc(P.record(rec.vault)).update({ status: 'awaiting_employee', employeeSignedAt: null });
            if (S.esign[key]) await S.db.doc(P.sign(rec.vault)).delete();
            await updateRec(key, { employeeSig: null, previousSignatures: (rec.previousSignatures || []).concat(old ? [Object.assign({}, old, { resetAt: nowIso(), resetReason: 'Cleared by HR so the employee signs again' })] : []) });
            S.esign[key] = null;
            await logEvent({ action: 'Employee signature cleared by HR; employee can sign again', contractId: rec.contractId, version: rec.versionNo, employeeKey: key });
            c2(); toast('Signature cleared.'); reopen();
          } catch (e) { done(); toast(errText(e), 'error'); }
        };
      };
      actions.append(clr);
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
            await updateRec(key, { status: 'returned', returnNote: ta.value.trim(), employeeSig: null });
            if (rec.vault) await S.db.doc(P.record(rec.vault)).update({ status: 'returned', returnNote: ta.value.trim() });
            if (rec.vault && S.esign[key]) await S.db.doc(P.sign(rec.vault)).delete();
            await logEvent({ action: 'Contract returned for correction', contractId: rec.contractId, version: rec.versionNo, employeeKey: key, detail: ta.value.trim() });
            c2(); reopen();
          } catch (e) { done(); toast(errText(e), 'error'); }
        };
      };
      actions.append(retBtn);
    }

    if (st === 'draft' || st === 'returned' || st === 'awaiting_employee') {
      const rm = h('button', { class: 'btn danger', text: 'Remove contract' });
      rm.onclick = () => {
        const ok = h('button', { class: 'btn danger', text: `Remove ${rec.name}` });
        const c2 = modal('Remove contract', h('div', { class: 'stack' }, h('p', { text: `This deletes ${rec.name}'s contract and record from the app. Use it for employees who have left before signing. It cannot be undone; the original PDF stays in Google Drive.` }), h('div', { class: 'row end' }, ok)));
        ok.onclick = async () => {
          const done = busy(ok, 'Removing…');
          try {
            if (rec.vault) await unpublishFromEmployee(rec.vault);
            for (const vid of [rec.currentVid, rec.pendingVid].filter(Boolean)) { await S.db.doc('hr/data/versions/' + vid).delete(); await S.db.doc('hr/data/formatted/' + vid).delete(); }
            await S.db.doc('hr/data/employees/' + key).delete();
            await updateDirectory();
            await logEvent({ action: 'Contract removed', employeeKey: key, contractId: rec.contractId || null, detail: rec.name });
            c2(); close();
          } catch (e) { done(); toast(errText(e), 'error'); }
        };
      };
      actions.append(rm);
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
            await updateRec(key, patch);
            if (rec.vault && S.esign[key] && S.esign[key].signature) await S.db.doc(P.sign(rec.vault)).delete();
            const r = Object.assign({}, fresh(), patch);
            if (r.vault && r.status !== 'draft') await publishToEmployee(r);
            await logEvent({ action: 'Revised contract approved by HR', contractId: rec.contractId, version: patch.versionNo, employeeKey: key, detail: `${changed} changed lines` });
            toast('Revised draft approved. Re-issue it when ready.'); reopen();
          } catch (e) { done(); toast(errText(e), 'error'); }
        };
        discard.onclick = async () => { await updateRec(key, { pendingVid: null }); await S.db.doc('hr/data/versions/' + rec.pendingVid).delete(); await S.db.doc('hr/data/formatted/' + rec.pendingVid).delete(); reopen(); };
        diffSection.replaceChildren(
          h('h3', { text: 'Revised draft waiting for review' }),
          h('p', { class: 'small muted', text: `${changed} line(s) differ. Removed text is struck through; added text is green. Nothing changes until you approve.` }),
          np.monthly !== rec.monthly ? h('p', { class: 'note warn', text: `Salary changes from ${ET.peso(rec.monthly)} to ${ET.peso(np.monthly)}. Confirm Juan approved this amount.` }) : null,
          (np.issues || []).length ? h('p', { class: 'note bad', text: np.issues.join(' ') }) : null,
          h('div', { class: 'diff' }, d.map((x) => h('div', { class: x.op === '+' ? 'add' : x.op === '-' ? 'del' : 'same', text: (x.op === '=' ? '  ' : x.op + ' ') + x.text }))),
          h('div', { class: 'row' }, approve, discard));
      }).catch((e) => diffSection.replaceChildren(h('p', { class: 'note bad', text: errText(e) })));
    }

    const codeSection = rec.accessCode
      ? h('section', { class: 'stack' }, h('h3', { text: 'Access code (HR only — give it to the employee privately)' }),
          h('p', { class: 'code', style: 'font-size:1.3rem;letter-spacing:.1em', text: rec.accessCode }),
          h('div', { class: 'row' },
            copyButton('Copy message for employee', inviteMessage(rec), 'btn sm'),
            copyButton('Copy code', rec.accessCode),
            copyButton('Copy personal link', personalLink(rec.accessCode)),
            h('button', { class: 'btn ghost sm', text: 'Replace code', onclick: async (e) => {
              const done = busy(e.target, 'Replacing…');
              try { await newAccessCode(fresh()); toast('New code created. The old code no longer works.'); reopen(); } catch (er) { done(); toast(errText(er), 'error'); }
            } })),
          h('p', { class: 'small muted', text: 'The personal link fills in the code automatically. Replace the code if it was shared with the wrong person.' }))
      : h('p', { class: 'small muted', text: 'An access code is created when you issue the contract.' });

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
          h('label', { class: 'f', for: 'f-email' }, 'Email', h('span', { class: 'h', text: 'Optional. Not needed for signing.' }), email)),
        h('p', { class: 'small' }, 'Internal employee code: ', codePreview, h('span', { class: 'muted', text: ' (HR only; never shown to employees)' }))),
      codeSection,
      h('section', { class: 'stack' }, h('h3', { text: 'Payroll explanation settings' }),
        h('p', { class: 'small muted', text: 'These only change the informational pay estimate. They never change the contract.' }),
        h('div', { class: 'grid2' },
          h('label', { class: 'f', for: 'f-nd' }, 'Estimated night-shift hours per month', h('span', { class: 'h', text: rec.hasNightDiff ? 'Leave at 0 to describe it without an amount. Hours between 10 PM and 6 AM (208 = 8 hours × 26 days).' : 'This contract has no night differential.' }), nd),
          h('label', { class: 'f', for: 'f-dm' }, 'Qualifying de minimis benefits per month', h('span', { class: 'h', text: 'Leave at 0 unless Juan approved one in writing.' }), dm)),
        h('label', { class: 'f', for: 'f-pkg' }, 'Salary package (pay breakdown)', h('span', { class: 'h', text: pkgStatus }), pkgSel),
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
    const c = codes();
    const recs = Object.values(S.employees).filter((r) => r.accessCode && matches(r, c[r.key])).sort((a, b) => a.name.localeCompare(b.name));
    const sigClaims = Object.entries(S.claims).filter(([, cl]) => cl.kind === 'signatory' && cl.status === 'pending');
    const unknown = sigClaims.map(([u]) => u).filter((u) => !S.profiles[u]);
    if (unknown.length) resolveProfiles(unknown).then(() => { if (H.tab === 'access') renderHr(); });
    const exportBtn = h('button', { class: 'btn secondary', text: 'Download code list (CSV)', disabled: !recs.length, onclick: async () => {
      const csv = ET.csv([['Employee', 'Employee code', 'Access code', 'Personal link'], ...recs.map((r) => [r.name, c[r.key] || '', r.accessCode, personalLink(r.accessCode)])]);
      if (await saveFile(`EquityTrack_AccessCodes_${ET.phYMD(nowIso())}.csv`, csv)) logEvent({ action: 'Access code list downloaded by HR' });
    } });
    return h('div', { class: 'stack', style: 'gap:14px' },
      sigClaims.length ? h('section', { class: 'panel' }, h('h3', { text: 'Signatory request' }),
        sigClaims.map(([uid]) => h('div', { class: 'row between' },
          h('span', { text: `${personLabel(uid)} asks to sign for the Company as Juan Diaz.` }),
          h('div', { class: 'row' },
            h('button', { class: 'btn sm', text: 'Designate as signatory', onclick: async (e) => {
              const done = busy(e.target);
              try {
                await S.db.doc('hr/config').set(Object.assign({}, S.cfg, { signatoryUid: uid, signatoryAt: nowIso() }));
                await S.db.doc('claims/' + uid).update({ status: 'approved', decidedAt: nowIso() });
                await logEvent({ action: 'Company signatory designated', detail: personLabel(uid) });
              } catch (er) { done(); toast(errText(er), 'error'); }
            } }),
            h('button', { class: 'btn danger sm', text: 'Reject', onclick: async () => { await S.db.doc('claims/' + uid).update({ status: 'rejected', decidedAt: nowIso() }); } }))))) : null,
      h('p', { class: 'lede', text: 'Each issued contract has a personal access code. Give each employee their own code privately (chat or in person). They open the link, select their name and enter the code. A code opens only that one contract.' }),
      h('div', { class: 'row' }, exportBtn, h('div', { style: 'flex:1;min-width:220px' }, searchBox('code-search', 'Search by name or employee code'))),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Employee', 'Status', 'Access code', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, recs.length ? recs.map((r) => h('tr', {},
          h('td', {}, h('strong', { text: r.name }), h('div', { class: 'small muted code', text: c[r.key] || '' })),
          h('td', {}, pill(statusOf(r))),
          h('td', { class: 'code', style: 'letter-spacing:.06em', text: r.accessCode }),
          h('td', {}, h('div', { class: 'row' }, copyButton('Copy message', inviteMessage(r), 'btn sm'), copyButton('Copy code', r.accessCode)))))
          : h('tr', {}, h('td', { colspan: 4, class: 'muted', text: 'Codes appear here when you issue contracts.' }))))));
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
        for (const r of Object.values(S.employees)) if (r.vault && r.status !== 'draft') await S.db.doc(P.record(r.vault)).update({ payroll: Object.assign(payrollInputs(r), { statutory: ns }) });
        await logEvent({ action: 'Settings updated', outcome: 'info' });
        toast('Settings saved.');
      } catch (e) { toast(errText(e), 'error'); }
      done();
    };
    resolveProfiles([S.cfg.signatoryUid]).then(() => { const el = document.getElementById('sig-who'); if (el) el.textContent = S.cfg.signatoryUid ? personLabel(S.cfg.signatoryUid) : 'Not designated'; });
    return h('div', { class: 'stack', style: 'gap:16px' },
      packagesPanel(),
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

  function packagesPanel() {
    const list = JSON.parse(JSON.stringify((S.cfg && S.cfg.packages) || []));
    const box = h('div', { class: 'stack', style: 'gap:18px' });
    const recs = Object.values(S.employees);
    function editor(p, i) {
      const name = h('input', { type: 'text', id: `pk-${i}-name`, value: p.name || '' });
      const gross = h('input', { type: 'number', step: '0.01', id: `pk-${i}-gross`, value: p.gross || 0 });
      const earn = h('textarea', { id: `pk-${i}-earn`, value: rowsText(p.earnings), style: 'min-height:140px' });
      const ded = h('textarea', { id: `pk-${i}-ded`, value: rowsText(p.deductions), style: 'min-height:110px' });
      const note = h('textarea', { id: `pk-${i}-note`, value: p.note || '', style: 'min-height:60px' });
      const conf = h('input', { type: 'checkbox', id: `pk-${i}-conf`, checked: !!p.confirmed });
      const summary = h('p', { class: 'small' });
      const sync = () => {
        Object.assign(p, { name: name.value.trim(), gross: Number(gross.value) || 0, earnings: parseRows(earn.value), deductions: parseRows(ded.value), note: note.value.trim(), confirmed: conf.checked });
        const probs = pkgProblems(p);
        const who = recs.filter((r) => pkgFor(Object.assign({}, r, {})) && (r.packageId ? r.packageId === p.id : Math.abs(r.monthly - p.gross) < 0.005)).map((r) => r.name);
        summary.replaceChildren(
          h('span', { class: probs.length ? 'check-bad' : 'check-ok', text: probs.length ? probs.join(' ') : `Gross ${ET.peso(sumAmt(p.earnings))} − deductions ${ET.peso(sumAmt(p.deductions))} = take-home ${ET.peso(sumAmt(p.earnings) - sumAmt(p.deductions))}.` }),
          h('span', { class: 'muted', text: ` Applies to ${who.length} employee(s).` }));
      };
      [name, gross, earn, ded, note, conf].forEach((el) => el.addEventListener('input', sync));
      conf.addEventListener('change', sync);
      sync();
      return h('div', { class: 'stack', style: 'border-top:1px solid var(--line);padding-top:14px' },
        h('div', { class: 'grid2' }, h('label', { class: 'f', for: name.id }, 'Package name', name), h('label', { class: 'f', for: gross.id }, 'Monthly gross (must equal the contract salary)', gross)),
        h('div', { class: 'grid2' },
          h('label', { class: 'f', for: earn.id }, 'Earnings', h('span', { class: 'h', text: 'One per line: label, amount' }), earn),
          h('label', { class: 'f', for: ded.id }, 'Deductions', h('span', { class: 'h', text: 'One per line: label, amount' }), ded)),
        h('label', { class: 'f', for: note.id }, 'Note shown to employees', note),
        summary,
        h('div', { class: 'row between' },
          h('label', { class: 'check', for: conf.id }, conf, h('span', { text: 'Confirmed by HR — show this breakdown to the employees it applies to' })),
          h('button', { class: 'btn ghost sm', text: 'Remove package', onclick: () => { list.splice(i, 1); draw(); } })));
    }
    const save = h('button', { class: 'btn', text: 'Save salary packages' });
    save.onclick = async () => {
      const bad = list.find((p) => !p.name || !p.gross || pkgProblems(p).length);
      if (bad) { toast(`Fix “${bad.name || 'unnamed package'}” first: ${pkgProblems(bad).join(' ') || 'it needs a name and a gross amount.'}`, 'error'); return; }
      const done = busy(save, 'Saving…');
      try {
        const packages = list.map((p) => Object.assign({}, p, { id: p.id || 'p' + ET.randomId(4) }));
        await S.db.doc('hr/config').set(Object.assign({}, S.cfg, { packages }));
        S.cfg = Object.assign({}, S.cfg, { packages });
        for (const r of Object.values(S.employees)) if (r.vault && r.status !== 'draft') await S.db.doc(P.record(r.vault)).update({ payroll: payrollInputs(r) });
        await logEvent({ action: 'Salary packages updated', detail: packages.map((p) => `${p.name}${p.confirmed ? ' (confirmed)' : ''}`).join('; ') });
        toast('Salary packages saved.');
      } catch (e) { toast(errText(e), 'error'); }
      done();
    };
    function draw() {
      box.replaceChildren(...list.map(editor),
        h('div', { class: 'row between' },
          h('button', { class: 'btn secondary sm', text: 'Add package', onclick: () => { list.push({ name: 'New package', gross: 0, earnings: [], deductions: [], note: '', confirmed: false }); draw(); } }),
          save));
    }
    draw();
    return h('section', { class: 'panel' }, h('h3', { text: 'Salary packages (pay breakdown shown to employees)' }),
      h('p', { class: 'small muted', text: 'Each employee is matched to the package whose gross equals their contract salary, or to the package chosen on their record. Only confirmed packages are shown, and only to the employees they apply to. Packages never appear in the contract or the signed PDF.' }),
      box);
  }

  /* ---------------- Juan / company signatory ---------------- */
  const J = { filter: 'awaiting_company', selected: new Set() };

  function juanMain() {
    S.role = 'signatory';
    mount(spinner('Loading contracts…'));
    subscribeAdminData(() => { if (!J.busy) renderJuan(); repairEmployeeCopies(); });
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
    try {
      const { bytes } = await getVersionBytes(r.currentVid, r.sha);
      renderPdf(frame, sig ? await employeeSignedPdf(bytes, { anchors: r.anchors, contractId: r.contractId, version: r.versionNo, sha: r.sha, name: r.name }, sig) : bytes);
    } catch (e) { frame.replaceChildren(h('p', { class: 'note bad', text: errText(e) })); }
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
    if (!r.vault) throw new Error('This contract has no access code.');
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
    await S.db.doc(P.final(r.vault)).set({ b64, sha: finalSha, contractId: r.contractId, version: r.versionNo });
    await S.db.doc('hr/data/employees/' + r.key).update({ status: 'fully_signed', employeeSig: empSig, companySig, finalSha, fullySignedAt: signedAt });
    await S.db.doc(P.record(r.vault)).update({ status: 'fully_signed', companySignedAt: signedAt, employeeSignedAt: empSig.signedAt, finalSha });
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
    if (!window.claude || !window.claude.use) { mount(blocked('Open this page in Claude', 'Sign in to Claude and open the link HR sent you. Then select your name and enter your access code.')); return; }
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
