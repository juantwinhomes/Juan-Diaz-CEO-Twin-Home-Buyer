#!/usr/bin/env bash
#
# One-shot deploy of the GA4 MCP server to Cloud Run.
#
# Easiest way to run this: open Google Cloud Shell (shell.cloud.google.com),
# clone this repo, cd into ga4-mcp-server, then ./deploy.sh — Cloud Shell
# already has gcloud installed and authenticated.
#
# Re-running is safe: existing resources are reused, and a fresh shared secret
# is minted each time (which also rotates the connector URL).

set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-ga4-mcp-server}"
SA_NAME="${SA_NAME:-ga4-mcp}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null 2>&1 || fail "gcloud is not installed. Use Google Cloud Shell, or install the gcloud CLI."
[ -f "$(dirname "$0")/package.json" ] || fail "Run this from the ga4-mcp-server directory."
cd "$(dirname "$0")"

# ---------------------------------------------------------------- project ---
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  read -r -p "Google Cloud project ID: " PROJECT
  [ -n "$PROJECT" ] || fail "A project ID is required."
fi
gcloud config set project "$PROJECT" >/dev/null
say "Project: $PROJECT"

# ------------------------------------------------------------- property id ---
GA4_PROPERTY_ID="${GA4_PROPERTY_ID:-}"
if [ -z "$GA4_PROPERTY_ID" ]; then
  echo
  echo "GA4 property ID — the numeric one in GA4 Admin -> Property Settings."
  echo "Not the G-XXXXXXX measurement ID. Leave blank to fill in later."
  read -r -p "GA4 property ID: " GA4_PROPERTY_ID
fi
if [ -n "$GA4_PROPERTY_ID" ] && ! printf '%s' "$GA4_PROPERTY_ID" | grep -Eq '^[0-9]+$'; then
  fail "\"$GA4_PROPERTY_ID\" is not numeric. Use the property ID, not the G-XXXXXXX measurement ID."
fi

# ----------------------------------------------------------------- enable ---
say "Enabling required APIs (this can take a minute the first time)…"
gcloud services enable \
  analyticsdata.googleapis.com \
  analyticsadmin.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# ---------------------------------------------------------- service account ---
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  say "Reusing service account: $SA_EMAIL"
else
  say "Creating service account: $SA_EMAIL"
  gcloud iam service-accounts create "$SA_NAME" --display-name="GA4 MCP Server"
fi

# ----------------------------------------------------------------- secret ---
if command -v openssl >/dev/null 2>&1; then
  SECRET="$(openssl rand -hex 32)"
else
  SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi

ENV_VARS="MCP_SHARED_SECRET=${SECRET}"
[ -n "$GA4_PROPERTY_ID" ] && ENV_VARS="GA4_PROPERTY_ID=${GA4_PROPERTY_ID},${ENV_VARS}"

# ----------------------------------------------------------------- deploy ---
say "Deploying to Cloud Run in $REGION…"
if ! gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-env-vars "$ENV_VARS" \
  --allow-unauthenticated \
  --quiet; then
  fail "Deploy failed. If the error mentions 'allUsers' or an org policy, your organization blocks public Cloud Run services — ask an admin, or deploy somewhere without that restriction."
fi

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
[ -n "$URL" ] || fail "Deployed, but could not read the service URL. Check the Cloud Run console."

# ------------------------------------------------------------------ done ----
cat <<EOF

────────────────────────────────────────────────────────────────
 Deployed.
────────────────────────────────────────────────────────────────

STEP 1 — Give this service account access to your GA4 property.
  Nothing works until this is done.

    $SA_EMAIL

  In Google Analytics: Admin -> Property access management -> +
  Add that email with the Viewer role.

STEP 2 — Add the connector in claude.ai.

  Settings -> Connectors -> Add custom connector

    Name:  GA4 Analytics
    URL:   ${URL}/mcp/${SECRET}

  The name must match exactly — the dashboard looks it up by name.

STEP 3 — Reload the dashboard. The Google Analytics page fills in.

Keep that URL secret: it is the credential. Re-run this script to
rotate it.

Health check (no credentials needed):
  curl ${URL}/healthz

EOF
