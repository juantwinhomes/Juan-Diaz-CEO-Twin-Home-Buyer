// End-to-end run of the whole signing flow in Chromium, with an in-memory stand-in for Claude's db/user/downloads.
// Run: NODE_PATH=<folder with playwright-core, pdfjs-dist, pdf-lib, @pdf-lib/fontkit, jszip> \
//      node contract-signing/tests/e2e.js path/to/Contract.pdf [outDir]
// The contract PDF is passed in and never committed.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const NM = process.env.NODE_PATH.split(':')[0];
const pdfFile = process.argv[2];
const outDir = process.argv[3] || '/tmp';
const CDN = {
  'pdf-lib.min.js': 'pdf-lib/dist/pdf-lib.min.js',
  'fontkit.umd.min.js': '@pdf-lib/fontkit/dist/fontkit.umd.min.js',
  'jszip.min.js': 'jszip/dist/jszip.min.js',
  'pdf.min.js': 'pdfjs-dist/build/pdf.min.js',
  'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js',
};

// ---- shared in-memory store (lives in Node so all three browser tabs see the same data) ----
const store = new Map();
const downloads = [];
const errors = [];
const pages = [];
const parent = (p) => p.split('/').slice(0, -1).join('/');

// ---- static server: the published page is index.html inside the platform skeleton ----
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (url === '/' || url === '/index.html') {
    res.setHeader('content-type', 'text/html');
    return res.end('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '</body></html>');
  }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.end(fs.readFileSync(f));
});

