// ============================================================================
// aiDebriefService.js
// ----------------------------------------------------------------------------
// The single entry point for turning a transcript into structured facts.
// This is the PLUGGABLE SEAM: today it uses the local rule-based parser (no
// keys). When you add an ANTHROPIC_API_KEY, flip the engine to 'claude' and the
// exact same downstream code keeps working.
//
//   extractDebriefFacts(transcript)                      -> local parser
//   extractDebriefFacts(transcript, { engine: 'claude' }) -> Claude API (Phase 3b)
//
// The DEFAULT engine is chosen automatically:
//   - 'claude' if EXTRACTION_ENGINE=claude AND ANTHROPIC_API_KEY is set
//   - otherwise 'local'
// ============================================================================

import { extractFromTranscript } from './voiceNoteService.js';

// Decide which engine to use if the caller didn't specify one.
function defaultEngine() {
  if (process.env.EXTRACTION_ENGINE === 'claude' && process.env.ANTHROPIC_API_KEY) {
    return 'claude';
  }
  return 'local';
}

/**
 * Extract structured facts from a transcript.
 * @param {string} transcript
 * @param {object} [opts]
 * @param {'local'|'claude'} [opts.engine]
 * @returns {Promise<object>|object} the blankExtraction() shape
 */
export function extractDebriefFacts(transcript, opts = {}) {
  const engine = opts.engine || defaultEngine();
  if (engine === 'claude') {
    return extractWithClaude(transcript);
  }
  return extractFromTranscript(transcript);
}

// ---------------------------------------------------------------------------
// PHASE 3b — Claude-powered extraction (kept as a clearly-marked stub).
// To enable:
//   1. npm install @anthropic-ai/sdk
//   2. put ANTHROPIC_API_KEY=... and EXTRACTION_ENGINE=claude in .env
//   3. uncomment the implementation below.
// It uses prompts/juanVoiceMemoExtractionPrompt.md and MUST return the same
// object shape as the local parser (blankExtraction()), so nothing downstream
// changes.
// ---------------------------------------------------------------------------
async function extractWithClaude(/* transcript */) {
  throw new Error(
    'Claude engine not enabled yet. Add ANTHROPIC_API_KEY + `npm i @anthropic-ai/sdk`, ' +
      'then implement extractWithClaude() using prompts/juanVoiceMemoExtractionPrompt.md. ' +
      'Until then, use the local engine (the default).',
  );

  /*
  import fs from 'node:fs';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import Anthropic from '@anthropic-ai/sdk';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const promptPath = path.join(__dirname, '..', '..', 'prompts', 'juanVoiceMemoExtractionPrompt.md');
  const systemPrompt = fs.readFileSync(promptPath, 'utf8');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: transcript }],
  });
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return JSON.parse(text); // prompt forces JSON-only output
  */
}
