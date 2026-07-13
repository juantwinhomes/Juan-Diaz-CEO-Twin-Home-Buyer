// Extracts { phone, name, message } from an REI BlackBook "new text message"
// notification email, since REI BlackBook has no native inbound-text trigger for
// Zapier. Claude does the extraction when available; a regex pass is the fallback
// so the pipeline still works without an API key.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

export function extractWithRegex(text) {
  // Phone: first thing that looks like a US number.
  const phoneMatch = text.match(/\+?1?[\s.(-]*(\d{3})[\s.)-]*(\d{3})[\s.-]*(\d{4})/);
  const phone = phoneMatch ? phoneMatch.slice(1).join("") : "";

  // Message: prefer an explicitly labeled line, then quoted text.
  const labeled = text.match(/(?:message|said|replied|texted)\s*[:\-]\s*("?)([\s\S]+?)\1\s*(?:\n|$)/i);
  const quoted = text.match(/"([^"]{2,500})"/);
  const message = (labeled?.[2] || quoted?.[1] || "").trim();

  const named = text.match(/(?:from|contact)\s*[:\-]?\s+([A-Z][a-zA-Z'’-]+(?:[,]?\s+[A-Z][a-zA-Z'’-]+)?)/);
  const name = (named?.[1] || "").replace(/^(\w+),\s*(\w+)$/, "$2 $1").trim();

  return { phone, name, message };
}

export async function extractInboundFromEmail({ subject = "", body = "" }) {
  const text = `${subject}\n${body}`;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ...extractWithRegex(text), extractor: "regex" };

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        "You extract structured data from CRM notification emails about inbound SMS messages. " +
        'Respond with ONLY a JSON object: {"phone": "<10-digit US number or empty>", ' +
        '"name": "<sender name or empty>", "message": "<the SMS text the lead sent, verbatim, or empty>"}. ' +
        "Never invent values; use empty strings when unsure.",
      messages: [{ role: "user", content: `Notification email:\n\n${text}` }],
    });
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
    const result = {
      phone: String(parsed.phone || "").replace(/\D/g, ""),
      name: String(parsed.name || "").trim(),
      message: String(parsed.message || "").trim(),
    };
    // If the model came back empty-handed, still try the regex pass.
    if (!result.phone || !result.message) {
      const fallback = extractWithRegex(text);
      return {
        phone: result.phone || fallback.phone,
        name: result.name || fallback.name,
        message: result.message || fallback.message,
        extractor: "claude+regex",
      };
    }
    return { ...result, extractor: "claude" };
  } catch {
    return { ...extractWithRegex(text), extractor: "regex" };
  }
}
