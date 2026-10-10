// Run: node contract-signing/tests/core.test.js [path/to/contract.pdf ...]
// Needs pdfjs-dist@3.11.174, pdf-lib@1.17.1 and @pdf-lib/fontkit@1.1.1 on NODE_PATH for the PDF checks.
// Contract PDFs are passed as arguments and never committed: they contain salaries.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ET = require('../core.js');

// Employee codes
assert.strictEqual(ET.employeeCode('Maria Santos', '2001-07-17'), 'MS-170701');
assert.strictEqual(ET.employeeCode('Juan Dela Cruz Jr.', '1990-01-05'), 'JC-050190');
const codes = ET.assignCodes([
  { key: 'a', name: 'Maria Santos', dob: '2001-07-17', createdAt: '1' },
  { key: 'b', name: 'Mario Sison', dob: '2001-07-17', createdAt: '2' },
  { key: 'c', name: 'No Birthdate', dob: '', createdAt: '3' },
]);
assert.deepStrictEqual(codes, { a: 'MS-170701', b: 'MS-170701-2', c: '' });

// Statutory pieces
const st = ET.DEFAULT_STATUTORY;
assert.strictEqual(ET.sssMsc(4000, st.sss), 5000);
assert.strictEqual(ET.sssMsc(5250, st.sss), 5500);
assert.strictEqual(ET.sssMsc(20100, st.sss), 20000);
assert.strictEqual(ET.sssMsc(80000, st.sss), 35000);
assert.strictEqual(ET.withholding(20000, st.tax), 0);
assert.strictEqual(ET.withholding(33333, st.tax), 1875);
assert.strictEqual(ET.withholding(43333, st.tax), 3875);

const p = ET.computePayroll({ monthly: 38000, hourly: 182.11, ndHoursPerMonth: 0, deMinimis: 0, thirteenthApplicable: true }, st);
assert.strictEqual(p.sss, 1750);
assert.strictEqual(p.philhealth, 950);
assert.strictEqual(p.pagibig, 200);
assert.strictEqual(p.taxable, 35100);
assert.strictEqual(p.tax, ET.round2(1875 + 0.2 * (35100 - 33333)));
assert.strictEqual(p.takeHome, ET.round2(38000 - 1750 - 950 - 200 - p.tax));
assert.strictEqual(p.thirteenth, 38000);
const nd = ET.computePayroll({ monthly: 38000, hourly: 182.11, ndHoursPerMonth: 208 }, st);
assert.strictEqual(nd.nd, ET.round2(182.11 * 0.1 * 208));

assert.strictEqual(ET.hrFileName('MS-170701', 'Maria Santos', '2026-10-12T03:00:00Z'), 'MS-170701_Maria-Santos_EmploymentContract_2026-10-12.pdf');
assert.deepStrictEqual(ET.diffLines(['a', 'b', 'c'], ['a', 'x', 'c']).map((d) => d.op + d.text), ['=a', '-b', '+x', '=c']);
console.log('pure checks: ok');

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) return;
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const PDFLib = require('pdf-lib');
  const fontkit = require('@pdf-lib/fontkit');
  const asset = (f) => new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'assets', f)));
  const assets = { regular: asset('LiberationSans-Regular.ttf'), bold: asset('LiberationSans-Bold.ttf'), banner: asset('letterhead-banner.jpg') };
  // 1x1 navy PNG stands in for a drawn signature.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  let failures = 0;
  for (const f of files) {
    const bytes = new Uint8Array(fs.readFileSync(f));
    const { pages } = await ET.extractPdf(pdfjs, bytes);
    const c = ET.parseContract(pages);
    const model = ET.structureDraft(pages);
    const expected = ET.fingerprintText(pages);
    const modelOk = ET.modelText(model) === expected;
    const out = await ET.renderPacketPdf(PDFLib, fontkit, assets, model);
    const v = await ET.verifyFormatted(pdfjs, out.bytes, expected);
    const signed = await ET.buildFinalPdf(PDFLib, {
      sourceBytes: out.bytes, anchors: out.anchors, ref: 'ETP-EC-2026-TEST01', version: 1, sourceSha: await ET.sha256Hex(out.bytes),
      employee: { name: c.name, sigPng: png, signedAt: '2026-10-12T05:00:00Z' },
      company: { name: 'Juan Diaz', sigPng: png, signedAt: '2026-10-13T02:30:00Z' },
    });
    if (process.env.OUT_DIR) {
      fs.writeFileSync(path.join(process.env.OUT_DIR, 'formatted-' + path.basename(f)), out.bytes);
      fs.writeFileSync(path.join(process.env.OUT_DIR, 'signed-' + path.basename(f)), signed);
    }
    if (!modelOk || !v.ok) failures++;
    console.log(`${path.basename(f)}: blocks ${model.blocks.length}, pages ${out.pageCount}, structure ${modelOk ? 'exact' : 'MISMATCH'}, re-read ${v.ok ? 'exact' : v.detail}, notes ${c.issues.length}, formatted ${Math.round(out.bytes.length / 1024)} KB, signed ${Math.round(signed.length / 1024)} KB`);
  }
  if (failures) { console.error(failures + ' contract(s) failed the wording check'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
