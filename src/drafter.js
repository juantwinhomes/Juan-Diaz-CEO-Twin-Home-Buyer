// Drafts SMS replies with Claude, using the business rules in config/business-rules.md
// plus the contact's conversation history.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const RULES_FILE =
  process.env.BUSINESS_RULES_FILE || path.join(process.cwd(), "config", "business-rules.md");

// If Claude can't be reached, this safe acknowledgment goes out (or to approval) instead,
// so a lead never sits unanswered.
export const FALLBACK_REPLY =
  "Thanks for the message! Let me look into that and get right back to you.";

function loadRules() {
  try {
    return fs.readFileSync(RULES_FILE, "utf8");
  } catch {
    return "Be brief, friendly, and professional. Never commit to a price or terms.";
  }
}

function buildPrompt({ name, phone, message, history }) {
  const transcript = history.messages
    .map((m) => `${m.direction === "in" ? "Lead" : "Us"}: ${m.text}`)
    .join("\n");

  return `An inbound SMS just arrived from a real-estate lead.

Lead name: ${name || "unknown"}
Lead phone: ${phone}

Conversation so far (oldest first):
${transcript || "(no prior messages on record)"}

Newest inbound message to answer:
"${message}"

Draft the single best SMS reply. Output ONLY the reply text — no quotes, no commentary.`;
}

export async function draftReply(input) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { text: FALLBACK_REPLY, fallback: true, reason: "ANTHROPIC_API_KEY not set" };
  }

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: [
        "You draft SMS replies for a real-estate home-buying business (Twin Home Buyer).",
        "Replies must be under 320 characters, sound like a real person texting, and follow these business rules:",
        "",
        loadRules(),
      ].join("\n"),
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) throw new Error("empty completion");
    return { text, fallback: false };
  } catch (err) {
    return { text: FALLBACK_REPLY, fallback: true, reason: err.message };
  }
}
