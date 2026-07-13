// Optional notification when a draft is waiting for approval.
// Point NOTIFY_WEBHOOK_URL at anything that accepts a JSON POST — a Zapier/Make hook
// that texts or emails you, a Slack incoming webhook, etc.

export async function notifyPendingDraft(draft) {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;

  const base = process.env.PUBLIC_BASE_URL || "";
  const token = process.env.DASHBOARD_TOKEN || "";
  const dashboardLink = base ? `${base}/dashboard?token=${token}` : "(set PUBLIC_BASE_URL for a link)";

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text:
          `New lead text from ${draft.name || draft.phone}: "${draft.inboundText}"\n` +
          `Suggested reply: "${draft.replyText}"\n` +
          `Approve: ${dashboardLink}`,
        draft,
      }),
    });
  } catch {
    // Notification failures must never block the pipeline; the draft is still on the dashboard.
  }
}
