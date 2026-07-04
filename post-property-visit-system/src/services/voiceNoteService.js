// ============================================================================
// voiceNoteService.js
// ----------------------------------------------------------------------------
// Turns Juan's voice-memo TRANSCRIPT (plain text) into structured facts.
//
// PHASE 1: this is a LOCAL, rule-based parser. No AI, no API keys, no network.
//          It is intentionally conservative — anything it cannot confidently
//          read is returned as "Unknown" (it never invents details).
//
// PHASE 3: we will replace the body of extractFromTranscript() with a real AI
//          call (Claude / Whisper) using the prompt in
//          prompts/juanVoiceMemoExtractionPrompt.md. The RETURN SHAPE below is
//          the contract — later phases must keep producing this same object so
//          nothing downstream breaks.
// ============================================================================

import { CLASSIFICATIONS } from '../config/classifications.js';

const UNKNOWN = 'Unknown';

// The structured object every extractor (local now, AI later) must return.
export function blankExtraction() {
  return {
    property_address: UNKNOWN,
    seller_name: UNKNOWN,
    entered_property: UNKNOWN, // "Yes" | "No" | "Unknown"
    deal_status: UNKNOWN, // "Pursuing" | "Nurturing" | "Passing" | "Under Contract" | "Unknown"
    seller_asking_price: UNKNOWN,
    likely_offer_range: UNKNOWN,
    repair_concerns: [],
    motivation_score: UNKNOWN, // "0".."10" or "Unknown"
    urgency: UNKNOWN,
    decision_maker: UNKNOWN,
    main_objection: UNKNOWN,
    next_best_action: UNKNOWN,
    follow_up_timing: UNKNOWN, // free text like "in 2 weeks"
    follow_up_days: null, // integer days if we could parse the timing, else null
    pass_reason: UNKNOWN,
    full_documentation_required: UNKNOWN, // "Yes" | "No" | "Unknown"
    suggested_classification: UNKNOWN, // a CLASSIFICATIONS label or "Unknown"
    raw_transcript: '',
  };
}

// --- small helpers ----------------------------------------------------------

// Normalize a money string like "550k", "$550,000", "550 thousand" to a number.
function parseMoney(text) {
  if (!text) return null;
  const t = text.toLowerCase().replace(/[$,\s]/g, '');
  // matches 550k, 450k, 1.2m, 550000
  const m = t.match(/(\d+(?:\.\d+)?)(k|m)?/);
  if (!m) return null;
  let value = parseFloat(m[1]);
  if (m[2] === 'k') value *= 1000;
  else if (m[2] === 'm') value *= 1000000;
  return Math.round(value);
}

function formatMoney(n) {
  if (n == null) return UNKNOWN;
  return `$${n.toLocaleString('en-US')}`;
}

// Turn phrases like "in 2 weeks", "next week", "in 3 days" into a day count.
function parseFollowUpDays(text) {
  const t = text.toLowerCase();
  if (/tomorrow/.test(t)) return 1;
  if (/next week/.test(t)) return 7;
  let m = t.match(/in\s+(\d+)\s+day/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/in\s+(\d+)\s+week/);
  if (m) return parseInt(m[1], 10) * 7;
  m = t.match(/in\s+(\d+)\s+month/);
  if (m) return parseInt(m[1], 10) * 30;
  return null;
}

// Guess a seller classification from keyword hits. Returns the label or Unknown.
function guessClassification(lowerText, dealStatus) {
  if (dealStatus === 'Passing') return 'Pass';
  let best = null;
  let bestHits = 0;
  for (const c of CLASSIFICATIONS) {
    const hits = c.keywords.filter((kw) => lowerText.includes(kw)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = c;
    }
  }
  return best ? best.label : UNKNOWN;
}

// --- the main extractor ------------------------------------------------------

/**
 * Extract structured facts from a transcript string.
 * @param {string} transcript - plain-text version of Juan's memo
 * @returns {object} shape of blankExtraction()
 */
