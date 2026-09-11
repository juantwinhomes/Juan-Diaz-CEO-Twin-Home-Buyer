/**
 * Local stand-in for the Apps Script web app: serves Index.html (templates resolved) and routes
 * google.script.run calls (POST /rpc) into the emulated backend. Identity comes from ?as=<email> / X-User header,
 * exactly the way Session.getActiveUser() would identify the signed-in Google account in production.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { createMocks, loadBackend } = require('./gas-mock');
const SRC = path.join(__dirname, '..', 'src'); const PUBLIC = require('../docs/public-functions.json');
function start(port, owner) {
  owner = owner || 'seth@twinhomebuyer.com';
  const { ctx, state } = createMocks({ active: owner, effective: owner, htmlDir: SRC });
  loadBackend(ctx, SRC); ctx.setupDatabase();
  state.photos[owner] = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const freshRequest = (email) => { state.identity.active = email; state.identity.effective = owner; ctx._dbCache = { ss: ctx._dbCache.ss, sheets: {}, headers: {}, tables: {} }; };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/') {
      const as = url.searchParams.get('as') || ''; freshRequest(as);
      let html = ctx.doGet({}).getContent();
      html = html.replace('<body>', `<body><script>window.__USER=${JSON.stringify(as)};window.__localRun=function(fn,args){return fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-User':window.__USER},body:JSON.stringify({fn:fn,args:args})}).then(function(r){return r.json()})};</script>`);
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html);
    }
    if (req.method === 'POST' && url.pathname === '/rpc') {
      let body = ''; req.on('data', c => body += c); req.on('end', () => {
        try {
          const { fn, args } = JSON.parse(body); freshRequest(req.headers['x-user'] || '');
          if (!PUBLIC.includes(fn) || typeof ctx[fn] !== 'function') { res.writeHead(403); return res.end(JSON.stringify({ ok: false, code: 'NOT_EXPOSED', message: fn + ' is not a public function' })); }
          const out = ctx[fn].apply(null, args || []);
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out === undefined ? null : out));
        } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, code: 'SERVER_ERROR', message: String(e && e.message) })); }
      }); return;
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, ctx, state, url: `http://127.0.0.1:${port}`, freshRequest })));
}
module.exports = { start };
if (require.main === module) start(Number(process.env.PORT) || 8787).then(s => console.log('desk at ' + s.url + '/?as=seth@twinhomebuyer.com'));
