// Renders the one-page approval dashboard. Server-rendered HTML, zero client deps —
// it just needs to work fast from a phone.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderDashboard(drafts, { sendConfigured }) {
  const cards = drafts
    .map(
      (d) => `
    <div class="card">
      <div class="meta">
        <strong>${esc(d.name || "Unknown")}</strong> &middot; ${esc(d.phone)}
        <span class="time">${esc(new Date(d.createdAt).toLocaleString())}</span>
      </div>
      <div class="inbound">&ldquo;${esc(d.inboundText)}&rdquo;</div>
      ${d.fallback ? `<div class="warn">Claude unavailable (${esc(d.fallbackReason || "unknown")}) — this is the fallback reply. Edit before sending.</div>` : ""}
      ${d.sendError ? `<div class="warn">Last send failed: ${esc(d.sendError)}</div>` : ""}
      <form method="POST" action="/drafts/${esc(d.id)}/approve">
        <input type="hidden" name="token" value="">
        <textarea name="replyText" rows="3">${esc(d.replyText)}</textarea>
        <div class="actions">
          <button type="submit" class="approve" ${sendConfigured ? "" : "disabled title='Set REIBB_SEND_WEBFORM_URL first'"}>Send reply</button>
          <button type="submit" formaction="/drafts/${esc(d.id)}/dismiss" class="dismiss">Dismiss</button>
        </div>
      </form>
    </div>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Text Inbox — Pending Replies</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 1.2rem; }
  .card { border: 1px solid #8884; border-radius: 10px; padding: 14px; margin: 12px 0; }
  .meta { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .time { margin-left: auto; font-size: .8rem; opacity: .7; }
  .inbound { margin: 10px 0; padding: 10px; background: #8881; border-radius: 8px; }
  .warn { color: #b45309; font-size: .85rem; margin: 6px 0; }
  textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid #8886; }
  .actions { display: flex; gap: 8px; margin-top: 8px; }
  button { font: inherit; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; }
  .approve { background: #16a34a; color: white; }
  .approve[disabled] { background: #8888; cursor: not-allowed; }
  .dismiss { background: #8883; }
  .empty { opacity: .7; margin-top: 40px; text-align: center; }
</style>
</head>
<body>
<h1>Pending replies (${drafts.length})</h1>
${cards || `<p class="empty">Inbox clear — no drafts waiting. 🎉</p>`}
<script>
  // Carry the token from the URL into every form so approve/dismiss stay authorized.
  const token = new URLSearchParams(location.search).get("token") || "";
  document.querySelectorAll('input[name="token"]').forEach((el) => (el.value = token));
</script>
</body>
</html>`;
}
