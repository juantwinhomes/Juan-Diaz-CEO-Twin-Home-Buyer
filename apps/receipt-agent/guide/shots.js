// Drives the real Receipt Inbox page (v46) on made-up example data and saves screenshots plus button positions for the guide.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const PAGE = fs.readFileSync(path.join(DIR, '..', 'v6', 'page46.html'), 'utf8');
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });

// ---------- example data (not the company's) ----------
const iso = (d, h = 17) => d + 'T' + String(h).padStart(2, '0') + ':12:00.000Z';
let n = 0;
const k = () => 'ex' + (++n).toString(36).padStart(4, '0');
const row = (date, name, memo, split, account, amount, extra = {}) => Object.assign({ k: k(), date, type: amount < 0 ? 'Credit Card Credit' : 'Expense', num: '', name, memo, split, account, amount, payment: false }, extra);
const amex = 'Amex - 2001', cap1 = 'Capital One CC', hd = 'Home Depot - 5253', wf = 'WELLS FARGO (8251)';
const rows = {
  amexNov: [
    row('2026-11-05', 'Home Depot', 'THE HOME DEPOT #0628 SAN CARLOS CA XXXX5004', 'Inventory Asset:972 Norton St:Rehab Costs', amex, 1393.25),
    row('2026-11-05', 'Amazon', 'AMAZON MKTPL*ZX4TR2 AMZN.COM/BILL WA XXXX5004', 'Inventory Asset:820 28th St:Rehab & Holding Costs', amex, 131.22),
    row('2026-11-04', 'Google Ads', 'GOOGLE *ADS4471 MOUNTAIN VIEW CA XXXX5004', 'Acquisition Marketing:AM - PPC', amex, 410.10),
    row('2026-11-04', 'Facebook', 'FACEBK *Q7RXDS MENLO PARK CA XXXX5004', 'Advertising & Marketing:AM - Facebook', amex, 373.00),
    row('2026-11-03', 'Town Restaurant', 'AplPay TST* TOWN SAN CARLOS CA XXXX5004', 'Meals for the team', amex, 157.78),
    row('2026-11-03', 'Home Depot', 'AplPay THE HOME DEPOT SAN MATEO CA XXXX5004', 'Inventory Asset:972 Norton St:Rehab Costs', amex, 2117.06),
    row('2026-11-02', 'Ox Mountain', 'OX MOUNTAIN SUPPLY HALF MOON BAY CA XXXX5004', 'Inventory Asset:972 Norton St:Rehab Costs', amex, 318.00),
    row('2026-11-01', 'Foot Locker', 'AplPay FOOT LOCKER SAN MATEO CA XXXX5004', "Owner's Pay & Personal Expenses", amex, 230.68),
    row('2026-11-02', 'Uber', 'UBER *TRIP HELP.UBER.COM CA XXXX5004', 'Auto Expenses', amex, 23.40),
    row('2026-11-01', 'Jet Black Logistics', 'IN *JET BLACK LOGIST FRESNO CA XXXX5004', 'Inventory Asset:22496 Avenue 18 3/4:Rehab Costs', amex, 2273.25),
    row('2026-11-05', 'Amex payment', 'ONLINE PAYMENT - THANK YOU', '', amex, -5000, { payment: true, type: 'Credit Card Payment' })
  ],
  amexOct: [
    row('2026-10-24', 'TAP Air Portugal', 'TAP AIRLINES LISBON PR XXXX5004', 'Travel', amex, 1646.00),
    row('2026-10-20', 'Lyngso Materials', 'LYNGSO GARDEN MATERIAL SAN CARLOS CA XXXX5004', 'Inventory Asset:460 5th Ave:Rehab Costs', amex, 682.27)
  ],
  cap1Nov: [
    row('2026-11-03', 'Automated Genius', 'AUTO GENIUS - 1175', 'Sales Marketing', cap1, 598.83),
    row('2026-11-03', 'BBB', 'BBB OAKLAND - 1175', 'Legal & Professional Fees', cap1, 63.42)
  ],
  hdNov: [
    row('2026-11-02', 'Home Depot', 'sale original invoice #9901018', 'Inventory Asset:972 Norton St:Rehab Costs', hd, 1156.28),
    row('2026-11-01', 'Home Depot', 'sale original invoice #900652', '', hd, 341.57)
  ],
  wfNov: [
    row('2026-11-02', 'BEC CFO, LLC', 'BUSINESS TO BUSINESS ACH BEC CFO, LLC SALE', 'Legal & Professional Fees', wf, 1300.00),
    row('2026-11-01', 'Newrez Shellpoint', 'NEWREZ-SHELLPOIN ACH PMT 261101', 'Mortgages:8715 D St', wf, 3028.30),
    row('2026-11-03', 'State Farm', 'STATE FARM INSURANCE PMT', 'Insurance', wf, 404.78)
  ]
};
const pend = [row('2026-11-05', 'KZ Kitchen Cabinets', 'KZ KITCHEN CABINETS - 1175', '', cap1, 802.69, { type: 'Pending', suggest: 'Inventory Asset:972 Norton St:Rehab Costs' })];
const oxK = rows.amexNov[6].k;
const cards = new Map([
  ['amex-2001--2026-11', { account: amex, month: '2026-11', rows: rows.amexNov, marks: {}, found: { [oxK]: { id: 'f1', name: '$318.00 - Ox Mountain.pdf', url: 'https://drive.google.com/file/d/example', at: '2026-11-06T18:00:00Z', possible: false } }, from: '2026-11-01', to: '2026-11-05', uploadedAt: '2026-11-07T15:00:00Z', file: 'Transaction Detail by Account.xlsx' }],
  ['amex-2001--2026-10', { account: amex, month: '2026-10', rows: rows.amexOct, marks: {}, found: {}, from: '2026-10-20', to: '2026-10-24', uploadedAt: '2026-11-07T15:00:00Z', file: 'Transaction Detail by Account.xlsx' }],
  ['capital-one-cc--2026-11', { account: cap1, month: '2026-11', rows: rows.cap1Nov, marks: {}, found: {}, from: '2026-11-03', to: '2026-11-03', uploadedAt: '2026-11-07T15:00:00Z', file: 'Transaction Detail by Account.xlsx' }],
  ['home-depot-5253--2026-11', { account: hd, month: '2026-11', rows: rows.hdNov, marks: {}, found: {}, from: '2026-11-01', to: '2026-11-02', uploadedAt: '2026-11-07T15:00:00Z', file: 'Transaction Detail by Account.xlsx' }],
  ['wells-fargo-8251--2026-11', { account: wf, month: '2026-11', rows: rows.wfNov, marks: {}, found: {}, from: '2026-11-01', to: '2026-11-03', uploadedAt: '2026-11-07T15:00:00Z', file: 'Transaction Detail by Account.xlsx' }],
  ['pending-capital-one-cc', { account: cap1, pending: true, rows: pend, marks: {}, found: {}, from: '2026-11-05', to: '2026-11-05', uploadedAt: '2026-11-07T15:05:00Z', file: 'PCapital_One.csv' }]
]);
const vendors = new Map([['proxtra--2026-11', { source: 'proxtra', month: '2026-11', from: '2026-11-03', to: '2026-11-03', uploadedAt: '2026-11-07T15:10:00Z', file: 'Purchase_History.csv', rows: [
  { k: 'px1', date: '2026-11-03', total: 2117.06, store: '#0632, San Mateo', purchaser: 'Equity track Accounting dept', job: '972 Norton', order: 'H0632-570528', cards: ['5004'], payment: 'X-5004', nickname: 'AmEx 5004', invoice: '6901871' }
] }]]);
const rx = (id, source, subject, sender, day, x, status = 'new', extra = {}) => Object.assign({ id, threadId: id, source, subject, sender, emailDate: iso(day), viewUrl: 'https://mail.google.com/mail/?authuser=accounting@twinhomebuyer.com#all/' + id,
  extracted: Object.assign({ isReceipt: true, kind: 'purchase', vendor: null, date: day, total: null, itemsSubtotal: null, tax: null, orderNumber: null, items: null, location: null, note: null, cardLast4: null, readBy: 'rules' }, x),
  status, property: '', reviewedAt: null, scannedAt: '2026-11-07T15:00:00Z', scannedBy: 'accounting@twinhomebuyer.com' }, extra);
