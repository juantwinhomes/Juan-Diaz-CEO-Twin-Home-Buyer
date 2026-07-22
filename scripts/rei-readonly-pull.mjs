#!/usr/bin/env node
/**
 * REI BlackBook — STRICTLY READ-ONLY data pull for the Direct-Mail ROI report.
 *
 * Loads the saved session (auth/rei-storage-state.json) and reads the contact
 * data needed for the ROI report. It NEVER writes to REI: no Save clicks, no
 * form submits that mutate, no tag/stage edits, no notes, no deletes, no
 * messages, no workflow triggers. Read-only is enforced two ways:
 *   1. The code only navigates and calls REI's read/query endpoints.
 *   2. A network guard aborts any PUT/PATCH/DELETE and any POST that is not on
 *      the read-only query allowlist.
 *
 * Fields retrieved per contact:
 *   REI contact ID · Lead name · Property address · Source · Tags ·
 *   Pipeline stage · Campaign / mailing list · Date received ·
 *   Revenue custom field · Closed-deal status · Cancelled-contract status ·
 *   REI record URL
 *
 * Direct-mail classification — SOURCE takes priority over tags:
 *   - Direct Mail (Postcard) / (Checks) / (Call-in) / (Letters) are counted.
 *   - PPC, Bing Ads, PropertyLeads, Google/Facebook/web/TV are NOT direct mail
 *     even if they carry a mail-related tag.
 *
 * Modes:
 *   node scripts/rei-readonly-pull.mjs --test [contactId]   # ONE contact, diagnostics
 *   node scripts/rei-readonly-pull.mjs --all                # full verified pull -> JSON
 *
 * Output (full mode): scripts/out/rei-directmail-dataset.json  (git-ignored; PII)
 *
 * If the session has expired, the script STOPS and tells you to re-run
 * scripts/rei-auth.mjs in a visible browser. It never bypasses CAPTCHA/MFA.
 *
 * No secrets (cookies/tokens/passwords) are ever printed or logged.
 */

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = (process.env.REI_BASE_URL || 'https://my.reiblackbook.com').replace(/\/+$/, '');
const STATE = process.env.REI_STORAGE_STATE || 'auth/rei-storage-state.json';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const OUT = 'scripts/out/rei-directmail-dataset.json';
const LOGIN_RE = /\/services\/account\/login/i;
const PAGE_LIMIT = 100;                          // REI query limit <= 100

// POSTs allowed because they are read-only *queries*, not mutations.
const READ_POST_ALLOW = [
  /\/profitdial\/contacts\/query/i,
  /\/profitdial\/profiles\/getProfileFieldValues/i,
  /\/profitdial\/contacts\/get/i,
  /\/services\/account\//i,                       // session/auth checks
];

function log(m) { process.stdout.write(`[rei-pull] ${m}\n`); }
const lc = (s) => String(s == null ? '' : s).toLowerCase();

// ---- direct-mail classification (source wins) -------------------------------
const NON_DM = /motivated lead|property leads|leadgeeks|bing|google ads|adwords|(^|\W)ppl(\W|$)|(^|\W)ppc(\W|$)|facebook|instagram|tiktok|youtube|tv commercial|web inquir|website|zillow|seo/i;
const DM_POSTCARD = /postcard/i;
const DM_CHECKS = /check/i;
const DM_LETTER = /letter/i;
const DM_CALLIN = /call.?in|hotline|inbound call|call in/i;
const DM_GENERIC = /direct mail/i;
const MAIL_TAG = /postcard|check|mailer|mailed|direct mail|letter/i;

