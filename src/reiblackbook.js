// Sends an approved reply back into REI BlackBook.
//
// REI BlackBook has no public "send SMS" API, but its webforms accept POSTs and can
// trigger a workflow. The workflow reads a custom field (the drafted reply) and sends
// it with a Text Reply step. See README.md ("REI BlackBook setup") for the exact
// workflow configuration.

const SEND_URL = () => process.env.REIBB_SEND_WEBFORM_URL;

export function isSendConfigured() {
  return Boolean(SEND_URL());
}

export async function sendReply({ phone, name, replyText }) {
  const url = SEND_URL();
  if (!url) {
    return { ok: false, error: "REIBB_SEND_WEBFORM_URL is not configured" };
  }

  const [firstName = "", ...rest] = String(name || "").trim().split(/\s+/);
  const body = new URLSearchParams({
    [process.env.REIBB_FIELD_PHONE || "phone"]: phone,
    [process.env.REIBB_FIELD_FIRST_NAME || "first_name"]: firstName,
    [process.env.REIBB_FIELD_LAST_NAME || "last_name"]: rest.join(" "),
    [process.env.REIBB_FIELD_REPLY || "ai_reply"]: replyText,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      return { ok: false, error: `REI BlackBook responded ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