// Mock of window.claude installed before the page's scripts run. Role comes from window.name.
function mockClaude() {
  let built = null;
  window.claude = { use: (n) => new Promise((r) => setTimeout(() => { built = built || build(); r(built[n] || null); }, 20)) };
  function build() {
  const role = window.name;
  const ids = { hr: 'u_hr', juan: 'u_juan', emp: 'u_emp_shared_dept' };
  const me = { id: ids[role], name: { hr: 'HR Account', juan: 'Juan Diaz', emp: 'Department Account' }[role], email: null, isOwner: role === 'hr', canEdit: role !== 'emp', avatarUrl: '', color: '#000' };
  const snap = (p, d) => ({ id: p.split('/').pop(), exists: d != null, data: () => d == null ? undefined : d, metadata: { fromCache: false, hasPendingWrites: false } });
  function docRef(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: async () => snap(p, await window.__dbGet(p)),
      set: async (d) => { await window.__dbSet(p, JSON.parse(JSON.stringify(d))); },
      update: async (d) => { const ok = await window.__dbUpdate(p, JSON.parse(JSON.stringify(d))); if (!ok) throw { code: 'invalid_argument', message: 'missing' }; },
      delete: async () => { await window.__dbDelete(p); },
      onSnapshot(next) {
        let last = '__init__', live = true;
        const tick = async () => { if (!live) return; const d = await window.__dbGet(p); const k = JSON.stringify(d); if (k !== last) { last = k; next(snap(p, d)); } setTimeout(tick, 250); };
        tick(); return () => { live = false; };
      },
      collection: (c) => collRef(p + '/' + c),
    };
  }
  function collRef(p) {
    const q = {
      path: p, doc: (id) => docRef(p + '/' + (id || Math.random().toString(36).slice(2))),
      get: async () => { const rows = await window.__dbList(p); const docs = rows.map(([k, d]) => snap(k, d)); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; },
      onSnapshot(next) {
        let last = '__init__', live = true;
        const tick = async () => { if (!live) return; const rows = await window.__dbList(p); const k = JSON.stringify(rows); if (k !== last) { last = k; const docs = rows.map(([kk, d]) => snap(kk, d)); next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }); } setTimeout(tick, 250); };
        tick(); return () => { live = false; };
      },
      where: () => q, orderBy: () => q, limit: () => q,
    };
    return q;
  }
  const db = { doc: docRef, collection: collRef };
  const user = { me: async () => me, id: async () => me.id, isOwner: async () => me.isOwner, canEdit: async () => me.canEdit, can: async () => null, profiles: async (list) => Object.fromEntries([].concat(list).map((i) => [i, { id: i, name: i === 'u_juan' ? 'Juan Diaz' : '', email: null, avatarUrl: '', color: '#000', isMe: i === me.id, guest: false }])) };
  const dl = { save: async ({ filename, data }) => { const b = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new TextEncoder().encode(String(data)); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); await window.__download(filename, btoa(s)); return { status: 'saved' }; } };
  return { db, user, downloads: dl, mcp: null };
  }
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  // HR's confirmed ₱38,000 salary package (from the October 2026 payroll projection) and an unconfirmed one.
  store.set('hr/config', { packages: [
    { id: 'p38000', name: '₱38,000 package', gross: 38000, confirmed: true, note: 'Test note.',
      earnings: [['Basic salary', 25000], ['Estimated night differential', 2843.75], ['Rice subsidy', 2500], ['Laundry allowance', 400], ['Qualifying night-shift meal benefit', 2100], ['Remaining compensation / guarantee adjustment', 5156.25]].map(([label, amount]) => ({ label, amount })),
      deductions: [['SSS employee', 1750], ['PhilHealth employee', 625], ['Pag-IBIG employee', 200], ['Estimated BIR withholding tax', 1438.75]].map(([label, amount]) => ({ label, amount })) },
    { id: 'p25760', name: '₱25,760 package', gross: 25760, confirmed: false, earnings: [{ label: 'Basic salary', amount: 25760 }], deductions: [] },
  ] });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.exposeFunction('__dbGet', (p) => store.has(p) ? store.get(p) : null);
  await ctx.exposeFunction('__dbSet', (p, d) => { store.set(p, d); });
  await ctx.exposeFunction('__dbUpdate', (p, d) => {
    if (!store.has(p)) return false;
    const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v); else a[k] = v; } return a; };
    store.set(p, merge(JSON.parse(JSON.stringify(store.get(p))), d)); return true;
  });
  await ctx.exposeFunction('__dbDelete', (p) => { store.delete(p); });
  await ctx.exposeFunction('__dbList', (p) => [...store.entries()].filter(([k]) => parent(k) === p).sort());
  await ctx.exposeFunction('__download', (name, b64) => { downloads.push({ name, bytes: Buffer.from(b64, 'base64') }); });
  await ctx.route(/cdnjs|unpkg|jsdelivr/, (route) => {
    const file = route.request().url().split('/').pop();
    if (CDN[file]) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, CDN[file])) });
    return route.abort();
  });
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await ctx.addInitScript(mockClaude);

  const open = async (role, hash = '') => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${role}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${role} console: ${m.text()}`); });
    await p.addInitScript((r) => { sessionStorage.setItem('role', r); window.name = r; }, role);
    await p.goto(base + 'index.html' + hash);
    pages.push([role, p]);
    return p;
  };
  const step = (t) => console.log('✓ ' + t);
  const T = 30000;

  // 1. HR uploads and issues
  const hr = await open('hr');
  await hr.getByText('Employment contracts').waitFor({ timeout: T });
  await hr.setInputFiles('#upload', pdfFile);
  await hr.getByText(/: added /).waitFor({ timeout: 60000 });
  await hr.getByRole('button', { name: 'Done' }).click();
  step('HR uploaded the draft; it was laid out in the onboarding format');
  await hr.getByRole('button', { name: 'Open' }).first().click();
  await hr.getByText('Wording check passed').waitFor({ timeout: T });
  await hr.locator('#f-dob').fill('2003-02-03');
  await hr.getByRole('button', { name: 'Save details' }).click();
  await hr.getByText('Birthdate on file.').waitFor({ timeout: T });
  await hr.locator('.doc-frame canvas').first().waitFor({ timeout: T });
  step('HR preview rendered and wording check passed');
  await hr.getByRole('button', { name: 'Issue for employee signature' }).click();
  await hr.getByText(/Access code \(HR only/).waitFor({ timeout: T });
  const empKey = [...store.keys()].find((k) => k.startsWith('hr/data/employees/'));
  const rec = store.get(empKey);
  if (!rec.accessCode || !store.has(`vault/${rec.vault}/d/record`)) throw new Error('issue did not create the employee record');
  step(`HR issued the contract; access code ${rec.accessCode} created`);
  await hr.getByRole('button', { name: 'Close' }).click();

  // 2. Employee: wrong code is refused, right code opens
  const emp = await open('emp');
  await emp.locator('#emp-name').fill(rec.name.split(' ')[0]);
  await emp.locator('#emp-name-list li').first().click();
  await emp.locator('#emp-code').fill('AAAA-BBBB-CCCC');
  await emp.getByRole('button', { name: 'Open my contract' }).click();
  await emp.getByText('That name and access code do not match').waitFor({ timeout: T });
  step('Wrong access code refused');
  await emp.goto(base + 'index.html?fresh=1#' + rec.accessCode);
  await emp.locator('#emp-name').fill(rec.name.split(' ')[0]);
  await emp.locator('#emp-name-list li').first().click();
  await emp.getByRole('button', { name: 'Open my contract' }).click();
  await emp.getByText('Understanding Your Monthly Compensation').waitFor({ timeout: T });
  const payText = await emp.locator('table.pay').innerText();
  if (!/Rice subsidy/.test(payText) || !/33,986\.25/.test(payText) || !/16,993\.13/.test(payText)) throw new Error('confirmed salary package not shown correctly:\n' + payText);
  if (/25,760/.test(await emp.locator('main').innerText())) throw new Error('another package leaked onto the page');
  step('Employee opened their own pay page with the personal link');
  await emp.getByRole('button', { name: 'I Understand — Review My Contract' }).click();
  await emp.locator('.doc-frame canvas').first().waitFor({ timeout: T });
  await emp.getByRole('button', { name: /Continue to sign/ }).click();
  const pad = await emp.locator('.pad canvas').boundingBox();
  await emp.mouse.move(pad.x + 40, pad.y + 120); await emp.mouse.down();
  for (let i = 0; i < 30; i++) await emp.mouse.move(pad.x + 40 + i * 9, pad.y + 110 + Math.sin(i / 2) * 30);
  await emp.mouse.up();
  await emp.getByRole('button', { name: 'Preview signature' }).click();
  await emp.locator('.sig-preview img').waitFor({ timeout: T });
  await emp.locator('#consent').check();
  await emp.getByRole('button', { name: 'Submit My Signature' }).click();
  await emp.getByText("Awaiting Juan's signature").waitFor({ timeout: T });
  step('Employee drew, previewed and submitted a signature');
  await emp.locator('.doc-frame canvas').first().waitFor({ timeout: T });
  await emp.getByRole('button', { name: 'Download my signed copy (PDF)' }).click();
  for (let i = 0; i < 40 && !downloads.length; i++) await new Promise((r) => setTimeout(r, 250));
  const partial = downloads.shift();
  if (!partial || !/AwaitingCompanySignature/.test(partial.name)) throw new Error('employee-signed copy was not offered');
  fs.writeFileSync(path.join(outDir, partial.name), partial.bytes);
  step('Employee sees and can download the contract with their own signature before Juan signs');
  await hr.waitForFunction(() => true);
  for (let i = 0; i < 40 && !store.get(empKey).employeeSig; i++) await new Promise((r) => setTimeout(r, 250));
  if (!store.get(empKey).employeeSig) throw new Error('HR did not lock the employee signature');
  step('HR console locked the employee signature');

  // 3. Juan requests the role, HR designates him, Juan batch-signs
  const juan = await open('juan');
  await juan.getByRole('button', { name: 'Request signatory role' }).click();
  await hr.getByRole('tab', { name: /Access codes/ }).click();
  await hr.getByRole('button', { name: 'Designate as signatory' }).click();
  await juan.getByText('Contracts waiting for your signature').waitFor({ timeout: T });
  step('Juan designated as signatory');
  await juan.locator('tbody input[type=checkbox]').first().check();
  await juan.getByRole('button', { name: /Review and Sign Selected Contracts \(1\)/ }).click();
  const jp = await juan.locator('.pad canvas').boundingBox();
  await juan.mouse.move(jp.x + 30, jp.y + 120); await juan.mouse.down();
  for (let i = 0; i < 30; i++) await juan.mouse.move(jp.x + 30 + i * 10, jp.y + 100 + Math.cos(i / 3) * 25);
  await juan.mouse.up();
  await juan.getByRole('button', { name: 'Preview signature' }).click();
  await juan.locator('#juan-name').fill('Juan Diaz');
  await juan.locator('#juan-consent').check();
  await juan.getByRole('button', { name: 'Sign 1 Contract' }).click();
  await juan.getByText('1 of 1 contracts fully signed.').waitFor({ timeout: 60000 });
  step('Juan signed the batch');

  // 4. Employee gets the fully signed copy; HR downloads PDF and ZIP
  await emp.getByText('Your Employment Contract Is Complete').waitFor({ timeout: T });
  await emp.getByRole('button', { name: 'Download My Signed Contract (PDF)' }).click();
  for (let i = 0; i < 40 && !downloads.length; i++) await new Promise((r) => setTimeout(r, 250));
  step('Employee saw the completion page and downloaded ' + (downloads[0] && downloads[0].name));
  await hr.getByRole('tab', { name: /Signed PDFs/ }).click();
  await hr.getByRole('button', { name: 'Download', exact: true }).click();
  await hr.getByRole('button', { name: /Download all as ZIP/ }).click();
  for (let i = 0; i < 40 && downloads.length < 3; i++) await new Promise((r) => setTimeout(r, 250));
  step('HR downloads: ' + downloads.slice(1).map((d) => d.name).join(', '));
  await hr.getByRole('tab', { name: /Activity history/ }).click();
  await hr.getByRole('button', { name: 'Export activity (CSV)' }).click();
  for (let i = 0; i < 40 && downloads.length < 4; i++) await new Promise((r) => setTimeout(r, 250));
  const csv = downloads[3] ? downloads[3].bytes.toString() : '';
  step('Activity history exported (' + (csv.split('\n').length - 1) + ' events)');

  downloads.forEach((d) => fs.writeFileSync(path.join(outDir, d.name), d.bytes));
  fs.writeFileSync(path.join(outDir, 'pay-page.txt'), payText);
  await emp.screenshot({ path: path.join(outDir, 'employee-complete.png'), fullPage: true });
  await juan.screenshot({ path: path.join(outDir, 'juan-done.png'), fullPage: true });
  console.log(errors.length ? 'Page errors:\n' + errors.join('\n') : 'No page errors.');
  await browser.close(); server.close();
})().catch(async (e) => {
  console.error('FAILED:', e.message.split('\n')[0]);
  console.error(errors.join('\n'));
  for (const [role, p] of pages) { try { console.error(`--- ${role} page text:\n` + (await p.locator('main').innerText()).slice(0, 600)); console.error(`--- ${role} dialog:\n` + (await p.locator('#layer').innerText()).slice(0, 1500)); } catch (_) {} }
  process.exit(1);
});