const receipts = [
  rx('ex-r01', 'homedepot', 'Hi Equity Track, your Home Depot receipt for # H0628-598932 is here', 'The Home Depot <HomeDepotReceipt@homedepot.com>', '2026-11-05', { vendor: 'Home Depot', total: 1393.25, tax: 118.69, orderNumber: 'H0628-598932', items: 'Pine stakes, Oatey washing machine valves', location: 'San Carlos #0628', readBy: 'pdf' }),
  rx('ex-r02', 'forwards', 'Fwd: Your Amazon.com order of Copper elbows', 'Era Santos <era@twinhomebuyer.com>', '2026-11-05', { vendor: 'Amazon', total: 131.22, orderNumber: '113-7811332-2580214', cardLast4: '5004', items: 'Copper elbows, pipe tape', readBy: 'claude' }),
  rx('ex-r03', 'vendors', 'Payment confirmation: Invoice #3745-(American Rock and Rent)', 'QuickBooks Payments <quickbooks@notification.intuit.com>', '2026-11-01', { vendor: 'QuickBooks Payments', total: 2273.25 }),
  rx('ex-r04', 'homedepot', 'Hi Equity Track, your Home Depot receipt for # H0632-572313 is here', 'The Home Depot <HomeDepotReceipt@homedepot.com>', '2026-11-02', { vendor: 'Home Depot', total: 1156.28, orderNumber: 'H0632-572313', location: 'San Mateo #0632', readBy: 'pdf' }),
  rx('ex-r05', 'uber', 'Your Saturday trip with Uber', 'Uber Receipts <noreply@uber.com>', '2026-11-02', { vendor: 'Uber', total: 23.40, cardLast4: '5004' }, 'good'),
  rx('ex-r06', 'vendors', "Your Lowe's order receipt", "Lowe's <orders@lowes.com>", '2026-11-04', { vendor: "Lowe's", total: 249.54, orderNumber: '300902288263968118' }),
  rx('ex-r07', 'other', 'Receipt $142.37 820 28th St', 'Jose Ramos <jose@twinhomebuyer.com>', '2026-11-06', { vendor: 'Ace Hardware', total: 142.37, location: '820 28th St', items: 'Crew receipt photo', readBy: 'claude' }),
  rx('ex-r08', 'juan', 'Fwd: Your receipt from Apple', 'Juan Diaz <juan@twinhomebuyer.com>', '2026-11-05', { vendor: 'Apple', total: 200.00, items: 'Apple usage credits', note: 'For the AI tools account' }),
  rx('ex-r09', 'other', 'Your weekly market report', 'Bay Area Realty News <news@example-realty.com>', '2026-11-04', { isReceipt: false, vendor: 'Bay Area Realty News' }, 'not_receipt'),
  rx('ex-r10', 'teamsent', 'Starlink invoice', 'Era Santos <era@twinhomebuyer.com>', '2026-11-06', { vendor: null, total: null, items: null, readBy: 'rules' })
];
const holders = { '5004': 'Juan Diaz', '5253': 'John Decena', '8251': 'Juan Diaz' };
const info = { [rows.amexNov[6].k]: { approvedBy: 'Juan Diaz', at: '2026-11-07T16:00:00Z', by: 'darlyn' } };
const bodies = {
  'ex-r01': 'Customer Receipt\nThe Home Depot #0628, 1125 Old County Rd, San Carlos, CA\nOrder # H0628-598932\nJob name: 972 Norton San Mateo\n\nPine stakes (12-pack) x4  $16.56\nOatey washing machine valves  $63.00\n...\nSubtotal  $1,274.56\nTax  $118.69\nTotal  $1,393.25',
  'ex-r02': 'Forwarded message from Era Santos: crew order for 820 28th St.\n\nOrder #113-7811332-2580214\nCopper elbows (10 pack), pipe tape\nOrder total: $131.22\nPaid with Amex ending 5004',
  'ex-r03': 'QuickBooks Payments\nPayment confirmation\nInvoice #3745 from American Rock and Rent\nAmount paid: $2,273.25\nPayment method: Amex ending 5004',
  'ex-r06': "Thank you for shopping at Lowe's.\nOrder #300902288263968118\nTotal: $249.54",
  'ex-r07': 'Photo attached: Ace Hardware receipt for 820 28th St.',
  'ex-r08': 'Juan forwarded this receipt.\nApple usage credits  $200.00',
  'ex-r09': 'This week in Bay Area real estate...'
};

