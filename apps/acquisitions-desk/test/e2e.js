#!/usr/bin/env node
/** Browser end-to-end tests for the v2 frontend (Chromium via Playwright), two signed-in users. */
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright'); const { start } = require('./e2e-server');
const OUT = path.join(__dirname, 'screenshots'); fs.mkdirSync(OUT, { recursive: true });
const SETH = 'seth@twinhomebuyer.com', CHERRY = 'cherry@twinhomebuyer.com';
const results = []; let failed = 0;
async function test(name, fn) { try { await fn(); results.push(['PASS', name]); console.log('PASS', name); } catch (e) { failed++; results.push(['FAIL', name, e.message]); console.log('FAIL', name, '\n     ', e.message.split('\n')[0]); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const srv = await start(8788); const { ctx, freshRequest } = srv;
  freshRequest(SETH); ctx.saveSetting('auto_refresh_seconds', 10);
  const browser = await chromium.launch();
  const open = async (email, opts) => { const c = await browser.newContext(Object.assign({ viewport: { width: 1360, height: 900 } }, opts || {})); const p = await c.newPage(); p.dialogs = []; p.on('dialog', d => { const r = p.dialogs.length ? p.dialogs.shift() : null; if (r === null || r === undefined) d.dismiss(); else if (r === true) d.accept(); else d.accept(String(r)); }); p.on('pageerror', e => console.log('   [pageerror]', email, e.message)); await p.goto(srv.url + '/?as=' + encodeURIComponent(email)); return p; };
  const booted = async p => { await p.waitForSelector('#boot', { state: 'hidden', timeout: 15000 }); };
  const tab = async (p, v) => { await p.click(`#railNav [data-view="${v}"]`); await p.waitForSelector(`#view-${v}:not([hidden])`); };
  const pane = async (p, name) => { await p.click(`#sub-today [data-p="${name}"]`); };
  const row = (p, id) => p.locator('#lead-' + id);
  const openLead = async (p, id, t) => { if (!(await p.isHidden('#drawer'))) await p.keyboard.press('Escape'); await row(p, id).click(); await p.waitForFunction(id => document.getElementById('drawer').dataset.id === id && document.getElementById('drTitle').textContent !== 'Loading…', id); await p.waitForTimeout(400); /* let the drawer's own getLead settle */ if (t) { await p.click(`#dtabs [data-t="${t}"]`); } };
  const drSaved = async p => { await p.waitForFunction(() => document.getElementById('drStatus').textContent === 'Saved', null, { timeout: 10000 }); };
  const boardHas = async (p, text) => p.waitForFunction(t => document.getElementById('leadList').textContent.includes(t), text, { timeout: 10000 });
  const setFilter = async (p, f) => { await p.click(`#filterTabs [data-filter="${f}"]`); };
  let A, B, leadId, lead2Id;

  await test('authorized user boots; identity comes from the account, no dropdown', async () => {
    A = await open(SETH); await booted(A);
    assert((await A.textContent('#meName')).trim() === 'Seth' && (await A.textContent('#meRole')).trim() === 'ADMIN', 'badge');
    await A.waitForSelector('#meAvatar img', { timeout: 5000 }); assert(await A.$('#me') === null, 'no identity dropdown'); assert(!(await A.isHidden('#tabAdmin')), 'admin tab for ADMIN');
    assert((await A.textContent('#footTz')).trim() === 'America/Los_Angeles', 'business tz in footer');
    assert(!(await A.isHidden('#view-today')), 'Today opens first');
  });
  await test('unauthorized account and no identity see no company data', async () => {
    const S = await open('stranger@gmail.com'); const html = await S.content(); assert(html.includes('ACCESS DENIED') && !html.includes('view-leads'), 'stranger denied'); await S.context().close();
    const N = await open(''); assert((await N.content()).includes('IDENTITY UNAVAILABLE'), 'no identity'); await N.context().close();
  });
  await test('bulk import from the board drawer: summary with added / duplicates / failed and the failing line', async () => {
    await tab(A, 'leads'); await A.click('#openAdd'); await A.waitForSelector('#addDrawer:not([hidden])');
    await A.fill('#bulk', ['1420 Ashby Ave Oakland, R. Nunez, 510-555-0134, PPC, owned free and clear', '1420 Ashby Avenue Oakland, dup, 510-555-0134, PPC', ', missing address, 555', '820 28th St Oakland, J. Owner, 510-555-0820, TV, problem deal'].join('\n'));
    await A.click('#addBulk'); await A.waitForFunction(() => document.getElementById('bulkMsg').textContent.includes('Added: 2'));
    const msg = await A.textContent('#bulkMsg'); assert(msg.includes('Duplicates skipped: 1') && msg.includes('Failed: 1'), msg); assert((await A.textContent('#importReport')).includes('Line 3'), 'failing line reported');
    await A.keyboard.press('Escape'); await boardHas(A, '1420 Ashby Ave Oakland');
    leadId = await A.getAttribute('.lead:has-text("1420 Ashby")', 'data-id'); lead2Id = await A.getAttribute('.lead:has-text("820 28th St")', 'data-id');
    assert(/^LEAD-\d{8}-[A-Z0-9]{5}$/.test(leadId), 'permanent id ' + leadId);
  });
  await test('persistence: status + note survive a full reload', async () => {
    await openLead(A, leadId); await A.selectOption('#drawer [data-set=status]', 'CONTACT_MADE'); await drSaved(A);
    await A.fill('#drawer [data-note]', 'Spoke to seller, motivated'); await A.click('#drawer [data-send]'); await drSaved(A);
    await A.reload(); await booted(A); await tab(A, 'leads'); await boardHas(A, '1420 Ashby'); await openLead(A, leadId);
    assert(await A.inputValue('#drawer [data-set=status]') === 'CONTACT_MADE', 'status persisted'); assert((await A.textContent('#drBody')).includes('Spoke to seller, motivated'), 'note persisted');
    assert((await row(A, leadId).textContent()).includes('Contact made'), 'row shows status');
  });
  await test('cross-user: Cherry sees Seth\'s note; her next action shows for Seth after Refresh and on Today', async () => {
    B = await open(CHERRY); await booted(B); assert((await B.textContent('#meRole')).trim() === 'MANAGER', 'Cherry manager'); assert(await B.isHidden('#tabAdmin'), 'no admin tab for manager');
    await tab(B, 'leads'); await boardHas(B, '1420 Ashby'); await openLead(B, leadId); assert((await B.textContent('#drBody')).includes('Spoke to seller, motivated'), 'Cherry sees the note');
    const today = (await B.textContent('#footToday')).trim();
    await B.fill('#drawer [data-set=next_action]', 'Send offer'); await B.press('#drawer [data-set=next_action]', 'Tab'); await B.fill('#drawer [data-set=due_date]', today); await B.press('#drawer [data-set=due_date]', 'Tab'); await drSaved(B);
    await A.keyboard.press('Escape'); await A.click('#refreshBtn'); await A.waitForFunction(id => document.getElementById('lead-' + id).textContent.includes('Send offer'), leadId);
    await tab(A, 'today'); await A.click('#queueTabs [data-q=due_today]'); await A.waitForFunction(() => document.getElementById('queue').textContent.includes('1420 Ashby') && document.getElementById('queue').textContent.includes('Due today'));
  });
  await test('TEST B in the browser: stale save gets the conflict notice, nothing silently overwritten', async () => {
    await tab(A, 'leads'); await openLead(A, leadId, 'uw'); await openLead(B, leadId, 'uw');
    await A.fill('#drawer [data-set=repairs]', '10000'); // Seth is typing (not committed yet); his drawer is open so nothing refreshes under him
    await B.fill('#drawer [data-set=arv]', '500000'); await B.press('#drawer [data-set=arv]', 'Tab'); await drSaved(B);
   
    await A.press('#drawer [data-set=repairs]', 'Tab'); // Seth commits his stale edit
    await A.waitForFunction(() => document.getElementById('drBody').textContent.includes('updated by another team member') || document.getElementById('drStatus').textContent.includes('Changed by another user'));
    assert(await A.inputValue('#drawer [data-set=arv]') === '500000', 'latest copy (Cherry\'s ARV) now shown to Seth');
    await A.fill('#drawer [data-set=repairs]', '12000'); await A.press('#drawer [data-set=repairs]', 'Tab'); await drSaved(A); // a deliberate new value after reviewing
    const mao = 500000 * 0.7 - 12000; assert((await A.textContent('#drBody')).replace(/,/g, '').includes('$' + mao), 'MAO = ' + mao);
  });
  await test('half-typed text is never saved: a save elsewhere does not commit the field under the cursor', async () => {
    const nextActions = () => { freshRequest(SETH); return ctx.getLead(leadId).data.activity.filter(a => a.action_type === 'NEXT_ACTION_CHANGED').length; };
    await openLead(A, leadId, 'work'); const before = nextActions();
    await A.click('#drawer [data-set=next_action]'); await A.keyboard.press('Control+a'); await A.keyboard.type('Call the title company');
    // A save on another field lands while the person is still typing — this is what rebuilt the card mid-sentence.
    await A.evaluate(() => { const s = document.querySelector('#drBody [data-set=status]'); s.value = 'INVESTIGATING'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await drSaved(A);
    assert(await A.evaluate(() => document.activeElement.dataset.set) === 'next_action', 'the cursor stays in the field');
    assert(await A.inputValue('#drawer [data-set=next_action]') === 'Call the title company', 'typed text survives the save');
    assert(nextActions() === before, `half-typed next action reached the database: ${before} -> ${nextActions()}`);
    await A.keyboard.press('Tab'); await drSaved(A); // committing it deliberately does save, exactly once
    await A.waitForFunction(id => document.getElementById('lead-' + id).textContent.includes('Call the title company'), leadId);
    assert(nextActions() === before + 1, `deliberate commit should write one entry, got ${nextActions() - before}`);
    assert(ctx.getLead(leadId).data.next_action === 'Call the title company', 'the whole sentence was saved, not a prefix');
  });
  await test('wholesale: the money fields follow the exit strategy', async () => {
    await openLead(A, leadId, 'uw');
    await A.selectOption('#drawer [data-set=exit_strategy]', 'Wholesale - Double Close'); await drSaved(A);
    assert(await A.$('#drawer [data-set=sale_price]'), 'a double close asks for a sale price');
    assert(!(await A.$('#drawer [data-set=assignment_fee]')), 'and not for a fee');
    await A.fill('#drawer [data-set=purchase_price]', '270000'); await A.press('#drawer [data-set=purchase_price]', 'Tab'); await drSaved(A);
    await A.fill('#drawer [data-set=sale_price]', '85000'); await A.press('#drawer [data-set=sale_price]', 'Tab'); await drSaved(A);
    await A.waitForFunction(() => document.getElementById('drBody').textContent.includes('Selling for less than we paid'));
    await A.selectOption('#drawer [data-set=exit_strategy]', 'Wholesale - Assignment'); await drSaved(A);
    await A.waitForSelector('#drawer [data-set=assignment_fee]');
    assert(!(await A.$('#drawer [data-set=sale_price]')), 'an assignment has no sale price to enter');
    await A.waitForFunction(() => document.getElementById('drBody').textContent.includes('There is a sale price on an assignment'));
    assert((await A.textContent('#drBody')).includes('Contract price'), 'purchase price is called the contract price');
    assert((await A.textContent('#drBody')).includes('Revenue'), 'the end figure is called Revenue on an assignment too');
  });
  await test('compliance: mailer/check → both flags, visible warning, Waiting on Juan, lead kept', async () => {
    await A.click('#dtabs [data-t=work]'); A.dialogs.push(true); await A.click('#drawer [data-comply="1"]'); await drSaved(A);
    const t = await A.textContent('#drBody'); assert(t.includes('Mailer or check mentioned') && t.includes('routed to Juan'), 'warning shown');
    assert((await row(A, leadId).textContent()).includes('Mailer or check'), 'row state'); await A.keyboard.press('Escape');
    await tab(A, 'today'); await pane(A, 'juan'); await A.waitForFunction(() => document.getElementById('flagged').textContent.includes('1420 Ashby') && document.getElementById('flagged').textContent.includes('Mailer or check'));
    await tab(A, 'leads'); await setFilter(A, 'live'); await boardHas(A, '1420 Ashby');
  });
  await test('work queue: overdue / no next action + Mark done without follow-up flags NO NEXT ACTION', async () => {
    const today = (await A.textContent('#footToday')).trim(); const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 3); const past = d.toISOString().slice(0, 10);
    await openLead(A, lead2Id); await A.fill('#drawer [data-set=next_action]', 'Call county on liens'); await A.press('#drawer [data-set=next_action]', 'Tab'); await A.fill('#drawer [data-set=due_date]', past); await A.press('#drawer [data-set=due_date]', 'Tab'); await drSaved(A); await A.keyboard.press('Escape');
    await tab(A, 'today'); await pane(A, 'queue'); await A.click('#queueTabs [data-q=overdue]'); await A.waitForFunction(() => /Overdue 3 days/.test(document.getElementById('queue').textContent) && document.getElementById('queue').textContent.includes('820 28th St'));
    A.dialogs.push(''); await A.click(`#queue [data-qdone="${lead2Id}"]`);
    await A.waitForFunction(id => !document.querySelector(`#queue [data-qdone="${id}"]`), lead2Id);
    await A.click('#queueTabs [data-q=no_next_action]'); await A.waitForFunction(() => document.getElementById('queue').textContent.includes('820 28th St') && document.getElementById('queue').textContent.includes('No next action'));
  });
  await test('archive hides from live, shows in archived with history, restore returns it', async () => {
    await tab(A, 'leads'); await openLead(A, lead2Id); A.dialogs.push('no equity after liens'); await A.selectOption('#drawer [data-set=status]', 'ARCHIVED_NO_EQUITY'); await drSaved(A); await A.keyboard.press('Escape');
    await setFilter(A, 'live'); await A.waitForFunction(id => !document.getElementById('lead-' + id), lead2Id);
    await setFilter(A, 'archived'); await boardHas(A, '820 28th St'); await openLead(A, lead2Id, 'hist'); const t = await A.textContent('#drBody'); assert(t.includes('Archived: no equity') && t.includes('Call county on liens'), 'history intact');
    await A.click('#dtabs [data-t=work]'); await A.click('#drawer [data-restore]'); await drSaved(A); await A.keyboard.press('Escape'); await setFilter(A, 'live'); await boardHas(A, '820 28th St');
  });
  await test('day log saves once per business date; dashboards show the numbers', async () => {
    await tab(A, 'today'); await pane(A, 'log'); const v = { d_tv_spend: 1000, d_ppc_spend: 500, d_seo_spend: 0, d_ppl_spend: 300, d_mail_spend: 0, d_other_spend: 200, d_new_leads: 20, d_inbound_calls: 30, d_missed_calls: 10, d_sellers_reached: 10, d_appointments_set: 4, d_contracts_signed: 2, d_contracts_fell_out: 1, d_deals_closed: 1, d_minutes_to_first_call: 12 };
    for (const k in v) await A.fill('#' + k, String(v[k])); await A.click('#saveDay'); await A.waitForFunction(() => document.getElementById('saveMsg').textContent.includes('Saved by Seth'));
    await A.fill('#d_new_leads', '25'); await A.click('#saveDay'); await A.waitForFunction(() => document.getElementById('todayLabel').textContent.includes('by Seth'));
    await tab(A, 'dash'); await A.waitForFunction(() => document.getElementById('t-c2c').textContent === '50%', null, { timeout: 15000 });
    await A.click('#sub-dash [data-d=marketing]'); await A.waitForFunction(() => document.getElementById('mktHero').textContent.includes('$80 per lead'), null, { timeout: 15000 });
    const facts = (await A.textContent('#mktFacts')).replace(/,/g, ''); assert(facts.includes('$500') && facts.includes('$1000') && facts.includes('$2000'), 'CPA/CPC/CPD: ' + facts);
    assert((await A.textContent('#chanTable')).replace(/,/g, '').includes('PPC$500'), 'channel table'); assert((await A.locator('#ch-pace rect.bar').count()) === 16, '8 weeks × 2 series bars');
    assert((await A.locator('#chan-tiles .tile').count()) === 6, 'six spend channels'); assert((await A.locator('#ch-src rect.bar').count()) >= 9, 'leads by source bars');
    await A.click('#sub-dash [data-d=pipeline]'); assert((await A.locator('#funnel .stage').count()) === 6, 'six funnel stages');
    await A.click('#sub-dash [data-d=discipline]'); await A.waitForFunction(() => document.querySelectorAll('#cal i.logged').length >= 1, 'today logged in calendar');
  });
  await test('dashboards: the window is picked by date and compared with the one before', async () => {
    await tab(A, 'dash'); await A.waitForFunction(() => document.getElementById('dashCompare').textContent.length > 0, null, { timeout: 15000 });
    const cmp = await A.textContent('#dashCompare');
    assert(/Leads/.test(cmp) && /vs before|nothing before|same as before/.test(cmp), 'compared with the window before: ' + cmp.slice(0, 120));
    assert(await A.$('#period') === null, 'the preset dropdown is gone');
    const to = await A.inputValue('#dTo');
    const shift = (d, n) => { const p = d.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); };
    await A.fill('#dFrom', shift(to, -6)); await A.press('#dFrom', 'Tab');
    await A.waitForFunction(() => document.querySelectorAll('#ch-pace rect.bar').length === 14, null, { timeout: 20000 }); // 7 daily buckets x 2 series
    await A.click('#dReset');
    await A.waitForFunction(() => document.querySelectorAll('#ch-pace rect.bar').length === 16, null, { timeout: 20000 }); // back to 8 weekly buckets
    assert(await A.inputValue('#dFrom') === shift(to, -55), 'reset goes back to the last eight weeks');
  });
  await test('tools: the inventory filters by type, not by who built it', async () => {
    await tab(A, 'tools'); await A.waitForFunction(() => document.querySelectorAll('#typeFilter button').length > 0);
    const labels = await A.$$eval('#typeFilter button', b => b.map(x => x.textContent.replace(/\s+\d+$/, '').trim()));
    assert(labels[0] === 'All' && labels.includes('System') && labels.includes('Automation') && labels.includes('Reporting'), 'type tabs: ' + labels.join(', '));
    assert(!labels.some(l => /Seth|Cherry|Bryan|Jonathan|Builder/.test(l)), 'no builder tabs left: ' + labels.join(', '));
    const id = await A.$eval('#toolList .row', r => r.dataset.tid);
    await A.click('#tool-' + id); await A.waitForSelector('#toolDrawer:not([hidden])');
    await A.selectOption('#toolDrawer [data-tool="tool_type"]', 'Automation');
    await A.waitForFunction(() => document.getElementById('tdStatus').textContent === 'Saved', null, { timeout: 10000 });
    await A.keyboard.press('Escape');
    await A.click('#typeFilter button[data-b="Automation"]');
    await A.waitForFunction(i => document.getElementById('toolList').textContent.length > 0 && document.querySelectorAll('#toolList .row').length >= 1 && !!document.getElementById('tool-' + i), id);
    await A.click('#typeFilter button[data-b="Reporting"]');
    await A.waitForFunction(i => !document.getElementById('tool-' + i), id, { timeout: 10000 });
    await A.click('#typeFilter button[data-b=""]');
  });
  await test('tools: daily list, training from USERS, mark run / undo on Today', async () => {
    await tab(A, 'tools'); await A.waitForSelector('#tool-plbids'); assert((await A.textContent('#tool-plbids')).includes('every day'), 'seeded daily');
    await A.click('#tool-plbids'); await A.waitForSelector('#toolDrawer:not([hidden])'); await A.click('#toolDrawer [data-trained="USR-CHERRY"]'); await A.waitForFunction(() => document.getElementById('tool-plbids').textContent.includes('1 trained')); await A.keyboard.press('Escape');
    await tab(A, 'today'); await pane(A, 'tools'); await A.waitForFunction(() => document.getElementById('runsToday').textContent.includes('PropertyLeads bid monitoring'));
    await A.click('#runsToday [data-run="plbids"]'); await A.waitForFunction(() => document.getElementById('runsToday').textContent.includes('done by Seth'));
    await A.click('#runsToday [data-run="plbids"]'); await A.waitForFunction(() => !document.getElementById('runsToday').textContent.includes('done by Seth'));
  });
  await test('auto refresh: Cherry\'s change appears on Seth\'s board within the refresh window, no click', async () => {
    await tab(A, 'leads'); await setFilter(A, 'live'); await boardHas(A, '1420 Ashby'); await A.evaluate(() => document.activeElement && document.activeElement.blur());
    await openLead(B, leadId, 'work'); /* reopen: Cherry's old copy is stale after Seth's edits */ await B.fill('#drawer [data-set=next_action]', 'auto refresh check'); await B.press('#drawer [data-set=next_action]', 'Tab'); await drSaved(B);
    await A.waitForFunction(id => document.getElementById('lead-' + id).textContent.includes('auto refresh check'), leadId, { timeout: 25000 });
  });
  await test('Juan management view + team table populated from activity', async () => {
    await tab(A, 'today'); await pane(A, 'team'); await A.click('#refreshBtn'); await A.waitForFunction(() => document.getElementById('juanTeam').textContent.includes('Cherry') && document.getElementById('juanTeam').textContent.includes('Seth'));
    assert((await A.textContent('#juanTally')).includes('worked'), 'tally'); assert((await A.textContent('#juanChanges')).includes('Cherry'), 'changes list');
  });
  await test('admin: settings save (MAO %) re-prices the drawer; user add needs email to be active', async () => {
    await tab(A, 'admin'); await A.waitForSelector('#s_mao_percentage'); await A.fill('#s_mao_percentage', '65'); await A.click('#saveSettings'); await A.waitForFunction(() => document.getElementById('settingsMsg').textContent === 'Saved');
    await tab(A, 'leads'); await openLead(A, leadId, 'uw'); assert((await A.textContent('#drBody')).includes('65% of ARV'), 'MAO 65%'); await A.keyboard.press('Escape');
    await tab(A, 'admin'); await A.fill('#u_name', 'Thea Two'); await A.click('#addUser'); await A.waitForFunction(() => document.getElementById('userMsg').textContent.includes('inactive until an email'));
    await A.fill('#s_mao_percentage', '70'); await A.click('#saveSettings'); await A.waitForFunction(() => document.getElementById('settingsMsg').textContent === 'Saved');
  });
  await test('XSS: hostile seller data is rendered inert', async () => {
    freshRequest(SETH); const r = ctx.createLead({ address: '9 Xss <img src=x onerror="window.__pwned=1"> St', seller_name: '<script>window.__pwned=2</script>' }); assert(r.ok, 'created');
    await tab(A, 'leads'); await setFilter(A, 'live'); await boardHas(A, '9 Xss'); const id = await A.getAttribute('.lead:has-text("9 Xss")', 'data-id'); await openLead(A, id); await A.waitForTimeout(300);
    assert(await A.evaluate(() => window.__pwned) === undefined, 'no script execution'); assert((await A.textContent('#drTitle')).includes('<img src=x'), 'shown as text'); await A.keyboard.press('Escape');
  });
  await test('responsive: desktop / laptop / phone render without horizontal scroll', async () => {
    for (const [w, h, name] of [[1440, 900, 'desktop'], [1024, 768, 'laptop'], [390, 844, 'phone']]) {
      await A.setViewportSize({ width: w, height: h });
      for (const v of ['today', 'leads', 'dash', 'tools']) { if (w > 720) await tab(A, v); else { await A.click(`#tabbar [data-view="${v}"]`); await A.waitForSelector(`#view-${v}:not([hidden])`); } await A.waitForTimeout(250); const sw = await A.evaluate(() => document.documentElement.scrollWidth); assert(sw <= w + 1, `${name} ${v}: scrollWidth ${sw} > ${w}`); if (v === 'today' || v === 'dash') await A.screenshot({ path: path.join(OUT, `${name}-${v}.png`) }); }
    }
    await A.setViewportSize({ width: 1360, height: 900 });
  });
  await test('REP role: David can work leads but cannot reassign, sees no management panel', async () => {
    freshRequest(SETH); const u = ctx.getUsers().data.find(x => x.name === 'David'); ctx.updateUser(u.user_id, { email: 'david.test@example.com', active: true });
    const D = await open('david.test@example.com'); await booted(D); assert(await D.isHidden('#juanPanelTab') && await D.isHidden('#tabAdmin'), 'no management for rep');
    await tab(D, 'leads'); await boardHas(D, '1420 Ashby'); await openLead(D, leadId); const dis = await D.locator('#drawer [data-set=assigned_to] option[disabled]').count(); assert(dis >= 8, 'others disabled for rep: ' + dis);
    await D.click('#drawer [data-attempt]'); await drSaved(D); assert((await D.textContent('#drBody')).includes('David'), 'attempt attributed to David'); await D.context().close();
  });
  await browser.close(); srv.server.close();
  console.log(`\n${results.filter(r => r[0] === 'PASS').length} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