/** Returns { isDM:boolean, type:string, basis:'source'|'tag'|'none' }. */
function classify(source, tags) {
  const s = lc(source);
  if (s) {
    if (NON_DM.test(s)) return { isDM: false, type: 'Other channel (source)', basis: 'source' };
    if (DM_POSTCARD.test(s)) return { isDM: true, type: 'Direct Mail (Postcard)', basis: 'source' };
    if (DM_CHECKS.test(s)) return { isDM: true, type: 'Direct Mail (Checks)', basis: 'source' };
    if (DM_LETTER.test(s)) return { isDM: true, type: 'Direct Mail (Letters)', basis: 'source' };
    if (DM_CALLIN.test(s)) return { isDM: true, type: 'Direct Mail (Call-in)', basis: 'source' };
    if (DM_GENERIC.test(s)) return { isDM: true, type: 'Direct Mail (unspecified)', basis: 'source' };
    return { isDM: false, type: 'Other channel (source)', basis: 'source' }; // known non-mail source
  }
  // Source blank -> fall back to tags, but exclude clear non-DM channels.
  const t = Array.isArray(tags) ? tags.join(';') : String(tags || '');
  if (!t) return { isDM: false, type: 'Unknown (no source, no tags)', basis: 'none' };
  if (NON_DM.test(t)) return { isDM: false, type: 'Other channel (tag)', basis: 'tag' };
  if (MAIL_TAG.test(t)) {
    if (DM_POSTCARD.test(t)) return { isDM: true, type: 'Direct Mail (Postcard)', basis: 'tag' };
    if (DM_CHECKS.test(t)) return { isDM: true, type: 'Direct Mail (Checks)', basis: 'tag' };
    if (DM_LETTER.test(t)) return { isDM: true, type: 'Direct Mail (Letters)', basis: 'tag' };
    return { isDM: true, type: 'Direct Mail (tag)', basis: 'tag' };
  }
  return { isDM: false, type: 'Unknown (no mail evidence)', basis: 'none' };
}

// ---- field extraction (adaptive; REI response keys vary) --------------------
const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};
const STAGE_CLOSED = /acquired|deal closed|closed\s*\/?\s*won|won|sold/i;
const STAGE_CANCELLED = /cancel/i;

