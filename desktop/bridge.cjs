// Self-contained integration bridge (CommonJS) for the desktop app.
// Mirrors src/app.js but runs in-process inside Electron with global fetch.
const express = require('express');

function makeMonday(cfg) {
  const gql = async (query, variables = {}) => {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: cfg.mondayToken, 'API-Version': '2024-10' },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json();
    if (!res.ok || body.errors) throw new Error('monday.com API error: ' + JSON.stringify(body.errors || body));
    return body.data;
  };
  const C = cfg.mondayColumns;
  return {
    async findItemByLeadId(leadId) {
      if (!leadId) return null;
      const d = await gql(
        `query ($b: ID!, $c: String!, $v: String!){ items_page_by_column_values(board_id:$b, columns:[{column_id:$c, column_values:[$v]}], limit:1){ items{ id name } } }`,
        { b: cfg.mondayBoardId, c: C.leadId, v: String(leadId) }
      );
      return d.items_page_by_column_values?.items?.[0] || null;
    },
    async createLeadItem(lead) {
      const cv = {};
      if (lead.leadName) cv[C.leadName] = lead.leadName;
      if (lead.leadId) cv[C.leadId] = String(lead.leadId);
      cv[C.contactStatus] = { label: 'New' };
      if (lead.county) cv[C.county] = { labels: [lead.county] };
      cv[C.dateReceived] = { date: lead.receivedDate || new Date().toISOString().slice(0, 10) };
      if (lead.notes) cv[C.notes] = { text: lead.notes };
      if (lead.address) cv[C.location] = { address: lead.address };
      const d = await gql(
        `mutation ($b: ID!, $g: String!, $n: String!, $cv: JSON!){ create_item(board_id:$b, group_id:$g, item_name:$n, column_values:$cv, create_labels_if_missing:true){ id name } }`,
        { b: cfg.mondayBoardId, g: cfg.mondayNewLeadGroupId, n: lead.itemName, cv: JSON.stringify(cv) }
      );
      return d.create_item;
    },
    async addItemUpdate(itemId, body) {
      await gql(`mutation ($i: ID!, $b: String!){ create_update(item_id:$i, body:$b){ id } }`, { i: itemId, b: body });
    },
  };
}

function normalizeReiLead(p = {}) {
  const pick = (keys) => { for (const k of keys) { const v = p[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
  const first = pick(['first_name', 'firstname', 'FirstName']);
  const last = pick(['last_name', 'lastname', 'LastName']);
  const full = pick(['full_name', 'name', 'contact_name']) || [first, last].filter(Boolean).join(' ');
  const street = pick(['property_address', 'address', 'street_address', 'PropertyAddress']);
  const city = pick(['property_city', 'city']); const state = pick(['property_state', 'state']); const zip = pick(['property_zip', 'zip']);
  const county = pick(['property_county', 'county']);
  const address = [street, city, state, zip].filter(Boolean).join(', ');
  const notes = [];
  const phone = pick(['phone', 'phone_number', 'mobile']); if (phone) notes.push('Phone: ' + phone);
  const email = pick(['email', 'Email']); if (email) notes.push('Email: ' + email);
  const source = pick(['source', 'lead_source', 'campaign']); if (source) notes.push('Source: ' + source);
  return { itemName: street || address || full || 'New REI Blackbook lead', leadName: full, leadId: pick(['contact_id', 'lead_id', 'id']), county, address, notes: notes.join('\n') };
}

function parseMondayEvent(body = {}) {
  const e = body.event || {};
  const labels = [];
  const chosen = e.value?.chosenValues; if (Array.isArray(chosen)) for (const c of chosen) if (c?.name) labels.push(c.name);
  const st = e.value?.label?.text; if (st) labels.push(st);
  return { type: e.type || '', itemId: e.pulseId || e.itemId || null, labels };
}

function createBridge(getCfg, log = () => {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  const synced = new Set();
  const secretOk = (req, res) => {
    const cfg = getCfg();
    if (!cfg.webhookSecret) return true;
    if (req.query.secret === cfg.webhookSecret) return true;
    res.status(401).json({ ok: false, error: 'invalid or missing secret' }); return false;
  };

  app.get('/healthz', (_q, r) => r.json({ ok: true, service: 'thb-directmail-bridge' }));

  app.post('/webhooks/reiblackbook', async (req, res) => {
    if (!secretOk(req, res)) return;
    try {
      const cfg = getCfg(); const monday = makeMonday(cfg);
      const lead = normalizeReiLead(req.body);
      if (lead.leadId) {
        const existing = await monday.findItemByLeadId(lead.leadId);
        if (existing) { await monday.addItemUpdate(existing.id, `Duplicate REI Blackbook webhook ignored (lead ${lead.leadId}).`); return res.json({ ok: true, deduped: true, itemId: existing.id }); }
      }
      const item = await monday.createLeadItem(lead);
      log(`[rei→monday] created item ${item.id} (${item.name})`);
      res.json({ ok: true, itemId: item.id });
    } catch (err) { log('[rei→monday] failed: ' + err.message); res.status(500).json({ ok: false, error: err.message }); }
  });

  app.post('/webhooks/monday', async (req, res) => {
    if (req.body?.challenge) return res.json({ challenge: req.body.challenge });
    if (!secretOk(req, res)) return;
    try {
      const cfg = getCfg();
      const ev = parseMondayEvent(req.body);
      const closed = ev.labels.some((l) => (cfg.closedStages || []).includes(l));
      if (!ev.itemId || !closed) return res.json({ ok: true, skipped: true, reason: 'not a closed-stage change' });
      if (synced.has(String(ev.itemId))) return res.json({ ok: true, skipped: true, reason: 'already synced' });
      // Deal booking into QuickBooks requires a QBO developer app; logged for now.
      synced.add(String(ev.itemId));
      log(`[monday→qbo] closed-stage event on item ${ev.itemId} (QuickBooks booking requires QBO app credentials)`);
      res.json({ ok: true, itemId: ev.itemId, note: 'QuickBooks booking pending QBO app credentials' });
    } catch (err) { log('[monday→qbo] failed: ' + err.message); res.status(500).json({ ok: false, error: err.message }); }
  });

  return app;
}

module.exports = { createBridge };
