// Notifies you when a draft is waiting for approval.
//
// Point NOTIFY_WEBHOOK_URL at a Google Chat space webhook (Space → Apps & integrations
// → Webhooks) and you'll get a formatted Chat message per inbound text. Any other URL
// receives a generic JSON POST ({ text, draft }) — works with Slack/Zapier/Make too.

function isGoogleChat(url) {
  try {
    return new URL(url).hostname === "chat.googleapis.com";
  } catch {
    return false;
  }
}

export async function notifyPendingDraft(draft) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;

  const base = process.env.PUBLIC_BASE_URL || "";
  const token = process.env.DASHBOARD_TOKEN || "";
  const dashboardLink = base
    ? `${base.replace(/\/$/, "")}/dashboard?token=${encodeURIComponent(token)}`
    : "";

  const who = draft.name || draft.phone;
  const payload = isGoogleChat(url)
    ? {
        // Google Chat message format: https://developers.google.com/chat/api/guides/message-formats
        text:
          `📱 *New lead text from ${who}* (${draft.phone})\n` +
          `> ${draft.inboundText}\n\n` +
          `✍️ *Suggested reply:*\n${draft.replyText}\n\n` +
          (dashboardLink
            ? `<${dashboardLink}|Review & send>`
            : "_Set PUBLIC_BASE_URL to get a review link here._"),
      }
    : {
        text:
          `New lead text from ${who}: "${draft.inboundText}"\n` +
          `Suggested reply: "${draft.replyText}"\n` +
          (dashboardLink ? `Approve: ${dashboardLink}` : ""),
        draft,
      };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Notification failures must never block the pipeline; the draft is still on the dashboard.
  }
}