const stub = `<script>
(function(){
  const docs = ${JSON.stringify(receipts)};
  const listeners = { receipts: [], cards: [], charges: [], vendors: [] };
  const store = { cards: new Map(${JSON.stringify([...cards])}), vendors: new Map(${JSON.stringify([...vendors])}), charges: new Map(Object.entries(${JSON.stringify(info)})) };
  const snapOf = arr => ({ docs: arr.map(d => ({ id: d.id, data: () => d })), metadata: { fromCache: false } });
  const arrOf = name => name === "receipts" ? docs : [...store[name].entries()].map(([id, d]) => Object.assign({ id }, d));
  const fire = name => { for (const n of listeners[name]) n(snapOf(arrOf(name))); };
  let holders = ${JSON.stringify(holders)}; const hl = [];
  const db = {
    collection: name => ({
      orderBy: () => ({ limit: () => ({ onSnapshot: n => { listeners[name].push(n); setTimeout(() => fire(name), 30); return () => {}; } }) }),
      onSnapshot: n => { listeners[name].push(n); setTimeout(() => fire(name), 30); return () => {}; },
      doc: id => ({
        update: async p => { if (name === "receipts") { const d = docs.find(x => x.id === id); if (d) Object.assign(d, p); } else if (store[name] && store[name].get(id)) Object.assign(store[name].get(id), p); setTimeout(() => fire(name), 10); },
        set: async d => { if (name === "receipts") { const i = docs.findIndex(x => x.id === id); if (i >= 0) docs[i] = Object.assign({ id }, d); else docs.push(Object.assign({ id }, d)); } else store[name].set(id, JSON.parse(JSON.stringify(d))); setTimeout(() => fire(name), 10); },
        delete: async () => { if (store[name]) store[name].delete(id); setTimeout(() => fire(name), 10); }
      })
    }),
    doc: p => ({
      onSnapshot: n => { if (p === "meta/cardholders") { hl.push(n); setTimeout(() => n({ exists: true, data: () => ({ holders }) }), 30); } else setTimeout(() => n({ exists: p === "meta/usage", data: () => ({ months: { "2026-11": { receipts: 93, calls: 17 } } }) }), 30); return () => {}; },
      get: async () => ({ exists: false }),
      set: async d => { if (p === "meta/cardholders") { holders = d.holders; hl.forEach(n => n({ exists: true, data: () => ({ holders }) })); } }
    })
  };
  const bodies = ${JSON.stringify(bodies)};
  const mcp = { callTool: async (s, t, i) => {
    if (s === "Gmail" && t === "get_message") { const d = docs.find(x => x.id === i.messageId) || {}; return { payload: { subject: d.subject, sender: d.sender, date: d.emailDate, plaintextBody: bodies[i.messageId] || "", attachments: [] } }; }
    if (s === "Google Drive") {
      const q = i.query || "";
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'") || q.includes("parentId = '0AJUvSfJqg5l9Uk9PVA'")) return { payload: { files: [{ id: "cAmex", title: "AmEx Receipt", parentId: "0AJUvSfJqg5l9Uk9PVA" }, { id: "cCap", title: "Capital One Personal", parentId: "0AJUvSfJqg5l9Uk9PVA" }, { id: "cHD", title: "Home Depot Card *5253", parentId: "0AJUvSfJqg5l9Uk9PVA" }] } };
      if (q.includes("parentId = 'cAmex'")) return { payload: { files: [{ id: "mNov", title: "NOVEMBER 2026", parentId: "cAmex" }] } };
      return { payload: { files: [] } };
    }
    return { payload: { threads: [] } };
  } };
  window.claude = { use: n => Promise.resolve(n === "db" ? db : n === "mcp" ? mcp : n === "downloads" ? { save: async () => ({ status: "saved" }) } : null) };
})();
</script>`;
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>' + stub + '</head><body>' + PAGE + '</body></html>';