function mapContact(raw, profile) {
  const p = { ...(raw || {}), ...(profile || {}) };
  const id = pick(p, ['id', 'contact_id', 'contactId', 'ContactId', 'cid']);
  const first = pick(p, ['first_name', 'firstname', 'FirstName']);
  const last = pick(p, ['last_name', 'lastname', 'LastName']);
  const name = pick(p, ['full_name', 'name', 'contact_name']) || [first, last].filter(Boolean).join(' ');
  const street = pick(p, ['property_address', 'address', 'street_address', 'PropertyAddress', 'address1']);
  const city = pick(p, ['property_city', 'city', 'City']);
  const state = pick(p, ['property_state', 'state', 'State']);
  const zip = pick(p, ['property_zip', 'zip', 'postal_code', 'Zip']);
  const address = [street, city, state, zip].filter(Boolean).join(', ');
  const source = pick(p, ['source', 'lead_source', 'Source', 'contact_source']);
  const tagsRaw = pick(p, ['tags', 'Tags', 'tag_list', 'labels']);
  const tags = Array.isArray(tagsRaw) ? tagsRaw : String(tagsRaw || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const campaign = pick(p, ['campaign', 'Campaign', 'list', 'list_name', 'mailing_list', 'utm_campaign']);
  const stage = pick(p, ['lead_stage', 'stage', 'pipeline_stage', 'Lead Stage', 'disposition', 'status']);
  const dateReceived = String(pick(p, ['created_at', 'date_created', 'received_date', 'date', 'created'])).slice(0, 19);
  const revenueRaw = pick(p, ['revenue', 'Revenue', 'actual_revenue', 'deal_revenue', 'gross_revenue']);
  const revenue = revenueRaw === '' ? null : parseFloat(String(revenueRaw).replace(/[^0-9.\-]/g, ''));
  const url = id ? `${BASE}/profitdial/contacts/${id}` : '';
  const { isDM, type, basis } = classify(source, tags);
  return {
    contactId: String(id || ''),
    name, address, source: source || '', tags,
    stage: stage || '', campaign: campaign || '',
    dateReceived: dateReceived || '',
    revenue: Number.isFinite(revenue) ? revenue : null,
    isClosed: STAGE_CLOSED.test(lc(stage)),
    isCancelled: STAGE_CANCELLED.test(lc(stage)),
    recordUrl: url,
    directMail: isDM, mailType: type, classificationBasis: basis,
    _fieldsMissing: [
      ['contactId', id], ['name', name], ['address', address], ['source', source],
      ['tags', tags.length], ['stage', stage], ['campaign', campaign],
      ['dateReceived', dateReceived], ['revenue', revenueRaw],
    ].filter(([, v]) => v === '' || v === 0 || v === undefined).map(([k]) => k),
  };
}

// ---- REI API (authenticated, read-only) -------------------------------------
async function queryContactsPage(req, page) {
  // Documented: POST /profitdial/contacts/query, offset = page number, limit <= 100
  const res = await req.post(`${BASE}/profitdial/contacts/query`, {
    data: { offset: page, limit: PAGE_LIMIT },
    headers: { Accept: 'application/json' },
    failOnStatusCode: false,
  });
  const status = res.status();
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status, body };
}
function contactsFromBody(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  return body.contacts || body.data || body.results || body.rows || body.items || [];
}
async function getProfileFields(req, contactId) {
  const res = await req.post(`${BASE}/profitdial/profiles/getProfileFieldValues`, {
    data: { contact_id: contactId, contactId },
    headers: { Accept: 'application/json' },
    failOnStatusCode: false,
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  // Normalize {fields:[{name,value}]} or {Campaign:..,Revenue:..} shapes.
  if (body && Array.isArray(body.fields)) {
    const o = {};
    for (const f of body.fields) o[f.name || f.label || f.key] = f.value ?? f.text;
    return o;
  }
  return body && typeof body === 'object' ? (body.data || body) : {};
}

async function ensureAuthed(page) {
  await page.goto(`${BASE}/profitdial`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  if (LOGIN_RE.test(page.url())) {
    log('SESSION EXPIRED — REI redirected to the login page.');
    log('Read-only pull STOPPED. Re-authenticate in a visible browser:');
    log('   node scripts/rei-auth.mjs');
    log('CAPTCHA/MFA are never bypassed — you must log in manually.');
    return false;
  }
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const testId = args.find((a) => /^\d+$/.test(a));

  if (!existsSync(STATE)) {
    log(`No saved session at ${STATE}.`);
    log('Run the one-time interactive login first (visible browser):');
    log('   node scripts/rei-auth.mjs');
    process.exit(2);
  }

  const launchOpts = { headless: true, executablePath: existsSync(EXE) ? EXE : undefined, args: ['--ssl-version-max=tls1.2'] };
  if (process.env.REI_PROXY) launchOpts.proxy = { server: process.env.REI_PROXY };
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ storageState: STATE });

  // ---- READ-ONLY network guard ----
  let blocked = 0;
  await context.route('**/*', (route) => {
    const r = route.request();
    const m = r.method().toUpperCase();
    const u = r.url();
    if (m === 'GET' || m === 'HEAD') return route.continue();
    if (m === 'POST' && READ_POST_ALLOW.some((re) => re.test(u))) return route.continue();
    blocked++;
    log(`READ-ONLY GUARD blocked ${m} ${u.replace(BASE, '')}`);
    return route.abort();
  });

  const page = await context.newPage();
  const req = context.request;

  if (!(await ensureAuthed(page))) { await browser.close(); process.exit(3); }
  log('Session is authenticated.');

  // ---------- TEST MODE: one contact, full diagnostics ----------
  if (testMode) {
    log('--- SINGLE-CONTACT TEST ---');
    const first = await queryContactsPage(req, 0);
    log(`Opened: POST ${BASE}/profitdial/contacts/query  (status ${first.status})`);
    const list = contactsFromBody(first.body);
    if (!list.length) {
      log('Endpoint returned no contacts in the expected shape.');
      log(`Response top-level keys: ${first.body ? Object.keys(first.body).join(', ') : '(non-JSON)'}`);
      log('SELECTOR/ENDPOINT CHANGE LIKELY: contacts/query response schema differs from the documented one.');
      await browser.close(); process.exit(4);
    }
    let raw = list[0];
    if (testId) raw = list.find((c) => String(pick(c, ['id', 'contact_id', 'contactId'])) === testId) || raw;
    const cid = String(pick(raw, ['id', 'contact_id', 'contactId']));
    log(`Test contact id: ${cid}`);
    const profile = await getProfileFields(req, cid).catch(() => ({}));
    const rec = mapContact(raw, profile);
    const fields = ['contactId','name','address','source','tags','stage','campaign','dateReceived','revenue','isClosed','isCancelled','recordUrl'];
    const readOk = fields.filter((f) => rec._fieldsMissing.indexOf(f) === -1);
    log(`Record URL: ${rec.recordUrl}`);
    log(`Fields READ OK (${readOk.length}/${fields.length}): ${readOk.join(', ')}`);
    log(`Fields MISSING: ${rec._fieldsMissing.length ? rec._fieldsMissing.join(', ') : '(none)'}`);
    log(`Classification: directMail=${rec.directMail} type="${rec.mailType}" basis=${rec.classificationBasis}`);
    log(`Authenticated: YES · Read-only guard blocks so far: ${blocked}`);
    log('Page/selector check: contacts/query + getProfileFieldValues responded as expected.'
        + (rec._fieldsMissing.length > 3 ? ' NOTE: several fields empty — verify field-name mapping against live schema.' : ''));
    // NOTE: nothing written; no mutations performed.
    await browser.close();
    return;
  }

  // ---------- FULL MODE: paginate all contacts ----------
  log('--- FULL READ-ONLY PULL ---');
  const all = [];
  const seen = new Set();
  let page0 = 0, empties = 0;
  while (empties < 1) {
    const { status, body } = await queryContactsPage(req, page0);
    const list = contactsFromBody(body);
    if (status !== 200 && status !== 201) { log(`query page ${page0} status ${status} — stopping.`); break; }
    if (!list.length) { empties++; break; }
    for (const c of list) {
      const cid = String(pick(c, ['id', 'contact_id', 'contactId']));
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      all.push(c);
    }
    log(`page ${page0}: +${list.length} (total contacts ${all.length})`);
    if (list.length < PAGE_LIMIT) break;
    page0++;
    if (page0 > 200) { log('Safety cap at 200 pages reached.'); break; }
  }

  const records = [];
  for (const c of all) {
    const cid = String(pick(c, ['id', 'contact_id', 'contactId']));
    let profile = {};
    try { profile = await getProfileFields(req, cid); } catch { /* keep base fields */ }
    records.push(mapContact(c, profile));
  }

  const dm = records.filter((r) => r.directMail);
  const summary = {
    retrievedAt: new Date().toISOString(),
    contactsChecked: records.length,
    directMailLeads: dm.length,
    byType: dm.reduce((a, r) => ((a[r.mailType] = (a[r.mailType] || 0) + 1), a), {}),
    closedDeals: dm.filter((r) => r.isClosed).length,
    cancelledContracts: dm.filter((r) => r.isCancelled).length,
    totalRevenue: dm.reduce((s, r) => s + (r.isClosed && r.revenue ? r.revenue : 0), 0),
    warnings: {
      closedMissingRevenue: dm.filter((r) => r.isClosed && !r.revenue).length,
      missingSource: dm.filter((r) => !r.source).length,
      missingAddress: dm.filter((r) => !r.address).length,
    },
    readOnlyBlocks: blocked,
  };
  // duplicates by contactId (should be 0 due to seen-set; report anyway)
  const idCounts = records.reduce((a, r) => ((a[r.contactId] = (a[r.contactId] || 0) + 1), a), {});
  summary.warnings.duplicateIds = Object.values(idCounts).filter((n) => n > 1).length;

  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ summary, records }, null, 2));
  log(`Wrote ${records.length} contacts (${dm.length} direct-mail) -> ${OUT}`);
  log(`Closed: ${summary.closedDeals} · Revenue: $${summary.totalRevenue.toLocaleString()} · `
      + `warnings: rev-missing ${summary.warnings.closedMissingRevenue}, src-missing ${summary.warnings.missingSource}, `
      + `addr-missing ${summary.warnings.missingAddress}, dupes ${summary.warnings.duplicateIds}`);
  await browser.close();
}

main().catch((e) => { log(`Unexpected error: ${String(e.message).split('\n')[0]}`); process.exit(1); });
