import express from 'express';
import { config } from './config.js';
import { normalizeReiLead, parseMondayEvent } from './mapping.js';
import { findItemByLeadId, createLeadItem, addItemUpdate, getItemForClosedDeal } from './monday.js';
import { recordClosedDeal } from './quickbooks.js';

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

/**
 * REI Blackbook → Monday.com
 * Point an REI Blackbook workflow webhook step at:
 *   POST https://<your-host>/webhooks/reiblackbook?secret=<WEBHOOK_SECRET>
 */
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
    console.log(`[rei→monday] created item ${item.id} (${item.name})`);
    res.json({ ok: true, itemId: item.id });
  } catch (err) {
    console.error('[rei→monday] failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Monday.com → QuickBooks
 * Create a Monday webhook (or board automation calling a webhook) for
 * "when Lead Stage changes" pointing at:
 *   POST https://<your-host>/webhooks/monday?secret=<WEBHOOK_SECRET>
 * When the new stage is one of MONDAY_CLOSED_STAGES, the deal is pushed to QBO.
 */
app.post('/webhooks/monday', async (req, res) => {
  // Monday webhook handshake: echo the challenge.
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

    console.log(`[monday→qbo] item ${deal.id} synced (customer ${result.customer.Id})`);
    res.json({ ok: true, customerId: result.customer.Id, salesReceiptId: result.salesReceipt?.Id || null });
  } catch (err) {
    console.error('[monday→qbo] failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(config.port, () => {
  console.log(`thb-integration-bridge listening on :${config.port}`);
  console.log(`  POST /webhooks/reiblackbook  (REI Blackbook → Monday board ${config.monday.boardId})`);
  console.log(`  POST /webhooks/monday        (Monday stage ${config.monday.closedStageLabels.join('/')} → QuickBooks)`);
});
