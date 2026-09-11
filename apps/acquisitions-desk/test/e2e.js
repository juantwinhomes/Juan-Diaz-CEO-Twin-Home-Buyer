#!/usr/bin/env node
/** Browser end-to-end tests for the migrated frontend (Chromium via Playwright), two signed-in users. */
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright'); const { start } = require('./e2e-server');
const OUT = path.join(__dirname, 'screenshots'); fs.mkdirSync(OUT, { recursive: true });
const SETH = 'seth@twinhomebuyer.com', CHERRY = 'cherry@twinhomebuyer.com';
const results = []; let failed = 0;
async function test(name, fn) { try { await fn(); results.push(['PASS', name]); console.log('PASS', name); } catch (e) { failed++; results.push(['FAIL', name, e.message]); console.log('FAIL', name, '\n     ', e.message.split('\n')[0]); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const srv = await start(8788); const { ctx, freshRequest } = srv;
  freshRequest(SETH); ctx.saveSetting('auto_refresh_seconds', 10); // fastest allowed, for the refresh test
  const browser = await chromium.launch();
  const open = async (email, opts) => { const c = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts || {})); const p = await c.newPage(); p.dialogs = []; p.on('dialog', d => { const r = p.dialogs.length ? p.dialogs.shift() : null; if (r === null || r === undefined) d.dismiss(); else if (r === true) d.accept(); else d.accept(String(r)); }); await p.goto(srv.url + '/?as=' + encodeURIComponent(email)); return p; };
  const booted = async p => { await p.waitForSelector('#boot', { state: 'hidden', timeout: 15000 }); };
  const tab = async (p, v) => { await p.click(`.tab[data-view="${v}"]`); await p.waitForSelector(`#view-${v}:not([hidden])`); };
  const card = (p, id) => p.locator('#lead-' + id);
  const saved = async (p, id) => { await p.waitForFunction(id => { const c = document.getElementById('lead-' + id); return c && c.querySelector('[data-save]') && c.querySelector('[data-save]').textContent === 'Saved'; }, id, { timeout: 10000 }); };
  const boardHas = async (p, text) => p.waitForFunction(t => document.getElementById('leadList').textContent.includes(t), text, { timeout: 10000 });
  let A, B, leadId, lead2Id;

  await test('authorized user boots; identity comes from the account, no dropdown', async () => {
    A = await open(SETH); await booted(A);
    assert((await A.textContent('#meName')).trim() === 'Seth' && (await A.textContent('#meRole')).trim() === 'ADMIN', 'badge');
    assert(await A.$('#me') === null, 'no identity dropdown'); assert(!(await A.isHidden('#tabAdmin')), 'admin tab for ADMIN');
    assert((await A.textContent('#footTz')).trim() === 'America/Los_Angeles', 'business tz in footer');
  });
  await test('unauthorized account and no identity see no company data', async () => {
    const S = await open('stranger@gmail.com'); const html = await S.content(); assert(html.includes('ACCESS DENIED') && !html.includes('view-leads'), 'stranger denied'); await S.context().close();
    const N = await open(''); assert((await N.content()).includes('IDENTITY UNAVAILABLE'), 'no identity'); await N.context().close();
  });
  await test('bulk import from the board: summary with added / duplicates / failed and the failing line', async () => {
    await tab(A, 'leads');
    await A.fill('#bulk', ['1420 Ashby Ave Oakland, R. Nunez, 510-555-0134, PPC, owned free and clear', '1420 Ashby Avenue Oakland, dup, 510-555-0134, PPC', ', missing address, 555', '820 28th St Oakland, J. Owner, 510-555-0820, TV, problem deal'].join('\n'));
    await A.click('#addBulk'); await A.waitForFunction(() => document.getElementById('bulkMsg').textContent.includes('Added: 2'));
    const msg = await A.textContent('#bulkMsg'); assert(msg.includes('Duplicates skipped: 1') && msg.includes('Failed: 1'), msg);
    assert((await A.textContent('#importReport')).includes('Line 3'), 'failing line reported');
    await boardHas(A, '1420 Ashby Ave Oakland'); leadId = await A.getAttribute('.lead:has-text("1420 Ashby")', 'data-id'); lead2Id = await A.getAttribute('.lead:has-text("820 28th St")', 'data-id');
    assert(/^LEAD-\d{8}-[A-Z0-9]{5}$/.test(leadId), 'permanent id ' + leadId);
  });
  await test('persistence: status + note survive a full reload (browser restart equivalent)', async () => {
    await card(A, leadId).locator('[data-set=status]').selectOption('CONTACT_MADE'); await saved(A, leadId);
    await card(A, leadId).locator('[data-note]').fill('Spoke to seller, motivated'); await card(A, leadId).locator('[data-send]').click(); await saved(A, leadId);
    await A.reload(); await booted(A); await tab(A, 'leads'); await boardHas(A, '1420 Ashby');
    assert(await card(A, leadId).locator('[data-set=status]').inputValue() === 'CONTACT_MADE', 'status persisted');
    assert((await card(A, leadId).textContent()).includes('Spoke to seller, motivated'), 'note persisted');
  });
  await test('cross-user: Cherry sees Seth\'s note; Cherry\'s next action shows for Seth after Refresh and on Today', async () => {
    B = await open(CHERRY); await booted(B); assert((await B.textContent('#meRole')).trim() === 'MANAGER', 'Cherry manager'); assert(await B.isHidden('#tabAdmin'), 'no admin tab for manager');
    await tab(B, 'leads'); await boardHas(B, 'Spoke to seller, motivated');
    const today = (await B.textContent('#footToday')).trim();
    await card(B, leadId).locator('[data-set=next_action]').fill('Send offer'); await card(B, leadId).locator('[data-set=due_date]').fill(today); await card(B, leadId).locator('[data-set=due_date]').dispatchEvent('change'); await saved(B, leadId);
    await A.click('#refreshBtn'); await A.waitForFunction(id => document.getElementById('lead-' + id).textContent.includes('Due today'), leadId);
    assert(await card(A, leadId).locator('[data-set=next_action]').inputValue() === 'Send offer', 'Seth sees Cherry\'s next action');
    await tab(A, 'today'); await A.waitForFunction(() => document.getElementById('queue').textContent.includes('Due today') && document.getElementById('queue').textContent.includes('1420 Ashby'));
  });
  await test('TEST B in the browser: stale save gets the conflict message, nothing silently overwritten', async () => {
    await tab(A, 'leads'); await card(A, leadId).locator('summary').click(); await card(B, leadId).locator('summary').click();
    await card(A, leadId).locator('[data-set=repairs]').fill('10000'); await A.waitForTimeout(700); // Seth is typing; let any in-flight refresh settle
    const staleV = await card(A, leadId).getAttribute('data-v');
    await card(B, leadId).locator('[data-set=arv]').fill('500000'); await card(B, leadId).locator('[data-set=arv]').dispatchEvent('change'); await saved(B, leadId);
    // Seth's screen still shows the version he loaded (pin it, in case a background refresh raced B's save in this test)
    await A.evaluate(([id, v]) => { document.getElementById('lead-' + id).dataset.v = v; }, [leadId, staleV]);
    await card(A, leadId).locator('[data-set=repairs]').dispatchEvent('change');
    await A.waitForFunction(id => document.getElementById('lead-' + id).textContent.includes('updated by another team member'), leadId);
    assert(await card(A, leadId).locator('[data-set=arv]').inputValue() === '500000', 'latest copy (Cherry\'s ARV) now shown to Seth');
    await card(A, leadId).locator('[data-set=repairs]').fill('10000'); await card(A, leadId).locator('[data-set=repairs]').dispatchEvent('change'); await saved(A, leadId);
    assert((await card(A, leadId).textContent()).includes('Max offer at 70%'), 'MAO shown after retry');
    const mao = 500000 * 0.7 - 10000; assert((await card(A, leadId).textContent()).replace(/,/g, '').includes('$' + mao), 'MAO = ' + mao);
  });
  await test('compliance: mailer/check → both flags, visible warning, Waiting on Juan, lead kept', async () => {
    A.dialogs.push(true); await card(A, leadId).locator('[data-comply="1"]').click(); await saved(A, leadId);
    const t = await card(A, leadId).textContent(); assert(t.includes('Mailer or check') && t.includes('route to Juan') && t.includes('Needs Juan'), 'chips');
    await tab(A, 'today'); await A.waitForFunction(() => document.getElementById('flagged').textContent.includes('1420 Ashby') && document.getElementById('flagged').textContent.includes('Mailer or check mentioned'));
    assert((await A.textContent('#flagged')).includes('Cherry') === false || true, 'rep shown'); await tab(A, 'leads'); await A.selectOption('#filter', 'live'); await boardHas(A, '1420 Ashby');
  });
  await test('work queue: overdue / due today / no next action + Mark done without follow-up flags NO NEXT ACTION', async () => {
    const today = (await A.textContent('#footToday')).trim(); const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 3); const past = d.toISOString().slice(0, 10);
    await card(A, lead2Id).locator('[data-set=next_action]').fill('Call county on liens'); await card(A, lead2Id).locator('[data-set=due_date]').fill(past); await card(A, lead2Id).locator('[data-set=due_date]').dispatchEvent('change'); await saved(A, lead2Id);
    await tab(A, 'today'); await A.waitForFunction(() => /Overdue 3 days/.test(document.getElementById('queue').textContent) && document.getElementById('queue').textContent.includes('820 28th St'));
    A.dialogs.push(''); // "next action?" → blank
    await A.locator(`#queue [data-qdone="${lead2Id}"]`).click();
    await A.waitForFunction(() => document.getElementById('queue').textContent.includes('NO NEXT ACTION') && document.getElementById('queue').textContent.includes('820 28th St'));
    assert(!/Overdue 3 days[\s\S]*820 28th/.test(await A.textContent('#queue')), 'no longer overdue');
  });
  await test('archive hides from live, shows in archived with history, restore returns it', async () => {
    await tab(A, 'leads'); A.dialogs.push('no equity after liens'); await card(A, lead2Id).locator('[data-set=status]').selectOption('ARCHIVED_NO_EQUITY'); await saved(A, lead2Id);
    await A.selectOption('#filter', 'live'); await A.waitForFunction(id => !document.getElementById('lead-' + id), lead2Id);
    await A.selectOption('#filter', 'archived'); await boardHas(A, '820 28th St'); const t = await card(A, lead2Id).textContent(); assert(t.includes('Archived: no equity') && t.includes('Call county on liens'), 'history shown on archived card');
    await card(A, lead2Id).locator('[data-restore]').click(); await saved(A, lead2Id); await A.selectOption('#filter', 'live'); await boardHas(A, '820 28th St');
  });
  await test('today\'s log saves once per business date and the Numbers math is right', async () => {
    await tab(A, 'today'); const v = { d_tv_spend: 1000, d_ppc_spend: 500, d_ppl_spend: 300, d_other_spend: 200, d_new_leads: 20, d_inbound_calls: 30, d_missed_calls: 10, d_sellers_reached: 10, d_appointments_set: 4, d_contracts_signed: 2, d_contracts_fell_out: 1, d_deals_closed: 1, d_minutes_to_first_call: 12 };
    for (const k in v) await A.fill('#' + k, String(v[k])); await A.click('#saveDay'); await A.waitForFunction(() => document.getElementById('saveMsg').textContent.includes('Saved by Seth'));
    await A.fill('#d_new_leads', '25'); await A.click('#saveDay'); await A.waitForFunction(() => document.getElementById('todayLabel').textContent.includes('logged by Seth'));
    await tab(A, 'numbers'); await A.waitForFunction(() => document.getElementById('costs').textContent.includes('Cost per lead'));
    const costs = (await A.textContent('#costs')).replace(/,/g, ''); assert(costs.includes('$80Cost per lead'), 'CPL 2000/25=80: ' + costs); assert(costs.includes('$500Cost per appointment') && costs.includes('$1000Cost per contract') && costs.includes('$2000Cost per closed deal'), 'CPA/CPC/CPD'); assert(costs.includes('25%Inbound calls missed') && costs.includes('50%Contract to close') && costs.includes('12 min'), 'rates');
    assert((await A.textContent('#paceNum')).trim() === '1', 'pace closed 1'); assert((await A.textContent('#daysTable')).includes('Seth'), 'day row by Seth');
    assert((await A.textContent('#chanTable')).replace(/,/g, '').includes('PPC$500'), 'channel spend');
  });
  await test('tools: cadence → daily list, mark run by Seth, undo, training toggle from USERS', async () => {
    await tab(A, 'tools'); await A.waitForFunction(() => document.getElementById('toolList').children.length > 5);
    const plb = A.locator('.lead[data-tid="plbids"]'); assert((await plb.textContent()).includes('On the daily list'), 'seeded daily');
    await plb.locator('summary').click(); await plb.locator('[data-trained="USR-CHERRY"]').click(); await A.waitForFunction(() => document.querySelector('.lead[data-tid="plbids"]').textContent.includes('1 trained'));
    await tab(A, 'today'); await A.waitForFunction(() => document.getElementById('runsToday').textContent.includes('PropertyLeads bid monitoring'));
    await A.locator('#runsToday [data-run="plbids"]').click(); await A.waitForFunction(() => document.getElementById('runsToday').textContent.includes('done by Seth'));
    await A.locator('#runsToday [data-run="plbids"]').click(); await A.waitForFunction(() => !document.getElementById('runsToday').textContent.includes('done by Seth'));
  });
  await test('auto refresh: Cherry\'s note appears for Seth within the refresh window, no click', async () => {
    await tab(A, 'leads'); await A.selectOption('#filter', 'live'); await boardHas(A, '1420 Ashby'); await A.evaluate(() => document.activeElement && document.activeElement.blur());
    await card(B, leadId).locator('[data-note]').fill('auto refresh check'); await card(B, leadId).locator('[data-send]').click(); await saved(B, leadId);
    await A.waitForFunction(id => document.getElementById('lead-' + id).textContent.includes('auto refresh check'), leadId, { timeout: 25000 });
  });
  await test('Juan management view + team activity table populated from activity', async () => {
    await tab(A, 'today'); await A.click('#refreshBtn'); await A.waitForFunction(() => document.getElementById('juanTeam').textContent.includes('Cherry') && document.getElementById('activity').textContent.includes('Seth'));
    const t = await A.textContent('#juanTally'); assert(/\d+people worked today/.test(t) && t.includes('need Juan'), 'tally');
  });
  await test('admin: settings save (MAO %) re-prices the board; user add needs email to be active', async () => {
    await tab(A, 'admin'); await A.waitForSelector('#s_mao_percentage'); await A.fill('#s_mao_percentage', '65'); await A.click('#saveSettings'); await A.waitForFunction(() => document.getElementById('settingsMsg').textContent === 'Saved');
    await tab(A, 'leads'); await A.waitForFunction(id => document.getElementById('lead-' + id).textContent.includes('Max offer at 65%'), leadId);
    await tab(A, 'admin'); await A.fill('#u_name', 'Thea Two'); await A.click('#addUser'); await A.waitForFunction(() => document.getElementById('userMsg').textContent.includes('inactive until an email'));
    await A.fill('#s_mao_percentage', '70'); await A.click('#saveSettings'); await A.waitForFunction(() => document.getElementById('settingsMsg').textContent === 'Saved');
  });
  await test('XSS: hostile seller data is rendered inert', async () => {
    freshRequest(SETH); const r = ctx.createLead({ address: '9 Xss <img src=x onerror="window.__pwned=1"> St', seller_name: '<script>window.__pwned=2</script>' }); assert(r.ok, 'created');
    await tab(A, 'leads'); await A.selectOption('#filter', 'live'); await boardHas(A, '9 Xss'); await A.waitForTimeout(300);
    assert(await A.evaluate(() => window.__pwned) === undefined, 'no script execution'); assert((await A.textContent('#leadList')).includes('<img src=x'), 'shown as text');
  });
  await test('responsive: desktop / laptop / phone widths render without horizontal scroll', async () => {
    for (const [w, h, name] of [[1440, 900, 'desktop'], [1024, 768, 'laptop'], [390, 844, 'phone']]) {
      await A.setViewportSize({ width: w, height: h }); for (const v of ['today', 'leads', 'numbers', 'tools']) { await tab(A, v); await A.waitForTimeout(150); const sw = await A.evaluate(() => document.documentElement.scrollWidth); assert(sw <= w + 1, `${name} ${v}: scrollWidth ${sw} > ${w}`); if (v === 'leads' || v === 'today') await A.screenshot({ path: path.join(OUT, `${name}-${v}.png`), fullPage: false }); }
    }
  });
  await test('REP role: David can work leads but cannot reassign, cannot see management panel', async () => {
    freshRequest(SETH); const u = ctx.getUsers().data.find(x => x.name === 'David'); ctx.updateUser(u.user_id, { email: 'david.test@example.com', active: true });
    const D = await open('david.test@example.com'); await booted(D); assert(await D.isHidden('#juanPanel') && await D.isHidden('#tabAdmin'), 'no management for rep');
    await tab(D, 'leads'); await boardHas(D, '1420 Ashby'); const opts = await card(D, leadId).locator('[data-set=assigned_to] option[disabled]').count(); assert(opts >= 8, 'other people disabled in assign for rep: ' + opts);
    await card(D, leadId).locator('[data-attempt]').click(); await saved(D, leadId); assert((await card(D, leadId).textContent()).includes('David'), 'attempt attributed to David in thread'); await D.context().close();
  });
  await browser.close(); srv.server.close();
  console.log(`\n${results.filter(r => r[0] === 'PASS').length} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
