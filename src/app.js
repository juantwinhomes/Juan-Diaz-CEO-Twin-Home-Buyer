import express from 'express';
import { config } from './config.js';
import { normalizeReiLead, parseMondayEvent } from './mapping.js';
import { findItemByLeadId, createLeadItem, addItemUpdate, getItemForClosedDeal } from './monday.js';
import { recordClosedDeal } from './quickbooks.js';

/**
 * Build the integration-bridge Express app. Importable so both the standalone
 * server (src/server.js) and the desktop app (desktop/main.js) can run it.
 * onLog is an optional callback (line: string) for surfacing logs in a UI.
 */
export function createApp({ onLog = () => {} } = {}) {
  const log = (line) => {
    console.log(line);
    try { onLog(line); } catch {}
  };

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Track items already synced to QuickBooks in this process (Monday retries webhooks).
  const syncedToQbo = new Set();

  function checkSecret(req, res) {
    if (!config.webhookSecret) return true; // no secret configured — allow (set one in production!)
    if (req.query.secret === config.webhookSecret) return true;
    res.status(401).json({ ok: false, error: 'invalid or missing secret' });
    return false;
  }

  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'thb-integration-bridge' }));

  // REI Blackbook → Monday.com
  app.post('/webhooks/reiblackbook', async (req, res) => {
    if (!checkSecret(req, res)) return;
    try {
      const lead = normalizeReiLead(req.body);
      if (lead.leadId) {
        const existing = await findItemByLeadId(lead.leadId);
        if (existing) {
          await addItemUpdate(existing.id, `Duplicate webhook from REI Blackbook ignored (lead ${lead.leadId}).`);
          return res.json({ ok: true, deduped: true, itemId: existing.id });
        }
      }
      const item = await createLeadItem(lead);
      log(`[rei→monday] created item ${item.id} (${item.name})`);
      res.json({ ok: true, itemId: item.id });
    } catch (err) {
      log(`[rei→monday] failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Monday.com → QuickBooks
  app.post('/webhooks/monday', async (req, res) => {
    if (req.body?.challenge) return res.json({ challenge: req.body.challenge });
    if (!checkSecret(req, res)) return;
    try {
      const event = parseMondayEvent(req.body);
      const closed = event.labels.some((l) => config.monday.closedStageLabels.includes(l));
      if (!event.itemId || !closed) {
        return res.json({ ok: true, skipped: true, reason: 'not a closed-stage change' });
      }
      if (syncedToQbo.has(String(event.itemId))) {
        return res.json({ ok: true, skipped: true, reason: 'already synced this item' });
      }
      const deal = await getItemForClosedDeal(event.itemId);
      if (!deal) return res.status(404).json({ ok: false, error: `Monday item ${event.itemId} not found` });

      const result = await recordClosedDeal(deal);
      syncedToQbo.add(String(event.itemId));
      const receiptMsg = result.salesReceipt
        ? `Sales receipt #${result.salesReceipt.DocNumber} created for $${result.salesReceipt.TotalAmt}.`
        : result.reason;
      await addItemUpdate(
        deal.id,
        `✅ Synced to QuickBooks: customer "${result.customer.DisplayName}" (id ${result.customer.Id}). ${receiptMsg}`
      );
      log(`[monday→qbo] item ${deal.id} synced (customer ${result.customer.Id})`);
      res.json({ ok: true, customerId: result.customer.Id, salesReceiptId: result.salesReceipt?.Id || null });
    } catch (err) {
      log(`[monday→qbo] failed: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return app;
}
