// On-demand data refresh: pulls direct-mail KPIs from QuickBooks + Monday.com
// using the credentials saved in Settings, and returns a data object the
// dashboard renders. REI Blackbook has no public API (browser automation only),
// so its figures are refreshed via the separate scripts and noted as such.

async function qboToken(cfg) {
  const basic = Buffer.from(`${cfg.qboClientId}:${cfg.qboClientSecret}`).toString('base64');
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.qboRefreshToken }),
  });
  if (!res.ok) throw new Error(`QuickBooks token refresh failed (${res.status})`);
  return (await res.json()).access_token;
}

async function qboDirectMailSpend(cfg) {
  const base = cfg.qboEnvironment === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
  const token = await qboToken(cfg);
  const url = `${base}/v3/company/${cfg.qboRealmId}/reports/ProfitAndLoss?start_date=${cfg.periodStart}&end_date=${cfg.periodEnd}&minorversion=73`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`QuickBooks P&L failed (${res.status})`);
  const data = await res.json();
  // Walk the report rows to find the "AM- Direct Mail" account total.
  let total = 0;
  const walk = (rows) => {
    for (const r of rows?.Row || []) {
      const name = r.ColData?.[0]?.value || r.Header?.ColData?.[0]?.value || '';
      if (/direct mail/i.test(name)) {
        const amt = r.ColData?.[r.ColData.length - 1]?.value || r.Summary?.ColData?.[r.Summary.ColData.length - 1]?.value;
        const n = parseFloat(String(amt).replace(/[^0-9.-]/g, ''));
        if (!isNaN(n) && n > total) total = n;
      }
      if (r.Rows) walk(r.Rows);
    }
  };
  walk(data.Rows);
  return total;
}

async function mondayRedstone(cfg) {
  const q = `query ($b: ID!){ boards(ids:[$b]){ items_page(limit:100){ items{ column_values{ id text } } } } }`;
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: cfg.mondayToken, 'API-Version': '2024-10' },
    body: JSON.stringify({ query: q, variables: { b: cfg.redstoneBoardId } }),
  });
  const body = await res.json();
  if (body.errors) throw new Error('monday.com: ' + JSON.stringify(body.errors));
  const items = body.data?.boards?.[0]?.items_page?.items || [];
  let pieces = 0, cost = 0;
  for (const it of items) {
    for (const cv of it.column_values || []) {
      if (cv.id === cfg.redstoneQtyCol) pieces += parseFloat((cv.text || '0').replace(/[^0-9.]/g, '')) || 0;
      if (cv.id === cfg.redstoneCostCol) cost += parseFloat((cv.text || '0').replace(/[^0-9.]/g, '')) || 0;
    }
  }
  return { batches: items.length, pieces, cost };
}

async function refreshAll(cfg) {
  const out = { generatedAt: new Date().toISOString(), errors: {} };
  try { out.directMailSpend = await qboDirectMailSpend(cfg); } catch (e) { out.errors.quickbooks = e.message; }
  try { out.redstone = await mondayRedstone(cfg); } catch (e) { out.errors.monday = e.message; }
  out.note = 'REI Blackbook lead figures require browser automation (no public API) and are refreshed separately.';
  return out;
}

module.exports = { refreshAll };
