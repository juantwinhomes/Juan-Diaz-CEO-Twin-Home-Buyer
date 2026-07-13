import { test, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Isolate test data and force test mode before the app loads.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reibb-test-"));
process.env.NODE_ENV = "test";
process.env.DATA_DIR = tmpDir;
process.env.DASHBOARD_TOKEN = "test-token";
delete process.env.ANTHROPIC_API_KEY; // force fallback drafting — no network in tests
delete process.env.REIBB_SEND_WEBFORM_URL;
delete process.env.NOTIFY_WEBHOOK_URL;

const { default: app } = await import("../src/server.js");
const { FALLBACK_REPLY } = await import("../src/drafter.js");

let server, base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("health endpoint reports status", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "approve");
});

test("inbound webhook creates a pending draft (fallback reply without API key)", async () => {
  const res = await fetch(`${base}/webhook/inbound-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "(707) 596-1590", message: "Are you going to beat 719", first_name: "Tony", last_name: "Burke" }),
  });
  assert.equal(res.status, 200);
  await sleep(100); // drafting happens after the webhook response

  const page = await fetch(`${base}/dashboard?token=test-token`).then((r) => r.text());
  assert.match(page, /Tony Burke/);
  assert.match(page, /Are you going to beat 719/);
  assert.ok(page.includes(FALLBACK_REPLY));
});

test("rejects payloads without phone/message", async () => {
  const res = await fetch(`${base}/webhook/inbound-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ foo: "bar" }),
  });
  assert.equal(res.status, 400);
});

test("STOP opts the contact out and no draft is created", async () => {
  await fetch(`${base}/webhook/inbound-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "4154819715", message: "STOP", first_name: "Ellen", last_name: "Ware" }),
  });
  await sleep(100);
  // A later text from the same number is also ignored.
  await fetch(`${base}/webhook/inbound-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "4154819715", message: "hello again" }),
  });
  await sleep(100);

  const page = await fetch(`${base}/dashboard?token=test-token`).then((r) => r.text());
  assert.ok(!page.includes("Ellen"));
  assert.ok(!page.includes("hello again"));
});

test("dashboard requires the token", async () => {
  assert.equal((await fetch(`${base}/dashboard`)).status, 403);
  assert.equal((await fetch(`${base}/dashboard?token=wrong`)).status, 403);
});

test("inbound-email webhook extracts phone/message and creates a draft", async () => {
  const res = await fetch(`${base}/webhook/inbound-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: "New Text Message from Giorgi, Steve",
      body:
        "You have received a new text message.\n\n" +
        "From: Giorgi, Steve\n" +
        "Phone: (650) 333-8189\n" +
        'Message: "For $80,000-$100,000 it would sell for $4,200,000"\n',
    }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.extracted.phone, "6503338189");
  assert.match(json.extracted.message, /it would sell/);
  await sleep(100);

  const page = await fetch(`${base}/dashboard?token=test-token`).then((r) => r.text());
  assert.match(page, /6503338189/);
  assert.match(page, /it would sell/);
});

test("inbound-email webhook returns 422 when nothing extractable", async () => {
  const res = await fetch(`${base}/webhook/inbound-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "Weekly newsletter", body: "No lead data here." }),
  });
  assert.equal(res.status, 422);
});

test("Google Chat webhook receives a formatted notification", async () => {
  const { notifyPendingDraft } = await import("../src/notify.js");

  // notify.js only talks to chat.googleapis.com for the Chat format, so stub fetch
  // instead of standing up a server.
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return new Response("{}", { status: 200 });
  };
  process.env.NOTIFY_WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t";
  process.env.PUBLIC_BASE_URL = "https://example.com";

  try {
    await notifyPendingDraft({
      name: "Tony Burke",
      phone: "7075961590",
      inboundText: "Are you going to beat 719",
      replyText: "I may be able to — quick call today?",
    });
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.NOTIFY_WEBHOOK_URL;
    delete process.env.PUBLIC_BASE_URL;
  }

  assert.equal(calls.length, 1);
  const { body } = calls[0];
  // Google Chat accepts a Message resource: only `text`, no extra fields.
  assert.deepEqual(Object.keys(body), ["text"]);
  assert.match(body.text, /Tony Burke/);
  assert.match(body.text, /Are you going to beat 719/);
  assert.match(body.text, /quick call today/);
  assert.match(body.text, /dashboard\?token=test-token\|Review & send/);
});

test("approve sends the reply to the configured webform", async () => {
  // Stand up a fake REI BlackBook webform endpoint.
  const received = [];
  const { default: express } = await import("express");
  const fake = express().use(express.urlencoded({ extended: true }));
  fake.post("/webform", (req, res) => {
    received.push(req.body);
    res.send("ok");
  });
  const fakeServer = fake.listen(0);
  process.env.REIBB_SEND_WEBFORM_URL = `http://127.0.0.1:${fakeServer.address().port}/webform`;

  try {
    // Find Tony's pending draft id from the dashboard HTML (his card, specifically —
    // other tests create drafts too).
    const page = await fetch(`${base}/dashboard?token=test-token`).then((r) => r.text());
    const id = page.match(/Tony Burke[\s\S]*?\/drafts\/([a-f0-9]+)\/approve/)?.[1];
    assert.ok(id, "expected Tony's pending draft on the dashboard");

    const res = await fetch(`${base}/drafts/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "test-token", replyText: "I may be able to — quick call today?" }),
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(received.length, 1);
    assert.equal(received[0].phone, "7075961590");
    assert.equal(received[0].first_name, "Tony");
    assert.equal(received[0].ai_reply, "I may be able to — quick call today?");
  } finally {
    fakeServer.close();
    delete process.env.REIBB_SEND_WEBFORM_URL;
  }
});
