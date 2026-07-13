// Simple JSON-file persistence. One user, low volume — a database would be overkill.
// Data lives in data/store.json (git-ignored).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const EMPTY = { conversations: {}, drafts: {}, optedOut: {} };

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}

let state = load();

export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function recordMessage(phone, entry) {
  const key = normalizePhone(phone);
  if (!key) return;
  const convo = (state.conversations[key] ||= { messages: [] });
  convo.name = entry.name || convo.name;
  convo.messages.push({ ...entry, at: new Date().toISOString() });
  // Keep the last 40 messages per contact — plenty of context for drafting.
  convo.messages = convo.messages.slice(-40);
  save(state);
}

export function getConversation(phone) {
  return state.conversations[normalizePhone(phone)] || { messages: [] };
}

export function createDraft(draft) {
  const id = crypto.randomBytes(8).toString("hex");
  state.drafts[id] = {
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
    ...draft,
  };
  save(state);
  return state.drafts[id];
}

export function getDraft(id) {
  return state.drafts[id];
}

export function listPendingDrafts() {
  return Object.values(state.drafts)
    .filter((d) => d.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateDraft(id, patch) {
  const draft = state.drafts[id];
  if (!draft) return null;
  Object.assign(draft, patch);
  save(state);
  return draft;
}

export function setOptedOut(phone) {
  state.optedOut[normalizePhone(phone)] = new Date().toISOString();
  save(state);
}

export function isOptedOut(phone) {
  return Boolean(state.optedOut[normalizePhone(phone)]);
}
