/*
 * Equity Track contract signing — core logic.
 * Pure functions shared by the page (app.js) and the Node tests.
 * Nothing in this file holds employee data.
 */
(function (root) {
  'use strict';
  const ET = {};

  /* ---------------- Dates (Philippine time) ---------------- */
  ET.TZ = 'Asia/Manila';
  function fmt(iso, opts) {
    return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: ET.TZ }, opts)).format(new Date(iso));
  }
  ET.phDateLong = (iso) => fmt(iso, { year: 'numeric', month: 'long', day: 'numeric' });
  ET.phDateTime = (iso) =>
    fmt(iso, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' PHT';
  ET.phYMD = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: ET.TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  ET.dobLong = (ymd) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
  };

  /* ---------------- Names and employee codes ---------------- */
  const SUFFIXES = /^(jr|sr|ii|iii|iv|v)\.?$/i;
  ET.normName = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  /** Maria Santos + 2001-07-17 -> MS-170701 (initials, then DDMMYY). */
  ET.employeeCode = function (name, dob) {
    const words = String(name || '').trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w) && !SUFFIXES.test(w));
    if (!words.length || !/^\d{4}-\d{2}-\d{2}$/.test(dob || '')) return '';
    const initials = (words[0][0] + words[words.length - 1][0]).toUpperCase();
    const [y, m, d] = dob.split('-');
    return `${initials}-${d}${m}${y.slice(2)}`;
  };

  /** Assigns unique codes; a duplicate base code gets -2, -3 ... in creation order. */
  ET.assignCodes = function (records) {
    const sorted = records.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.key).localeCompare(String(b.key)));
    const seen = {};
    const out = {};
    for (const r of sorted) {
      const base = ET.employeeCode(r.name, r.dob);
      if (!base) { out[r.key] = ''; continue; }
      seen[base] = (seen[base] || 0) + 1;
      out[r.key] = seen[base] === 1 ? base : `${base}-${seen[base]}`;
    }
    return out;
  };

  /* ---------------- Money ---------------- */
  ET.round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  ET.peso = (n) => '₱' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (s) => Number(String(s).replace(/,/g, ''));

  /* ---------------- Hashing ---------------- */
  ET.sha256Hex = async function (bytes) {
    const buf = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  ET.b64FromBytes = function (bytes) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return root.btoa(s);
  };
  ET.bytesFromB64 = function (b64) {
    const s = root.atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };
  ET.randomId = function (len) {
    const a = new Uint8Array(len);
    root.crypto.getRandomValues(a);
    return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  /* ---------------- PDF text extraction (pdf.js) ---------------- */
  ET.extractPdf = async function (pdfjsLib, bytes) {
    const doc = await pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      await page.getOperatorList(); // loads fonts so bold faces can be recognised by name
      const tc = await page.getTextContent();
      const fontName = (id) => { try { return page.commonObjs.get(id).name || ''; } catch (_) { return ''; } };
      const items = tc.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, size: Math.abs(it.transform[3]) || 10, bold: /bold/i.test(fontName(it.fontName)) }));
      pages.push({ items });
    }
    return { pages };
  };

  /** Lines of text in reading order, used for display diffs between versions. */
  ET.textLines = function (pages) {
    const lines = [];
    for (const pg of pages) {
      const rows = [];
      for (const it of pg.items) {
        let row = rows.find((r) => Math.abs(r.y - it.y) < 2);
        if (!row) rows.push((row = { y: it.y, parts: [] }));
        row.parts.push(it);
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(' ').replace(/\s+([,.;:)])/g, '$1').replace(/\s+/g, ' ').trim());
    }
    return lines;
  };

  /** Reads the approved terms out of one of Juan's drafted contracts. Never edits them. */
  ET.parseContract = function (pages) {
    const full = pages.map((p) => p.items.map((i) => i.str).join(' ')).join(' ').replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1');
    const issues = [];
    const m = (re) => { const r = full.match(re); return r ? r[1].trim() : ''; };
    const name = m(/represented by its CEO Juan Diaz, and (.+?) \(the "Employee"\)/).replace(/\s+/g, ' ');
    const titleLine = m(/EMPLOYMENT CONTRACT (.+?) · Effective/);
    const effective = m(/cut-off starting ([A-Z][a-z]+ \d{1,2}, \d{4})/);
    const startDate = m(/employment began on ([A-Z][a-z]+ \d{1,2}, \d{4})/);
    const monthlyS = m(/Monthly salary \(gross, before deductions\) ₱\s?([\d,]+\.\d{2})/);
    const perCutS = m(/Per cut-off \(gross, before deductions\) ₱\s?([\d,]+\.\d{2})/);
    const hourlyS = m(/hourly rate ₱\s?([\d,]+\.\d{2})/);
    const dailyS = m(/daily rate ₱\s?([\d,]+\.\d{2})/);
    const monthly = monthlyS ? num(monthlyS) : 0;
    const perCutoff = perCutS ? num(perCutS) : 0;
    const managerial = /managerial/i.test(full);
    const hasNightDiff = /Night shift differential/i.test(full) && !/no night-shift premium/i.test(full);

    if (!name) issues.push('Employee name not found in the opening paragraph.');
    if (!titleLine) issues.push('Position line under the title not found.');
    if (!monthly) issues.push('Monthly salary not found in section SALARY.');
    if (monthly && perCutoff && ET.round2(monthly / 2) !== ET.round2(perCutoff)) issues.push('Per cut-off amount is not half of the monthly salary. Check the draft with Juan.');
    if (!startDate) issues.push(/employment began on _{3,}/.test(full) ? 'The start date is blank in this draft. Ask Juan for a revised PDF with the date filled in; it cannot be typed in here.' : 'Start date not found.');

    const all = pages.flatMap((p) => p.items.map((i) => i.str.trim()));
    if (!all.includes('JUAN DIAZ') || !name || !all.some((t) => t.toUpperCase() === name.toUpperCase()))
      issues.push('Signature block (JUAN DIAZ and the employee name) not found, so signatures cannot be placed.');

    return {
      name, position: titleLine, effective, startDate, monthly, perCutoff,
      hourly: hourlyS ? num(hourlyS) : 0, daily: dailyS ? num(dailyS) : 0,
      managerial, hasNightDiff, issues,
    };
  };

  /* ---------------- Re-typeset Juan's draft in the onboarding-packet format ---------------- */
  // The wording comes only from Juan's draft. The packet supplies the layout: long-bond page, header banner,
  // Arial-style type, ruled sections and stacked signature blocks. Letterhead contact lines are the only additions.
  ET.LETTERHEAD = { phone: 'Phone: 0995-125-9905 | 0947-261-8667', email: 'hr@equitytrackph.com' };
  ET.FORMAT_EXTRAS = [ET.LETTERHEAD.phone, 'Email: ' + ET.LETTERHEAD.email, 'Signature:', 'Signature:'];
  const squash = (t) => String(t).replace(/[\s_]+/g, '');

  /** Every character of a PDF in reading-stream order, ignoring spaces and blank-line underscores. */
  ET.fingerprintText = (pages, minY) => squash(pages.map((p) => p.items.filter((i) => minY == null || i.y > minY).map((i) => i.str).join('')).join(''));

  function toRuns(items) {
    const runs = [];
    let prev = null;
    for (const it of items) {
      let t = it.str.replace(/\s+/g, ' ');
      if (prev && it.x - (prev.x + prev.w) > it.size * 0.12 && !/^ /.test(t) && !/ $/.test(runs[runs.length - 1].t)) t = ' ' + t;
      const last = runs[runs.length - 1];
      if (last && last.b === it.bold) last.t += t; else runs.push({ t, b: it.bold });
      prev = it;
    }
    return runs;
  }
  const runsText = (runs) => runs.map((r) => r.t).join('').replace(/\s+/g, ' ').trim();
  function appendRuns(into, more) {
    const last = into[into.length - 1];
    const joinNoSpace = /[A-Za-z]-$/.test(last.t.trimEnd());
    const first = Object.assign({}, more[0], { t: (joinNoSpace ? '' : ' ') + more[0].t.replace(/^ +/, '') });
    if (joinNoSpace) last.t = last.t.trimEnd();
    [first, ...more.slice(1)].forEach((r) => { const l = into[into.length - 1]; if (l.b === r.b) l.t += r.t; else into.push(Object.assign({}, r)); });
  }
  function groupLines(items, page) {
    const rows = [];
    for (const it of items) {
      let r = rows.find((q) => Math.abs(q.y - it.y) < 1.5);
      if (!r) rows.push((r = { page, y: it.y, items: [] }));
      r.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      r.x = r.items[0].x;
      const last = r.items[r.items.length - 1];
      r.right = last.x + last.w;
      r.size = Math.max(...r.items.map((i) => i.size));
    }
    return rows;
  }

  /** Splits Juan's draft into letterhead, title, blocks and signature lines without changing a character. */
  ET.structureDraft = function (pages) {
    const lines = pages.flatMap((pg, pi) => groupLines(pg.items, pi));
    const xs = {};
    lines.forEach((l) => { const k = Math.round(l.x); xs[k] = (xs[k] || 0) + 1; });
    const left = Number(Object.entries(xs).sort((a, b) => b[1] - a[1])[0][0]);
    const firstBody = lines.findIndex((l) => Math.abs(l.x - left) < 1.5);
    const sigIdx = lines.findIndex((l, i) => i > firstBody && l.items[0].str.trim() === 'JUAN DIAZ');
    if (firstBody < 3 || sigIdx < 0) throw new Error('This PDF does not follow the drafted contract layout (letterhead, title, sections, signature block).');
    const header = lines.slice(0, firstBody).map((l) => runsText(toRuns(l.items)));
    const body = lines.slice(firstBody, sigIdx);
    const maxRight = Math.max(...body.map((l) => l.right));
    const blocks = [];
    let cur = null, prev = null;
    for (const l of body) {
      const runs = toRuns(l.items);
      const txt = runsText(runs);
      let gapAt = -1;
      for (let k = 1; k < l.items.length; k++) if (l.items[k].x - (l.items[k - 1].x + l.items[k - 1].w) > 40) gapAt = k;
      if (l.items.every((i) => i.bold) && /^\d+\.\s/.test(txt)) { blocks.push({ type: 'h', text: txt }); cur = null; prev = l; continue; }
      if (gapAt > 0) { blocks.push({ type: 'row', left: toRuns(l.items.slice(0, gapAt)), right: toRuns(l.items.slice(gapAt)) }); cur = null; prev = l; continue; }
      const kind = l.x > left + 5 ? 'li' : 'p';
      let cont = false;
      if (cur && cur.type === kind && prev) cont = prev.page === l.page ? prev.y - l.y < l.size * 1.55 : prev.right > maxRight - 25;
      if (cont) appendRuns(cur.runs, runs);
      else { cur = { type: kind, runs: runs.map((r) => Object.assign({}, r)) }; blocks.push(cur); }
      prev = l;
    }
    blocks.forEach((b) => { for (const k of ['runs', 'left', 'right']) if (b[k]) { b[k] = b[k].map((r) => ({ t: r.t.replace(/\s+/g, ' '), b: r.b })); b[k][0].t = b[k][0].t.trimStart(); b[k][b[k].length - 1].t = b[k][b[k].length - 1].t.trimEnd(); } });
    const sigItems = lines.slice(sigIdx).flatMap((l) => l.items);
    const col = (pred) => groupLines(sigItems.filter(pred), 0).map((l) => runsText(toRuns(l.items)));
    return {
      letterhead: { name: header[0], address: header[1] },
      title: header[2], subtitle: header.slice(3).join(' '),
      blocks,
      signature: { company: col((i) => i.x < 300), employee: col((i) => i.x >= 300) },
    };
  };

  ET.modelText = (m) => squash([m.letterhead.name, m.letterhead.address, m.title, m.subtitle,
    ...m.blocks.map((b) => b.type === 'h' ? b.text : b.type === 'row' ? runsText(b.left) + runsText(b.right) : runsText(b.runs)),
    ...m.signature.company, ...m.signature.employee].join(''));

  /** Draws the contract in the packet layout. Returns the PDF and where each signature and date go. */
  ET.renderPacketPdf = async function (PDFLib, fontkit, assets, m) {
    const { PDFDocument, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const R = await doc.embedFont(assets.regular, { subset: true });
    const B = await doc.embedFont(assets.bold, { subset: true });
    const banner = await doc.embedJpg(assets.banner);
    const supported = new Set(R.getCharacterSet());
    const W = 612, H = 936, L = 50, RX = 562, CW = RX - L, TOP = 850, BOTTOM = 60, SZ = 10, LEAD = 12;
    const ink = rgb(0, 0, 0), rule = rgb(0.6, 0.6, 0.6), link = rgb(0.07, 0.33, 0.8);
    const font = (b) => (b ? B : R);
    const pages = [];
    let page, y;
    const newPage = () => { page = doc.addPage([W, H]); pages.push(page); page.drawImage(banner, { x: 9.72, y: H - 9.72 - 66.6, width: 592.9, height: 66.6 }); y = TOP; };
    const ensure = (h) => { if (y - h < BOTTOM) newPage(); };
    const draw = (t, x, b, size = SZ, color = ink) => {
      for (const ch of t) if (!supported.has(ch.codePointAt(0))) throw new Error(`The character "${ch}" cannot be printed in the contract font.`);
      page.drawText(t, { x, y, size, font: font(b), color });
      return font(b).widthOfTextAtSize(t, size);
    };
    const line = (x1, x2, yy) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: rule });
    const ruleBreak = () => { ensure(LEAD * 3); y -= 7; line(L, RX, y); y -= 3; };
    const spaceW = R.widthOfTextAtSize(' ', SZ);
    function words(runs) {
      const out = []; let w = null;
      for (const r of runs) for (const p of r.t.split(/( +)/)) {
        if (!p) continue;
        if (/^ +$/.test(p)) { w = null; continue; }
        if (!w) { w = { segs: [], w: 0 }; out.push(w); }
        const pw = font(r.b).widthOfTextAtSize(p, SZ);
        w.segs.push({ t: p, b: r.b, w: pw }); w.w += pw;
      }
      return out;
    }
    function para(runs, x0, width, onFirst) {
      const ws = words(runs); const rows = []; let row = [], rw = 0;
      for (const w of ws) { if (row.length && rw + spaceW + w.w > width) { rows.push({ row, rw }); row = []; rw = 0; } rw += (row.length ? spaceW : 0) + w.w; row.push(w); }
      if (row.length) rows.push({ row, rw });
      rows.forEach(({ row: r, rw: used }, i) => {
        ensure(LEAD); y -= LEAD;
        if (i === 0 && onFirst) onFirst();
        let extra = i < rows.length - 1 && r.length > 1 ? (width - used) / (r.length - 1) : 0;
        if (extra > 14) extra = 0;
        let x = x0;
        r.forEach((w) => { w.segs.forEach((sg) => { draw(sg.t, x, sg.b); x += sg.w; }); x += spaceW + extra; });
      });
    }

    newPage();
    y -= LEAD; draw(m.letterhead.name, L, true);
    y -= LEAD; draw(m.letterhead.address, L, false);
    y -= LEAD; draw(ET.LETTERHEAD.phone, L, false);
    y -= LEAD; const ew = draw('Email: ', L, false); const lw = draw(ET.LETTERHEAD.email, L + ew, false, SZ, link); line(L + ew, L + ew + lw, y - 1.5);
    y -= 10;
    y -= LEAD + 1; draw(m.title, L, true, 11);
    if (m.subtitle) { y -= LEAD; draw(m.subtitle, L, true); }
    y -= 6;
    let prevType = null;
    for (const b of m.blocks) {
      if (b.type === 'h') { ruleBreak(); y -= LEAD; draw(b.text, L, true); y -= 1; }
      else if (b.type === 'p') { if (prevType === 'p' || prevType === 'li' || prevType === 'row') y -= 4; para(b.runs, L, CW); }
      else if (b.type === 'li') { y -= prevType === 'li' ? 2 : 2; para(b.runs, L + 32, CW - 32, () => page.drawCircle({ x: L + 19, y: y + 3.4, size: 1.6, color: ink })); }
      else if (b.type === 'row') {
        if (prevType !== 'row') y -= 6;
        ensure(18); y -= 17;
        page.drawRectangle({ x: L, y: y - 5.5, width: CW, height: 17, borderColor: rule, borderWidth: 0.6 });
        let x = L + 8; b.left.forEach((r) => { x += draw(r.t, x, r.b); });
        const rw = b.right.reduce((a, r) => a + font(r.b).widthOfTextAtSize(r.t, SZ), 0);
        x = RX - 8 - rw; b.right.forEach((r) => { x += draw(r.t, x, r.b); });
      }
      if (b.type === 'row') y -= 0; else if (prevType === 'row' && b.type !== 'row') y -= 2;
      prevType = b.type;
    }

    // Signature blocks, kept together on one page.
    const anchors = { page: 0 };
    ensure(250);
    function sigBlock(lines, key) {
      ruleBreak();
      const textLines = lines.filter((t) => !/^Date:/.test(t));
      const dateLine = lines.find((t) => /^Date:/.test(t)) || 'Date:';
      textLines.forEach((t, i) => { y -= LEAD; draw(t, L, i === 0); });
      y -= 30;
      const sw = draw('Signature:', L, false);
      line(L + sw + 4, L + sw + 170, y - 2);
      const sig = { x: L + sw + 10, y };
      y -= LEAD + 4;
      const dateLabel = dateLine.replace(/[_\s]+$/, '');
      const dw = draw(dateLabel, L, false);
      line(L + dw + 4, L + dw + 170, y - 2);
      anchors[key] = { sig, date: { x: L + dw + 8, y, size: SZ } };
      anchors.page = pages.length - 1;
    }
    sigBlock(m.signature.company, 'company');
    sigBlock(m.signature.employee, 'employee');

    pages.forEach((pg, i) => { const t = String(i + 1); pg.drawText(t, { x: RX - R.widthOfTextAtSize(t, 10), y: 26, size: 10, font: R, color: ink }); });
    doc.setTitle('Employment Contract'); doc.setAuthor('Equity Track Inc. Philippines'); doc.setProducer('Equity Track contract signing');
    return { bytes: await doc.save(), anchors, pageCount: pages.length };
  };

  /** Reads the formatted PDF back and confirms it carries exactly the draft's characters, in order. */
  ET.verifyFormatted = async function (pdfjsLib, bytes, expected) {
    const { pages } = await ET.extractPdf(pdfjsLib, bytes);
    let got = ET.fingerprintText(pages, 45);
    for (const extra of ET.FORMAT_EXTRAS) { const e = squash(extra); const k = got.indexOf(e); if (k >= 0) got = got.slice(0, k) + got.slice(k + e.length); }
    if (got === expected) return { ok: true, chars: got.length };
    let i = 0; while (i < got.length && got[i] === expected[i]) i++;
    return { ok: false, detail: `Wording differs from Juan's draft near: “${expected.slice(Math.max(0, i - 40), i + 40)}”` };
  };

  /* ---------------- Line diff for version review ---------------- */
  ET.diffLines = function (a, b) {
    const n = a.length, mlen = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(mlen + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = mlen - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < mlen) {
      if (a[i] === b[j]) { out.push({ op: '=', text: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: '-', text: a[i++] });
      else out.push({ op: '+', text: b[j++] });
    }
    while (i < n) out.push({ op: '-', text: a[i++] });
    while (j < mlen) out.push({ op: '+', text: b[j++] });
    return out;
  };

  /* ---------------- Payroll estimate (informational only) ---------------- */
  ET.DEFAULT_STATUTORY = {
    label: 'Philippine rates as configured by HR (2026)',
    workDaysPerYear: 313,
    ndRate: 0.10,
    sss: { employeeRate: 0.05, mscMin: 5000, mscMax: 35000, mscStep: 500 },
    philhealth: { rate: 0.05, employeeShare: 0.5, floor: 10000, ceiling: 100000 },
    pagibig: { lowRate: 0.01, lowThreshold: 1500, rate: 0.02, maxFundSalary: 10000 },
    // Monthly withholding tax table (TRAIN law, effective 2023): over / base tax / rate on the excess.
    tax: [
      { over: 0, base: 0, rate: 0 },
      { over: 20833, base: 0, rate: 0.15 },
      { over: 33333, base: 1875, rate: 0.20 },
      { over: 66667, base: 8541.8, rate: 0.25 },
      { over: 166667, base: 33541.8, rate: 0.30 },
      { over: 666667, base: 183541.8, rate: 0.35 },
    ],
    thirteenthExemptCap: 90000,
  };

  ET.sssMsc = function (comp, s) {
    const half = s.mscStep / 2;
    if (comp < s.mscMin + half) return s.mscMin;
    const msc = Math.floor((comp - (s.mscMin + half)) / s.mscStep) * s.mscStep + s.mscMin + s.mscStep;
    return Math.min(msc, s.mscMax);
  };

  ET.withholding = function (taxable, table) {
    let row = table[0];
    for (const r of table) if (taxable > r.over) row = r;
    return ET.round2(Math.max(0, row.base + row.rate * (taxable - row.over)));
  };

  /**
   * p: {monthly, hourly?, ndHoursPerMonth, deMinimis, otherDeductions:[{label, amount}], thirteenthApplicable}
   */
  ET.computePayroll = function (p, st) {
    st = st || ET.DEFAULT_STATUTORY;
    const monthly = Number(p.monthly) || 0;
    const hourly = Number(p.hourly) || ET.round2((monthly * 12) / st.workDaysPerYear / 8);
    const nd = ET.round2(hourly * st.ndRate * (Number(p.ndHoursPerMonth) || 0));
    const deMinimis = ET.round2(Number(p.deMinimis) || 0);
    const comp = monthly + nd;
    const sss = ET.round2(ET.sssMsc(comp, st.sss) * st.sss.employeeRate);
    const phBase = Math.min(Math.max(monthly, st.philhealth.floor), st.philhealth.ceiling);
    const philhealth = ET.round2(phBase * st.philhealth.rate * st.philhealth.employeeShare);
    const pagibig = ET.round2(comp <= st.pagibig.lowThreshold ? comp * st.pagibig.lowRate : Math.min(comp, st.pagibig.maxFundSalary) * st.pagibig.rate);
    const taxable = ET.round2(comp - sss - philhealth - pagibig);
    const tax = ET.withholding(taxable, st.tax);
    const others = (p.otherDeductions || []).filter((o) => o && o.label && Number(o.amount)).map((o) => ({ label: String(o.label), amount: ET.round2(Number(o.amount)) }));
    const otherTotal = ET.round2(others.reduce((a, o) => a + o.amount, 0));
    const gross = ET.round2(monthly + nd + deMinimis);
    const totalDeductions = ET.round2(sss + philhealth + pagibig + tax + otherTotal);
    const takeHome = ET.round2(gross - totalDeductions);
    return {
      monthly, hourly, nd, deMinimis, guaranteed: monthly, gross,
      sss, philhealth, pagibig, taxable, tax, others, otherTotal, totalDeductions,
      takeHome, perCutoff: ET.round2(takeHome / 2),
      thirteenth: p.thirteenthApplicable ? monthly : 0,
    };
  };

  /* ---------------- Final signed PDF (pdf-lib) ---------------- */
  /**
   * opts: {sourceBytes, anchors, ref, version, sourceSha,
   *        employee:{name, sigPng(Uint8Array), signedAt}, company:{name, title, sigPng, signedAt}}
   * Stamps both signatures onto Juan's approved document. The contract text itself is untouched.
   */
  ET.buildFinalPdf = async function (PDFLib, o) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.load(o.sourceBytes, { updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const small = font;
    const pages = doc.getPages();
    const a = o.anchors;
    if (!a || !pages[a.page] || !a.company || !a.employee) throw new Error('Signature fields are missing from this contract.');
    const page = pages[a.page];
    const ink = rgb(0.06, 0.13, 0.33);
    const grey = rgb(0.4, 0.42, 0.48);

    async function place(sig, at) {
      const img = await doc.embedPng(sig.sigPng);
      const s = Math.min(160 / img.width, 26 / img.height);
      page.drawImage(img, { x: at.sig.x, y: at.sig.y - 1, width: img.width * s, height: img.height * s });
      page.drawText(ET.phDateLong(sig.signedAt), { x: at.date.x, y: at.date.y + 1, size: at.date.size || 10, font, color: ink });
      page.drawText('Electronically signed ' + ET.phDateTime(sig.signedAt), { x: at.date.x + 172, y: at.date.y + 1, size: 6.5, font: small, color: grey });
    }
    await place(o.company, a.company);
    await place(o.employee, a.employee);

    const n = pages.length;
    pages.forEach((pg, i) => {
      const t = `Contract Ref. ${o.ref}  ·  Version ${o.version}  ·  Contract SHA-256 ${o.sourceSha.slice(0, 16)}`;
      pg.drawText(t, { x: 50, y: 26, size: 6.5, font: small, color: grey });
    });

    doc.setTitle(`Employment Contract — ${o.employee.name}`);
    doc.setSubject(`Contract Ref. ${o.ref}, version ${o.version}`);
    doc.setAuthor('Equity Track Inc. Philippines');
    doc.setProducer('Equity Track contract signing');
    doc.setCreationDate(new Date(o.company.signedAt));
    doc.setModificationDate(new Date(o.company.signedAt));
    return await doc.save();
  };

  /* ---------------- File names ---------------- */
  const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  ET.hrFileName = (code, name, iso) => `${code}_${slug(name)}_EmploymentContract_${ET.phYMD(iso)}.pdf`;
  ET.employeeFileName = (name, iso) => `${slug(name)}_EmploymentContract_${ET.phYMD(iso)}.pdf`;

  ET.csv = function (rows) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return rows.map((r) => r.map(esc).join(',')).join('\r\n');
  };

  root.ET = ET;
  if (typeof module !== 'undefined') module.exports = ET;
})(typeof window !== 'undefined' ? window : globalThis);
