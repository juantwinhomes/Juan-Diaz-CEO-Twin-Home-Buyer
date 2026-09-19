/**
 * The Vercel adapter works before anything is deployed.
 *
 * Drives api/index.js with request and response objects shaped the way Vercel
 * hands them over: a JSON body already parsed, a body still on the stream, the
 * login page arriving under its rewritten path, and a start-up with no database
 * configured. Everything else — routing, auth, the KPI maths — is the same code
 * the other guards already cover.
 *
 *   npm run check:vercel
 */
import handler from '../api/index.js';
import { closeDb } from '../server/db.js';

let failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};

/** A request the way Vercel's Node runtime presents it. */
function request({ method = 'GET', url, headers = {}, body, stream }) {
  const req = { method, url, headers: { host: 'localhost', 'x-forwarded-proto': 'https', ...headers } };
  if (body !== undefined) req.body = body;
  if (stream !== undefined) req[Symbol.asyncIterator] = async function* () { yield Buffer.from(stream); };
  return req;
}

/** A response object with just the surface the adapter uses. */
function response() {
  const res = { statusCode: 200, headers: {}, body: null };
  let finish;
  res.finished = new Promise((r) => { finish = r; });
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.end = (chunk) => { res.body = chunk ?? ''; finish(); };
  return res;
}

async function call(opts) {
  const res = response();
  await handler(request(opts), res);
  await res.finished;
  let json = null;
  try { json = JSON.parse(String(res.body)); } catch { /* not JSON */ }
  return { status: res.statusCode, headers: res.headers, body: String(res.body ?? ''), json };
}

/* A serverless start with no database configured must say so, not crash. */
process.env.VERCEL = '1';
let r = await call({ url: '/api/bootstrap' });
ok('no DATABASE_URL on the platform -> a clear 503', r.status === 503 && /DATABASE_URL/.test(r.json?.error || ''),
  `got ${r.status} ${r.body.slice(0, 80)}`);
delete process.env.VERCEL;

/* From here on, the embedded local database stands in for Supabase. */
r = await call({ url: '/api/bootstrap' });
ok('GET /api/bootstrap answers 200 with JSON', r.status === 200 && Array.isArray(r.json?.projects), `got ${r.status}`);
ok('the JSON content type is set', /application\/json/.test(r.headers['content-type'] || ''));

let userId = r.json?.users?.[0]?.id;
if (!userId) {
  const made = await call({ method: 'POST', url: '/api/users', body: { name: 'Vercel Check', role: 'AI / Systems' } });
  userId = made.json?.id;
}
ok('a team member is available for the writes below', Boolean(userId));

r = await call({ url: '/api/today?date=2026-09-19&user_id=' + userId });
ok('query strings reach the handler', r.status === 200 && r.json?.date === '2026-09-19', `got ${r.status} date=${r.json?.date}`);

/* The login page, both ways it can arrive. Locally there is no password, so
   /login sends you straight to the app. */
r = await call({ url: '/login' });
ok('/login by its own path -> handled (302 to /)', r.status === 302 && r.headers.location === '/', `got ${r.status}`);
r = await call({ url: '/api?page=login' });
ok('/login by its rewritten path -> the same', r.status === 302 && r.headers.location === '/', `got ${r.status}`);

/* Writes: Vercel usually parses JSON for us, but not always. */
const task = `Vercel adapter check ${Date.now()}`;
r = await call({ method: 'POST', url: '/api/commitments', body: { user_id: userId, task } });
ok('POST with a body Vercel already parsed -> 201', r.status === 201 && r.json?.task === task, `got ${r.status} ${r.body.slice(0, 80)}`);
const first = r.json?.id;

r = await call({
  method: 'POST', url: '/api/commitments',
  headers: { 'content-type': 'application/json' },
  stream: JSON.stringify({ user_id: userId, task: task + ' (stream)' })
});
ok('POST with a body still on the stream -> 201', r.status === 201 && r.json?.task === task + ' (stream)', `got ${r.status}`);
const second = r.json?.id;

for (const id of [first, second]) {
  if (id) {
    r = await call({ method: 'DELETE', url: `/api/commitments/${id}` });
    ok(`DELETE cleans up ${id}`, r.status === 200 && r.json?.deleted === true, `got ${r.status}`);
  }
}

r = await call({ url: '/api/definitely-not-a-route' });
ok('an unknown API path -> 404 JSON, not a crash', r.status === 404 && /No route/.test(r.json?.error || ''), `got ${r.status}`);

r = await call({ method: 'POST', url: '/api/commitments', body: { user_id: userId } });
ok('a bad request -> 400 with the reason', r.status === 400 && Boolean(r.json?.error), `got ${r.status}`);

console.log(failed
  ? `\n  ${failed} problem(s) — do not deploy this to Vercel yet.\n`
  : '\n  The Vercel adapter is ready to deploy.\n');
await closeDb();
process.exit(failed ? 1 : 0);
