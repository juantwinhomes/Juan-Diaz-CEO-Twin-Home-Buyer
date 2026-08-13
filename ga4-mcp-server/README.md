# GA4 Analytics Server

One service, two front doors onto the same Google Analytics 4 data:

1. **A web dashboard** at `/` — a real password-protected website. Sessions,
   users, channels, top pages, live visitor count. No Claude account needed.
2. **An MCP endpoint** at `/mcp` — so Claude can read the same data as a custom
   connector.

Read-only by design: everything queries, nothing writes.

## Why it is built this way

The Google credentials have to live somewhere that is not a browser. Publishing
a key into a web page would expose it to every visitor, and Claude Artifact
pages additionally cannot make external network calls at all — so the
credentials sit here, on the server, and both front doors ask this service.

```
Browser ─────────────────────────────────►┐
                                          ├─► this server ──► GA4 Data API
Artifact ──► claude.ai connector ─────────┘    (service account)
```

The dashboard is the simpler path: paste one credential, deploy, open the URL.
The MCP endpoint is there when you want the same numbers inside Claude.

## Routes

| Route | Purpose |
|---|---|
| `/` | Web dashboard (password protected) |
| `/login`, `/logout` | Dashboard session |
| `/api/summary`, `/api/sources`, `/api/pages`, `/api/realtime`, `/api/properties` | JSON for the dashboard |
| `/mcp` | MCP endpoint for Claude |
| `/healthz` | Health check, no credentials needed |

## MCP tools

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

**The scripted path.** Open [Cloud Shell](https://shell.cloud.google.com) —
`gcloud` is already installed and signed in, so nothing has to be set up on your
own machine:

```bash
git clone https://github.com/juantwinhomes/Juan-Diaz-CEO-Twin-Home-Buyer.git
cd Juan-Diaz-CEO-Twin-Home-Buyer/ga4-mcp-server
./deploy.sh
```

It enables the APIs, creates the service account, mints a shared secret, deploys,
and prints the exact connector URL plus the service-account email you need for
step 2. Re-running it is safe and rotates the secret.

**By hand**, if you prefer:

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

### 4. Open the dashboard

Visit the service URL and sign in with `DASHBOARD_PASSWORD`. `deploy.sh` prints
both. That is the whole setup — no Claude account involved.

If the dashboard loads but the numbers error out, step 2 is the cause nine times
out of ten.

### 5. Optional — also use it from Claude

claude.ai → **Settings → Connectors → Add custom connector**, with the URL:

```
https://<your-service-url>/mcp/<your-shared-secret>
```

Name it exactly **GA4 Analytics** if you want the Claude SEO dashboard to find
it. The secret sits in the path because connector dialogs accept a URL and
nothing else; a bearer token works too if your client can send headers.

Confirm by asking Claude to run `ga4_list_properties` — your property should
come back with its numeric ID.

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
| `401 Unauthorized` on `/mcp` | Shared secret in the URL does not match `MCP_SHARED_SECRET` |
| `503 Dashboard disabled` | `DASHBOARD_PASSWORD` is not set — by design, rather than serving analytics openly |
| Dashboard loads, numbers error | Almost always step 2: the service account is not a Viewer on the property |

## Why the credentials cannot live in the dashboard instead

A reasonable question is why the API key is not simply put into the artifact
page. Two independent reasons:

1. **Artifact pages cannot make network calls.** A strict content-security
   policy blocks every external request, so a `fetch()` to Google from the page
   never leaves the browser regardless of what credential it carries.
2. **GA4 does not accept API keys.** The Data API authenticates with OAuth2
   access tokens minted from a service account — there is no key string that
   would work.

And a page's source is readable by anyone who opens it, so a credential placed
there would be public. Keeping the credential on this server is what makes the
whole arrangement safe.

## Security notes

- Anyone holding the URL can read your analytics — treat it like a password, and
  rotate by redeploying with a new `MCP_SHARED_SECRET`.
- The service account should be Viewer, never Editor or Administrator.
- Never commit `.env` or a service-account key. Both are gitignored here.
