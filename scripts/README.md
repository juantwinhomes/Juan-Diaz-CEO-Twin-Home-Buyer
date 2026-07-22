# REI BlackBook — read-only access scripts

Restores read-only access to REI BlackBook for the existing Direct-Mail KPI
system. These scripts **do not** modify REI, Monday.com, QuickBooks, the
dashboard, or any records. They only read.

## Files

| File | Purpose |
| --- | --- |
| `rei-auth.mjs` | One-time interactive login. Opens a **visible** browser so you type your username / password / MFA by hand, then saves the session to `auth/rei-storage-state.json`. Never logs secrets. |
| `rei-readonly-pull.mjs` | Strictly read-only data pull for the ROI report. Loads the saved session and reads contact fields. A network guard aborts any non-GET request that isn't a known read query. |

## 1. Authenticate (run on a machine with a screen)

The login is manual by design, so it must run where **you can see and use a
browser** — your own computer or an interactive desktop session. A headless
cloud container has no screen to type into.

```bash
npm install                 # installs playwright-core
node scripts/rei-auth.mjs   # log in by hand; session saved to auth/rei-storage-state.json
```

Then, if you authenticated on a different machine, copy `auth/rei-storage-state.json`
to the server (it is git-ignored and must never be committed).

## 2. Test on one contact

```bash
node scripts/rei-readonly-pull.mjs --test
```

Reports: which page was opened, which fields were read, which were missing,
whether the session is authenticated, and whether any REI page/selector changed.

## 3. Full read-only pull

```bash
node scripts/rei-readonly-pull.mjs --all
```

Writes `scripts/out/rei-directmail-dataset.json` (git-ignored — contains PII)
and prints a summary. The ROI report (`DIRECT_MAIL_ROI_UPDATED_REPORT.md`) is
then updated from that dataset, using Monday.com only for reconciliation.

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `REI_BASE_URL` | `https://my.reiblackbook.com` | REI base URL |
| `REI_STORAGE_STATE` | `auth/rei-storage-state.json` | saved session path |
| `PW_CHROMIUM` | `/opt/pw-browsers/chromium` | Chromium binary |
| `REI_PROXY` | *(unset)* | optional outbound proxy |

## Safety

- Read-only: only GET navigation and REI's read/query endpoints
  (`/profitdial/contacts/query`, `/profitdial/profiles/getProfileFieldValues`).
  PUT/PATCH/DELETE and any other POST are blocked at the network layer.
- No Save, submit, edit, tag/stage change, note, delete, message, or workflow.
- No username/password in source; no secrets printed or logged.
- If the session expires, the pull stops and asks you to re-run `rei-auth.mjs`.
  CAPTCHA/MFA are never bypassed.
