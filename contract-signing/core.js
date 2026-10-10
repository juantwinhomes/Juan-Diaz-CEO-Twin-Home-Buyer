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
      const tc = await page.getTextContent();
      const items = tc.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], size: Math.abs(it.transform[3]) || 10 }));
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

    // Signature anchors on the page that carries the signature block.
    let anchors = null;
    for (let p = pages.length - 1; p >= 0 && !anchors; p--) {
      const items = pages[p].items;
      const company = items.find((i) => i.str.trim() === 'JUAN DIAZ');
      const emp = name && items.find((i) => i.str.trim().toUpperCase() === name.toUpperCase() && i !== company);
      const dates = items.filter((i) => /^Date:/.test(i.str.trim()));
      if (company && emp && dates.length >= 2) {
        const near = (a) => dates.slice().sort((d1, d2) => Math.abs(d1.x - a.x) - Math.abs(d2.x - a.x))[0];
        const cd = near(company), ed = near(emp);
        anchors = {
          page: p,
          company: { x: company.x, y: company.y, size: company.size },
          companyDate: { x: cd.x, y: cd.y, size: cd.size },
          employee: { x: emp.x, y: emp.y, size: emp.size },
          employeeDate: { x: ed.x, y: ed.y, size: ed.size },
        };
      }
    }
    if (!anchors) issues.push('Signature block (JUAN DIAZ / employee name / Date lines) not found, so signatures cannot be placed.');

    return {
      name, position: titleLine, effective, startDate, monthly, perCutoff,
      hourly: hourlyS ? num(hourlyS) : 0, daily: dailyS ? num(dailyS) : 0,
      managerial, hasNightDiff, anchors, issues,
    };
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
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const small = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const a = o.anchors;
    if (!a || !pages[a.page]) throw new Error('Signature fields are missing from this contract.');
    const page = pages[a.page];
    const ink = rgb(0.06, 0.13, 0.33);
    const grey = rgb(0.4, 0.42, 0.48);

    async function place(sig, nameA, dateA) {
      const img = await doc.embedPng(sig.sigPng);
      const maxW = 170, maxH = 27;
      const s = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * s, h = img.height * s;
      page.drawImage(img, { x: nameA.x + 2, y: nameA.y + 15, width: w, height: h });
      const size = dateA.size || 10;
      page.drawText(ET.phDateLong(sig.signedAt), { x: dateA.x + font.widthOfTextAtSize('Date: ', size) + 4, y: dateA.y + 2, size, font, color: ink });
      page.drawText('Electronically signed ' + ET.phDateTime(sig.signedAt), { x: dateA.x, y: dateA.y - 12, size: 6.5, font: small, color: grey });
    }
    await place(o.company, a.company, a.companyDate);
    await place(o.employee, a.employee, a.employeeDate);

    const n = pages.length;
    pages.forEach((pg, i) => {
      const t = `Contract Ref. ${o.ref}  ·  Version ${o.version}  ·  Approved text SHA-256 ${o.sourceSha.slice(0, 16)}  ·  Page ${i + 1} of ${n}`;
      pg.drawText(t, { x: 67.5, y: 22, size: 6.5, font: small, color: grey });
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
