#!/usr/bin/env bash
# One-command production deploy with clasp. Run from apps/acquisitions-desk on a machine where you are signed in
# to the company Google account that owns the Apps Script project (see DEPLOY.md, step 2).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .clasp.json ] || { echo "Missing .clasp.json — copy .clasp.json.example and paste the scriptId (DEPLOY.md step 2)."; exit 1; }
node scripts/privatize.js
node test/run-backend-tests.js >/dev/null && echo "backend tests: PASS"
npx --yes @google/clasp@3 push --force
VERSION=$(node -e "const s=require('fs').readFileSync('src/Config.gs','utf8');console.log(/APP_VERSION = '([^']+)'/.exec(s)[1])")
DESC="THB Acquisitions Desk v$VERSION $(date -u +%Y-%m-%dT%H:%MZ)"
if [ -n "${DEPLOYMENT_ID:-}" ]; then
  npx --yes @google/clasp@3 deploy --deploymentId "$DEPLOYMENT_ID" --description "$DESC"
else
  echo "DEPLOYMENT_ID not set: creating a NEW deployment (a new /exec URL). For production updates export DEPLOYMENT_ID=<existing id> so the URL stays the same."
  npx --yes @google/clasp@3 deploy --description "$DESC"
fi
npx --yes @google/clasp@3 deployments
echo "Done. Production URL = the deployment's /exec URL above. Then in the Apps Script editor run setupDatabase() (first time) or nothing (updates)."
