// ============================================================================
// webhookSender.js  (Phase 7 — live REI BlackBook / Zapier push)
// ----------------------------------------------------------------------------
// Sends the flat webhook_payload (from crmService.js) to your REI BlackBook /
// Zapier incoming webhook. Built DRY-RUN FIRST for safety:
//
//   - No webhook URL configured        -> dry run (prints what WOULD send)
//   - URL set but SEND_LIVE !== 'true'  -> dry run
//   - URL set AND live === true         -> real HTTP POST
//
// So it is impossible to hit your live CRM by accident: you must set BOTH
// REI_BLACKBOOK_WEBHOOK_URL and SEND_LIVE=true (or pass { live: true }).
//
// Uses Node's built-in global fetch (Node 18+), so no dependencies.
// ============================================================================

/**
 * @param {object} webhookPayload - flat, all-string object from crmService
 * @param {object} [opts]
 * @param {string} [opts.url]  - override REI_BLACKBOOK_WEBHOOK_URL
 * @param {boolean} [opts.live] - override SEND_LIVE; when false, dry run
 * @returns {Promise<object>} result describing what happened
 */
export async function sendToReiBlackBook(webhookPayload, opts = {}) {
  const url = opts.url || process.env.REI_BLACKBOOK_WEBHOOK_URL || '';
  const live = opts.live ?? process.env.SEND_LIVE === 'true';

  if (!url) {
    return { sent: false, dryRun: true, reason: 'no-webhook-url', wouldSend: webhookPayload };
  }
  if (!live) {
    return { sent: false, dryRun: true, reason: 'dry-run (SEND_LIVE not true)', url, wouldSend: webhookPayload };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });
    return { sent: true, dryRun: false, url, status: res.status, ok: res.ok };
  } catch (err) {
    return { sent: false, dryRun: false, url, error: String(err.message || err) };
  }
}
