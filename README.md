# Twin Home Buyer — Integration Bridge

Connects the three systems Twin Home Buyer runs on:

```
REI Blackbook ──(workflow webhook)──▶ Bridge ──▶ Monday.com "Property Leads" board
Monday.com ──(Lead Stage = Acquired / Wholesale Closed)──▶ Bridge ──▶ QuickBooks Online
```

- **New leads** from REI Blackbook are created as items in the **🚨 New Lead Alert!** group
  of the **Property Leads** board (deduped by REI Blackbook contact id via the *Lead ID* column).
- **Closed deals** — when an item's *Lead Stage* changes to `Acquired` or `Wholesale Closed`,
  the bridge creates/finds the **QuickBooks customer** and books a **sales receipt** for the
  deal's *Actual Gross Revenue* (falling back to *Projected Gross Revenue*), then posts a
  confirmation update back on the Monday item.

## Endpoints

| Endpoint | Direction | Notes |
|---|---|---|
| `POST /webhooks/reiblackbook?secret=…` | REI Blackbook → Monday | Accepts JSON or form-encoded contact fields |
| `POST /webhooks/monday?secret=…` | Monday → QuickBooks | Handles Monday's `challenge` handshake automatically |
| `GET /healthz` | — | Liveness check |

## Setup

1. `npm install && cp .env.example .env` — fill in the tokens (see comments in `.env.example`).
2. `npm test` then `npm start` (deploy anywhere Node ≥18 runs: Railway, Render, Fly.io, etc.).
3. **REI Blackbook**: System Settings → Automation → Workflows → add/edit a workflow that fires
   on new lead → add a *webhook / Post to URL* step pointing at
   `https://<your-host>/webhooks/reiblackbook?secret=<WEBHOOK_SECRET>` with the contact merge
   fields (first/last name, property address/city/state/zip/county, phone, email, source, contact id).
4. **Monday.com**: create a webhook on the Property Leads board for *column value changed*
   on the **Lead Stage** column pointing at
   `https://<your-host>/webhooks/monday?secret=<WEBHOOK_SECRET>`.
5. **QuickBooks**: create an app at developer.intuit.com (Accounting scope) and put the
   client id/secret, refresh token, and realm (company) id in `.env`.

Field mapping lives in `src/mapping.js`; board/column ids in `src/config.js`
(pre-filled for the Property Leads board `18392647845`).
