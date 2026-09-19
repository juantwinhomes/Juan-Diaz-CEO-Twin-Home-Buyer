/**
 * Netlify serverless adapter.
 *
 * Netlify's CDN serves the static files straight from public/, so this function
 * only ever handles /api/* and the login page. The routing, auth and KPI logic
 * are the same module the long-running server uses.
 */
import { handleRequest } from '../../server/handler.js';
import { init } from '../../server/db.js';

// Serverless instances are reused between invocations, so the schema check and
// the database pool are set up once and shared by every later request.
let ready = null;
const ensureReady = () => (ready ||= init());

export default async (request) => {
  try {
    await ensureReady();
  } catch (err) {
    // A failure here is nearly always configuration, so say which.
    ready = null;
    console.error('[startup]', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());

  const result = await handleRequest({
    method: request.method,
    path: decodeURIComponent(url.pathname),
    query: Object.fromEntries(url.searchParams.entries()),
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text(),
    ip: (headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown',
    // Netlify terminates TLS in front of the function, so anything reaching it
    // arrived over https unless it is a local `netlify dev` session.
    secure: (headers['x-forwarded-proto'] || 'https').split(',')[0].trim() === 'https'
  });

  return new Response(result.body, { status: result.status, headers: result.headers });
};

export const config = { path: ['/api/*', '/login'] };
