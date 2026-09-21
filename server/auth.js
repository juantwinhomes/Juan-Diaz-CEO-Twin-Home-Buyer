/**
 * Optional password gate.
 *
 * Set APP_PASSWORD to require a shared password before anything is reachable.
 * Leave it unset (the default) and the app behaves exactly as before, which
 * keeps local use friction-free.
 *
 * Sessions are a signed, expiring token in an HttpOnly cookie — no session
 * store, so it survives restarts as long as SESSION_SECRET stays the same.
 */
import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const COOKIE = 'kpi_session';
const MAX_AGE_DAYS = 30;

export const authEnabled = () => PASSWORD.length > 0;

/* Warn loudly rather than silently handing out sessions that die on restart. */
if (authEnabled() && !process.env.SESSION_SECRET) {
  console.warn('  ! SESSION_SECRET is not set — everyone is signed out on restart.');
}

const sign = (value) => createHmac('sha256', SECRET).update(value).digest('hex');

/** Compare hashes so the check does not leak length or content via timing. */
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function makeToken() {
  const expires = Date.now() + MAX_AGE_DAYS * 86400_000;
  return `${expires}.${sign(String(expires))}`;
}

function validToken(token) {
  if (!token || !token.includes('.')) return false;
  const [expires, signature] = token.split('.');
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires));
}

const readCookie = (headers, name) =>
  String(headers.cookie || headers.Cookie || '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)?.[1];

export const isAuthed = (headers = {}) => !authEnabled() || validToken(readCookie(headers, COOKIE));

/* Modest brute-force protection: 10 wrong guesses per IP per 15 minutes. */
const attempts = new Map();
const WINDOW = 15 * 60_000;
const MAX_ATTEMPTS = 10;

function rateLimited(ip) {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.first > WINDOW) return false;
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.first > WINDOW) attempts.set(ip, { first: now, count: 1 });
  else record.count++;
  if (attempts.size > 5000) attempts.clear();
}

const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };

export function login({ ip = 'unknown', secure = false } = {}, password) {
  if (rateLimited(ip)) {
    return { status: 429, headers: JSON_TYPE,
      body: JSON.stringify({ error: 'Too many attempts. Wait 15 minutes and try again.' }) };
  }
  if (!password || !safeEqual(password, PASSWORD)) {
    recordFailure(ip);
    return { status: 401, headers: JSON_TYPE, body: JSON.stringify({ error: 'Wrong password.' }) };
  }
  attempts.delete(ip);
  return {
    status: 200,
    headers: {
      ...JSON_TYPE,
      'Set-Cookie': `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_DAYS * 86400}${secure ? '; Secure' : ''}`
    },
    body: JSON.stringify({ ok: true })
  };
}

export function logout() {
  return {
    status: 200,
    headers: { ...JSON_TYPE, 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` },
    body: JSON.stringify({ ok: true })
  };
}

export const LOGIN_PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — AI &amp; Systems</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%232563eb'/><rect x='7' y='16' width='4' height='9' rx='1.4' fill='white'/><rect x='14' y='11' width='4' height='14' rx='1.4' fill='white'/><rect x='21' y='7' width='4' height='18' rx='1.4' fill='white'/></svg>">
<script>
// The same appearance the app uses, applied before the first paint.
var t=null;try{t=localStorage.getItem('kpi.theme')}catch(e){}
document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
</script>
<style>
*{box-sizing:border-box}
html{color-scheme:light}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f5f6f8;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#101828}
.box{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:30px;width:100%;max-width:370px;
  box-shadow:0 4px 8px -2px rgba(16,24,40,.08)}
.mark{display:flex;align-items:center;gap:10px;margin-bottom:20px}
h1{font-size:17px;margin:0;letter-spacing:-.01em}
p.sub{font-size:12.5px;color:#98a2b3;margin:2px 0 0}
label{display:block;font-size:12.5px;font-weight:600;color:#475467;margin-bottom:5px}
input{width:100%;padding:9px 11px;border:1px solid #d0d5dd;border-radius:8px;font-size:14px;outline:none}
input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
button{width:100%;margin-top:14px;padding:10px;border:0;border-radius:8px;background:#2563eb;color:#fff;
  font-size:14px;font-weight:600;cursor:pointer}
button:hover{background:#1d4ed8}
button[disabled]{opacity:.6;cursor:not-allowed}
.err{margin-top:12px;padding:9px 11px;border-radius:8px;background:#fef3f2;border:1px solid #fecdc9;
  color:#912018;font-size:12.5px}
html[data-theme=dark]{color-scheme:dark}
html[data-theme=dark] body{background:#0b1019;color:#eef1f6}
html[data-theme=dark] .box{background:#121826;border-color:#242d40;box-shadow:0 4px 8px -2px rgba(0,0,0,.45)}
html[data-theme=dark] p.sub{color:#8591a6}
html[data-theme=dark] label{color:#b7c0d0}
html[data-theme=dark] input{background:#0b1019;border-color:#344058;color:#eef1f6}
html[data-theme=dark] input:focus{border-color:#6ea8fe;box-shadow:0 0 0 3px rgba(110,168,254,.25)}
html[data-theme=dark] button:hover{background:#3b82f6}
html[data-theme=dark] .err{background:#2e1314;border-color:#8f2a2a;color:#fecdc9}
</style></head><body>
<form class="box" id="f">
  <div class="mark">
    <svg viewBox="0 0 32 32" width="30" height="30"><rect width="32" height="32" rx="7" fill="#2563eb"/><rect x="7" y="16" width="4" height="9" rx="1.4" fill="#fff"/><rect x="14" y="11" width="4" height="14" rx="1.4" fill="#fff"/><rect x="21" y="7" width="4" height="18" rx="1.4" fill="#fff"/></svg>
    <div><h1>AI &amp; Systems</h1><p class="sub">Daily KPI Dashboard</p></div>
  </div>
  <label for="p">Team password</label>
  <input id="p" type="password" autocomplete="current-password" autofocus>
  <button id="b" type="submit">Sign in</button>
  <div class="err" id="e" hidden></div>
</form>
<script>
const f=document.getElementById('f'),b=document.getElementById('b'),e=document.getElementById('e');
f.addEventListener('submit',async(ev)=>{
  ev.preventDefault();b.disabled=true;b.textContent='Signing in…';e.hidden=true;
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password:document.getElementById('p').value})});
    if(r.ok){location.href='/';return;}
    const d=await r.json().catch(()=>({}));
    e.textContent=d.error||'Could not sign in.';e.hidden=false;
  }catch(err){e.textContent='Could not reach the server.';e.hidden=false;}
  b.disabled=false;b.textContent='Sign in';
  document.getElementById('p').select();
});
</script></body></html>`;
