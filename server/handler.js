/**
 * Transport-agnostic request handler.
 *
 * Takes a plain description of a request and returns a plain description of a
 * response, so the same routing, auth and static serving works behind a
 * long-running Node server (local, Docker, a VM) and behind a serverless
 * function (Netlify), with no duplicated logic.
 */
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { match, HttpError } from './api.js';
import { authEnabled, isAuthed, login, logout, LOGIN_PAGE } from './auth.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(MODULE_DIR, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const json = (status, payload) => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload ?? null)
});

const html = (status, body) => ({ status, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body });

/**
 * @param {object} req
 * @param {string} req.method
 * @param {string} req.path       decoded pathname
 * @param {object} req.query      parsed query string
 * @param {object} req.headers    lower-cased header map
 * @param {string} req.body       raw request body
 * @param {string} req.ip         client address, for rate limiting
 * @param {boolean} req.secure    whether the original request used https
 */
export async function handleRequest({ method, path, query = {}, headers = {}, body = '', ip = 'unknown', secure = false }) {
  const parseBody = () => {
    if (!body) return {};
    try { return JSON.parse(body); } catch { throw new HttpError(400, 'Invalid JSON body'); }
  };

  // ---- Password gate (only active when APP_PASSWORD is set) ---------------
  if (path === '/api/login' && method === 'POST') {
    let payload = {};
    try { payload = parseBody(); } catch { /* fall through to a wrong-password answer */ }
    return login({ ip, secure }, payload.password);
  }
  if (path === '/api/logout' && method === 'POST') return logout();

  if (authEnabled() && !isAuthed(headers)) {
    if (path.startsWith('/api/')) return json(401, { error: 'Not signed in' });
    return html(path === '/login' ? 200 : 401, LOGIN_PAGE);
  }
  if (path === '/login') return { status: 302, headers: { Location: '/' }, body: '' };

  // ---- API ----------------------------------------------------------------
  if (path.startsWith('/api/')) {
    try {
      const hit = match(method, path);
      if (!hit) return json(404, { error: `No route for ${method} ${path}` });
      const result = await hit.handler(hit.params, query, parseBody());
      return json(method === 'POST' ? 201 : 200, result);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(`[api] ${method} ${path}:`, err);
      return json(status, { error: err.message || 'Server error' });
    }
  }

  // ---- Static files; unknown paths fall back to the SPA shell -------------
  try {
    const rel = path === '/' ? '/index.html' : path;
    let file = join(PUBLIC_DIR, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(PUBLIC_DIR)) return { status: 403, headers: {}, body: 'Forbidden' };
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, 'index.html');
    } catch {
      if (extname(file)) return { status: 404, headers: {}, body: 'Not found' };
      file = join(PUBLIC_DIR, 'index.html');
    }
    return {
      status: 200,
      headers: { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' },
      body: await readFile(file)
    };
  } catch {
    return { status: 404, headers: {}, body: 'Not found' };
  }
}
