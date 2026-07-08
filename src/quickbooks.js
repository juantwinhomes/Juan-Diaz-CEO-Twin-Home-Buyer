import { config, assertConfigured } from './config.js';

const QBO_BASE = () =>
  config.quickbooks.environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';

let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

async function getAccessToken() {
  assertConfigured(['quickbooks.clientId', 'quickbooks.clientSecret', 'quickbooks.refreshToken']);
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry - 60_000) return cachedAccessToken;

  const basic = Buffer.from(`${config.quickbooks.clientId}:${config.quickbooks.clientSecret}`).toString('base64');
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.quickbooks.refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`QBO token refresh failed (${res.status}): ${await res.text()}`);
  const tok = await res.json();
  cachedAccessToken = tok.access_token;
  cachedAccessTokenExpiry = Date.now() + tok.expires_in * 1000;
  return cachedAccessToken;
}

async function qbo(path, { method = 'GET', body } = {}) {
  assertConfigured(['quickbooks.realmId']);
  const token = await getAccessToken();
  const url = `${QBO_BASE()}/v3/company/${config.quickbooks.realmId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QBO API error (${res.status}) on ${path}: ${JSON.stringify(data)}`);
  return data;
}

function escapeQboQueryValue(value) {
  return String(value).replace(/'/g, "\\'");
}

/** Find a customer by display name, or create one. */
export async function findOrCreateCustomer({ displayName, notes }) {
  const q = `select * from Customer where DisplayName = '${escapeQboQueryValue(displayName)}'`;
  const found = await qbo(`/query?query=${encodeURIComponent(q)}`);
  const existing = found.QueryResponse?.Customer?.[0];
  if (existing) return existing;

  const created = await qbo('/customer', {
    method: 'POST',
    body: { DisplayName: displayName, Notes: notes || undefined },
  });
  return created.Customer;
}

/** Find the service item used on deal lines, or create it as a Service item. */
async function findOrCreateServiceItem() {
  const name = config.quickbooks.serviceItemName;
  const q = `select * from Item where Name = '${escapeQboQueryValue(name)}'`;
  const found = await qbo(`/query?query=${encodeURIComponent(q)}`);
  const existing = found.QueryResponse?.Item?.[0];
  if (existing) return existing;

  // Need an income account to create a service item.
  const accQ = `select * from Account where AccountType = 'Income' maxresults 1`;
  const accounts = await qbo(`/query?query=${encodeURIComponent(accQ)}`);
  const income = accounts.QueryResponse?.Account?.[0];
  if (!income) throw new Error('No Income account found in QuickBooks to attach the service item to.');

  const created = await qbo('/item', {
    method: 'POST',
    body: {
      Name: name,
      Type: 'Service',
      IncomeAccountRef: { value: income.Id },
    },
  });
  return created.Item;
}

/**
 * Record a closed deal: ensure customer exists, then create a sales receipt
 * for the deal's gross revenue with the property address on the line.
 */
export async function recordClosedDeal(deal) {
  const amount = deal.actualGrossRevenue || deal.projectedGrossRevenue;
  const customer = await findOrCreateCustomer({
    displayName: deal.leadName || deal.propertyAddress,
    notes: `REI Blackbook lead ${deal.leadId || '(unknown id)'} — ${deal.propertyAddress}`,
  });

  if (!amount) {
    return { customer, salesReceipt: null, reason: 'No revenue amount on the Monday item; created/verified customer only.' };
  }

  const item = await findOrCreateServiceItem();
  const receipt = await qbo('/salesreceipt', {
    method: 'POST',
    body: {
      CustomerRef: { value: customer.Id },
      PrivateNote: `Auto-created from Monday.com item ${deal.id} (stage: ${deal.leadStage})`,
      Line: [
        {
          Amount: amount,
          DetailType: 'SalesItemLineDetail',
          Description: `Deal closed — ${deal.propertyAddress}`,
          SalesItemLineDetail: { ItemRef: { value: item.Id }, Qty: 1, UnitPrice: amount },
        },
      ],
    },
  });
  return { customer, salesReceipt: receipt.SalesReceipt };
}
