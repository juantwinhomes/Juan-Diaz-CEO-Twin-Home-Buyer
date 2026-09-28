'use strict';
// Takes screenshots of the main screens with the synthetic data. Run with the server started: npm start, then npm run screenshots.
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const BASE = process.env.KCA_URL || 'http://127.0.0.1:4400';
const OUT = path.join(__dirname, '..', 'screenshots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const shot = async (name, hash, { full = true, wait = 600 } = {}) => {
    if (hash) await page.goto(`${BASE}/${hash}`);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    console.log('saved', name);
  };
  const loginAs = async label => {
    await page.goto(`${BASE}/#/login`);
    await page.waitForSelector('.who');
    await page.click(`.who:has-text("${label}")`);
    await page.waitForTimeout(700);
  };

  await page.goto(`${BASE}/#/login`); await shot('01-login', null, { full: false });
  await loginAs('Kristine');
  await shot('02-kristine-home', '#/');
  await shot('03-learn', '#/learn');
  await page.goto(`${BASE}/#/learn/m2`); await page.waitForTimeout(600);
  await page.check('#q0o2'); await page.fill('#why0', 'Never trust contact details in the change request');
  await page.click('[data-act="tutor"][data-i="0"]'); await page.waitForTimeout(500);
  await page.locator('.q').first().scrollIntoViewIfNeeded();
  await shot('04-lesson-coach', null, { full: true });
  await shot('05-exceptions', '#/exceptions');
  const dup = await page.evaluate(async () => (await (await fetch('/api/issues?type=duplicate_invoice', { headers: { 'X-Session': sessionStorage.getItem('kca-token') } })).json())[0].id);
  await shot('06-issue-duplicate', `#/exceptions/${dup}`);
  await page.click('[data-act="row"] >> nth=1'); await shot('07-source-row', null, { full: false });
  await page.keyboard.press('Escape');

  // Workbench: preview an import.
  await page.goto(`${BASE}/#/workbench`); await page.waitForTimeout(600);
  await page.selectOption('#imp-entity', 'ENT-THB');
  await page.setInputFiles('#imp-file', path.join(__dirname, '..', 'samples', 'synthetic-thb-ledger-adjustments-2026-09.csv'));
  await page.click('form[data-form="import"] button.btn');
  await page.waitForTimeout(900);
  await shot('08-import-preview', null);
  await shot('09-workbench', '#/workbench');
  const st = await page.evaluate(async () => (await (await fetch('/api/reports/recon', { headers: { 'X-Session': sessionStorage.getItem('kca-token') } })).json())[0].id);
  await shot('10-reconciliation', `#/reports/recon/${st}`);
  await shot('11-project', '#/reports/project/PRJ-THB-0001');
  await shot('12-forecast', '#/reports/forecast/ENT-PPS');
  await shot('13-close', '#/close');
  await shot('14-draws', '#/reports/draws');
  await shot('15-intercompany', '#/reports/intercompany');
  await shot('16-coach', '#/coach');

  await loginAs('Juan');
  await shot('17-juan-brief', '#/brief');
  await shot('18-approvals', '#/approvals');
  await loginAs('Admin');
  await shot('19-setup', '#/setup');
  await shot('20-admin', '#/admin');

  const mobile = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await mobile.goto(`${BASE}/#/login`); await mobile.waitForSelector('.who');
  await mobile.click('.who:has-text("Juan")'); await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: path.join(OUT, '21-brief-phone.png'), fullPage: false });
  console.log('saved 21-brief-phone');

  await browser.close();
  if (errors.length) { console.error('Page errors:', errors); process.exit(1); }
})();
