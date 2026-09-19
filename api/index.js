/**
 * Vercel serverless adapter.
 *
 * Vercel's CDN serves the static files straight from public/, so this function
 * only ever handles /api/* and the login page. The routing, auth and KPI logic
 * are the same module the long-running server and the Netlify function use —
 * this file only translates Vercel's request and response objects.
 *
 * Every /api/* path and /login reach this one file through the rewrites in
 * vercel.json.
 */
import { handleRequest } from '../server/handler.js';
import { init } from '../server/db.js';

// Instances are reused between invocations, so the schema check and the
// connection pool are set up once and shared by every later request.
let ready = null;
const ensureReady = () => (ready ||= init());

/** Vercel parses a JSON body before we see it; anything else arrives as a stream. */
async function rawBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  // No parsed body and nothing to read from: an empty body, not an error.
  if (typeof req[Symbol.asyncIterator] !== 'function') return '';
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  try {
    await ensureReady();
  } catch (err) {
    // A failure here is nearly always configuration, so say which.
    ready = null;
    console.error('[startup]', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());
  // The login page reaches us through a rewrite that tags it, so it is found
  // whether the platform hands over the path the browser asked for or the
  // rewritten one.
  let path = decodeURIComponent(url.pathname);
  if (query.page === 'login') {
    path = '/login';
    delete query.page;
  }

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }

  const result = await handleRequest({
    method: req.method,
    path,
    query,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? '' : await rawBody(req),
    ip: (headers['x-forwarded-for'] || headers['x-real-ip'] || '').split(',')[0].trim() || 'unknown',
    // Vercel terminates TLS in front of the function, so anything reaching it
    // arrived over https unless it is a local `vercel dev` session.
    secure: (headers['x-forwarded-proto'] || 'https').split(',')[0].trim() === 'https'
  });

  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers || {})) res.setHeader(key, value);
  res.end(result.body);
}
