#!/usr/bin/env node
/**
 * REI BlackBook — interactive authentication (one-time, manual).
 *
 * Opens a VISIBLE browser on the REI BlackBook login page so YOU can type your
 * username, password, and any verification / MFA code by hand. When the REI
 * dashboard is reached, the authenticated browser state (cookies + storage) is
 * saved to  auth/rei-storage-state.json  for the read-only data-pull script.
 *
 * This script NEVER stores, prints, or logs your username, password, MFA code,
 * cookies, tokens, or session data. Credentials are typed straight into the
 * real REI page and never touch this file or the console.
 *
 * Usage:
 *   node scripts/rei-auth.mjs
 *
 * Requirements:
 *   - Must run in an environment with a visible desktop / display (your own
 *     machine, or an interactive desktop session). A headless CI/cloud
 *     container has no screen for you to type into — run it locally.
 *
 * Env (all optional; sensible defaults):
 *   REI_BASE_URL        default https://my.reiblackbook.com
 *   REI_STORAGE_STATE   default auth/rei-storage-state.json
 *   PW_CHROMIUM         path to a Chromium binary (else Playwright's default)
 */

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = (process.env.REI_BASE_URL || 'https://my.reiblackbook.com').replace(/\/+$/, '');
const STATE = process.env.REI_STORAGE_STATE || 'auth/rei-storage-state.json';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const LOGIN_RE = /\/services\/account\/login/i;      // Joomla login route
const LOGIN_FORM = '#form-login';                     // verified 2026-07-22
const PW_FIELD = '#modlgn_passwd';                    // verified 2026-07-22
const WAIT_MS = 8 * 60 * 1000;                        // up to 8 min for manual login + MFA

function log(msg) { process.stdout.write(`[rei-auth] ${msg}\n`); }

async function main() {
  const launchOpts = {
    headless: false,                                  // VISIBLE — you log in by hand
    executablePath: existsSync(EXE) ? EXE : undefined,
    args: ['--ssl-version-max=tls1.2'],
  };
  if (process.env.REI_PROXY) launchOpts.proxy = { server: process.env.REI_PROXY };

  let browser;
  try {
    browser = await chromium.launch(launchOpts);
  } catch (e) {
    log('ERROR: could not launch a visible browser.');
    log('This environment appears to have no display. Run this script on your');
    log('own computer (visible desktop) to complete the manual login, then copy');
    log(`the generated ${STATE} back to the server.`);
    log(`(details: ${String(e.message).split('\n')[0]})`);
    process.exit(2);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  log(`Opening REI BlackBook login: ${BASE}/`);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  log('A browser window is open. Please log in manually:');
  log('  1. Enter your REI BlackBook username and password.');
  log('  2. Complete any verification / MFA step REI shows you.');
  log('  3. Wait for the REI dashboard to load — this script detects it automatically.');
  log('Do NOT close the window; it will close itself once the session is saved.');

  // Poll until we are off the login page (dashboard reached), up to WAIT_MS.
  const deadline = Date.now() + WAIT_MS;
  let authed = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    let url = '';
    try { url = page.url(); } catch { /* page navigating */ }
    if (!url || url === 'about:blank') continue;
    const onLogin = LOGIN_RE.test(url) || (await page.$(PW_FIELD)) !== null || (await page.$(LOGIN_FORM)) !== null;
    if (!onLogin) {
      // Confirm the session really has access to an authenticated area.
      try {
        await page.goto(`${BASE}/profitdial`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!LOGIN_RE.test(page.url())) { authed = true; break; }
      } catch { /* retry loop */ }
    }
  }

  if (!authed) {
    log('Timed out waiting for a successful login. Nothing was saved.');
    log('Re-run the script and complete the login (including MFA) within the time window.');
    await browser.close();
    process.exit(1);
  }

  if (!existsSync(dirname(STATE))) mkdirSync(dirname(STATE), { recursive: true });
  await context.storageState({ path: STATE });
  log(`Authenticated. Session saved to ${STATE} (contents not shown).`);
  log('You can now run:  node scripts/rei-readonly-pull.mjs --test');
  await browser.close();
}

main().catch((e) => {
  // Never surface page content / secrets — only a short reason.
  log(`Unexpected error: ${String(e.message).split('\n')[0]}`);
  process.exit(1);
});