const W = 1440, H = 900;
const hotspots = {};
async function shot(page, name, targets, opts = {}) {
  await page.waitForTimeout(250);
  const vw = opts.width || W, vh = opts.height || H;
  const boxes = {};
  for (const [key, sel] of Object.entries(targets)) {
    const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
    try {
      const b = await el.boundingBox({ timeout: 1500 });
      if (b) boxes[key] = { x: +(100 * b.x / vw).toFixed(2), y: +(100 * b.y / vh).toFixed(2), w: +(100 * b.width / vw).toFixed(2), h: +(100 * b.height / vh).toFixed(2) };
      else console.log('  no box for', name, key);
    } catch (e) { console.log('  missing', name, key); }
  }
  await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 84 });
  hotspots[name] = { w: vw, h: vh, boxes };
  console.log('shot', name, Object.keys(boxes).length + '/' + Object.keys(targets).length);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, colorScheme: 'dark' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  // 1. Receipts view, the first receipt open.
  await page.locator('#items .item', { hasText: 'H0628-598932' }).first().click(); await page.waitForTimeout(700);
  await shot(page, 'receipts', {
    views: '.views', scan: '#scan', lookback: '#days', saveSheet: '#saveSheet', openSheet: '#openSheet', urgent: '#urgent',
    tabs: '#tabs', search: '#search', source: '#source', cmatch: '#cmatch', rdate: '#rdate', selAll: '.qmeta label',
    item: page.locator('#items .item', { hasText: 'H0628-598932' }).first(), ctag: page.locator('#items .item', { hasText: 'H0628-598932' }).first().locator('.ctag'), good: '#detail .d-actions .btn.good', followup: '#detail .d-actions .btn >> nth=1',
    notreceipt: '#detail .d-actions .btn >> nth=2', download: '#detail .d-actions .btn >> nth=3', gmail: '#detail .d-actions a.btn',
    property: '#detail .field input', facts: '#detail .facts dl', matchbox: '#detail .matchbox', viewer: '#detail .viewer'
  });

  // 2. A possible match to confirm.
  const conf = page.locator('#items .item', { hasText: 'American Rock and Rent' }).first();
  await conf.click(); await page.waitForTimeout(600);
  await page.evaluate(() => { const d = document.getElementById('detail'); d.scrollTop = d.scrollHeight; }); await page.waitForTimeout(300);
  await shot(page, 'confirm', { item: conf, matchbox: '#detail .matchbox', yes: '#detail .matchbox .btn.good', no: '#detail .matchbox .btn.ghost', facts: '#detail .facts dl' });

  // 3. Clearing matched receipts in one go.
  await page.selectOption('#cmatch', 'on'); await page.waitForTimeout(300);
  await page.check('#selAll'); await page.waitForTimeout(300);
  await shot(page, 'bulkreceipts', { cmatch: '#cmatch', selAll: '.qmeta label', bulk: '#bulk', bulkGood: '#bulk button >> nth=0', bulkNot: '#bulk button >> nth=1' });
  await page.uncheck('#selAll'); await page.selectOption('#cmatch', 'all'); await page.waitForTimeout(300);

  // 4. Card charges view.
  await page.click('#viewCards'); await page.waitForTimeout(500);
  await page.click('#cAll'); await page.waitForTimeout(500);
  await shot(page, 'cards', {
    title: '#cStats', upload: '#cardUpload', driveCheck: '#driveCheck', driveSearch: '#driveSearch', copyReport: '#copyReport', exportX: '#cardExport',
    range: '.c-range .vseg', from: 'label[for="cFrom"]', card: '#cCard', sort: '#cSort', tiles: '#cTabs', missing: '#cTabs .kpi[data-key="missing"]',
    check: '#cTabs .kpi[data-key="check"]', matched: '#cTabs .kpi[data-key="matched"]', drive: '#cTabs .kpi[data-key="drive"]', skipped: '#cTabs .kpi[data-key="skipped"]', nocharge: '#cTabs .kpi[data-key="nocharge"]',
    flags: '#cFlagTabs', bills: '#cBills', holders: '#cHolders', head: '#cList .crow.head', row: '#cList .crow:not(.head)', due: '#cList .crow:not(.head) .due',
    ask: '#cList .crow:not(.head) .c-ask', fillin: '#cList .crow:not(.head) .c-act .btn >> nth=0', uploadRow: '#cList .crow:not(.head) .c-act .btn >> nth=1', notneeded: '#cList .crow:not(.head) .c-act .btn >> nth=2',
    buyer: '#cList .crow:not(.head) .c-card'
  });

  // 5. Rows filed in Drive and by Pro Xtra.
  await page.click('#cTabs .kpi[data-key="drive"]'); await page.waitForTimeout(400);
  await shot(page, 'filed', { tile: '#cTabs .kpi[data-key="drive"]', rows: '#cList', pro: page.locator('#cList .crow', { hasText: 'Pro Xtra' }).first(), drive: page.locator('#cList .crow', { hasText: 'In Drive' }).first() });
  await page.click('#cTabs .kpi[data-key="missing"]'); await page.waitForTimeout(300);

  // 6. Fill in one charge.
  await page.locator('#cList .crow:not(.head) .c-act .btn').first().click(); await page.waitForTimeout(400);
  await shot(page, 'fillin', { panel: '.edit-panel', bought: '.edit-panel .ef >> nth=0', approved: '.edit-panel .ef >> nth=1', what: '.edit-panel .ef >> nth=2', prop: '.edit-panel .ef >> nth=3', flag: '.edit-panel .ef-check', save: '.edit-panel .btn.primary' });
  await page.locator('.edit-panel .btn.ghost').first().click(); await page.waitForTimeout(300);

  // 7. Tick several and approve together.
  await page.click('#cFlagTabs .kpi[data-key="f:noapprover"]'); await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) { await page.locator('#cList .crow:not(.head) .c-date input').nth(i).check(); await page.waitForTimeout(120); }
  await page.fill('.bulk-edit .ef >> nth=1 >> input', 'Juan Diaz');
  await shot(page, 'bulkfill', { flag: '#cFlagTabs .kpi[data-key="f:noapprover"]', tick: '#cList .crow:not(.head) .c-date input', tickAll: '#cList .crow.head input', bar: '.bulk-edit', approved: '.bulk-edit .ef >> nth=1', apply: '.bulk-edit .btn.primary' });
  await page.locator('.bulk-edit .btn.ghost').click(); await page.waitForTimeout(300);
  await page.click('#cTabs .kpi[data-key="missing"]'); await page.waitForTimeout(300);

  // 8. Upload a receipt on a charge.
  await page.locator('#cList .crow:not(.head) .c-act .btn', { hasText: 'Upload' }).first().click(); await page.waitForTimeout(900);
  await shot(page, 'upload', { button: '#cList .crow:not(.head) .c-act .btn.primary', panel: '.up-panel:not(.edit-panel)' });
  await page.locator('#cList .crow:not(.head) .c-act .btn.primary').first().click(); await page.waitForTimeout(300);

  // 9. Card holders window.
  await page.click('#cHolders'); await page.waitForTimeout(500);
  await shot(page, 'holders', { dialog: '#holdersDlg', table: '#cHoldersList', input: '#cHoldersList input', close: '#holdersClose' });
  await page.click('#holdersClose'); await page.waitForTimeout(300);

  // 10. Uploading the For review files (bank transactions).
  const feedDir = path.join(DIR, '..', 'bankfeed2');
  const files = [path.join(feedDir, 'cap1cc', 'pCapital_One (7).csv'), path.join(feedDir, 'wf8251', 'PWells_Fargo-1-1.csv'), path.join(feedDir, 'cap1cc', 'Capital_One (8).csv')];
  await page.setInputFiles('#cardFile', files); await page.waitForTimeout(1500);
  await shot(page, 'feed', { upload: '#cardUpload', panel: '.feed-panel', select: '.feed-line select', load: '.feed-panel .btn.primary' });
  await page.locator('.feed-panel .btn.ghost').click(); await page.waitForTimeout(300);

  // 11. The urgency bar and the toolbar, close up.
  await shot(page, 'top', { urgent: '#urgent', late: '#urgent .u-item >> nth=0', due: '#urgent .u-item >> nth=1', confirm: '#urgent .u-item >> nth=2', waiting: '#urgent .u-item >> nth=3', scan: '#scan', saveSheet: '#saveSheet' });

  // 12. The report text.
  await page.click('#cAll'); await page.waitForTimeout(300);
  await page.click('#copyReport'); await page.waitForTimeout(400);
  const report = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (e) { return document.getElementById('reportBox').value; } });
  fs.writeFileSync(path.join(OUT, 'report.txt'), report);

  // 13. Phone.
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
  await page.click('#viewReceipts'); await page.waitForTimeout(400);
  await shot(page, 'phone', { views: '.views', tabs: '#tabs', item: '#items .item' }, { width: 390, height: 844 });

  fs.writeFileSync(path.join(OUT, 'hotspots.json'), JSON.stringify(hotspots, null, 1));
  console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
  await browser.close();
})();
