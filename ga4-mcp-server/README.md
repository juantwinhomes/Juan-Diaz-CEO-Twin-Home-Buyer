# GA4 MCP Server

Exposes the Google Analytics 4 Data API to Claude as a custom connector, so the
SEO dashboard can read live analytics the same way it already reads Semrush.

Read-only by design: every tool queries, none write.

## Why this exists

Claude's connector directory has no Google Analytics entry, and a published
Artifact page cannot call Google directly — its network access is blocked. A
custom connector is the supported way in: this server holds the Google
credentials, Claude calls this server, and the page calls Claude.

```
Artifact page  ──►  claude.ai connector  ──►  this server  ──►  GA4 Data API
                    (viewer's session)        (service account)
```

## Tools

| Tool | What it answers |
|---|---|
| `ga4_list_properties` | Which properties can I read, and what are their IDs? |
| `ga4_traffic_summary` | Daily sessions, users, engaged sessions, page views |
| `ga4_top_pages` | Which pages get the traffic |
| `ga4_traffic_sources` | Channel or source/medium breakdown, with conversions |
| `ga4_realtime_users` | Who is on the site in the last 30 minutes |
| `ga4_run_report` | Any dimension/metric combination GA4 supports |

Dates accept `YYYY-MM-DD`, `NdaysAgo`, `yesterday`, or `today`.

## Setup

### 1. Google Cloud

1. Create (or pick) a project at <https://console.cloud.google.com>.
2. Enable **Google Analytics Data API**. To use `ga4_list_properties`, also
   enable **Google Analytics Admin API**.
3. Create a service account. No roles or key are needed if you deploy to Cloud
   Run — the deploy attaches the identity for you.
4. Copy the service-account email, which looks like
   `name@project-id.iam.gserviceaccount.com`.

### 2. Grant it access to the property

In Google Analytics: **Admin → Property access management → +** → add the
service-account email with the **Viewer** role.

This step is the one people miss. Without it every call fails with a 403.

### 3. Deploy

**Cloud Run** (recommended — no key file ever exists):

```bash
gcloud run deploy ga4-mcp-server \
  --source . \
  --region us-central1 \
  --service-account name@project-id.iam.gserviceaccount.com \
  --set-env-vars "GA4_PROPERTY_ID=123456789,MCP_SHARED_SECRET=$(openssl rand -hex 32)" \
  --allow-unauthenticated
```

`--allow-unauthenticated` lets Claude reach the URL; `MCP_SHARED_SECRET` is what
actually guards it. Note the secret you generated — you need it in step 4.

**Anywhere else** (Render, Railway, Fly, a VPS): set
`GOOGLE_SERVICE_ACCOUNT_JSON` to the whole key file contents, plus
`GA4_PROPERTY_ID` and `MCP_SHARED_SECRET`. Then `npm ci && npm run build && npm start`.

### 4. Add it to Claude

claude.ai → **Settings → Connectors → Add custom connector**, with the URL:

```
https://<your-service-url>/mcp/<your-shared-secret>
```

The secret sits in the path because connector dialogs accept a URL and nothing
else. A bearer token works too if your client can send headers.

### 5. Confirm

Ask Claude to run `ga4_list_properties`. Your property should come back with its
numeric ID. If the list is empty, step 2 did not take effect.

## Local development

```bash
cp .env.example .env     # fill in the values
npm install
npm run build
npm start
```

Health check, which needs no credentials:

```bash
curl localhost:8080/healthz
```

Full round trip:

```bash
curl -X POST localhost:8080/mcp/<secret> \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Troubleshooting

| Symptom | Cause |
|---|---|
| `403` mentioning permission | Service account is not a Viewer on the property (step 2), or the Data API is not enabled |
| `Could not load the default credentials` | Running outside Cloud Run without `GOOGLE_SERVICE_ACCOUNT_JSON` |
| `"G-XXXXXXX" is not a GA4 property ID` | That is the measurement ID; use the numeric property ID |
| `ga4_list_properties` returns `[]` | Credentials are valid but no property has granted access yet |
| `401 Unauthorized` | Shared secret in the URL does not match `MCP_SHARED_SECRET` |

## Security notes

- Anyone holding the URL can read your analytics — treat it like a password, and
  rotate by redeploying with a new `MCP_SHARED_SECRET`.
- The service account should be Viewer, never Editor or Administrator.
- Never commit `.env` or a service-account key. Both are gitignored here.
