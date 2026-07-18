#!/usr/bin/env python3
"""REI BlackBook login for the Lead QA Bot.

Reads credentials from environment variables (never hardcode, never commit):
  REIBB_URL   - login URL (e.g. https://<account>.reiblackbook.com/login)
  REIBB_EMAIL - login email
  REIBB_PASS  - login password

Logs in headlessly, saves Playwright storage state to the path given as
argv[1] (default: /tmp/reibb_state.json, outside the repo), and drops a
screenshot next to it so a human can verify what the bot saw.

Exit codes: 0 = logged in, 2 = missing config, 3 = login failed/blocked.
"""
import os
import sys

from playwright.sync_api import sync_playwright

STATE_PATH = sys.argv[1] if len(sys.argv) > 1 else "/tmp/reibb_state.json"
SHOT_PATH = STATE_PATH.rsplit(".", 1)[0] + ".png"

# Local override file wins over env vars (lets us update creds without
# touching environment settings); file lives outside the repo, never committed.
_overrides = {}
_env_file = os.path.expanduser("~/.reibb.env")
if os.path.exists(_env_file):
    with open(_env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                _overrides[k.strip()] = v.strip()

def _get(name):
    return _overrides.get(name) or os.environ.get(name, "")

url = _get("REIBB_URL")
email = _get("REIBB_EMAIL")
password = _get("REIBB_PASS")

if not (url and email and password):
    missing = [n for n, v in [("REIBB_URL", url), ("REIBB_EMAIL", email),
                              ("REIBB_PASS", password)] if not v]
    print(f"MISSING CONFIG: {', '.join(missing)} not set", file=sys.stderr)
    sys.exit(2)

with sync_playwright() as pw:
    # Use the environment's pre-installed Chromium (do not `playwright install`).
    browser = pw.chromium.launch(
        headless=True, executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    page.goto(url, wait_until="domcontentloaded", timeout=45000)

    # Standard email/password form; selectors verified on first live run.
    page.fill('input[type="email"], input[name*="email" i], input[name*="user" i]', email)
    page.fill('input[type="password"]', password)
    page.click('button[type="submit"], input[type="submit"]')
    page.wait_for_load_state("networkidle", timeout=45000)

    page.screenshot(path=SHOT_PATH, full_page=False)

    still_login = page.locator('input[type="password"]').count() > 0
    if still_login:
        print(f"LOGIN FAILED — still on login page. Screenshot: {SHOT_PATH}",
              file=sys.stderr)
        browser.close()
        sys.exit(3)

    page.context.storage_state(path=STATE_PATH)
    print(f"LOGGED IN. State: {STATE_PATH}  Screenshot: {SHOT_PATH}")
    browser.close()
