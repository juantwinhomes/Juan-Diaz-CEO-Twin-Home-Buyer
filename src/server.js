import express from "express";
import crypto from "node:crypto";
import { draftReply } from "./drafter.js";
import { sendReply, isSendConfigured } from "./reiblackbook.js";
import { notifyPendingDraft } from "./notify.js";
import {
  recordMessage,
  getConversation,
  createDraft,
  getDraft,
  listPendingDrafts,
  updateDraft,
  setOptedOut,
  isOptedOut,
  normalizePhone,
} from "./store.js";
import { renderDashboard } from "./dashboard.js";
import { extractInboundFromEmail } from "./extractor.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const REPLY_MODE = () => (process.env.REPLY_MODE || "approve").toLowerCase(); // approve | auto
const OPT_OUT_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;

function inQuietHours() {
  const tz = process.env.QUIET_HOURS_TZ || "America/Chicago";
  const start = Number(process.env.QUIET_HOURS_START ?? 21); // 9pm
  const end = Number(process.env.QUIET_HOURS_END ?? 8); // 8am
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())
  );
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

function requireToken(req, res, next) {
  const expected = process.env.DASHBOARD_TOKEN;
  if (!expected) {
    return res.status(500).send("DASHBOARD_TOKEN is not set — refusing to serve the dashboard without it.");
  }
  const provided = req.query.token || req.body?.token || "";
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).send("Invalid or missing token.");
  }
  next();
}

// Extracts the fields we need from an REI BlackBook webhook payload. Field names are
// configurable because webhook field mapping in REI BlackBook is user-chosen.
function parseInbound(body) {
  const pick = (...keys) => {
    for (const k of keys) {
      const v = body[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  const phone = pick(process.env.WEBHOOK_FIELD_PHONE || "phone", "from_number", "contact_phone", "Phone");
  const message = pick(process.env.WEBHOOK_FIELD_MESSAGE || "message", "body", "text", "Message");
  const first = pick(process.env.WEBHOOK_FIELD_FIRST_NAME || "first_name", "FirstName");
  const last = pick(process.env.WEBHOOK_FIELD_LAST_NAME || "last_name", "LastName");
  const name = [first, last].filter(Boolean).join(" ") || pick("name", "contact_name");
  return { phone: normalizePhone(phone), message, name };
}

async function deliver(draft) {
  const result = await sendReply({ phone: draft.phone, name: draft.name, replyText: draft.replyText });
  if (result.ok) {
    recordMessage(draft.phone, { direction: "out", text: draft.replyText, name: draft.name });
    updateDraft(draft.id, { status: "sent", sentAt: new Date().toISOString() });
  } else {
    updateDraft(draft.id, { status: "pending", sendError: result.error });
  }
  return result;
}

// Shared pipeline: record → guardrails → draft → send or queue for approval.
async function processInbound({ phone, message, name }) {
  recordMessage(phone, { direction: "in", text: message, name });

  if (OPT_OUT_RE.test(message)) {
    setOptedOut(phone);
    return; // carrier/REI BlackBook handles the STOP confirmation; never draft a reply
  }
  if (isOptedOut(phone)) return;

  const history = getConversation(phone);
  const drafted = await draftReply({ name, phone, message, history });

  const draft = createDraft({
    phone,
    name,
    inboundText: message,
    replyText: drafted.text,
    fallback: drafted.fallback,
    fallbackReason: drafted.reason,
  });

  const autoSendOk =
    REPLY_MODE() === "auto" && isSendConfigured() && !drafted.fallback && !inQuietHours();

  if (autoSendOk) {
    await deliver(draft);
  } else {
    await notifyPendingDraft(draft);
  }
}

function checkSecret(req, res) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.query.secret !== secret) {
    res.status(403).json({ error: "bad secret" });
    return false;
  }
  return true;
}

// ── Webhook: structured payload (REI BlackBook workflow webhook or Zapier POST) ─────
app.post("/webhook/inbound-text", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { phone, message, name } = parseInbound(req.body || {});
  if (!phone || !message) {
    return res.status(400).json({ error: "could not find phone/message in payload", received: Object.keys(req.body || {}) });
  }

  // Respond immediately; drafting happens after.
  res.json({ ok: true });
  await processInbound({ phone, message, name });
});

// ── Webhook: raw notification email (Gmail → Zapier → here) ─────────────────────────
// REI BlackBook has no native inbound-text trigger, but it can email you on every
// incoming text. Forward that email's subject/body here and the lead's phone, name,
// and message are extracted automatically.
app.post("/webhook/inbound-email", async (req, res) => {
  if (!checkSecret(req, res)) return;

  const subject = String(req.body?.subject || "");
  const body = String(req.body?.body || req.body?.body_plain || req.body?.text || "");
  if (!subject && !body) {
    return res.status(400).json({ error: "expected 'subject' and/or 'body' fields" });
  }

  const { phone, name, message, extractor } = await extractInboundFromEmail({ subject, body });
  if (!phone || !message) {
    return res.status(422).json({
      error: "could not extract a phone number and message from the email",
      extractor,
      extracted: { phone, name, message },
    });
  }

  res.json({ ok: true, extracted: { phone, name, message }, extractor });
  await processInbound({ phone: normalizePhone(phone), message, name });
});

// ── Approval dashboard ──────────────────────────────────────────────────────────────
app.get("/dashboard", requireToken, (req, res) => {
  res.send(renderDashboard(listPendingDrafts(), { sendConfigured: isSendConfigured() }));
});

app.post("/drafts/:id/approve", requireToken, async (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft || draft.status !== "pending") return res.status(404).send("Draft not found or already handled.");
  if (typeof req.body.replyText === "string" && req.body.replyText.trim()) {
    updateDraft(draft.id, { replyText: req.body.replyText.trim(), edited: true });
  }
  await deliver(getDraft(draft.id));
  res.redirect(`/dashboard?token=${encodeURIComponent(req.query.token || req.body.token || "")}`);
});

app.post("/drafts/:id/dismiss", requireToken, (req, res) => {
  const draft = getDraft(req.params.id);
  if (draft && draft.status === "pending") updateDraft(draft.id, { status: "dismissed" });
  res.redirect(`/dashboard?token=${encodeURIComponent(req.query.token || req.body.token || "")}`);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mode: REPLY_MODE(),
    sendConfigured: isSendConfigured(),
    claudeConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    pendingDrafts: listPendingDrafts().length,
  });
});

const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`REI BlackBook inbox automation listening on :${port}`);
    console.log(`Mode: ${REPLY_MODE()} | send configured: ${isSendConfigured()} | Claude: ${Boolean(process.env.ANTHROPIC_API_KEY)}`);
  });
}

export default app;
