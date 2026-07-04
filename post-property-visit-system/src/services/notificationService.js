// ============================================================================
// notificationService.js
// ----------------------------------------------------------------------------
// The "pit crew alarm bell." Reads a completed debrief, decides which
// documentation gaps need a human RIGHT NOW, and produces alert objects +
// a ready-to-send email. It never sends anything by itself.
//
// Escalation (by severity):
//   HIGH   -> missing photos/video on a viable deal, or no voice memo.
//             Photo/video gaps route to JUAN (he may still be near the house).
//   MEDIUM -> classification / next action / follow-up / pass-reason gaps.
//             Route to the Acquisition Ops Coordinator.
//
// PHASE 5: build alerts + write them to a local log (no keys).
// PHASE 5b/7: pass toEmail() to a Gmail/Slack adapter to actually deliver.
// ============================================================================

// Recipients. Real addresses come from env; otherwise clearly-marked placeholders.
export function getRecipients() {
  return {
    juan: process.env.JUAN_ALERT_EMAIL || 'juan@twinhomebuyer.com',
    coordinator: process.env.OPS_ALERT_EMAIL || 'coordinator@twinhomebuyer.com (PLACEHOLDER)',
    cherry: process.env.CHERRY_ALERT_EMAIL || 'cherry@twinhomebuyer.com (PLACEHOLDER)',
  };
}

/**
 * Inspect a debrief and return the alerts that need human action.
 * @param {object} d - completed debrief
 * @param {object} [recipients] - override getRecipients()
 * @returns {Array<{severity,code,role,to,message,fix}>}
 */
export function buildNotifications(d, recipients = getRecipients()) {
  const alerts = [];
  const add = (severity, code, role, message, fix) =>
    alerts.push({ severity, code, role, to: recipients[role], message, fix });

  // --- HIGH: Juan's judgment or the visual package is missing ---------------
  if (d.voice_memo_received !== 'Yes') {
    add(
      'high',
      'NO_VOICE_MEMO',
      'coordinator',
      `No voice memo captured for ${d.property_address || 'this property'}.`,
      "Ask Juan for a 60-second update today while the visit is fresh.",
    );
  }
  if (d.photos_required === 'Yes' && d.photos_uploaded !== 'Yes') {
    add(
      'high',
      'NO_PHOTOS_VIABLE',
      'juan',
      `Viable deal at ${d.property_address || 'this property'} has NO photos uploaded.`,
      'Grab photos now — contact Juan while he may still be near the property.',
    );
  }
  if (d.video_required === 'Yes' && d.video_uploaded !== 'Yes') {
    add(
      'high',
      'NO_VIDEO_VIABLE',
      'juan',
      `Viable deal at ${d.property_address || 'this property'} has NO walkthrough video.`,
      'Capture a 30-60s walkthrough while Juan is still on site if possible.',
    );
  }

  // --- MEDIUM: automation can't route without these --------------------------
  if (!d.seller_classification) {
    add(
      'medium',
      'NO_CLASSIFICATION',
      'coordinator',
      `Seller not classified for ${d.property_address || 'this property'}.`,
      'Classify the seller before end of day so follow-up automation can run.',
    );
  }
  if (!d.next_best_action || d.next_best_action === 'Unknown') {
    add(
      'medium',
      'NO_NEXT_ACTION',
      'coordinator',
      `No next action set for ${d.property_address || 'this property'}.`,
      'A default follow-up was auto-created; confirm or replace it.',
    );
  }
  if (d.deal_status === 'Passing' && !d.pass_reason) {
    add(
      'medium',
      'PASS_REASON_MISSING',
      'coordinator',
      `Pass with no reason recorded for ${d.property_address || 'this property'}.`,
      'Record the pass reason before closing so the team knows why later.',
    );
  }
  if (d.deal_status !== 'Passing' && !d.follow_up_date) {
    add(
      'medium',
      'NO_FOLLOW_UP_DATE',
      'coordinator',
      `No follow-up date set for ${d.property_address || 'this property'}.`,
      'Set a follow-up date so the lead does not die in the CRM.',
    );
  }

  return alerts;
}

// Highest severity present (for subject-line urgency / routing).
export function topSeverity(alerts) {
  return alerts.some((a) => a.severity === 'high') ? 'high' : alerts.length ? 'medium' : 'none';
}

/**
 * Build a single email summarizing the alerts. Does NOT send.
 * @returns {{to:string[], subject:string, body:string} | null} null if no alerts
 */
export function toEmail(d, alerts) {
  if (!alerts.length) return null;
  const to = [...new Set(alerts.map((a) => a.to))];
  const urgent = topSeverity(alerts) === 'high';
  const subject = `${urgent ? '[ACTION NEEDED] ' : '[Follow-up] '}Post-visit docs incomplete — ${d.property_address || 'property'}`;

  const lines = [
    `Post-visit documentation needs attention for ${d.property_address || 'a property'}` +
      (d.seller_name ? ` (${d.seller_name}).` : '.'),
    '',
    'Items:',
    ...alerts.map((a) => `  • [${a.severity.toUpperCase()}] ${a.message}\n      Fix: ${a.fix}  (→ ${a.role})`),
    '',
    '--- Debrief snapshot ---',
    d.crm_ready_summary || '',
  ];
  return { to, subject, body: lines.join('\n') };
}