export function extractFromTranscript(transcript) {
  const out = blankExtraction();
  if (!transcript || !transcript.trim()) {
    return out; // everything stays "Unknown"; caller treats as no memo
  }
  out.raw_transcript = transcript.trim();
  const text = transcript.trim();
  const lower = text.toLowerCase();

  // --- entered the property? -------------------------------------------------
  if (/(no entry|no-show|no show|couldn'?t get in|could not get in|didn'?t (?:go|get) (?:in|inside)|door was locked|no access|nobody (?:home|answered))/.test(lower)) {
    out.entered_property = 'No';
  } else if (/(went inside|walked through|walkthrough|toured|inside the (?:house|home|property)|entered|got inside)/.test(lower)) {
    out.entered_property = 'Yes';
  }

  // --- deal status: pursuing / nurturing / passing / under contract ----------
  if (/(under contract|signed the agreement|got it signed|signed contract)/.test(lower)) {
    out.deal_status = 'Under Contract';
  } else if (/(hard pass|passing|we pass|gonna pass|going to pass|walk away|not a deal|no deal)/.test(lower)) {
    out.deal_status = 'Passing';
  } else if (/(nurture|follow up later|not ready|check back|down the road)/.test(lower)) {
    out.deal_status = 'Nurturing';
  } else if (/(pursu|chase|push the offer|let'?s get|going after|make an offer|write it up)/.test(lower)) {
    out.deal_status = 'Pursuing';
  }

  // --- prices: "wants 550k" (asking) and "closer to 450k" (our offer) --------
  const askMatch = lower.match(/(?:wants|asking|list(?:ed)? at|price is|looking for)\s+\$?([\d.,]+\s*[km]?)/);
  if (askMatch) out.seller_asking_price = formatMoney(parseMoney(askMatch[1]));

  const offerMatch = lower.match(/(?:closer to|we'?re at|our number|offer|around|maybe|likely)\s+\$?([\d.,]+\s*[km]?)/);
  if (offerMatch) {
    const n = parseMoney(offerMatch[1]);
    if (n != null) out.likely_offer_range = formatMoney(n);
  }

  // --- repair concerns: scan for known building components -------------------
  // We split the memo into clauses (by comma/period) and keep any clause that
  // mentions a building component. This yields clean phrases like
  // "Roof is rough" instead of raw character windows.
  const repairKeywords = [
    'roof', 'foundation', 'plumbing', 'electrical', 'panel', 'hvac', 'ac',
    'water heater', 'mold', 'water damage', 'termite', 'window', 'flooring',
    'siding', 'sewer', 'septic', 'crawl space', 'wiring',
  ];
  const clauses = text.split(/[.,;]/).map((c) => c.trim()).filter(Boolean);
  const repairs = [];
  for (const clause of clauses) {
    const lc = clause.toLowerCase();
    // Word-boundary match so short keywords like "ac" don't hit "place".
    if (repairKeywords.some((kw) => new RegExp(`\\b${kw}\\b`).test(lc))) {
      // Capitalize first letter for a tidy line item.
      const clean = clause.charAt(0).toUpperCase() + clause.slice(1);
      repairs.push(clean);
    }
  }
  if (repairs.length) out.repair_concerns = [...new Set(repairs)];

  // --- motivation score: "6 out of 10", "motivation is 7", "8/10" ------------
  let motMatch = lower.match(/motivation\s+(?:is\s+)?(?:a\s+)?(\d{1,2})\s*(?:out of|\/)\s*10/);
  if (!motMatch) motMatch = lower.match(/(\d{1,2})\s*(?:out of|\/)\s*10/);
  if (!motMatch) motMatch = lower.match(/motivation\s+(?:is\s+)?(?:a\s+)?(\d{1,2})\b/);
  if (motMatch) out.motivation_score = `${motMatch[1]}/10`;

  // --- urgency ---------------------------------------------------------------
  if (/(urgent|asap|right away|needs to sell fast|behind on payments|foreclosure|quickly)/.test(lower)) {
    out.urgency = 'High';
  } else if (/(no rush|not in a hurry|whenever|no timeline)/.test(lower)) {
    out.urgency = 'Low';
  }

  // --- decision maker --------------------------------------------------------
  const dmMatch = lower.match(/(wife|husband|spouse|son|daughter|brother|sister|mother|father|mom|dad|kids|children|co-owner|partner)\s+(?:is|are)?\s*(?:the\s+)?decision maker/);
  if (dmMatch) {
    out.decision_maker = dmMatch[1];
  } else {
    const talkMatch = lower.match(/talk to (?:their|his|her|the)\s+([a-z]+)/);
    if (talkMatch) out.decision_maker = talkMatch[1];
  }

  // --- next best action ------------------------------------------------------
  if (out.deal_status === 'Pursuing') out.next_best_action = 'Prepare and present offer';
  else if (out.deal_status === 'Nurturing') out.next_best_action = 'Add to nurture and follow up';
  else if (out.deal_status === 'Passing') out.next_best_action = 'Record pass reason and archive';
  else if (out.deal_status === 'Under Contract') out.next_best_action = 'Open TC handoff';

  // --- follow-up timing ------------------------------------------------------
  const days = parseFollowUpDays(lower);
  if (days != null) {
    out.follow_up_days = days;
    const timingMatch = lower.match(/(?:follow up|follow-up|check back|circle back)\s+([^.]*)/);
    out.follow_up_timing = timingMatch ? timingMatch[1].trim() : `in ${days} days`;
  }

  // --- pass reason -----------------------------------------------------------
  if (out.deal_status === 'Passing') {
    const passMatch = lower.match(/(?:pass(?:ing)?|walk away)[^.]*because\s+([^.]*)/);
    if (passMatch) out.pass_reason = passMatch[1].trim();
    else out.pass_reason = 'Pass reason not clearly stated — coordinator to confirm';
  }

  // --- full documentation required? -----------------------------------------
  // Full docs required when entering AND pursuing, or under contract.
  if (out.deal_status === 'Under Contract') out.full_documentation_required = 'Yes';
  else if (out.entered_property === 'Yes' && out.deal_status === 'Pursuing') out.full_documentation_required = 'Yes';
  else if (out.entered_property === 'No' || out.deal_status === 'Passing') out.full_documentation_required = 'No';

  // --- suggested classification ----------------------------------------------
  out.suggested_classification = guessClassification(lower, out.deal_status);

  return out;
}
